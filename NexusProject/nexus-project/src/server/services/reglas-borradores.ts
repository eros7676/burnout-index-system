// Lifecycle of a rules draft: create → edit → simulate → (submit → approve) → publish, or discard.
// Every step runs in one transaction with its REGLAS_BORRADOR_* event and under a row lock on
// the draft; every request quotes the fingerprint (huella) of the content it read.
// Research: work/enterprise/research/workforce-admin.md §1.7, §2.3, §4.3.
import { Prisma, type PrismaClient } from "@prisma/client";
import { definicionAccion } from "../../shared/auditoria-catalogo";
import type { ErrorCampo, FechaISO, Pagina } from "../../shared/contracts";
import {
  type BorradorReglasDTO,
  type BorradorResumenDTO,
  type CambioParametroDTO,
  type EstadoBorradorReglas,
  type EventoBorradorDTO,
  type PropuestaReglas,
  type PublicacionReglasDTO,
  type SimulacionReglasDTO,
  type UsuarioRefDTO,
  type VersionesReglasDTO,
} from "../../shared/contratos/reglas";
import { ErrorDominio } from "../../shared/errors";
import { tienePermiso, type Permiso, type Rol } from "../../shared/permisos";
import {
  calcularCambios,
  registrarEvento,
  type ContextoAuditoria,
} from "../repositories/auditoria";
import { reglasDesdeDb } from "../repositories/evaluaciones";
import { fechaDesdeDb, fechaParaDb } from "../repositories/fechas";
import { guardarVersionNueva } from "../repositories/reglas";
import {
  bloquearBorrador,
  cambiosDeEvento,
  leerBorrador,
  leerHistorial,
  leerPublicaciones,
  listarBorradoresPaginado,
  usuarioDeEvento,
  type BorradorFila,
} from "../repositories/reglas-borradores";
import { validarPropuesta, type Problema } from "./reglas";
import {
  cambiosEntre,
  configuracionDe,
  huellaBorrador,
  mismosParametros,
  propuestaDesde,
} from "./reglas-parametros";
import {
  ErrorBorrador,
  contextoVigente,
  esRetroactivo,
  estadosDeVersiones,
  exigirContextoVigente,
  exigirEstado,
  exigirHuella,
  exigirOtraPersona,
  exigirPublicable,
  exigirSimulacion,
  hoyEnArgentina,
  lunesDe,
  problemasDeMotivo,
  problemasDeVigencia,
  rechazarPorProblemas,
  siguienteVersion,
  type ContextoFecha,
} from "./reglas-politica";
import { contextoActual, simularImpacto } from "./reglas-simulacion";

export type OpcionesBorrador = {
  /** Clock, replaceable in tests. */
  ahora?: () => Date;
  /** Employee-weeks one simulation may read; tests lower it. */
  limiteSemanas?: number;
};

const SEMANA_MS = 7 * 86_400_000;
const ABIERTOS = ["BORRADOR", "EN_REVISION"] as const;
/** A publication lists every affected week in its job: allow it time beyond Prisma's 5 s default. */
const TRANSACCION = { timeout: 120_000, maxWait: 10_000 } as const;
const LECTURA = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  timeout: 30_000,
  maxWait: 10_000,
} as const;

const json = (valor: unknown) => valor as Prisma.InputJsonObject;
const sumarSemana = (fecha: FechaISO): FechaISO =>
  new Date(fechaParaDb(fecha).getTime() + SEMANA_MS).toISOString().slice(0, 10);

function exigirPermiso(actor: ContextoAuditoria, permiso: Permiso) {
  const rol = actor.actorRol as Rol | undefined;
  if (!rol || !tienePermiso(rol, permiso))
    throw new ErrorBorrador(
      "SIN_PERMISO",
      "No tiene permiso para realizar esta operación.",
    );
}

/** The body of a mutating request: an object with only the expected fields. */
function leerCuerpo(
  entrada: unknown,
  campos: readonly string[],
): Record<string, unknown> {
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada))
    throw new ErrorBorrador("PETICION_INVALIDA", "El cuerpo debe ser un objeto JSON.");
  const extras = Object.keys(entrada).filter((k) => !campos.includes(k));
  if (extras.length > 0)
    throw new ErrorBorrador(
      "PETICION_INVALIDA",
      `Campos no reconocidos: ${extras.join(", ")}.`,
    );
  return entrada as Record<string, unknown>;
}

async function contextoDeFecha(
  tx: Prisma.TransactionClient,
  ahora: Date,
): Promise<ContextoFecha> {
  const filas = await tx.configuracionIndice.findMany({
    select: { effectiveFrom: true },
    orderBy: { effectiveFrom: "asc" },
  });
  const vigencias = filas.map((f) => fechaDesdeDb(f.effectiveFrom));
  return {
    primeraVigencia: vigencias[0] ?? "0000-00-00",
    vigencias,
    lunesActual: lunesDe(hoyEnArgentina(ahora)),
  };
}

/** Shape, reason and dates: what a save must satisfy. */
function validarContenido(
  propuestaCruda: unknown,
  motivo: unknown,
  fechas: ContextoFecha,
): { propuesta: PropuestaReglas | null; problemas: Problema[] } {
  const { propuesta, problemas } = validarPropuesta(propuestaCruda);
  const todos = [...problemas, ...problemasDeMotivo(motivo)];
  if (propuesta) todos.push(...problemasDeVigencia(propuesta.effectiveFrom, fechas));
  return { propuesta, problemas: todos };
}

/** The version in force at `inicio`; with `estricto`, only versions that start before it. */
async function versionEnVigor(
  tx: Prisma.TransactionClient,
  inicio: Date,
  estricto = false,
) {
  return tx.configuracionIndice.findFirst({
    where: { effectiveFrom: estricto ? { lt: inicio } : { lte: inicio } },
    orderBy: { effectiveFrom: "desc" },
  });
}

/** What still keeps a draft from simulating, submitting or publishing. */
async function validarParaAvanzar(
  tx: Prisma.TransactionClient,
  fila: BorradorFila,
  fechas: ContextoFecha,
): Promise<PropuestaReglas> {
  const { propuesta, problemas } = validarContenido(fila.propuesta, fila.motivo, fechas);
  if (propuesta) {
    const base = await versionEnVigor(tx, fechaParaDb(propuesta.effectiveFrom));
    if (base && mismosParametros(propuestaDesde(reglasDesdeDb(base)), propuesta))
      problemas.push({
        campo: "propuesta",
        detalle: `Sin cambios respecto de ${base.version}. Modifique al menos un parámetro.`,
      });
  }
  if (!propuesta || problemas.length > 0) rechazarPorProblemas(problemas);
  return propuesta;
}

function propuestaDeFila(fila: BorradorFila): PropuestaReglas {
  const { propuesta } = validarPropuesta(fila.propuesta);
  if (!propuesta)
    throw new Error(`El contenido del borrador ${fila.borradorId} está dañado.`);
  return propuesta;
}

function simulacionDeFila(fila: BorradorFila): SimulacionReglasDTO | null {
  return fila.simulacion ? (fila.simulacion as unknown as SimulacionReglasDTO) : null;
}

const editable = (fila: BorradorFila) =>
  (ABIERTOS as readonly EstadoBorradorReglas[]).includes(fila.estado);

/** Open and not yet approved: the only state in which content can change. */
function exigirModificable(fila: BorradorFila) {
  exigirEstado(fila.estado, ABIERTOS, "Solo se puede modificar un borrador abierto.");
  if (fila.aprobadoPor)
    throw new ErrorBorrador(
      "ESTADO_INCOMPATIBLE",
      "El borrador ya fue aprobado. Para cambiarlo, descártelo y cree uno nuevo.",
    );
}

// ── Reading ────────────────────────────────────────────────────────────────

async function usuariosDe(
  tx: Prisma.TransactionClient,
  filas: BorradorFila[],
): Promise<Map<string, { creador?: UsuarioRefDTO; aprobador?: UsuarioRefDTO }>> {
  const eventos = (await leerHistorial(
    tx,
    filas.map((f) => f.borradorId),
  )).filter(
    (e) =>
      e.accion === "REGLAS_BORRADOR_CREADO" ||
      e.accion === "REGLAS_BORRADOR_APROBADO",
  );
  const mapa = new Map<string, { creador?: UsuarioRefDTO; aprobador?: UsuarioRefDTO }>();
  for (const e of eventos) {
    const entrada = mapa.get(e.correlacionId!) ?? {};
    if (e.accion === "REGLAS_BORRADOR_CREADO") entrada.creador = usuarioDeEvento(e);
    else entrada.aprobador = usuarioDeEvento(e);
    mapa.set(e.correlacionId!, entrada);
  }
  return mapa;
}

const sinNombre = (userId: string): UsuarioRefDTO => ({ userId, nombre: userId, rol: null });

function resumenDe(
  fila: BorradorFila,
  usuarios: { creador?: UsuarioRefDTO; aprobador?: UsuarioRefDTO } | undefined,
): BorradorResumenDTO {
  const propuesta = propuestaDeFila(fila);
  return {
    borradorId: fila.borradorId,
    estado: fila.estado,
    baseVersion: fila.baseVersion,
    effectiveFrom: propuesta.effectiveFrom,
    motivo: fila.motivo,
    retroactivo: fila.retroactivo,
    simulado: fila.simulacionHuella !== null && fila.simulacionHuella === fila.huella,
    creadoPor: usuarios?.creador ?? sinNombre(fila.creadoPor),
    aprobadoPor: fila.aprobadoPor
      ? (usuarios?.aprobador ?? sinNombre(fila.aprobadoPor))
      : null,
    aprobadoAt: fila.aprobadoAt?.toISOString() ?? null,
    versionPublicada: fila.versionPublicada,
    createdAt: fila.createdAt.toISOString(),
    updatedAt: fila.updatedAt.toISOString(),
  };
}

const primitivo = (valor: unknown): string | number =>
  typeof valor === "number" || typeof valor === "string" ? valor : String(valor ?? "");

/** The full view of a draft, with what a screen needs to decide what to offer. */
async function construirDTO(
  tx: Prisma.TransactionClient,
  fila: BorradorFila,
  ahora: Date,
): Promise<BorradorReglasDTO> {
  const propuesta = propuestaDeFila(fila);
  const inicio = fechaParaDb(propuesta.effectiveFrom);
  const abierto = editable(fila);
  const [baseFila, historial, usuarios] = await Promise.all([
    versionEnVigor(tx, inicio, fila.estado === "PUBLICADO"),
    leerHistorial(tx, [fila.borradorId]),
    usuariosDe(tx, [fila]),
  ]);
  if (!baseFila) throw new Error("No hay una versión anterior al borrador.");
  const base = propuestaDesde(reglasDesdeDb(baseFila));
  const simulacion = simulacionDeFila(fila);

  let requiereAprobacion = fila.retroactivo;
  let simulacionVigente = fila.simulacionHuella === fila.huella;
  let problemas: ErrorCampo[] = [];
  if (abierto) {
    const contexto = await contextoActual(tx, propuesta.effectiveFrom);
    requiereAprobacion = esRetroactivo(contexto.semanas);
    simulacionVigente =
      simulacionVigente && contextoVigente(simulacion?.contexto, contexto);
    try {
      await validarParaAvanzar(tx, fila, await contextoDeFecha(tx, ahora));
    } catch (error) {
      if (!(error instanceof ErrorBorrador)) throw error;
      problemas = error.detalles;
    }
  }

  let publicacion: BorradorReglasDTO["publicacion"] = null;
  if (fila.versionPublicada) {
    const trabajo = await tx.processingJob.findFirst({
      where: { rulesVersion: fila.versionPublicada, origen: "CAMBIO_REGLAS" },
      orderBy: { createdAt: "desc" },
      select: { jobId: true },
    });
    publicacion = { version: fila.versionPublicada, jobId: trabajo?.jobId ?? null };
  }

  const eventos: EventoBorradorDTO[] = historial.map((e) => ({
    eventoId: e.eventoId,
    accion: e.accion,
    etiqueta: definicionAccion(e.accion)?.etiqueta ?? e.accion,
    actor: usuarioDeEvento(e),
    createdAt: e.createdAt.toISOString(),
    justificacion: e.justificacion,
    cambios: cambiosDeEvento(e),
  }));
  // The start date is shown on its own: it always differs from the version in force.
  const cambios: CambioParametroDTO[] = cambiosEntre(base, propuesta)
    .filter((c) => c.campo !== "effectiveFrom")
    .map((c) => ({
      campo: c.campo,
      antes: primitivo(c.antes),
      despues: primitivo(c.despues),
    }));

  return {
    ...resumenDe(fila, usuarios.get(fila.borradorId)),
    retroactivo: abierto ? requiereAprobacion : fila.retroactivo,
    huella: fila.huella,
    propuesta,
    versionEnVigor: baseFila.version,
    base,
    cambios,
    simulacion,
    simulacionVigente,
    requiereAprobacion,
    problemas,
    publicacion,
    historial: eventos,
  };
}

export async function obtenerBorrador(
  db: PrismaClient,
  borradorId: string,
  opciones: OpcionesBorrador = {},
): Promise<BorradorReglasDTO> {
  const ahora = (opciones.ahora ?? (() => new Date()))();
  return db.$transaction(
    async (tx) => construirDTO(tx, await leerBorrador(tx, borradorId), ahora),
    LECTURA,
  );
}

export async function listarBorradores(
  db: PrismaClient,
  filtro: { estado?: EstadoBorradorReglas; page: number; pageSize: number },
): Promise<Pagina<BorradorResumenDTO>> {
  return db.$transaction(async (tx) => {
    const { total, items } = await listarBorradoresPaginado(tx, filtro);
    const usuarios = await usuariosDe(tx, items);
    return {
      items: items.map((f) => resumenDe(f, usuarios.get(f.borradorId))),
      total,
      page: filtro.page,
      pageSize: filtro.pageSize,
    };
  }, LECTURA);
}

/** Every published version with its label; `vigente` is the one in force this week. */
export async function listarVersiones(
  db: PrismaClient,
  opciones: OpcionesBorrador = {},
): Promise<VersionesReglasDTO> {
  const ahora = (opciones.ahora ?? (() => new Date()))();
  return db.$transaction(async (tx) => {
    const filas = await tx.configuracionIndice.findMany({
      orderBy: { effectiveFrom: "desc" },
    });
    const reglas = filas.map(reglasDesdeDb);
    const estados = estadosDeVersiones(
      reglas.map((r) => r.effectiveFrom),
      lunesDe(hoyEnArgentina(ahora)),
    );
    const borradores = await tx.borradorReglas.findMany({
      where: { versionPublicada: { in: reglas.map((r) => r.version) } },
    });
    const [publicaciones, usuarios] = await Promise.all([
      leerPublicaciones(tx, reglas.map((r) => r.version)),
      usuariosDe(tx, borradores),
    ]);
    const porVersion = new Map(borradores.map((b) => [b.versionPublicada!, b]));
    const versiones = reglas.map((r) => {
      const borrador = porVersion.get(r.version);
      const evento = publicaciones.get(r.version);
      const gente = borrador ? usuarios.get(borrador.borradorId) : undefined;
      return {
        version: r.version,
        effectiveFrom: r.effectiveFrom,
        createdAt: r.createdAt,
        createdBy: evento ? usuarioDeEvento(evento) : sinNombre(r.createdBy),
        estado: estados.get(r.effectiveFrom)!,
        motivo: borrador?.motivo ?? null,
        aprobadoPor: borrador?.aprobadoPor
          ? (gente?.aprobador ?? sinNombre(borrador.aprobadoPor))
          : null,
        borradorId: borrador?.borradorId ?? null,
      };
    });
    const vigente =
      reglas.find((r) => estados.get(r.effectiveFrom) === "VIGENTE") ??
      reglas[reglas.length - 1];
    return { vigente, versiones };
  }, LECTURA);
}

// ── Steps ──────────────────────────────────────────────────────────────────

const relojDe = (opciones: OpcionesBorrador) => opciones.ahora ?? (() => new Date());

/** A new draft copies the version in force at the next free Monday; the reason is written on the first save. */
export async function crearBorrador(
  db: PrismaClient,
  actor: ContextoAuditoria,
  opciones: OpcionesBorrador = {},
): Promise<BorradorReglasDTO> {
  exigirPermiso(actor, "EDITAR_REGLAS");
  const ahora = relojDe(opciones)();
  return db.$transaction(async (tx) => {
    const fechas = await contextoDeFecha(tx, ahora);
    let effectiveFrom = sumarSemana(fechas.lunesActual);
    while (fechas.vigencias.includes(effectiveFrom))
      effectiveFrom = sumarSemana(effectiveFrom);
    const baseFila = await versionEnVigor(tx, fechaParaDb(effectiveFrom));
    if (!baseFila) throw new Error("No hay una versión de reglas publicada.");
    const base = reglasDesdeDb(baseFila);
    const propuesta = propuestaDesde(base, effectiveFrom);
    const fila = await tx.borradorReglas.create({
      data: {
        baseVersion: base.version,
        propuesta: json(propuesta),
        motivo: "",
        huella: huellaBorrador(propuesta, ""),
        creadoPor: actor.actorId,
      },
    });
    await registrarEvento(tx, {
      accion: "REGLAS_BORRADOR_CREADO",
      recursoId: fila.borradorId,
      actor,
      correlacionId: fila.borradorId,
      detalles: { baseVersion: base.version, effectiveFrom },
    });
    return construirDTO(tx, fila, ahora);
  }, TRANSACCION);
}

/** Saves the content. Any change drops the simulation and returns an unapproved review to draft. */
export async function actualizarBorrador(
  db: PrismaClient,
  borradorId: string,
  entrada: unknown,
  actor: ContextoAuditoria,
  opciones: OpcionesBorrador = {},
): Promise<BorradorReglasDTO> {
  exigirPermiso(actor, "EDITAR_REGLAS");
  const cuerpo = leerCuerpo(entrada, ["huella", "motivo", "propuesta"]);
  const ahora = relojDe(opciones)();
  return db.$transaction(async (tx) => {
    const fila = await bloquearBorrador(tx, borradorId);
    exigirModificable(fila);
    exigirHuella(fila.huella, cuerpo.huella);
    const motivo = typeof cuerpo.motivo === "string" ? cuerpo.motivo.trim() : cuerpo.motivo;
    const { propuesta, problemas } = validarContenido(
      cuerpo.propuesta,
      motivo,
      await contextoDeFecha(tx, ahora),
    );
    if (!propuesta || problemas.length > 0) rechazarPorProblemas(problemas);
    const huella = huellaBorrador(propuesta, motivo as string);
    if (huella === fila.huella) return construirDTO(tx, fila, ahora);

    const cambios = cambiosEntre(propuestaDeFila(fila), propuesta);
    if (fila.estado === "EN_REVISION")
      cambios.push({ campo: "estado", antes: fila.estado, despues: "BORRADOR" });
    const actualizada = await tx.borradorReglas.update({
      where: { borradorId },
      data: {
        propuesta: json(propuesta),
        motivo: motivo as string,
        huella,
        estado: "BORRADOR",
        simulacion: Prisma.DbNull,
        simulacionHuella: null,
        retroactivo: false,
      },
    });
    await registrarEvento(tx, {
      accion: "REGLAS_BORRADOR_ACTUALIZADO",
      recursoId: borradorId,
      actor,
      correlacionId: borradorId,
      cambios,
      justificacion: motivo as string,
      detalles: { baseVersion: fila.baseVersion },
    });
    return construirDTO(tx, actualizada, ahora);
  }, TRANSACCION);
}

const soloHuella = (entrada: unknown) => leerCuerpo(entrada, ["huella"]).huella;

/**
 * Dry run on the current content; the result is stored on the draft and nothing else is written.
 * The heavy read happens outside the row lock, and the result is kept only if the draft did not change meanwhile.
 */
export async function simularBorrador(
  db: PrismaClient,
  borradorId: string,
  entrada: unknown,
  actor: ContextoAuditoria,
  opciones: OpcionesBorrador = {},
): Promise<BorradorReglasDTO> {
  exigirPermiso(actor, "EDITAR_REGLAS");
  const huella = soloHuella(entrada);
  const ahora = relojDe(opciones)();
  const propuesta = await db.$transaction(async (tx) => {
    const fila = await leerBorrador(tx, borradorId);
    exigirModificable(fila);
    exigirHuella(fila.huella, huella);
    return validarParaAvanzar(tx, fila, await contextoDeFecha(tx, ahora));
  }, LECTURA);
  const simulacion = await simularImpacto(db, propuesta, ahora, opciones.limiteSemanas);
  return db.$transaction(async (tx) => {
    const fila = await bloquearBorrador(tx, borradorId);
    exigirModificable(fila);
    exigirHuella(fila.huella, huella);
    const retroactivo = esRetroactivo(simulacion.contexto.semanas);
    const actualizada = await tx.borradorReglas.update({
      where: { borradorId },
      data: {
        simulacion: json(simulacion),
        simulacionHuella: fila.huella,
        retroactivo,
      },
    });
    await registrarEvento(tx, {
      accion: "REGLAS_BORRADOR_SIMULADO",
      recursoId: borradorId,
      actor,
      correlacionId: borradorId,
      detalles: {
        semanas: simulacion.alcance.semanas,
        personas: simulacion.alcance.personas,
        semanasConCambio: simulacion.semanasConCambio,
        retroactivo,
      },
    });
    return construirDTO(tx, actualizada, ahora);
  }, TRANSACCION);
}

/** A retroactive draft goes to Gerencia. A future-dated one is published directly, so it cannot be submitted. */
export async function enviarBorrador(
  db: PrismaClient,
  borradorId: string,
  entrada: unknown,
  actor: ContextoAuditoria,
  opciones: OpcionesBorrador = {},
): Promise<BorradorReglasDTO> {
  exigirPermiso(actor, "EDITAR_REGLAS");
  const huella = soloHuella(entrada);
  const ahora = relojDe(opciones)();
  return db.$transaction(async (tx) => {
    const fila = await bloquearBorrador(tx, borradorId);
    exigirEstado(fila.estado, ["BORRADOR"], "Solo se puede enviar a aprobación un borrador sin enviar.");
    exigirHuella(fila.huella, huella);
    const propuesta = await validarParaAvanzar(tx, fila, await contextoDeFecha(tx, ahora));
    exigirSimulacion(fila);
    const contexto = await contextoActual(tx, propuesta.effectiveFrom);
    exigirContextoVigente(simulacionDeFila(fila)?.contexto, contexto);
    if (!esRetroactivo(contexto.semanas))
      throw new ErrorBorrador(
        "ESTADO_INCOMPATIBLE",
        "El borrador no modifica semanas ya evaluadas: no requiere aprobación y se publica directamente.",
      );
    const actualizada = await tx.borradorReglas.update({
      where: { borradorId },
      data: { estado: "EN_REVISION", retroactivo: true },
    });
    await registrarEvento(tx, {
      accion: "REGLAS_BORRADOR_EN_REVISION",
      recursoId: borradorId,
      actor,
      correlacionId: borradorId,
      cambios: calcularCambios({ estado: fila.estado }, { estado: "EN_REVISION" }),
      detalles: { semanas: contexto.semanas },
    });
    return construirDTO(tx, actualizada, ahora);
  }, TRANSACCION);
}

/** Gerencia approves what it saw simulated, and never its own draft (four-eyes). */
export async function aprobarBorrador(
  db: PrismaClient,
  borradorId: string,
  entrada: unknown,
  actor: ContextoAuditoria,
  opciones: OpcionesBorrador = {},
): Promise<BorradorReglasDTO> {
  exigirPermiso(actor, "APROBAR_REGLAS");
  const huella = soloHuella(entrada);
  const ahora = relojDe(opciones)();
  return db.$transaction(async (tx) => {
    const fila = await bloquearBorrador(tx, borradorId);
    exigirEstado(fila.estado, ["EN_REVISION"], "Solo se puede aprobar un borrador en revisión.");
    if (fila.aprobadoPor)
      throw new ErrorBorrador("ESTADO_INCOMPATIBLE", "El borrador ya fue aprobado.");
    exigirHuella(fila.huella, huella);
    exigirOtraPersona(fila.creadoPor, actor.actorId);
    exigirSimulacion(fila);
    const propuesta = propuestaDeFila(fila);
    exigirContextoVigente(
      simulacionDeFila(fila)?.contexto,
      await contextoActual(tx, propuesta.effectiveFrom),
    );
    const actualizada = await tx.borradorReglas.update({
      where: { borradorId },
      data: { aprobadoPor: actor.actorId, aprobadoAt: ahora },
    });
    await registrarEvento(tx, {
      accion: "REGLAS_BORRADOR_APROBADO",
      recursoId: borradorId,
      actor,
      correlacionId: borradorId,
      detalles: { baseVersion: fila.baseVersion },
    });
    return construirDTO(tx, actualizada, ahora);
  }, TRANSACCION);
}

/** Back to draft with a written reason; the author edits and submits again. */
export async function rechazarBorrador(
  db: PrismaClient,
  borradorId: string,
  entrada: unknown,
  actor: ContextoAuditoria,
  opciones: OpcionesBorrador = {},
): Promise<BorradorReglasDTO> {
  exigirPermiso(actor, "APROBAR_REGLAS");
  const cuerpo = leerCuerpo(entrada, ["huella", "justificacion"]);
  const problemas = problemasDeMotivo(cuerpo.justificacion, "justificacion", {
    vacio: "Indique la justificación del rechazo.",
    articulo: "La justificación",
  });
  if (problemas.length > 0)
    rechazarPorProblemas(problemas, "Falta la justificación del rechazo.");
  const justificacion = (cuerpo.justificacion as string).trim();
  const ahora = relojDe(opciones)();
  return db.$transaction(async (tx) => {
    const fila = await bloquearBorrador(tx, borradorId);
    exigirEstado(fila.estado, ["EN_REVISION"], "Solo se puede rechazar un borrador en revisión.");
    if (fila.aprobadoPor)
      throw new ErrorBorrador(
        "ESTADO_INCOMPATIBLE",
        "El borrador ya fue aprobado y no puede rechazarse.",
      );
    exigirHuella(fila.huella, cuerpo.huella);
    exigirOtraPersona(fila.creadoPor, actor.actorId);
    const actualizada = await tx.borradorReglas.update({
      where: { borradorId },
      data: { estado: "BORRADOR" },
    });
    await registrarEvento(tx, {
      accion: "REGLAS_BORRADOR_RECHAZADO",
      recursoId: borradorId,
      actor,
      correlacionId: borradorId,
      cambios: calcularCambios({ estado: fila.estado }, { estado: "BORRADOR" }),
      justificacion,
      detalles: { baseVersion: fila.baseVersion },
    });
    return construirDTO(tx, actualizada, ahora);
  }, TRANSACCION);
}

/** The draft stays in history; its content can no longer move. */
export async function descartarBorrador(
  db: PrismaClient,
  borradorId: string,
  entrada: unknown,
  actor: ContextoAuditoria,
  opciones: OpcionesBorrador = {},
): Promise<BorradorReglasDTO> {
  exigirPermiso(actor, "EDITAR_REGLAS");
  const huella = soloHuella(entrada);
  const ahora = relojDe(opciones)();
  return db.$transaction(async (tx) => {
    const fila = await bloquearBorrador(tx, borradorId);
    exigirEstado(fila.estado, ABIERTOS, "Solo se puede descartar un borrador abierto.");
    exigirHuella(fila.huella, huella);
    const actualizada = await tx.borradorReglas.update({
      where: { borradorId },
      data: { estado: "DESCARTADO" },
    });
    await registrarEvento(tx, {
      accion: "REGLAS_BORRADOR_DESCARTADO",
      recursoId: borradorId,
      actor,
      correlacionId: borradorId,
      cambios: calcularCambios({ estado: fila.estado }, { estado: "DESCARTADO" }),
      detalles: { baseVersion: fila.baseVersion },
    });
    return construirDTO(tx, actualizada, ahora);
  }, TRANSACCION);
}

/**
 * Publishes through the existing path (new version, reprocessing job, REGLAS_PUBLICADAS)
 * in the same transaction that closes the draft. The server names the version and signs it with the session user.
 */
export async function publicarBorrador(
  db: PrismaClient,
  borradorId: string,
  entrada: unknown,
  actor: ContextoAuditoria,
  opciones: OpcionesBorrador = {},
): Promise<PublicacionReglasDTO> {
  exigirPermiso(actor, "EDITAR_REGLAS");
  const huella = soloHuella(entrada);
  const ahora = relojDe(opciones)();
  return db.$transaction(async (tx) => {
    const fila = await bloquearBorrador(tx, borradorId);
    exigirEstado(fila.estado, ABIERTOS, "Solo se puede publicar un borrador abierto.");
    exigirHuella(fila.huella, huella);
    const propuesta = await validarParaAvanzar(tx, fila, await contextoDeFecha(tx, ahora));
    const contexto = await contextoActual(tx, propuesta.effectiveFrom);
    exigirPublicable(fila, esRetroactivo(contexto.semanas));
    exigirContextoVigente(simulacionDeFila(fila)?.contexto, contexto);

    const versiones = await tx.configuracionIndice.findMany({ select: { version: true } });
    const reglas = configuracionDe(propuesta, {
      version: siguienteVersion(versiones.map((v) => v.version)),
      createdBy: actor.actorId,
      createdAt: ahora.toISOString(),
    });
    let publicada;
    try {
      publicada = await guardarVersionNueva(tx, reglas, {
        actor,
        correlacionId: borradorId,
        justificacion: fila.motivo,
      });
    } catch (error) {
      // Another publication took the name or the date between the checks and the insert.
      if (error instanceof ErrorDominio && error.codigo === "CONFIGURACION_INVALIDA")
        throw new ErrorBorrador(
          "CONFLICTO_EDICION",
          "Otra publicación ocupó esa versión o esa fecha de inicio. Recargue la página y simule nuevamente.",
        );
      throw error;
    }
    const actualizada = await tx.borradorReglas.update({
      where: { borradorId },
      data: {
        estado: "PUBLICADO",
        versionPublicada: publicada.version,
        retroactivo: esRetroactivo(contexto.semanas),
      },
    });
    return {
      borrador: await construirDTO(tx, actualizada, ahora),
      version: publicada,
    };
  }, TRANSACCION);
}
