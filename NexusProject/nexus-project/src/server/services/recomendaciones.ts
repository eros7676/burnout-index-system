import type { Factor } from "../../shared/contracts";

const SUGERENCIA: Record<Factor, string> = {
  HE: "Sugerencia para revisión humana: mirar las horas extra de la semana.",
  DS: "Sugerencia para revisión humana: mirar los días consecutivos sin descanso.",
  CT: "Sugerencia para revisión humana: mirar las tareas pendientes y vencidas.",
  VP: "Sugerencia para revisión humana: mirar el saldo de vacaciones pendientes.",
};

/**
 * Textos deterministas para los factores excedidos, en el orden del ranking.
 * No ejecutan acciones. T11 puede usarlos al crear una alerta sin armar el informe.
 */
export function recomendacionesDe(
  ranking: readonly Factor[],
  excedidas: readonly Factor[],
): string[] {
  const excedido = new Set(excedidas);
  const lineas = ranking
    .filter((codigo) => excedido.has(codigo))
    .map((codigo) => SUGERENCIA[codigo]);
  if (lineas.length === 0) {
    return [
      "Ningún factor figura como excedido. No corresponde una acción automática.",
    ];
  }
  return lineas;
}
