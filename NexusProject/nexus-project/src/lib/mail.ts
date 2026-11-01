import type {
  IntentoNotificacion,
  ResultadoSimulado,
} from "../shared/contracts";

/** Simulador puro y determinista: no usa SMTP, red, direcciones ni credenciales. */
export function simularCorreo(
  destinatarioId: string | null,
  resultado: ResultadoSimulado,
): Pick<IntentoNotificacion, "estado" | "detalle"> {
  if (!destinatarioId)
    return {
      estado: "SIN_DESTINATARIO",
      detalle: "No hay un responsable válido para la simulación.",
    };
  if (resultado === "FALLO")
    return {
      estado: "FALLIDO",
      detalle: "Fallo de envío simulado solicitado para la demostración.",
    };
  return { estado: "ENVIADO", detalle: "Enviado (simulado)." };
}
