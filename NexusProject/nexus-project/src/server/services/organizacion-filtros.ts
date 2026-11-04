// Query parameters of the organization reads. Anything unknown or repeated is a 400, as in the
// other read endpoints; ids use the same safe charset.
import type { FechaISO } from "../../shared/contracts";
import type {
  EstadoEquipo,
  EstadoPersona,
  FiltroNivel,
  FiltrosDirectorio,
  OrdenDirectorio,
} from "../../shared/contratos/organizacion";
import { ORDENES_DIRECTORIO } from "../../shared/contratos/organizacion";
import { ErrorOrganizacion } from "./organizacion-errores";
import { esFechaReal, esLunes } from "./organizacion-validacion";

const rechazar = (mensaje: string) =>
  new ErrorOrganizacion(400, "PETICION_INVALIDA", mensaje);

function exigirPermitidos(params: URLSearchParams, permitidos: readonly string[]) {
  for (const clave of params.keys())
    if (!permitidos.includes(clave) || params.getAll(clave).length !== 1)
      throw rechazar("Filtros desconocidos o repetidos.");
}

const opcion = <T extends string>(
  params: URLSearchParams,
  clave: string,
  validos: readonly T[],
): T | undefined => {
  const valor = params.get(clave);
  if (valor === null) return undefined;
  if (!validos.includes(valor as T)) throw rechazar(`Parámetro ${clave} no admitido.`);
  return valor as T;
};

function entero(params: URLSearchParams, clave: string, defecto: number, maximo: number) {
  const valor = params.get(clave);
  if (valor === null) return defecto;
  if (!/^[1-9]\d*$/.test(valor) || !Number.isSafeInteger(Number(valor)) || Number(valor) > maximo)
    throw rechazar(`Parámetro ${clave} no admitido.`);
  return Number(valor);
}

export function identificador(valor: string, clave = "identificador", maximo = 64) {
  if (!/^[A-Za-z0-9._-]+$/.test(valor) || valor.length > maximo)
    throw rechazar(`El ${clave} no es válido.`);
  return valor;
}

export function lunes(params: URLSearchParams, clave = "periodStart"): FechaISO | undefined {
  const valor = params.get(clave);
  if (valor === null) return undefined;
  if (!esFechaReal(valor) || !esLunes(valor))
    throw rechazar(`${clave} debe ser un lunes real en formato AAAA-MM-DD.`);
  return valor;
}

export function filtrosDirectorio(params: URLSearchParams): FiltrosDirectorio & {
  page: number;
  pageSize: number;
  estado: EstadoPersona;
  orden: OrdenDirectorio;
} {
  exigirPermitidos(params, [
    "periodStart", "teamId", "estado", "q", "nivel", "tipo", "orden", "page", "pageSize",
  ]);
  const q = params.get("q")?.trim() ?? "";
  if (q.length > 80) throw rechazar("La búsqueda admite hasta 80 caracteres.");
  const filtros: ReturnType<typeof filtrosDirectorio> = {
    page: entero(params, "page", 1, Number.MAX_SAFE_INTEGER),
    pageSize: entero(params, "pageSize", 50, 100),
    estado: opcion<EstadoPersona>(params, "estado", ["ACTIVAS", "BAJAS"]) ?? "ACTIVAS",
    orden: opcion<OrdenDirectorio>(params, "orden", ORDENES_DIRECTORIO) ?? "indice",
  };
  const periodStart = lunes(params);
  if (periodStart) filtros.periodStart = periodStart;
  if (params.has("teamId")) filtros.teamId = identificador(params.get("teamId")!, "equipo");
  if (q) filtros.q = q;
  const nivel = opcion<FiltroNivel>(params, "nivel", [
    "BAJO", "MEDIO", "ALTO", "INCOMPLETO", "DESACTUALIZADO",
  ]);
  if (nivel) filtros.nivel = nivel;
  const tipo = opcion<"TECNICO" | "TEAM_LEAD">(params, "tipo", ["TECNICO", "TEAM_LEAD"]);
  if (tipo) filtros.tipo = tipo;
  return filtros;
}

export function filtrosEquipos(params: URLSearchParams): {
  periodStart?: FechaISO;
  estado: EstadoEquipo;
  teamId?: string;
} {
  exigirPermitidos(params, ["periodStart", "estado", "teamId"]);
  const filtros: ReturnType<typeof filtrosEquipos> = {
    estado: opcion<EstadoEquipo>(params, "estado", ["ACTIVOS", "INACTIVOS"]) ?? "ACTIVOS",
  };
  const periodStart = lunes(params);
  if (periodStart) filtros.periodStart = periodStart;
  if (params.has("teamId")) filtros.teamId = identificador(params.get("teamId")!, "equipo");
  return filtros;
}

/** `GET /api/equipos/{teamId}` takes only the week. */
export function filtroSemanaEquipo(params: URLSearchParams) {
  exigirPermitidos(params, ["periodStart"]);
  return { periodStart: lunes(params) };
}

/** Calendar weeks of history a profile reads: 12 by default, 52 at most (task-evidence-scale §6.2). */
export function semanasDeFicha(params: URLSearchParams) {
  exigirPermitidos(params, ["semanas"]);
  return entero(params, "semanas", 12, 52);
}

export function sinFiltros(params: URLSearchParams) {
  exigirPermitidos(params, []);
}
