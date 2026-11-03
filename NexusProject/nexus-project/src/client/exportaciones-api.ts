import { API_ROUTES } from "../shared/api";
import type {
  FiltrosExportacion,
  TipoExportacion,
} from "../shared/contratos/exportaciones";

export type ArchivoExportado = {
  blob: Blob;
  nombre: string;
  /** Rows of data in the file, from `X-Total-Filas`. */
  filas: number | null;
};

const NOMBRE = /filename="([^"\r\n]+)"/;

/**
 * Asks for one CSV with the filters the screen has. The server decides the scope (a Team Lead's file
 * never goes beyond their team) and records who exported what before the first byte leaves.
 */
export async function pedirExportacion(
  tipo: TipoExportacion,
  filtros: FiltrosExportacion,
  signal?: AbortSignal,
): Promise<ArchivoExportado> {
  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros))
    if (valor !== undefined && valor !== "") query.set(clave, String(valor));
  const ruta = API_ROUTES.descargarExportacion.path.replace(
    "{tipo}",
    encodeURIComponent(tipo),
  );
  let respuesta: Response;
  try {
    respuesta = await fetch(`${ruta}${query.size ? `?${query}` : ""}`, {
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "No se pudo conectar. Revise la conexión e inténtelo nuevamente.",
    );
  }
  if (!respuesta.ok) {
    let mensaje = "No se pudo generar el archivo.";
    try {
      const cuerpo = await respuesta.json();
      if (typeof cuerpo?.error?.mensaje === "string")
        mensaje = cuerpo.error.mensaje;
    } catch {
      // The status alone is all there is to say.
    }
    throw new Error(mensaje);
  }
  const filas = Number(respuesta.headers.get("X-Total-Filas"));
  return {
    blob: await respuesta.blob(),
    nombre:
      NOMBRE.exec(respuesta.headers.get("Content-Disposition") ?? "")?.[1] ??
      `${tipo}.csv`,
    filas: Number.isFinite(filas) && filas >= 0 ? filas : null,
  };
}

/** Hands the file to the browser's download, as a click on a link would. */
export function guardarArchivo({ blob, nombre }: ArchivoExportado) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  // The download has started by the time the task ends; the URL is no longer needed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
