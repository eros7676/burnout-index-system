// What the audit screens ask of the server. Kept beside the screens because the shared client
// (src/client) belongs to the dashboard; the routes and shapes come from the shared contracts.
// Relative imports on purpose: tests/auditoria-ui.test.ts runs the pure parts outside Next.js.
import { API_ROUTES } from "../../shared/api";
import type { FiltrosAuditoria, PaginaAuditoria } from "../../shared/contracts";
import type {
  DetalleAuditoria,
  FormatoExportacion,
  OperacionAuditoria,
} from "../../shared/contratos/auditoria";

/** `?a=1&b=2` for the filters that carry a value, or nothing. */
export function consultaDe(filtros: object) {
  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros))
    if (valor !== undefined && valor !== "") query.set(clave, String(valor));
  return query.size ? `?${query}` : "";
}

/** The file name the server proposed in `Content-Disposition`, if it is a plain one. */
export function nombreDeDescarga(cabecera: string | null) {
  const nombre = /filename="([^"/\\]+)"/.exec(cabecera ?? "")?.[1];
  return nombre ?? null;
}

async function pedir(ruta: string, signal?: AbortSignal) {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, { cache: "no-store", signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "No se pudo conectar con el servidor. Revise la conexión e intente nuevamente.",
    );
  }
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    throw new Error(
      typeof cuerpo?.error?.mensaje === "string"
        ? cuerpo.error.mensaje
        : `Error HTTP ${respuesta.status}.`,
    );
  }
  return respuesta;
}

async function leer<T>(ruta: string, signal: AbortSignal): Promise<T> {
  const respuesta = await pedir(ruta, signal);
  try {
    return (await respuesta.json()) as T;
  } catch {
    throw new Error(
      "El servidor no devolvió una respuesta válida. Intente nuevamente.",
    );
  }
}

const conId = (ruta: string, marca: string, id: string) =>
  ruta.replace(marca, encodeURIComponent(id));

export type ResultadoExportacion = {
  nombre: string;
  filas: number;
  /** More events matched than the file holds. */
  truncado: boolean;
};

export const auditoriaApi = {
  listar: (filtros: FiltrosAuditoria, signal: AbortSignal) =>
    leer<PaginaAuditoria>(
      `${API_ROUTES.listarAuditoria.path}${consultaDe(filtros)}`,
      signal,
    ),
  detalle: (eventoId: string, signal: AbortSignal) =>
    leer<DetalleAuditoria>(
      conId(API_ROUTES.obtenerEventoAuditoria.path, "{eventoId}", eventoId),
      signal,
    ),
  operacion: (correlacionId: string, signal: AbortSignal) =>
    leer<OperacionAuditoria>(
      conId(
        API_ROUTES.listarOperacionAuditoria.path,
        "{correlacionId}",
        correlacionId,
      ),
      signal,
    ),
  /** Downloads the filtered set; the server records the export before it answers. */
  async exportar(
    filtros: FiltrosAuditoria,
    formato: FormatoExportacion,
  ): Promise<ResultadoExportacion> {
    // The whole filtered set, not a page of it.
    const consulta = { ...filtros, formato, cursor: undefined, pageSize: undefined };
    const respuesta = await pedir(
      `${API_ROUTES.exportarAuditoria.path}${consultaDe(consulta)}`,
    );
    const nombre =
      nombreDeDescarga(respuesta.headers.get("content-disposition")) ??
      `auditoria.${formato}`;
    const archivo = await respuesta.blob();
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(archivo);
    enlace.download = nombre;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
    return {
      nombre,
      filas: Number(respuesta.headers.get("x-exportacion-filas") ?? 0),
      truncado: respuesta.headers.get("x-exportacion-truncada") === "true",
    };
  },
};
