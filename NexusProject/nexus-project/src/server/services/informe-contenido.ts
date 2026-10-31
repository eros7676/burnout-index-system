import type { Evaluacion, FactorInforme } from "../../shared/contracts";

const CIERRE =
  "Parámetros demostrativos; no es un diagnóstico de burnout y no dispara una acción automática.";

function puntos(indice: number): string {
  return indice.toFixed(2).replace(".", ",");
}

/** Texto del informe a partir del resultado ya guardado, sin recalcular. */
export function explicarInforme(evaluacion: Evaluacion): string {
  const { indice, nivel, persistencia, rulesVersion, snapshot } = evaluacion;
  const { mediumLimit, highLimit } = snapshot.reglas;
  const visible = puntos(indice);
  if (nivel === "INCOMPLETO") {
    return `${visible} puntos, nivel INCOMPLETO. No hay semana previa inmediata (${persistencia.motivo}); el índice numérico se conserva. Versión ${rulesVersion}. ${CIERRE}`;
  }
  if (nivel === "BAJO") {
    return `${visible} puntos, nivel BAJO, por debajo del corte ${mediumLimit} de la versión ${rulesVersion}. ${CIERRE}`;
  }
  if (nivel === "ALTO") {
    const comunes = persistencia.comunesExcedidas.join(", ") || "ninguno";
    const anterior = persistencia.anterior
      ? ` La semana previa quedó en ${puntos(persistencia.anterior.indice)} puntos.`
      : "";
    return `${visible} puntos, nivel ALTO. Se cumple la persistencia (${persistencia.motivo}) con factores comunes ${comunes}.${anterior} Versión ${rulesVersion}. ${CIERRE}`;
  }
  const pico =
    indice >= highLimit
      ? ` El índice alcanza el corte alto ${highLimit}, pero el nivel guardado es MEDIO porque la persistencia es ${persistencia.motivo}.`
      : ` Queda entre los cortes ${mediumLimit} y ${highLimit} (persistencia ${persistencia.motivo}).`;
  return `${visible} puntos, nivel MEDIO.${pico} Versión ${rulesVersion}. ${CIERRE}`;
}

/** Factores en el orden del ranking guardado y con los umbrales del snapshot. */
export function factoresInforme(evaluacion: Evaluacion): FactorInforme[] {
  const excedidas = new Set(evaluacion.excedidas);
  return evaluacion.ranking.map((codigo) => ({
    codigo,
    valor: evaluacion.indicadores[codigo],
    umbral: evaluacion.snapshot.reglas.thresholds[codigo],
    score: evaluacion.scores[codigo],
    contribucion: evaluacion.contribuciones[codigo],
    excedido: excedidas.has(codigo),
  }));
}
