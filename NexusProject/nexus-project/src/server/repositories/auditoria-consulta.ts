// SQL for reading the audit trail. Every query follows an index of EventoAuditoria:
// (createdAt, eventoId) for the newest-first scan and the keyset position, (sujetoId|actorId|
// accion|resultado|correlacionId, createdAt) for the narrowing filters, (entidad, recursoId,
// createdAt) for a resource's history. Nothing here writes; the service records the read.
import type {
  EventoAuditoria as FilaEvento,
  Prisma,
} from "@prisma/client";
import {
  ACCIONES_AUDITORIA,
  definicionAccion,
} from "../../shared/auditoria-catalogo";
import type {
  OrigenAuditoria,
  ResultadoAuditoria,
} from "../../shared/contracts";

/** Actions that read data; the audit screen hides them unless asked (audit-trail §4.1). */
export const ACCIONES_LECTURA = ACCIONES_AUDITORIA.filter(
  (accion) => definicionAccion(accion)?.esLectura,
);

/** Events of these entities written before correlation ids existed share their resource id. */
export const ENTIDADES_CON_OPERACION_LEGADA = ["IMPORTACION", "REGLAS"] as const;

/** The filters of one query once validated; also what a read event records about itself. */
export type FiltrosNormalizados = {
  accion?: string;
  entidad?: string;
  recursoId?: string;
  sujetoId?: string;
  actorId?: string;
  correlacionId?: string;
  solicitudId?: string;
  /** Exact code, matched against resource, person, operation and request. */
  q?: string;
  resultado?: ResultadoAuditoria;
  origen?: OrigenAuditoria;
  consultas: boolean;
  desde?: string;
  hasta?: string;
};

/** Position of the last event of a page, in the newest-first order. */
export type CursorAuditoria = { createdAt: Date; eventoId: string };

const IGUALES = [
  "entidad",
  "accion",
  "recursoId",
  "sujetoId",
  "actorId",
  "correlacionId",
  "solicitudId",
  "resultado",
  "origen",
] as const;

export function whereDeFiltros(
  filtros: FiltrosNormalizados,
): Prisma.EventoAuditoriaWhereInput {
  const where: Prisma.EventoAuditoriaWhereInput = {};
  for (const campo of IGUALES)
    if (filtros[campo] !== undefined)
      Object.assign(where, { [campo]: filtros[campo] });
  // A consultation asked for by name is shown even when consultations are off.
  if (!filtros.consultas && filtros.accion === undefined)
    where.accion = { notIn: ACCIONES_LECTURA };
  if (filtros.q !== undefined)
    where.OR = [
      { recursoId: filtros.q },
      { sujetoId: filtros.q },
      { correlacionId: filtros.q },
      { solicitudId: filtros.q },
    ];
  if (filtros.desde || filtros.hasta)
    where.createdAt = {
      ...(filtros.desde ? { gte: new Date(filtros.desde) } : {}),
      ...(filtros.hasta ? { lte: new Date(filtros.hasta) } : {}),
    };
  return where;
}

/**
 * Rows strictly after the cursor. Written without a row constructor on purpose: MySQL range-scans
 * the expanded form on both columns of the index but only a prefix of `(a, b) < (x, y)`
 * (dev.mysql.com › Row Constructor Expression Optimization).
 */
const despuesDe = (cursor: CursorAuditoria): Prisma.EventoAuditoriaWhereInput => ({
  OR: [
    { createdAt: { lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, eventoId: { lt: cursor.eventoId } },
  ],
});

const MAS_RECIENTES = [{ createdAt: "desc" }, { eventoId: "desc" }] as const;

/** `take` rows after `cursor`, newest first; ask for one more than a page to know if there is a next. */
export function buscarRecientes(
  tx: Prisma.TransactionClient,
  where: Prisma.EventoAuditoriaWhereInput,
  cursor: CursorAuditoria | null,
  take: number,
) {
  return tx.eventoAuditoria.findMany({
    where: cursor ? { AND: [where, despuesDe(cursor)] } : where,
    orderBy: [...MAS_RECIENTES],
    take,
  });
}

/** Counts up to `tope` and one more, so the caller can tell "exactly tope" from "more than tope". */
export const contarHasta = (
  tx: Prisma.TransactionClient,
  where: Prisma.EventoAuditoriaWhereInput,
  tope: number,
) => tx.eventoAuditoria.count({ where, take: tope + 1 });

/** Consultations the current filters leave out. */
export function whereLecturasOcultas(
  filtros: FiltrosNormalizados,
): Prisma.EventoAuditoriaWhereInput {
  return {
    ...whereDeFiltros({ ...filtros, consultas: true }),
    accion: { in: ACCIONES_LECTURA },
  };
}

// The events of one operation are those that carry its correlation id plus, for imports and rules,
// the older ones that carried none and share their resource id. Two disjoint queries, each on its
// own index: one OR over both made MySQL scan every event without a correlation id.
const porCorrelacion = (id: string): Prisma.EventoAuditoriaWhereInput => ({
  correlacionId: id,
});
const sinCorrelacion = (id: string): Prisma.EventoAuditoriaWhereInput => ({
  correlacionId: null,
  entidad: { in: [...ENTIDADES_CON_OPERACION_LEGADA] },
  recursoId: id,
});

/** Oldest first, at most `take`. */
export async function eventosDeOperacion(
  tx: Prisma.TransactionClient,
  id: string,
  take: number,
) {
  const orderBy = [{ createdAt: "asc" }, { eventoId: "asc" }] as const;
  const conCorrelacion = await tx.eventoAuditoria.findMany({
    where: porCorrelacion(id),
    orderBy: [...orderBy],
    take,
  });
  const antiguos = await tx.eventoAuditoria.findMany({
    where: sinCorrelacion(id),
    orderBy: [...orderBy],
    take,
  });
  return [...conCorrelacion, ...antiguos]
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (a.eventoId < b.eventoId ? -1 : a.eventoId > b.eventoId ? 1 : 0),
    )
    .slice(0, take);
}

/** Events of the operation, counted up to `tope` and one more. */
export async function contarOperacion(
  tx: Prisma.TransactionClient,
  id: string,
  tope: number,
) {
  const suma =
    (await contarHasta(tx, porCorrelacion(id), tope)) +
    (await contarHasta(tx, sinCorrelacion(id), tope));
  return Math.min(suma, tope + 1);
}

/** Names of the people and teams a page mentions, in one query each (never one per row). */
export type Nombres = {
  personas: Map<string, string>;
  equipos: Map<string, string>;
};

export async function resolverNombres(
  tx: Prisma.TransactionClient,
  filas: Pick<FilaEvento, "entidad" | "recursoId" | "sujetoId">[],
): Promise<Nombres> {
  const personas = new Set<string>();
  const equipos = new Set<string>();
  for (const fila of filas) {
    if (fila.sujetoId) personas.add(fila.sujetoId);
    if (fila.entidad === "EMPLEADO") personas.add(fila.recursoId);
    if (fila.entidad === "EQUIPO") equipos.add(fila.recursoId);
  }
  const [empleados, equiposFila] = await Promise.all([
    personas.size
      ? tx.empleado.findMany({
          where: { employeeId: { in: [...personas] } },
          select: { employeeId: true, nombre: true },
        })
      : [],
    equipos.size
      ? tx.equipo.findMany({
          where: { teamId: { in: [...equipos] } },
          select: { teamId: true, nombre: true },
        })
      : [],
  ]);
  return {
    personas: new Map(empleados.map((e) => [e.employeeId, e.nombre])),
    equipos: new Map(equiposFila.map((e) => [e.teamId, e.nombre])),
  };
}
