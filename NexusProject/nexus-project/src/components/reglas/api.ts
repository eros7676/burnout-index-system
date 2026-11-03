// Calls of the rules editor. A refused step arrives as `ErrorReglas` with the server's code
// and the problems by field, so the screen can place each message next to its control.
import { API_ROUTES } from "@/shared/api";
import type { ApiError, ErrorCampo, JobDTO } from "@/shared/contracts";
import {
  RUTAS_REGLAS,
  type CuerposReglas,
  type FiltrosBorradoresReglas,
  type PropuestaReglas,
} from "@/shared/contratos/reglas";

export class ErrorReglas extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
    readonly detalles: ErrorCampo[] = [],
  ) {
    super(mensaje);
    this.name = "ErrorReglas";
  }
}

type Operacion = keyof typeof RUTAS_REGLAS;
type Entrada = {
  borradorId?: string;
  query?: FiltrosBorradoresReglas;
  cuerpo?: object;
  signal?: AbortSignal;
};

const SIN_CONEXION =
  "No se pudo conectar con el servidor. Verifique la conexión e inténtelo nuevamente.";

async function leerRespuesta(respuesta: Response) {
  try {
    return await respuesta.json();
  } catch {
    throw new ErrorReglas(
      respuesta.status,
      "RESPUESTA_INVALIDA",
      "El servidor no devolvió una respuesta válida. Inténtelo nuevamente.",
    );
  }
}

async function enviar<T>(
  ruta: string,
  metodo: string,
  { cuerpo, signal }: Pick<Entrada, "cuerpo" | "signal">,
): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      cache: "no-store",
      signal,
      ...(cuerpo !== undefined && {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ErrorReglas(0, "SIN_CONEXION", SIN_CONEXION);
  }
  const cuerpoRespuesta = await leerRespuesta(respuesta);
  if (!respuesta.ok) {
    const e = (cuerpoRespuesta as Partial<ApiError>).error;
    throw new ErrorReglas(
      respuesta.status,
      typeof e?.codigo === "string" ? e.codigo : "ERROR",
      typeof e?.mensaje === "string" ? e.mensaje : `Error HTTP ${respuesta.status}.`,
      Array.isArray(e?.detalles) ? e.detalles : [],
    );
  }
  return cuerpoRespuesta as T;
}

function pedir<K extends Operacion>(
  operacion: K,
  { borradorId, query, ...resto }: Entrada = {},
): Promise<CuerposReglas[K]> {
  const { method, path } = RUTAS_REGLAS[operacion];
  const ruta = path.replace("{borradorId}", encodeURIComponent(borradorId ?? ""));
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(query ?? {}))
    if (valor !== undefined) parametros.set(clave, String(valor));
  return enviar(parametros.size ? `${ruta}?${parametros}` : ruta, method, resto);
}

export const reglasApi = {
  versiones: (signal: AbortSignal) => pedir("listarVersionesReglas", { signal }),
  borradores: (query: FiltrosBorradoresReglas, signal: AbortSignal) =>
    pedir("listarBorradoresReglas", { query, signal }),
  crear: () => pedir("crearBorradorReglas", { cuerpo: {} }),
  obtener: (borradorId: string, signal: AbortSignal) =>
    pedir("obtenerBorradorReglas", { borradorId, signal }),
  guardar: (
    borradorId: string,
    cuerpo: { huella: string; motivo: string; propuesta: PropuestaReglas },
  ) => pedir("actualizarBorradorReglas", { borradorId, cuerpo }),
  simular: (borradorId: string, huella: string) =>
    pedir("simularBorradorReglas", { borradorId, cuerpo: { huella } }),
  enviar: (borradorId: string, huella: string) =>
    pedir("enviarBorradorReglas", { borradorId, cuerpo: { huella } }),
  aprobar: (borradorId: string, huella: string) =>
    pedir("aprobarBorradorReglas", { borradorId, cuerpo: { huella } }),
  rechazar: (borradorId: string, huella: string, justificacion: string) =>
    pedir("rechazarBorradorReglas", {
      borradorId,
      cuerpo: { huella, justificacion },
    }),
  publicar: (borradorId: string, huella: string) =>
    pedir("publicarBorradorReglas", { borradorId, cuerpo: { huella } }),
  descartar: (borradorId: string, huella: string) =>
    pedir("descartarBorradorReglas", { borradorId, cuerpo: { huella } }),
  /** Reprocessing job of a published version (RR. HH. only, like the import's own status). */
  procesamiento: (jobId: string, signal: AbortSignal) =>
    enviar<JobDTO>(
      API_ROUTES.consultarProcesamiento.path.replace("{jobId}", encodeURIComponent(jobId)),
      "GET",
      { signal },
    ),
};
