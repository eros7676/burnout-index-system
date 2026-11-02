import { API_ROUTES } from "../shared/api";
import type { CuerposExito } from "../shared/api";
import type {
  FiltrosAuditoria,
  FiltrosAlertas,
  FiltrosComunes,
  FiltrosEvaluaciones,
} from "../shared/contracts";

type Consulta =
  | "listarEvaluaciones"
  | "obtenerResumen"
  | "listarAlertas"
  | "obtenerInforme"
  | "listarPersonas"
  | "consultarMisDatos"
  | "consultarReglas"
  | "listarAuditoria";

async function consultar<K extends Consulta>(
  operacion: K,
  filtros: FiltrosEvaluaciones | FiltrosAlertas | FiltrosComunes | FiltrosAuditoria,
  signal: AbortSignal,
  evaluationId?: string,
): Promise<CuerposExito[K]> {
  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== "") query.set(clave, String(valor));
  }
  const ruta = API_ROUTES[operacion].path.replace(
    "{evaluationId}",
    encodeURIComponent(evaluationId ?? ""),
  );
  let response: Response;
  try {
    response = await fetch(`${ruta}${query.size ? `?${query}` : ""}`, {
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "No se pudo conectar. Revisá la conexión y volvé a intentar.",
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "El servidor no devolvió una respuesta JSON válida. Volvé a intentar.",
    );
  }
  if (!response.ok)
    throw new Error(
      typeof body?.error?.mensaje === "string"
        ? body.error.mensaje
        : `Error HTTP ${response.status}.`,
    );
  return body as CuerposExito[K];
}

export const tableroApi = {
  evaluaciones: (filtros: FiltrosEvaluaciones, signal: AbortSignal) =>
    consultar("listarEvaluaciones", filtros, signal),
  resumen: (filtros: FiltrosComunes, signal: AbortSignal) =>
    consultar("obtenerResumen", filtros, signal),
  alertas: (filtros: FiltrosAlertas, signal: AbortSignal) =>
    consultar("listarAlertas", filtros, signal),
  informe: (id: string, signal: AbortSignal) =>
    consultar("obtenerInforme", {}, signal, id),
  personas: (
    filtros: Pick<FiltrosComunes, "employeeId" | "teamId">,
    signal: AbortSignal,
  ) => consultar("listarPersonas", filtros, signal),
  misDatos: (signal: AbortSignal) =>
    consultar("consultarMisDatos", {}, signal),
  reglas: (signal: AbortSignal) => consultar("consultarReglas", {}, signal),
  auditoria: (filtros: FiltrosAuditoria, signal: AbortSignal) =>
    consultar("listarAuditoria", filtros, signal),
};
