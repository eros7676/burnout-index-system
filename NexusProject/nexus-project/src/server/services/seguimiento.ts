// Follow-up cases of alerts: one open case per person, append-only notes, organizational measures,
// closure with a reason. Every write records its SEGUIMIENTO_* event in the same transaction (D9).
// Research: work/enterprise/research/workforce-admin.md §2.4, §4.4; audit-trail.md.
import { Prisma, type PrismaClient } from "@prisma/client";
import type { ErrorCampo, UsuarioDemoDTO } from "../../shared/contracts";
import type { MotivoAuditoria } from "../../shared/auditoria-catalogo";
import type {
  AbrirSeguimiento,
  ActualizarSeguimiento,
  AnotarSeguimiento,
  CerrarSeguimiento,
  MarcarMedida,
  RegistrarMedida,
  SeguimientoAlertaDTO,
} from "../../shared/contratos/seguimiento";
import {
  calcularCambios,
  registrarEvento,
  type ContextoAuditoria,
} from "../repositories/auditoria";
import { fechaDesdeDb, fechaParaDb } from "../repositories/fechas";
import {
  bloquearPersona,
  dtoCaso,
  leerAlertaSeguimiento,
  leerCasos,
  type CasoDb,
  type Cliente,
  type ContextoAlerta,
} from "../repositories/seguimiento";
import {
  asignablesDe,
  asignadoPorDefecto,
  casoDeAlerta,
  hoyEnBuenosAires,
  puedeAnotar,
  puedeReasignar,
  puedeSeguir,
  puedeVer,
  validarActualizacion,
  validarCierre,
  validarMedida,
  validarNota,
} from "./seguimiento-reglas";

export class ErrorSeguimiento extends Error {
  constructor(
    public status: 403 | 404 | 409 | 422,
    mensaje: string,
    public detalles: ErrorCampo[] = [],
    public motivo: MotivoAuditoria = "SIN_PERMISO",
  ) {
    super(mensaje);
  }
}

/** Who acts: the signed-in user, the audit context of the request and the logins that exist. */
export type SesionSeguimiento = {
  usuario: UsuarioDemoDTO;
  actor: ContextoAuditoria;
  usuarios: readonly UsuarioDemoDTO[];
};

const MENSAJES = {
  sinAlerta: "No existe esa alerta.",
  sinCaso: "Esta alerta no tiene un seguimiento abierto.",
  verAjena: "No tiene permiso para consultar el seguimiento de esta alerta.",
  seguirAjena: "No tiene permiso para gestionar el seguimiento de esta alerta.",
  anotarAjena:
    "Solo RR. HH. y el responsable del seguimiento pueden registrar notas internas.",
  reasignar: "Solo RR. HH. puede asignar el seguimiento a otra persona.",
  cerrado: "El seguimiento está cerrado y no admite cambios.",
  cerradoNoSeReabre:
    "El seguimiento de esta alerta está cerrado y no se reabre. Una alerta nueva de la persona abrirá otro seguimiento.",
  superada:
    "La alerta fue superada: el seguimiento se abre desde la alerta vigente de la persona.",
} as const;

const nombresDe = (usuarios: readonly UsuarioDemoDTO[]) =>
  new Map(usuarios.map((u) => [u.userId, u.nombre]));

function validar(errores: ErrorCampo[]) {
  if (errores.length)
    throw new ErrorSeguimiento(
      422,
      errores[0].detalle,
      errores,
      "VALIDACION",
    );
}

// ── Read ──────────────────────────────────────────────────────────────────

function armar(
  contexto: ContextoAlerta,
  casos: CasoDb[],
  sesion: SesionSeguimiento,
): SeguimientoAlertaDTO {
  const { alerta } = contexto;
  const { usuario, usuarios } = sesion;
  const hallado = casoDeAlerta(casos, alerta);
  const gestionar = puedeSeguir(usuario, alerta);
  const asignables = asignablesDe(alerta, usuarios).map((u) => ({
    userId: u.userId,
    nombre: u.nombre,
  }));
  return {
    alertId: alerta.alertId,
    caso: hallado
      ? dtoCaso(hallado.caso, nombresDe(usuarios), {
          verNotas: puedeAnotar(usuario, hallado.caso, alerta),
          hoy: hoyEnBuenosAires(),
        })
      : null,
    relacion: hallado?.relacion ?? null,
    permisos: {
      abrir: gestionar && !hallado && alerta.vigencia === "ACTIVA",
      gestionar: gestionar && hallado?.caso.estado !== "CERRADO",
      anotar:
        !!hallado &&
        hallado.caso.estado !== "CERRADO" &&
        puedeAnotar(usuario, hallado.caso, alerta),
      reasignar: gestionar && puedeReasignar(usuario),
    },
    asignables,
    asignadoPorDefecto: gestionar ? asignadoPorDefecto(alerta, usuarios) : null,
  };
}

/** The follow-up of an alert: its case (if any), what the viewer may do and who may own it. */
export async function obtenerSeguimiento(
  db: Cliente,
  alertId: string,
  sesion: SesionSeguimiento,
): Promise<SeguimientoAlertaDTO> {
  const contexto = await leerAlertaSeguimiento(db, alertId);
  if (!contexto) throw new ErrorSeguimiento(404, MENSAJES.sinAlerta);
  if (!puedeVer(sesion.usuario, contexto.alerta))
    throw new ErrorSeguimiento(403, MENSAJES.verAjena, [], "FUERA_DE_EQUIPO");
  return armar(
    contexto,
    await leerCasos(db, contexto.alerta.employeeId),
    sesion,
  );
}

// ── Write ─────────────────────────────────────────────────────────────────

type Escritura = {
  tx: Prisma.TransactionClient;
  contexto: ContextoAlerta;
  casos: CasoDb[];
  sesion: SesionSeguimiento;
  hoy: string;
  ahora: Date;
};

const reintentable = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === "P2034" ||
    (error.code === "P2010" && error.meta?.code === "1213"));

/**
 * Runs one change with the person locked, so two writers never open two cases or interleave steps.
 * Answers with the alert's whole follow-up as it stands after the commit.
 */
async function escribir(
  db: PrismaClient,
  alertId: string,
  sesion: SesionSeguimiento,
  accion: (e: Escritura) => Promise<void>,
): Promise<SeguimientoAlertaDTO> {
  for (let n = 0; ; n++) {
    try {
      await db.$transaction(
        async (tx) => {
          const contexto = await leerAlertaSeguimiento(tx, alertId);
          if (!contexto) throw new ErrorSeguimiento(404, MENSAJES.sinAlerta);
          if (!puedeVer(sesion.usuario, contexto.alerta))
            throw new ErrorSeguimiento(
              403,
              MENSAJES.verAjena,
              [],
              "FUERA_DE_EQUIPO",
            );
          await bloquearPersona(tx, contexto.alerta.employeeId);
          await accion({
            tx,
            contexto,
            casos: await leerCasos(tx, contexto.alerta.employeeId),
            sesion,
            hoy: hoyEnBuenosAires(),
            ahora: new Date(),
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
      break;
    } catch (error) {
      if (n >= 2 || !reintentable(error)) throw error;
    }
  }
  return obtenerSeguimiento(db, alertId, sesion);
}

/** The case this alert belongs to, after checking the user may manage it. */
function casoGestionable(e: Escritura) {
  const { alerta } = e.contexto;
  if (!puedeSeguir(e.sesion.usuario, alerta))
    throw new ErrorSeguimiento(403, MENSAJES.seguirAjena, [], "FUERA_DE_EQUIPO");
  const hallado = casoDeAlerta(e.casos, alerta);
  if (!hallado) throw new ErrorSeguimiento(404, MENSAJES.sinCaso);
  if (hallado.caso.estado === "CERRADO")
    throw new ErrorSeguimiento(409, MENSAJES.cerrado, [], "ESTADO_INCOMPATIBLE");
  return hallado.caso;
}

const autor = (e: Escritura) => e.sesion.actor;

/**
 * Opens the person's case from an active alert. If the person already has an open case the alert joins
 * it and nothing is written: never a second case.
 */
export function abrirSeguimiento(
  db: PrismaClient,
  alertId: string,
  datos: AbrirSeguimiento,
  sesion: SesionSeguimiento,
) {
  return escribir(db, alertId, sesion, async (e) => {
    const { alerta } = e.contexto;
    const { usuario, usuarios } = e.sesion;
    if (!puedeSeguir(usuario, alerta))
      throw new ErrorSeguimiento(403, MENSAJES.seguirAjena, [], "FUERA_DE_EQUIPO");
    const hallado = casoDeAlerta(e.casos, alerta);
    if (hallado) {
      if (hallado.caso.estado === "CERRADO")
        throw new ErrorSeguimiento(
          409,
          MENSAJES.cerradoNoSeReabre,
          [],
          "ESTADO_INCOMPATIBLE",
        );
      return;
    }
    if (alerta.vigencia !== "ACTIVA")
      throw new ErrorSeguimiento(409, MENSAJES.superada, [], "ESTADO_INCOMPATIBLE");
    const asignadoA =
      datos.asignadoA ?? asignadoPorDefecto(alerta, usuarios);
    if (!asignablesDe(alerta, usuarios).some((u) => u.userId === asignadoA))
      validar([
        {
          fila: null,
          campo: "asignadoA",
          codigo: "RESPONSABLE_INVALIDO",
          detalle: "El responsable no puede actuar en este seguimiento.",
        },
      ]);
    if (asignadoA !== usuario.userId && !puedeReasignar(usuario))
      throw new ErrorSeguimiento(403, MENSAJES.reasignar);
    const caso = await e.tx.casoSeguimiento.create({
      data: {
        employeeId: alerta.employeeId,
        alertaOrigenId: alerta.alertId,
        estado: "NUEVO",
        asignadoA,
        abiertoPor: usuario.userId,
      },
    });
    await registrarEvento(e.tx, {
      accion: "SEGUIMIENTO_ABIERTO",
      recursoId: caso.casoId,
      actor: autor(e),
      sujetoId: alerta.employeeId,
      correlacionId: caso.casoId,
      detalles: { alertId: alerta.alertId, estado: "NUEVO", asignadoA },
    });
  });
}

/** Status, owner and due date. Closing has its own operation. */
export function actualizarSeguimiento(
  db: PrismaClient,
  alertId: string,
  datos: ActualizarSeguimiento,
  sesion: SesionSeguimiento,
) {
  return escribir(db, alertId, sesion, async (e) => {
    const caso = casoGestionable(e);
    const { alerta } = e.contexto;
    const { usuario, usuarios } = e.sesion;
    const actual = {
      estado: caso.estado,
      asignadoA: caso.asignadoA,
      vence: caso.vence ? fechaDesdeDb(caso.vence) : null,
    };
    validar(validarActualizacion(actual, datos, e.hoy));
    if (datos.asignadoA !== undefined && datos.asignadoA !== caso.asignadoA) {
      if (!asignablesDe(alerta, usuarios).some((u) => u.userId === datos.asignadoA))
        validar([
          {
            fila: null,
            campo: "asignadoA",
            codigo: "RESPONSABLE_INVALIDO",
            detalle: "El responsable no puede actuar en este seguimiento.",
          },
        ]);
      // Anyone allowed may take the case; only RR. HH. hands it to somebody else.
      if (datos.asignadoA !== usuario.userId && !puedeReasignar(usuario))
        throw new ErrorSeguimiento(403, MENSAJES.reasignar);
    }
    const despues = {
      estado: datos.estado ?? actual.estado,
      asignadoA: datos.asignadoA ?? actual.asignadoA,
      vence: datos.vence !== undefined ? datos.vence : actual.vence,
    };
    const cambios = calcularCambios(actual, despues);
    if (!cambios.length) return;
    await e.tx.casoSeguimiento.update({
      where: { casoId: caso.casoId },
      data: {
        estado: despues.estado,
        asignadoA: despues.asignadoA,
        vence: despues.vence ? fechaParaDb(despues.vence) : null,
      },
    });
    await registrarEvento(e.tx, {
      accion: "SEGUIMIENTO_ACTUALIZADO",
      recursoId: caso.casoId,
      actor: autor(e),
      sujetoId: caso.employeeId,
      correlacionId: caso.casoId,
      cambios,
      detalles: { alertId: alerta.alertId },
    });
  });
}

/** Appends an internal note. The text is never copied into the audit trail, only the note's id. */
export function anotarSeguimiento(
  db: PrismaClient,
  alertId: string,
  datos: AnotarSeguimiento,
  sesion: SesionSeguimiento,
) {
  return escribir(db, alertId, sesion, async (e) => {
    const { alerta } = e.contexto;
    const hallado = casoDeAlerta(e.casos, alerta);
    if (!hallado) throw new ErrorSeguimiento(404, MENSAJES.sinCaso);
    if (!puedeAnotar(e.sesion.usuario, hallado.caso, alerta))
      throw new ErrorSeguimiento(403, MENSAJES.anotarAjena, [], "FUERA_DE_EQUIPO");
    if (hallado.caso.estado === "CERRADO")
      throw new ErrorSeguimiento(409, MENSAJES.cerrado, [], "ESTADO_INCOMPATIBLE");
    validar(validarNota(datos.texto));
    const nota = await e.tx.notaSeguimiento.create({
      data: {
        casoId: hallado.caso.casoId,
        autorId: e.sesion.usuario.userId,
        texto: datos.texto.trim(),
      },
    });
    await registrarEvento(e.tx, {
      accion: "SEGUIMIENTO_NOTA_AGREGADA",
      recursoId: nota.notaId,
      actor: autor(e),
      sujetoId: hallado.caso.employeeId,
      correlacionId: hallado.caso.casoId,
      detalles: { notaId: nota.notaId, alertId: alerta.alertId },
    });
  });
}

export function registrarMedida(
  db: PrismaClient,
  alertId: string,
  datos: RegistrarMedida,
  sesion: SesionSeguimiento,
) {
  return escribir(db, alertId, sesion, async (e) => {
    const caso = casoGestionable(e);
    const permitidos = asignablesDe(e.contexto.alerta, e.sesion.usuarios).map(
      (u) => u.userId,
    );
    validar(validarMedida(datos, permitidos, e.hoy));
    const medida = await e.tx.medidaSeguimiento.create({
      data: {
        casoId: caso.casoId,
        tipo: datos.tipo,
        factor: datos.factor ?? null,
        responsable: datos.responsableId,
        vence: datos.vence ? fechaParaDb(datos.vence) : null,
      },
    });
    await registrarEvento(e.tx, {
      accion: "SEGUIMIENTO_MEDIDA_REGISTRADA",
      recursoId: medida.medidaId,
      actor: autor(e),
      sujetoId: caso.employeeId,
      correlacionId: caso.casoId,
      detalles: {
        medidaId: medida.medidaId,
        tipo: datos.tipo,
        factor: datos.factor ?? null,
        responsable: datos.responsableId,
      },
    });
  });
}

export function marcarMedida(
  db: PrismaClient,
  alertId: string,
  datos: MarcarMedida,
  sesion: SesionSeguimiento,
) {
  return escribir(db, alertId, sesion, async (e) => {
    const caso = casoGestionable(e);
    const medida = caso.medidas.find((m) => m.medidaId === datos.medidaId);
    if (!medida)
      throw new ErrorSeguimiento(404, "No existe esa medida en el seguimiento.");
    if (medida.hecha === datos.hecha) return;
    await e.tx.medidaSeguimiento.update({
      where: { medidaId: medida.medidaId },
      data: { hecha: datos.hecha },
    });
    await registrarEvento(e.tx, {
      accion: "SEGUIMIENTO_ACTUALIZADO",
      recursoId: caso.casoId,
      actor: autor(e),
      sujetoId: caso.employeeId,
      correlacionId: caso.casoId,
      cambios: [{ campo: "medida.hecha", antes: medida.hecha, despues: datos.hecha }],
      detalles: { medidaId: medida.medidaId, alertId: e.contexto.alerta.alertId },
    });
  });
}

/**
 * Closes the case with its reason and a justification, which is also written as the case's last note
 * (with the closing instant) and as the audit event's justification. There is no way back.
 */
export function cerrarSeguimiento(
  db: PrismaClient,
  alertId: string,
  datos: CerrarSeguimiento,
  sesion: SesionSeguimiento,
) {
  return escribir(db, alertId, sesion, async (e) => {
    const caso = casoGestionable(e);
    const origen = await e.tx.alerta.findUniqueOrThrow({
      where: { alertId: caso.alertaOrigenId },
      select: { vigencia: true },
    });
    validar(
      validarCierre(datos, {
        medidas: caso.medidas,
        alertaOrigenVigencia: origen.vigencia,
        personaActiva: e.contexto.persona.activo,
      }),
    );
    const justificacion = datos.justificacion.trim();
    await e.tx.casoSeguimiento.update({
      where: { casoId: caso.casoId },
      data: {
        estado: "CERRADO",
        motivoCierre: datos.motivoCierre,
        cerradoPor: e.sesion.usuario.userId,
        cerradoAt: e.ahora,
      },
    });
    const nota = await e.tx.notaSeguimiento.create({
      data: {
        casoId: caso.casoId,
        autorId: e.sesion.usuario.userId,
        texto: justificacion,
        createdAt: e.ahora,
      },
    });
    await registrarEvento(e.tx, {
      accion: "SEGUIMIENTO_CERRADO",
      recursoId: caso.casoId,
      actor: autor(e),
      sujetoId: caso.employeeId,
      correlacionId: caso.casoId,
      justificacion,
      cambios: [
        { campo: "estado", antes: caso.estado, despues: "CERRADO" },
        { campo: "motivoCierre", antes: null, despues: datos.motivoCierre },
      ],
      detalles: {
        motivoCierre: datos.motivoCierre,
        notaId: nota.notaId,
        alertId: e.contexto.alerta.alertId,
      },
    });
  });
}
