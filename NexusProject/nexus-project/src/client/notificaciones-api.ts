import { API_ROUTES, type CuerposExito } from "../shared/api";
import type { SolicitudNotificacion } from "../shared/contracts";
type Operacion =
  "listarNotificaciones" | "prepararNotificacion" | "procesarNotificacion";
async function llamar<K extends Operacion>(
  operacion: K,
  alertId: string,
  intentoId?: string,
  solicitud?: SolicitudNotificacion,
): Promise<CuerposExito[K]> {
  const ruta = API_ROUTES[operacion];
  const respuesta = await fetch(
    ruta.path
      .replace("{alertId}", encodeURIComponent(alertId))
      .replace("{intentoId}", encodeURIComponent(intentoId ?? "")),
    {
      method: ruta.method,
      cache: "no-store",
      ...(solicitud
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(solicitud),
          }
        : {}),
    },
  );
  const body = await respuesta.json();
  if (!respuesta.ok)
    throw new Error(
      body?.error?.mensaje ?? "No se pudo completar la simulación.",
    );
  return body;
}
export const notificacionesApi = {
  listar: (alertId: string) => llamar("listarNotificaciones", alertId),
  preparar: (alertId: string, solicitud: SolicitudNotificacion) =>
    llamar("prepararNotificacion", alertId, undefined, solicitud),
  procesar: (alertId: string, intentoId: string) =>
    llamar("procesarNotificacion", alertId, intentoId),
};
