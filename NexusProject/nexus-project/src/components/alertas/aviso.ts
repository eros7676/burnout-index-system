// How an alert reads: who it went to, how far its (simulated) delivery got, its
// factors and suggestions in words. Shared by Alertas and the Informe.
import type {
  Alerta,
  Factor,
  IntentoNotificacion,
  PersonaDTO,
} from "@/shared/contracts";
import { ESTADO_ENVIO, FACTOR } from "@/shared/formato";

/**
 * A technician's alert goes to their Team Lead, a person in the catalog; a Team
 * Lead's goes to management, which is not one of the people listed.
 */
export function nombreDestinatario(
  destinatarioId: string,
  personas: readonly PersonaDTO[],
  propio?: string | null,
) {
  if (propio && destinatarioId === propio) return "Usted";
  return (
    personas.find((p) => p.employeeId === destinatarioId)?.nombre ??
    "Gerencia de Operaciones"
  );
}

/** Nobody to notify: an incident to fix in the catalog, kept visible (T11). */
export const sinDestinatario = (alerta: Alerta) =>
  alerta.destinatarioId === null || alerta.estadoEnvio === "SIN_DESTINATARIO";

/** The alert as the server leaves it after a simulated attempt (T12), without reloading it. */
export const trasIntento = (intento: IntentoNotificacion): Partial<Alerta> => ({
  canal: "SIMULADO",
  estadoEnvio: intento.estado,
  destinatarioId: intento.destinatarioId,
  motivoDestinatario: intento.destinatarioId ? "OK" : "SIN_DESTINATARIO",
});

export type Tono = "neutro" | "aviso" | "exito" | "incidencia";

/** The delivery state in words; anything on the simulated channel says so (T12). */
export function envio(alerta: Alerta): { texto: string; tono: Tono } {
  const simulado = alerta.canal === "SIMULADO";
  switch (alerta.estadoEnvio) {
    case "SIN_DESTINATARIO":
      return { texto: ESTADO_ENVIO.SIN_DESTINATARIO, tono: "incidencia" };
    case "PENDIENTE":
      return {
        texto: simulado ? "Envío simulado pendiente" : ESTADO_ENVIO.PENDIENTE,
        tono: "aviso",
      };
    case "ENVIADO":
      return { texto: ESTADO_ENVIO.ENVIADO, tono: "exito" };
    case "FALLIDO":
      return {
        texto: simulado ? "Envío simulado fallido" : ESTADO_ENVIO.FALLIDO,
        tono: "aviso",
      };
    default:
      return { texto: ESTADO_ENVIO.NO_APLICA, tono: "neutro" };
  }
}

/** "Horas extra, Carga de tareas y Vacaciones pendientes" (the alert's factors) */
export function causasEnPalabras(causas: readonly Factor[]) {
  const nombres = causas.map((f) => FACTOR[f]);
  if (!nombres.length) return "Sin factores registrados";
  return nombres.length > 1
    ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`
    : nombres[0];
}

const PREFIJO = /^sugerencia para revisión humana:\s*/i;
/** A suggestion without the prefix every one of them repeats; the list title says it once. */
export function sugerencia(texto: string) {
  const limpio = texto.replace(PREFIJO, "");
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}
