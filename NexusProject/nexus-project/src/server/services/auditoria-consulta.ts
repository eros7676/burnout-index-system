// Reading the audit trail: pages, one event, one operation and the rows of an export.
// Every read records AUDITORIA_CONSULTADA (or EXPORTACION_GENERADA) in the same transaction,
// so it fails closed: if the trace cannot be written, nothing is returned (audit-trail §2.3,
// NIST SP 800-53 AU-9 and OWASP "all access to the logs must be recorded").
import { randomUUID } from "node:crypto";
import {
  Prisma,
  type EventoAuditoria as FilaEvento,
  type PrismaClient,
} from "@prisma/client";
import {
  definicionAccion,
  type CambioAuditoria,
} from "../../shared/auditoria-catalogo";
import type {
  EventoAuditoria,
  Factor,
  PaginaAuditoria,
} from "../../shared/contracts";
import {
  AUDITORIA_LIMITES,
  type DetalleAuditoria,
  type EventoExportado,
  type FormatoExportacion,
  type OperacionAuditoria,
} from "../../shared/contratos/auditoria";
import {
  buscarRecientes,
  contarHasta,
  contarOperacion,
  ENTIDADES_CON_OPERACION_LEGADA,
  eventosDeOperacion,
  resolverNombres,
  whereDeFiltros,
  whereLecturasOcultas,
  type CursorAuditoria,
  type FiltrosNormalizados,
  type Nombres,
} from "../repositories/auditoria-consulta";
import { registrarEvento, type Actor } from "../repositories/auditoria";
import { recortar } from "./auditoria-consulta-exportacion";
import { ErrorConsulta } from "./filtros-consultas";

const SIN_NOMBRES: Nombres = { personas: new Map(), equipos: new Map() };

// A position is `createdAt|eventoId` in base64url: opaque to the client, checked on the way back.
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ID_EVENTO = /^[A-Za-z0-9_-]{1,36}$/;
const CURSOR_ILEGIBLE =
  "Cursor de página no reconocido. Reinicie la consulta desde la primera página.";

export const codificarCursor = (cursor: CursorAuditoria) =>
  Buffer.from(
    `${cursor.createdAt.toISOString()}|${cursor.eventoId}`,
  ).toString("base64url");

export function decodificarCursor(texto: string): CursorAuditoria {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(texto))
    throw new ErrorConsulta(400, CURSOR_ILEGIBLE);
  const [iso, eventoId, ...resto] = Buffer.from(texto, "base64url")
    .toString("utf8")
    .split("|");
  const createdAt = new Date(iso ?? "");
  if (
    resto.length ||
    !ISO_MS.test(iso ?? "") ||
    !Number.isFinite(createdAt.getTime()) ||
    createdAt.toISOString() !== iso ||
    !ID_EVENTO.test(eventoId ?? "")
  )
    throw new ErrorConsulta(400, CURSOR_ILEGIBLE);
  return { createdAt, eventoId };
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

function cambiosDe(valor: Prisma.JsonValue | null): CambioAuditoria[] | null {
  if (!Array.isArray(valor)) return null;
  const cambios = valor.filter(
    (c) => esObjeto(c) && typeof c.campo === "string",
  ) as unknown as CambioAuditoria[];
  return cambios.length ? cambios : null;
}

/** The stored row as the API sends it: ISO dates, the catalog label, names resolved on read. */
export function aEvento(
  fila: FilaEvento,
  nombres: Nombres = SIN_NOMBRES,
): EventoAuditoria {
  return {
    eventoId: fila.eventoId,
    accion: fila.accion,
    etiqueta: definicionAccion(fila.accion)?.etiqueta ?? null,
    entidad: fila.entidad,
    recursoId: fila.recursoId,
    sujetoId: fila.sujetoId,
    actorId: fila.actorId,
    actorNombre: fila.actorNombre,
    actorRol: fila.actorRol,
    origen: fila.origen,
    resultado: fila.resultado,
    motivo: fila.motivo,
    solicitudId: fila.solicitudId,
    correlacionId: fila.correlacionId,
    cambios: cambiosDe(fila.cambios),
    justificacion: fila.justificacion,
    detalles: esObjeto(fila.detalles) ? fila.detalles : {},
    createdAt: fila.createdAt.toISOString(),
    recursoNombre:
      fila.entidad === "EMPLEADO"
        ? (nombres.personas.get(fila.recursoId) ?? null)
        : fila.entidad === "EQUIPO"
          ? (nombres.equipos.get(fila.recursoId) ?? null)
          : null,
    sujetoNombre: fila.sujetoId
      ? (nombres.personas.get(fila.sujetoId) ?? null)
      : null,
  };
}

/** The same row without the names: an export carries identifiers, not copies of personal data. */
export function aEventoExportado(fila: FilaEvento): EventoExportado {
  const { recursoNombre, sujetoNombre, ...evento } = aEvento(fila);
  void recursoNombre;
  void sujetoNombre;
  return evento;
}

/** The operation an event belongs to; older import and rules events fall back to their resource. */
export const idOperacion = (
  fila: Pick<FilaEvento, "correlacionId" | "entidad" | "recursoId">,
): string | null =>
  fila.correlacionId ??
  ((ENTIDADES_CON_OPERACION_LEGADA as readonly string[]).includes(fila.entidad)
    ? fila.recursoId
    : null);

type ParametrosReglas = {
  effectiveFrom: string;
  windowDays: number;
  persistencePeriods: number;
  weights: Record<string, number>;
  thresholds: Record<string, number>;
  mediumLimit: number;
  highLimit: number;
  minExceededFactors: number;
};
const FACTORES: Factor[] = ["HE", "DS", "CT", "VP"];

/** Field by field difference between two rules versions: what a publication changed. */
export function calcularCambiosReglas(
  anterior: ParametrosReglas,
  nueva: ParametrosReglas,
): CambioAuditoria[] {
  const campos: [string, unknown, unknown][] = [
    ["effectiveFrom", anterior.effectiveFrom, nueva.effectiveFrom],
    ["windowDays", anterior.windowDays, nueva.windowDays],
    ["persistencePeriods", anterior.persistencePeriods, nueva.persistencePeriods],
    ...FACTORES.map((f): [string, unknown, unknown] => [
      `weights.${f}`,
      anterior.weights[f],
      nueva.weights[f],
    ]),
    ...FACTORES.map((f): [string, unknown, unknown] => [
      `thresholds.${f}`,
      anterior.thresholds[f],
      nueva.thresholds[f],
    ]),
    ["mediumLimit", anterior.mediumLimit, nueva.mediumLimit],
    ["highLimit", anterior.highLimit, nueva.highLimit],
    ["minExceededFactors", anterior.minExceededFactors, nueva.minExceededFactors],
  ];
  return campos
    .filter(([, antes, despues]) => antes !== despues)
    .map(([campo, antes, despues]) => ({ campo, antes, despues }));
}

const AISLAMIENTO = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;

/** What a read event keeps of the filters: only the ones in use. */
const sinVacios = (filtros: FiltrosNormalizados) =>
  Object.fromEntries(
    Object.entries(filtros).filter(([, valor]) => valor !== undefined),
  ) as Prisma.InputJsonObject;

export async function listarEventos(
  db: PrismaClient,
  entrada: {
    filtros: FiltrosNormalizados;
    cursor: CursorAuditoria | null;
    pageSize: number;
    actor: Actor;
  },
  opciones: { conteoMaximo?: number } = {},
): Promise<PaginaAuditoria> {
  const { filtros, cursor, pageSize, actor } = entrada;
  const tope = opciones.conteoMaximo ?? AUDITORIA_LIMITES.conteoMaximo;
  return db.$transaction(async (tx) => {
    const where = whereDeFiltros(filtros);
    const ocultan = !filtros.consultas && filtros.accion === undefined;
    const filas = await buscarRecientes(tx, where, cursor, pageSize + 1);
    const contados = await contarHasta(tx, where, tope);
    const ocultas = ocultan
      ? await contarHasta(tx, whereLecturasOcultas(filtros), tope)
      : 0;
    const pagina = filas.slice(0, pageSize);
    const nombres = await resolverNombres(tx, pagina);
    await registrarEvento(tx, {
      accion: "AUDITORIA_CONSULTADA",
      recursoId: "eventos",
      sujetoId: filtros.sujetoId ?? null,
      actor,
      detalles: {
        vista: "lista",
        filtros: sinVacios(filtros),
        pageSize,
        continuacion: cursor !== null,
      },
    });
    return {
      items: pagina.map((fila) => aEvento(fila, nombres)),
      total: Math.min(contados, tope),
      totalAcotado: contados > tope,
      pageSize,
      siguiente:
        filas.length > pageSize
          ? codificarCursor(pagina[pageSize - 1])
          : null,
      consultasOcultas: Math.min(ocultas, tope),
    };
  }, AISLAMIENTO);
}

/** Rules published before changes were stored: the difference comes from the immutable versions. */
async function cambiosDeReglas(
  tx: Prisma.TransactionClient,
  fila: FilaEvento,
): Promise<CambioAuditoria[] | null> {
  const { version, versionAnterior } = esObjeto(fila.detalles)
    ? fila.detalles
    : ({} as Record<string, unknown>);
  if (typeof version !== "string" || typeof versionAnterior !== "string")
    return null;
  const nueva = await tx.configuracionIndice.findUnique({ where: { version } });
  const anterior = await tx.configuracionIndice.findUnique({
    where: { version: versionAnterior },
  });
  if (!nueva || !anterior) return null;
  const parametros = (c: typeof nueva): ParametrosReglas => ({
    ...c,
    effectiveFrom: c.effectiveFrom.toISOString().slice(0, 10),
    weights: c.weights as Record<string, number>,
    thresholds: c.thresholds as Record<string, number>,
  });
  return calcularCambiosReglas(parametros(anterior), parametros(nueva));
}

export async function obtenerDetalle(
  db: PrismaClient,
  eventoId: string,
  actor: Actor,
): Promise<DetalleAuditoria> {
  return db.$transaction(async (tx) => {
    const fila = await tx.eventoAuditoria.findUnique({ where: { eventoId } });
    if (!fila) throw new ErrorConsulta(404, "No se encontró el evento de auditoría.");
    const operacionId = idOperacion(fila);
    const nombres = await resolverNombres(tx, [fila]);
    const derivados =
      fila.cambios === null && fila.accion === "REGLAS_PUBLICADAS"
        ? await cambiosDeReglas(tx, fila)
        : null;
    const eventos = operacionId
      ? await contarOperacion(
          tx,
          operacionId,
          AUDITORIA_LIMITES.operacionMaxEventos,
        )
      : 0;
    await registrarEvento(tx, {
      accion: "AUDITORIA_CONSULTADA",
      recursoId: fila.eventoId,
      sujetoId: fila.sujetoId,
      actor,
      detalles: { vista: "detalle" },
    });
    const evento = aEvento(fila, nombres);
    return {
      evento: derivados?.length ? { ...evento, cambios: derivados } : evento,
      cambiosCalculados: !!derivados?.length,
      operacion: operacionId && eventos > 1 ? { id: operacionId, eventos } : null,
    };
  }, AISLAMIENTO);
}

export async function obtenerOperacion(
  db: PrismaClient,
  operacionId: string,
  actor: Actor,
  opciones: { maxEventos?: number } = {},
): Promise<OperacionAuditoria> {
  const max = opciones.maxEventos ?? AUDITORIA_LIMITES.operacionMaxEventos;
  return db.$transaction(async (tx) => {
    const filas = await eventosDeOperacion(tx, operacionId, max + 1);
    if (!filas.length)
      throw new ErrorConsulta(404, "No se encontró la operación indicada.");
    const truncada = filas.length > max;
    const pagina = filas.slice(0, max);
    const nombres = await resolverNombres(tx, pagina);
    const total = truncada
      ? await contarOperacion(tx, operacionId, AUDITORIA_LIMITES.conteoMaximo)
      : filas.length;
    await registrarEvento(tx, {
      accion: "AUDITORIA_CONSULTADA",
      recursoId: operacionId,
      actor,
      detalles: { vista: "operacion", eventos: pagina.length, truncada },
    });
    return {
      operacionId,
      eventos: pagina.map((fila) => aEvento(fila, nombres)),
      total,
      truncada,
    };
  }, AISLAMIENTO);
}

/**
 * The rows of an export, newest first, capped. The export event is written before the rows leave:
 * if it cannot be recorded, nothing is exported (OWASP: log "data import and export").
 */
export async function exportarEventos(
  db: PrismaClient,
  entrada: {
    filtros: FiltrosNormalizados;
    formato: FormatoExportacion;
    actor: Actor;
    solicitudId?: string;
  },
  opciones: { maxFilas?: number } = {},
) {
  const limite = opciones.maxFilas ?? AUDITORIA_LIMITES.exportacionMaxFilas;
  return db.$transaction(async (tx) => {
    const filas = await buscarRecientes(
      tx,
      whereDeFiltros(entrada.filtros),
      null,
      limite + 1,
    );
    const { filas: visibles, truncado } = recortar(filas, limite);
    const eventos = visibles.map(aEventoExportado);
    await registrarEvento(tx, {
      accion: "EXPORTACION_GENERADA",
      recursoId: entrada.solicitudId ?? randomUUID(),
      sujetoId: entrada.filtros.sujetoId ?? null,
      actor: entrada.actor,
      detalles: {
        dataset: "AUDITORIA",
        formato: entrada.formato,
        filtros: sinVacios(entrada.filtros),
        filas: eventos.length,
        truncado,
        limite,
      },
    });
    return { eventos, truncado, limite, generadoEn: new Date().toISOString() };
  }, AISLAMIENTO);
}
