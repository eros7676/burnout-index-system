// The audit screen's filters live in the URL, so a resource page can link to its trail
// (/audit?sujetoId=EMP-001) and a link can be shared. This module turns the query string into the
// screen's filters and into the API's (audit-trail.md §4.1). Relative imports on purpose:
// tests/auditoria-ui.test.ts runs it outside Next.js.
import {
  ACCIONES_AUDITORIA,
  definicionAccion,
  ENTIDADES_AUDITORIA,
  type EntidadAuditoria,
} from "../../shared/auditoria-catalogo";
import type { FiltrosAuditoria } from "../../shared/contracts";

export const POR_PAGINA = 25;

export type Periodo = "hoy" | "7d" | "30d" | "todo" | "personalizado";
export const PERIODOS: Record<Exclude<Periodo, "personalizado">, string> = {
  hoy: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  todo: "Todo el historial",
};

export type FiltrosUi = {
  periodo: Periodo;
  /** Days (YYYY-MM-DD) in Buenos Aires; only when `periodo` is "personalizado". */
  desde: string;
  hasta: string;
  entidad: "" | EntidadAuditoria;
  accion: string;
  resultado: "" | "EXITO" | "FALLO" | "DENEGADO";
  origen: "" | "WEB" | "CLI" | "SISTEMA";
  actorId: string;
  recursoId: string;
  sujetoId: string;
  correlacionId: string;
  solicitudId: string;
  q: string;
  consultas: boolean;
};

export const FILTROS_INICIALES: FiltrosUi = {
  periodo: "30d",
  desde: "",
  hasta: "",
  entidad: "",
  accion: "",
  resultado: "",
  origen: "",
  actorId: "",
  recursoId: "",
  sujetoId: "",
  correlacionId: "",
  solicitudId: "",
  q: "",
  consultas: false,
};

/** The codes a link can carry: they narrow to one thing, so they look at the whole history. */
const CODIGOS = ["recursoId", "sujetoId", "correlacionId", "solicitudId", "q"] as const;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const PERIODOS_URL = ["hoy", "7d", "30d", "todo"] as const;

const dentro = <T extends string>(valor: string | null, lista: readonly T[]) =>
  (lista as readonly string[]).includes(valor ?? "") ? (valor as T) : "";
const codigo = (valor: string | null) => (valor ?? "").trim().slice(0, 64);
const dia = (valor: string | null) => (DIA.test(valor ?? "") ? valor! : "");

const periodoPorDefecto = (f: Pick<FiltrosUi, (typeof CODIGOS)[number] | "desde" | "hasta">) =>
  f.desde || f.hasta
    ? "personalizado"
    : CODIGOS.some((c) => f[c])
      ? "todo"
      : "30d";

export function filtrosDeUrl(params: Pick<URLSearchParams, "get">): FiltrosUi {
  const base = {
    desde: dia(params.get("desde")),
    hasta: dia(params.get("hasta")),
    recursoId: codigo(params.get("recursoId")),
    sujetoId: codigo(params.get("sujetoId")),
    correlacionId: codigo(params.get("correlacionId")),
    solicitudId: codigo(params.get("solicitudId")),
    q: codigo(params.get("q")),
  };
  const explicito = dentro(params.get("periodo"), PERIODOS_URL);
  return {
    ...base,
    periodo: base.desde || base.hasta ? "personalizado" : explicito || periodoPorDefecto(base),
    entidad: dentro(params.get("entidad"), Object.keys(ENTIDADES_AUDITORIA) as EntidadAuditoria[]),
    accion: dentro(params.get("accion"), ACCIONES_AUDITORIA),
    resultado: dentro(params.get("resultado"), ["EXITO", "FALLO", "DENEGADO"] as const),
    origen: dentro(params.get("origen"), ["WEB", "CLI", "SISTEMA"] as const),
    actorId: codigo(params.get("actorId")),
    consultas: params.get("consultas") === "1",
  };
}

/** The query string (without "?") that reproduces the filters; empty for the default view. */
export function urlDeFiltros(f: FiltrosUi): string {
  const params = new URLSearchParams();
  if (f.periodo !== "personalizado" && f.periodo !== periodoPorDefecto(f))
    params.set("periodo", f.periodo);
  for (const [clave, valor] of [
    ["desde", f.desde],
    ["hasta", f.hasta],
    ["entidad", f.entidad],
    ["accion", f.accion],
    ["resultado", f.resultado],
    ["actorId", f.actorId],
    ["origen", f.origen],
    ["recursoId", f.recursoId],
    ["sujetoId", f.sujetoId],
    ["correlacionId", f.correlacionId],
    ["solicitudId", f.solicitudId],
    ["q", f.q],
  ] as const)
    if (valor) params.set(clave, valor);
  if (f.consultas) params.set("consultas", "1");
  return params.toString();
}

/**
 * A change to the filters, kept coherent: picking a preset period clears the days, picking a day
 * makes the period custom, and an action that does not belong to the new entity is dropped.
 */
export function conCambio(f: FiltrosUi, cambio: Partial<FiltrosUi>): FiltrosUi {
  const siguiente = { ...f, ...cambio };
  if (cambio.periodo !== undefined && cambio.periodo !== "personalizado") {
    siguiente.desde = "";
    siguiente.hasta = "";
  } else if (siguiente.desde || siguiente.hasta) siguiente.periodo = "personalizado";
  else if (siguiente.periodo === "personalizado")
    siguiente.periodo = periodoPorDefecto(siguiente);
  if (cambio.entidad !== undefined && siguiente.entidad && siguiente.accion)
    if (definicionAccion(siguiente.accion)?.entidad !== siguiente.entidad)
      siguiente.accion = "";
  return siguiente;
}

/** True when anything differs from the screen as it opens. */
export const hayFiltros = (f: FiltrosUi) => urlDeFiltros(f) !== "";

export const rangoInvertido = (f: FiltrosUi) =>
  f.periodo === "personalizado" && !!f.desde && !!f.hasta && f.desde > f.hasta;

// The API takes UTC instants; a picked day is a day in the product's zone, Buenos Aires,
// which has kept UTC−3 without daylight saving since 2009.
const inicioDelDia = (dia: string) =>
  new Date(`${dia}T00:00:00.000-03:00`).toISOString();
const finDelDia = (dia: string) =>
  new Date(`${dia}T23:59:59.999-03:00`).toISOString();
const hoyEnBuenosAires = (ahora: Date) =>
  new Date(ahora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const restarDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T00:00:00.000Z`) - n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const DIAS_ATRAS = { hoy: 0, "7d": 6, "30d": 29 } as const;

/** The API's filters; `ahora` is injected so the rolling periods are testable. */
export function filtrosParaApi(f: FiltrosUi, ahora: Date): FiltrosAuditoria {
  const filtros: FiltrosAuditoria = { pageSize: POR_PAGINA };
  if (f.periodo === "personalizado") {
    if (f.desde) filtros.desde = inicioDelDia(f.desde);
    if (f.hasta) filtros.hasta = finDelDia(f.hasta);
  } else if (f.periodo !== "todo")
    filtros.desde = inicioDelDia(
      restarDias(hoyEnBuenosAires(ahora), DIAS_ATRAS[f.periodo]),
    );
  if (f.entidad) filtros.entidad = f.entidad;
  for (const clave of [
    "accion",
    "resultado",
    "origen",
    "actorId",
    "recursoId",
    "sujetoId",
    "correlacionId",
    "solicitudId",
    "q",
  ] as const)
    if (f[clave]) Object.assign(filtros, { [clave]: f[clave] });
  if (f.consultas) filtros.consultas = "1";
  return filtros;
}

/** The list screen with these filters. */
export const rutaLista = (f: FiltrosUi) => {
  const query = urlDeFiltros(f);
  return query ? `/audit?${query}` : "/audit";
};

/**
 * An event's page, carrying the list it was opened from so "back" restores the same filters.
 * The list travels as one encoded query string and is re-validated when read (`rutaDeRetorno`).
 */
export const enlaceDetalle = (eventoId: string, f: FiltrosUi) => {
  const query = urlDeFiltros(f);
  const base = `/audit/${encodeURIComponent(eventoId)}`;
  return query ? `${base}?lista=${encodeURIComponent(query)}` : base;
};

/** Back to the list: whatever `lista` carried, passed through the same validation as the URL. */
export const rutaDeRetorno = (lista: string | null) =>
  rutaLista(filtrosDeUrl(new URLSearchParams(lista ?? "")));

export const enlaceOperacion = (correlacionId: string) =>
  `/audit/operations/${encodeURIComponent(correlacionId)}`;
