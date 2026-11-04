import type { Factor } from "@/shared/contracts";
import { MIDE } from "./reglas/parametros";

/**
 * Tooltip texts for the metrics the screens name. Each one states the rule the engine applies
 * (calculo.ts, reglas.tsx), so a header explains what its column means without repeating it.
 */
export const DEFINICION = {
  indice:
    "Suma de los puntajes de los cuatro factores según su peso, de 0 a 100.",
  nivel:
    "Clasificación del índice de la semana. Alto exige un índice elevado durante dos semanas consecutivas, con factores en común.",
  racha: "Semanas consecutivas, hasta la semana elegida, con nivel Alto.",
  promedio:
    "Promedio del índice de las personas del equipo con resultado vigente en la semana.",
  enAltoEquipo:
    "Personas del equipo con índice elevado durante dos semanas consecutivas, con factores en común.",
  vigentes:
    "Personas con un resultado calculado y al día con los datos y las reglas actuales, sobre las personas evaluables del equipo.",
  nuevasEnAlto:
    "Personas en nivel Alto esta semana que no lo estaban en la anterior.",
  puntaje:
    "Puntaje del factor, de 0 a 100: 50 al alcanzar el umbral y 100 al duplicarlo.",
  aporte:
    "Puntaje multiplicado por el peso del factor. La suma de los aportes es el índice.",
  umbral:
    "Valor de referencia del factor: equivale a 50 puntos, y a 100 al duplicarlo.",
  frenteAlUmbral:
    "La barra llega al doble del umbral; la marca indica el umbral.",
  vigenciaAlerta:
    "Activa mientras su resultado sea el vigente de la semana; pasa a Superada cuando un nuevo cálculo lo reemplaza.",
} as const;

/** What each factor measures; the task load also states how it is weighed. */
export const DEFINICION_FACTOR: Record<Factor, string> = {
  ...MIDE,
  CT: "Tareas vencidas (60 %) y pendientes (40 %) sobre las tareas activas de la semana.",
};
