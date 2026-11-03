import type { Factor } from "../../shared/contracts";

const SUGERENCIA: Record<Factor, string> = {
  HE: "Revisar las horas extra de la semana.",
  DS: "Revisar los días consecutivos sin descanso.",
  CT: "Revisar las tareas pendientes y vencidas.",
  VP: "Revisar el saldo de vacaciones pendientes.",
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
    return ["Ningún factor supera su umbral."];
  }
  return lineas;
}
