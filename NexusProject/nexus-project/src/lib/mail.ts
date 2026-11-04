import type {
  Factor,
  IntentoNotificacion,
  ResultadoSimulado,
} from "../shared/contracts";
import { FACTOR, decimal, semana } from "../shared/formato";

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

/** What an alert notice says, read from the alert, its evaluation and the people involved. */
export type DatosAviso = {
  alertId: string;
  persona: { nombre: string; equipo: string | null };
  /** Who the notice is for (the Team Lead or Gerencia), named in the message. */
  destinatario: { nombre: string; tipo: "TECNICO" | "TEAM_LEAD" | "GERENCIA" };
  periodStart: string;
  periodEnd: string;
  indice: number;
  causas: readonly Factor[];
  sugerencias: readonly string[];
};

const PUESTO_DESTINO: Record<DatosAviso["destinatario"]["tipo"], string> = {
  TECNICO: "Técnico",
  TEAM_LEAD: "Team Lead",
  GERENCIA: "Gerencia",
};

/**
 * The notice as plain text: who and which week first, then the factors, the suggestions and a link
 * to the alert. It says it is not a diagnosis and, being a demo, whom it was meant for.
 */
export function mensajeAviso(
  datos: DatosAviso,
  appUrl: string,
): { asunto: string; texto: string } {
  const periodo = semana(datos.periodStart, datos.periodEnd);
  const equipo = datos.persona.equipo ? ` (${datos.persona.equipo})` : "";
  const causas = datos.causas.map((f) => FACTOR[f]);
  const factores =
    causas.length > 1 ? `${causas.slice(0, -1).join(", ")} y ${causas.at(-1)}` : (causas[0] ?? "ninguno");
  const destino = `${datos.destinatario.nombre} (${PUESTO_DESTINO[datos.destinatario.tipo]})`;
  return {
    asunto: `Alerta de posible sobrecarga: ${datos.persona.nombre}, semana ${periodo}`,
    texto: [
      `Para: ${destino}`,
      "",
      `${datos.persona.nombre}${equipo} quedó en nivel Alto la semana ${periodo}, con un índice de ${decimal(datos.indice)}.`,
      `Factores que superan su umbral: ${factores}.`,
      "",
      "Sugerencias de revisión:",
      ...datos.sugerencias.map((s) => `- ${s}`),
      "",
      `Ver la alerta y registrar el seguimiento: ${appUrl}/alerts/${encodeURIComponent(datos.alertId)}`,
      "",
      "El índice señala una posible sobrecarga de trabajo a partir de datos operativos; no es un diagnóstico médico y el sistema no toma decisiones. La revisión es humana.",
      `Demostración: este aviso iba dirigido a ${destino} y llega a la casilla de demostración.`,
    ].join("\n"),
  };
}
