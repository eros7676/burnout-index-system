// Reads of the task evidence. Every query goes through an index of TareaSemana and returns one page
// or one aggregate: `[recordId, taskId]` (a week's rows), `[recordId, estadoCierre, diasAtraso]`
// (the status groups) and `[employeeId, taskId, periodStart]` (one task's closes).
import type { Prisma } from "@prisma/client";
import type { FechaISO } from "../../shared/contracts";
import type {
  CierreTareaDTO,
  EstadoTarea,
  TareaDTO,
} from "../../shared/contratos/tareas";
import { enlaceSeguro, type GrupoEstado } from "../services/tareas-consulta-resumen";
import { fechaDesdeDb, fechaParaDb } from "./fechas";

type Tx = Prisma.TransactionClient;

const COLUMNAS_PERSONA = {
  employeeId: true,
  nombre: true,
  tipo: true,
  teamId: true,
  equipo: { select: { nombre: true } },
} as const;

export async function leerPersona(tx: Tx, employeeId: string, teamId?: string) {
  return tx.empleado.findFirst({
    where: { employeeId, ...(teamId ? { teamId } : {}) },
    select: COLUMNAS_PERSONA,
  });
}

/** The columns of a record the week view shows. */
const COLUMNAS_REGISTRO = {
  recordId: true,
  periodoId: true,
  sourceImportId: true,
  huellaTareas: true,
  horasExtra: true,
  diasConsecutivosSinDescanso: true,
  tareasActivas: true,
  tareasPendientes: true,
  tareasVencidas: true,
  vacacionesPendientesDias: true,
} as const;

/**
 * The record that backs a person-week: the one asked for (a report's snapshot) or the current one.
 * Only confirmed imports count, as in every other read.
 */
export async function leerRegistroSemana(
  tx: Tx,
  filtro: { employeeId: string; periodStart: FechaISO; recordId?: string },
) {
  const periodo = await tx.periodoEmpleado.findFirst({
    where: {
      employeeId: filtro.employeeId,
      periodStart: fechaParaDb(filtro.periodStart),
    },
    select: { periodoId: true, periodStart: true, periodEnd: true, registroVigenteId: true },
  });
  if (!periodo) return null;
  const recordId = filtro.recordId ?? periodo.registroVigenteId;
  if (!recordId) return null;
  const registro = await tx.registroLaboral.findFirst({
    where: {
      recordId,
      periodoId: periodo.periodoId,
      importacion: { status: "CONFIRMADA" },
    },
    select: COLUMNAS_REGISTRO,
  });
  if (!registro) return null;
  return {
    periodo,
    registro,
    vigente: registro.recordId === periodo.registroVigenteId,
  };
}

/** Index and level of the evaluation that used a record (an earlier data version's result). */
export async function leerResultadoDeRegistro(tx: Tx, recordId: string) {
  const evaluacion = await tx.evaluacion.findFirst({
    where: { actualRecordId: recordId },
    orderBy: [{ createdAt: "desc" }, { evaluationId: "desc" }],
    select: { evaluationId: true, indice: true, nivel: true },
  });
  return evaluacion
    ? {
        evaluationId: evaluacion.evaluationId,
        indice: Number(evaluacion.indice),
        nivel: evaluacion.nivel,
      }
    : null;
}

/** Counts by status for several records at once (the weeks ledger) or one (a week). */
export async function gruposPorRegistro(tx: Tx, recordIds: string[]) {
  const mapa = new Map<string, GrupoEstado[]>();
  if (!recordIds.length) return mapa;
  const filas = await tx.tareaSemana.groupBy({
    by: ["recordId", "estadoCierre"],
    where: { recordId: { in: recordIds } },
    _count: { _all: true },
    _max: { diasAtraso: true },
    _sum: { diasAtraso: true },
  });
  for (const f of filas) {
    const lista = mapa.get(f.recordId) ?? [];
    lista.push({
      estado: f.estadoCierre,
      n: f._count._all,
      diasAtrasoMax: f._max.diasAtraso,
      diasAtrasoTotal: f._sum.diasAtraso,
    });
    mapa.set(f.recordId, lista);
  }
  return mapa;
}

const aTarea = (f: {
  taskId: string;
  titulo: string;
  origen: string;
  origenRef: string | null;
  asignadaEl: Date;
  venceEl: Date | null;
  completadaEl: Date | null;
  estadoCierre: EstadoTarea;
  diasAtraso: number | null;
}): TareaDTO => ({
  taskId: f.taskId,
  titulo: f.titulo,
  origen: f.origen,
  origenRef: enlaceSeguro(f.origenRef),
  asignadaEl: fechaDesdeDb(f.asignadaEl),
  venceEl: f.venceEl ? fechaDesdeDb(f.venceEl) : null,
  completadaEl: f.completadaEl ? fechaDesdeDb(f.completadaEl) : null,
  estado: f.estadoCierre,
  diasAtraso: f.diasAtraso,
});

/**
 * One page of a record's tasks. Overdue first (the longest delay first), then open in time by due
 * date with the undated last, then completed by due date; the key breaks ties so pages never repeat.
 */
export async function paginaTareas(
  tx: Tx,
  filtro: { recordId: string; estado?: EstadoTarea; page: number; pageSize: number },
) {
  const where: Prisma.TareaSemanaWhereInput = {
    recordId: filtro.recordId,
    ...(filtro.estado ? { estadoCierre: filtro.estado } : {}),
  };
  const [items, total] = await Promise.all([
    tx.tareaSemana.findMany({
      where,
      orderBy: [
        { estadoCierre: "desc" },
        { diasAtraso: { sort: "desc", nulls: "last" } },
        { venceEl: { sort: "asc", nulls: "last" } },
        { taskId: "asc" },
      ],
      skip: (filtro.page - 1) * filtro.pageSize,
      take: filtro.pageSize,
    }),
    tx.tareaSemana.count({ where }),
  ]);
  return { items: items.map(aTarea), total };
}

/** Where a record's rows came from: the first row's confirmed import. */
export async function leerImportacionTareas(tx: Tx, recordId: string) {
  const fila = await tx.tareaSemana.findFirst({
    where: { recordId },
    orderBy: { taskId: "asc" },
    select: { importacion: { select: { importId: true, confirmedAt: true } } },
  });
  return fila
    ? {
        importId: fila.importacion.importId,
        confirmadaEl: fila.importacion.confirmedAt?.toISOString() ?? null,
      }
    : null;
}

/** The last weeks of a person with their current record's counts, newest first. */
export async function leerSemanasConRegistro(
  tx: Tx,
  employeeId: string,
  limite: number,
) {
  const periodos = await tx.periodoEmpleado.findMany({
    where: {
      employeeId,
      registroVigente: { importacion: { status: "CONFIRMADA" } },
    },
    orderBy: { periodStart: "desc" },
    take: limite,
    select: {
      periodStart: true,
      periodEnd: true,
      registroVigente: { select: COLUMNAS_REGISTRO },
    },
  });
  return periodos.flatMap((p) =>
    p.registroVigente
      ? [
          {
            periodStart: fechaDesdeDb(p.periodStart),
            periodEnd: fechaDesdeDb(p.periodEnd),
            registro: p.registroVigente,
          },
        ]
      : [],
  );
}

export const CIERRES_MAXIMO = 52;

/** One task's closes, newest first; one more than the limit is read to know whether it was cut. */
export async function leerCierresTarea(tx: Tx, employeeId: string, taskId: string) {
  // Only rows of the current data version of each week: a superseded version must not repeat a close.
  const filas = await tx.tareaSemana.findMany({
    where: { employeeId, taskId, registro: { vigenteEn: { some: {} } } },
    orderBy: { periodStart: "desc" },
    take: CIERRES_MAXIMO + 1,
    include: { registro: { select: { periodo: { select: { periodEnd: true } } } } },
  });
  const cierres: CierreTareaDTO[] = filas.slice(0, CIERRES_MAXIMO).map((f) => ({
    periodStart: fechaDesdeDb(f.periodStart),
    periodEnd: fechaDesdeDb(f.registro.periodo.periodEnd),
    asignadaEl: fechaDesdeDb(f.asignadaEl),
    venceEl: f.venceEl ? fechaDesdeDb(f.venceEl) : null,
    completadaEl: f.completadaEl ? fechaDesdeDb(f.completadaEl) : null,
    estado: f.estadoCierre,
    diasAtraso: f.diasAtraso,
  }));
  const nueva = filas[0];
  return {
    cierres,
    truncado: filas.length > CIERRES_MAXIMO,
    cabecera: nueva
      ? {
          titulo: nueva.titulo,
          origen: nueva.origen,
          origenRef: enlaceSeguro(nueva.origenRef),
        }
      : null,
  };
}

/**
 * The covered people of a team (current catalogue, as every team read) with their current record of one
 * week. `soloLideres` keeps the Team Leads alone. People without the week loaded are left out.
 */
export async function leerSemanaDeEquipo(
  tx: Tx,
  filtro: { teamId: string; periodStart: FechaISO; soloLideres: boolean },
) {
  const periodos = await tx.periodoEmpleado.findMany({
    where: {
      periodStart: fechaParaDb(filtro.periodStart),
      registroVigente: { importacion: { status: "CONFIRMADA" } },
      empleado: {
        teamId: filtro.teamId,
        activo: true,
        enCobertura: true,
        tipo: filtro.soloLideres ? "TEAM_LEAD" : { in: ["TECNICO", "TEAM_LEAD"] },
      },
    },
    orderBy: { employeeId: "asc" },
    select: {
      employeeId: true,
      periodEnd: true,
      empleado: { select: { nombre: true } },
      registroVigente: {
        select: {
          recordId: true,
          huellaTareas: true,
          tareasActivas: true,
          tareasPendientes: true,
          tareasVencidas: true,
        },
      },
    },
  });
  return periodos.flatMap((p) =>
    p.registroVigente
      ? [
          {
            employeeId: p.employeeId,
            nombre: p.empleado.nombre,
            periodEnd: fechaDesdeDb(p.periodEnd),
            registro: p.registroVigente,
          },
        ]
      : [],
  );
}

/** One page of several records' tasks, in the week's order with the person as the last tiebreaker before the key. */
export async function paginaTareasDeRegistros(
  tx: Tx,
  filtro: { recordIds: string[]; estado?: EstadoTarea; page: number; pageSize: number },
) {
  if (!filtro.recordIds.length) return { items: [], total: 0 };
  const where: Prisma.TareaSemanaWhereInput = {
    recordId: { in: filtro.recordIds },
    ...(filtro.estado ? { estadoCierre: filtro.estado } : {}),
  };
  const [filas, total] = await Promise.all([
    tx.tareaSemana.findMany({
      where,
      orderBy: [
        { estadoCierre: "desc" },
        { diasAtraso: { sort: "desc", nulls: "last" } },
        { venceEl: { sort: "asc", nulls: "last" } },
        { employeeId: "asc" },
        { taskId: "asc" },
      ],
      skip: (filtro.page - 1) * filtro.pageSize,
      take: filtro.pageSize,
    }),
    tx.tareaSemana.count({ where }),
  ]);
  return {
    items: filas.map((f) => ({ ...aTarea(f), employeeId: f.employeeId })),
    total,
  };
}
