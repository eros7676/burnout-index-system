// Query-string rules of the task routes: a closed set of keys, each at most once, every value checked.
import { API_DEFAULTS } from "../../shared/api";
import type { FechaISO } from "../../shared/contracts";
import {
  ESTADOS_TAREA,
  type EstadoTarea,
} from "../../shared/contratos/tareas";
import { fechaParaDb } from "../repositories/fechas";
import { ErrorConsulta, identificador } from "./filtros-consultas";

/** Weeks of a person's ledger: 12 by default (D10), a year at most. */
export const SEMANAS_DEFECTO = 12;
export const SEMANAS_MAXIMO = 52;

type Params = URLSearchParams;
function leer(request: Request, permitidos: readonly string[]): Params {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys())
    if (!permitidos.includes(key) || params.getAll(key).length !== 1)
      throw new ErrorConsulta(400, "Filtros desconocidos o repetidos.");
  return params;
}

function entero(params: Params, key: string, defecto: number, maximo: number) {
  const valor = params.get(key);
  if (valor === null) return defecto;
  const numero = Number(valor);
  if (!/^[1-9]\d*$/.test(valor) || !Number.isSafeInteger(numero) || numero > maximo)
    throw new ErrorConsulta(400, `Parámetro ${key} inválido.`);
  return numero;
}

function lunes(params: Params, key: string): FechaISO | undefined {
  const valor = params.get(key);
  if (valor === null) return undefined;
  try {
    if (fechaParaDb(valor).getUTCDay() !== 1) throw new Error();
  } catch {
    throw new ErrorConsulta(
      400,
      `${key} debe ser un lunes real en formato YYYY-MM-DD.`,
    );
  }
  return valor;
}

function estado(params: Params): EstadoTarea | undefined {
  const valor = params.get("estado");
  if (valor === null) return undefined;
  if (!(ESTADOS_TAREA as readonly string[]).includes(valor))
    throw new ErrorConsulta(400, "Estado inválido.");
  return valor as EstadoTarea;
}

function requerido<T>(valor: T | undefined, clave: string): T {
  if (valor === undefined)
    throw new ErrorConsulta(400, `Falta el parámetro ${clave}.`);
  return valor;
}

/** `teamId` is not asked for: `proteger` adds the Team Lead's team, and the service honours it. */
export type FiltroSemana = {
  employeeId: string;
  periodStart: FechaISO;
  recordId?: string;
  estado?: EstadoTarea;
  teamId?: string;
  page: number;
  pageSize: number;
};

export function filtrosSemana(request: Request): FiltroSemana {
  const params = leer(request, [
    "employeeId",
    "periodStart",
    "recordId",
    "estado",
    "teamId",
    "page",
    "pageSize",
  ]);
  const filtro: FiltroSemana = {
    employeeId: identificador(requerido(params.get("employeeId") ?? undefined, "employeeId")),
    periodStart: requerido(lunes(params, "periodStart"), "periodStart"),
    page: entero(params, "page", API_DEFAULTS.page, Number.MAX_SAFE_INTEGER),
    pageSize: entero(params, "pageSize", API_DEFAULTS.pageSize, API_DEFAULTS.maxPageSize),
  };
  if (params.has("recordId")) filtro.recordId = identificador(params.get("recordId")!, 36);
  const e = estado(params);
  if (e) filtro.estado = e;
  if (params.has("teamId")) filtro.teamId = identificador(params.get("teamId")!);
  return filtro;
}

/** A team's week. The team is asked for: `proteger` checks a Team Lead's against their own. */
export type FiltroEquipo = {
  teamId: string;
  periodStart: FechaISO;
  estado?: EstadoTarea;
  page: number;
  pageSize: number;
};

export function filtrosEquipo(request: Request): FiltroEquipo {
  const params = leer(request, ["teamId", "periodStart", "estado", "page", "pageSize"]);
  const filtro: FiltroEquipo = {
    teamId: identificador(requerido(params.get("teamId") ?? undefined, "teamId")),
    periodStart: requerido(lunes(params, "periodStart"), "periodStart"),
    page: entero(params, "page", API_DEFAULTS.page, Number.MAX_SAFE_INTEGER),
    pageSize: entero(params, "pageSize", API_DEFAULTS.pageSize, API_DEFAULTS.maxPageSize),
  };
  const e = estado(params);
  if (e) filtro.estado = e;
  return filtro;
}

export type FiltroSemanas = { employeeId: string; teamId?: string; semanas: number };

export function filtrosSemanas(request: Request): FiltroSemanas {
  const params = leer(request, ["employeeId", "teamId", "semanas"]);
  const filtro: FiltroSemanas = {
    employeeId: identificador(requerido(params.get("employeeId") ?? undefined, "employeeId")),
    semanas: entero(params, "semanas", SEMANAS_DEFECTO, SEMANAS_MAXIMO),
  };
  if (params.has("teamId")) filtro.teamId = identificador(params.get("teamId")!);
  return filtro;
}

/** Keys of the source system: letters, digits and `_ . : / -`, at most 64 characters. */
const CLAVE_TAREA = /^[A-Za-z0-9_.:/-]{1,64}$/;

export type FiltroHistorial = { employeeId: string; taskId: string; teamId?: string };

export function filtrosHistorial(request: Request): FiltroHistorial {
  const params = leer(request, ["employeeId", "taskId", "teamId"]);
  const taskId = requerido(params.get("taskId") ?? undefined, "taskId");
  if (!CLAVE_TAREA.test(taskId))
    throw new ErrorConsulta(400, "Identificador de tarea inválido.");
  const filtro: FiltroHistorial = {
    employeeId: identificador(requerido(params.get("employeeId") ?? undefined, "employeeId")),
    taskId,
  };
  if (params.has("teamId")) filtro.teamId = identificador(params.get("teamId")!);
  return filtro;
}

export type FiltroMisTareas = {
  periodStart?: FechaISO;
  estado?: EstadoTarea;
  page: number;
  pageSize: number;
  semanas: number;
};

/** No person parameter exists: the signed-in person is the only one it can name. */
export function filtrosMisTareas(request: Request): FiltroMisTareas {
  const params = leer(request, ["periodStart", "estado", "page", "pageSize", "semanas"]);
  const filtro: FiltroMisTareas = {
    page: entero(params, "page", API_DEFAULTS.page, Number.MAX_SAFE_INTEGER),
    pageSize: entero(params, "pageSize", API_DEFAULTS.pageSize, API_DEFAULTS.maxPageSize),
    semanas: entero(params, "semanas", SEMANAS_DEFECTO, SEMANAS_MAXIMO),
  };
  const desde = lunes(params, "periodStart");
  if (desde) filtro.periodStart = desde;
  const e = estado(params);
  if (e) filtro.estado = e;
  return filtro;
}
