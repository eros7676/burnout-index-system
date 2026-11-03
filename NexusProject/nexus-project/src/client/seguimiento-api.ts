import { API_ROUTES } from "../shared/api";
import type { CuerposExito, PeticionesApi } from "../shared/api";
import type { ErrorCampo } from "../shared/contracts";
import type {
  AbrirSeguimiento,
  ActualizarSeguimiento,
  AnotarSeguimiento,
  CerrarSeguimiento,
  MarcarMedida,
  RegistrarMedida,
} from "../shared/contratos/seguimiento";

type Operacion =
  | "obtenerAlerta"
  | "obtenerSeguimiento"
  | "abrirSeguimiento"
  | "actualizarSeguimiento"
  | "anotarSeguimiento"
  | "registrarMedida"
  | "marcarMedida"
  | "cerrarSeguimiento";

/** A failed call: the message for the page and, for a refused form, the message of each field. */
export class ErrorLlamada extends Error {
  constructor(
    mensaje: string,
    public detalles: ErrorCampo[] = [],
  ) {
    super(mensaje);
  }
  /** The message the server gave for one field of the form, if any. */
  campo(nombre: string) {
    return this.detalles.find((d) => d.campo === nombre)?.detalle;
  }
}

async function llamar<K extends Operacion>(
  operacion: K,
  alertId: string,
  cuerpo?: PeticionesApi[K]["body"],
  signal?: AbortSignal,
): Promise<CuerposExito[K]> {
  const ruta = API_ROUTES[operacion];
  let respuesta: Response;
  try {
    respuesta = await fetch(
      ruta.path.replace("{alertId}", encodeURIComponent(alertId)),
      {
        method: ruta.method,
        cache: "no-store",
        signal,
        ...(cuerpo !== undefined
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(cuerpo),
            }
          : {}),
      },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    // The browser's own text ("Failed to fetch") says nothing to the user.
    throw new ErrorLlamada(
      "No se pudo conectar. Revise la conexión e inténtelo nuevamente.",
    );
  }
  let body;
  try {
    body = await respuesta.json();
  } catch {
    throw new ErrorLlamada(
      "El servidor no devolvió una respuesta válida. Inténtelo nuevamente.",
    );
  }
  if (!respuesta.ok)
    throw new ErrorLlamada(
      typeof body?.error?.mensaje === "string"
        ? body.error.mensaje
        : "No se pudo completar la operación.",
      Array.isArray(body?.error?.detalles) ? body.error.detalles : [],
    );
  return body as CuerposExito[K];
}

/** The alert page and its follow-up case. Every write answers with the alert's whole follow-up. */
export const seguimientoApi = {
  alerta: (alertId: string, signal: AbortSignal) =>
    llamar("obtenerAlerta", alertId, undefined, signal),
  obtener: (alertId: string, signal: AbortSignal) =>
    llamar("obtenerSeguimiento", alertId, undefined, signal),
  abrir: (alertId: string, cuerpo: AbrirSeguimiento) =>
    llamar("abrirSeguimiento", alertId, cuerpo),
  actualizar: (alertId: string, cuerpo: ActualizarSeguimiento) =>
    llamar("actualizarSeguimiento", alertId, cuerpo),
  anotar: (alertId: string, cuerpo: AnotarSeguimiento) =>
    llamar("anotarSeguimiento", alertId, cuerpo),
  registrarMedida: (alertId: string, cuerpo: RegistrarMedida) =>
    llamar("registrarMedida", alertId, cuerpo),
  marcarMedida: (alertId: string, cuerpo: MarcarMedida) =>
    llamar("marcarMedida", alertId, cuerpo),
  cerrar: (alertId: string, cuerpo: CerrarSeguimiento) =>
    llamar("cerrarSeguimiento", alertId, cuerpo),
};
