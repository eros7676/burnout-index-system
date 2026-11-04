// Query-string filters of the alerts list and its CSV export: the board's common filters plus the
// follow-up ones. Unknown or repeated keys are rejected, so a typo never silently widens a list.
import {
  FILTROS_SEGUIMIENTO,
  type FiltroSeguimiento,
} from "../../shared/contratos/seguimiento";
import {
  ErrorConsulta,
  filtrosConsulta,
  identificador,
} from "./filtros-consultas";
import type { ConsultaAlertas } from "./seguimiento-alertas";

const PROPIOS = ["seguimiento", "asignadoA", "vencido", "dirigidas"] as const;

/** The follow-up filters of a request, validated; the board's own keys are left to `filtrosConsulta`. */
export function filtrosSeguimiento(params: URLSearchParams): {
  seguimiento?: FiltroSeguimiento;
  asignadoA?: string;
  vencido?: "1";
  dirigidas?: "1";
} {
  for (const clave of PROPIOS)
    if (params.getAll(clave).length > 1)
      throw new ErrorConsulta(400, "Filtros desconocidos o repetidos.");
  const resultado: ReturnType<typeof filtrosSeguimiento> = {};
  const seguimiento = params.get("seguimiento");
  if (seguimiento !== null) {
    if (!FILTROS_SEGUIMIENTO.includes(seguimiento as FiltroSeguimiento))
      throw new ErrorConsulta(400, "Estado de seguimiento inválido.");
    resultado.seguimiento = seguimiento as FiltroSeguimiento;
  }
  const asignadoA = params.get("asignadoA");
  if (asignadoA !== null) resultado.asignadoA = identificador(asignadoA);
  const vencido = params.get("vencido");
  if (vencido !== null) {
    if (vencido !== "1") throw new ErrorConsulta(400, "El filtro de vencidos admite solo 1.");
    resultado.vencido = "1";
  }
  const dirigidas = params.get("dirigidas");
  if (dirigidas !== null) {
    if (dirigidas !== "1") throw new ErrorConsulta(400, "El filtro de alertas dirigidas admite solo 1.");
    resultado.dirigidas = "1";
  }
  return resultado;
}

/** The alerts list's filters: employeeId, teamId, periodStart, page, pageSize and the follow-up ones. */
export function filtrosAlertas(request: Request): ConsultaAlertas {
  const url = new URL(request.url);
  const propios = filtrosSeguimiento(url.searchParams);
  const comunes = new URL(url);
  for (const clave of PROPIOS) comunes.searchParams.delete(clave);
  return {
    ...filtrosConsulta(new Request(comunes, { method: "GET" }), "alertas"),
    ...propios,
  };
}
