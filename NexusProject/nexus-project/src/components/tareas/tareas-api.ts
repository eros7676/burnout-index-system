// Client reads of the task evidence. Same shape as the other client APIs: no-store, aborted with the
// view, and the server's message shown as is; transport failures speak in the formal register.
import { API_ROUTES } from "@/shared/api";
import type { CuerposExito, PeticionesApi } from "@/shared/api";

type Operacion =
  | "listarTareasSemana"
  | "listarTareasEquipo"
  | "listarSemanasConTareas"
  | "consultarHistorialTarea"
  | "consultarMisTareas"
  | "listarJornadasSemana";

async function consultar<K extends Operacion>(
  operacion: K,
  filtros: Record<string, string | number | undefined>,
  signal: AbortSignal,
): Promise<CuerposExito[K]> {
  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros))
    if (valor !== undefined && valor !== "") query.set(clave, String(valor));
  let response: Response;
  try {
    response = await fetch(
      `${API_ROUTES[operacion].path}${query.size ? `?${query}` : ""}`,
      { cache: "no-store", signal },
    );
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "No se pudo conectar. Verifique la conexión e inténtelo nuevamente.",
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "El servidor no devolvió una respuesta válida. Inténtelo nuevamente.",
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

export const tareasApi = {
  semana: (
    filtros: NonNullable<PeticionesApi["listarTareasSemana"]["query"]>,
    signal: AbortSignal,
  ) => consultar("listarTareasSemana", filtros, signal),
  equipo: (
    filtros: NonNullable<PeticionesApi["listarTareasEquipo"]["query"]>,
    signal: AbortSignal,
  ) => consultar("listarTareasEquipo", filtros, signal),
  /** Counts per week (no rows, so not an audited read). */
  semanas: (
    filtros: NonNullable<PeticionesApi["listarSemanasConTareas"]["query"]>,
    signal: AbortSignal,
  ) => consultar("listarSemanasConTareas", filtros, signal),
  historial: (employeeId: string, taskId: string, signal: AbortSignal) =>
    consultar("consultarHistorialTarea", { employeeId, taskId }, signal),
  propias: (
    filtros: NonNullable<PeticionesApi["consultarMisTareas"]["query"]>,
    signal: AbortSignal,
  ) => consultar("consultarMisTareas", filtros, signal),
  /** The seven days of a person-week (jornadas-v1), under the task rows' rule. */
  dias: (filtros: PeticionesApi["listarJornadasSemana"]["query"], signal: AbortSignal) =>
    consultar("listarJornadasSemana", filtros, signal),
};
