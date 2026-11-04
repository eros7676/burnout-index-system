import type { Factor, RegistroLaboral } from "../../shared/contracts";
import { FACTOR } from "../../shared/formato";

/** What the suggestions read: the stored evaluation's ranking, its exceeded factors and the
 * snapshot it was computed from (the week, the week before and that version's thresholds). */
export type EntradaRecomendaciones = {
  ranking: readonly Factor[];
  excedidas: readonly Factor[];
  snapshot: {
    actual: RegistroLaboral;
    anterior: RegistroLaboral | null;
    reglas: { thresholds: Record<Factor, number> };
  };
};

const NUMERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const n = (valor: number) => NUMERO.format(valor);
const dias = (valor: number) => `${n(valor)} ${valor === 1 ? "día" : "días"}`;
const horas = (valor: number) => `${n(valor)} h`;

/** How far a value is past its threshold, in the factor's unit. */
function exceso(valor: number, umbral: number, unidad: (v: number) => string) {
  if (valor >= umbral * 2)
    return `${valor === umbral * 2 ? "el doble" : "más del doble"} del umbral (${unidad(umbral)})`;
  return `${unidad(valor - umbral)} por encima del umbral (${unidad(umbral)})`;
}

/** The week before, against the same threshold: was it already past it? */
function antes(anterior: number | undefined, umbral: number, unidad: (v: number) => string) {
  if (anterior === undefined) return "";
  return anterior > umbral
    ? `; también lo superó la semana anterior (${unidad(anterior)})`
    : `; la semana anterior estaba dentro del umbral (${unidad(anterior)})`;
}

type Linea = (actual: RegistroLaboral, anterior: RegistroLaboral | null, umbral: number) => string;

/**
 * One line per factor: the fact from the week's data, then a suggestion for a person to weigh
 * (PDF §5.4: review task assignment and due dates, redistribute load, consider rest, avoid
 * further assignments). Nothing here acts.
 */
const LINEA: Record<Factor, Linea> = {
  HE: (a, p, u) =>
    `${horas(a.horasExtra)} extra en la semana, ${exceso(a.horasExtra, u, horas)}` +
    `${antes(p?.horasExtra, u, horas)}. ` +
    "Evitar asignaciones adicionales y revisar qué tareas se pueden redistribuir.",
  DS: (a, p, u) =>
    `${dias(a.diasConsecutivosSinDescanso)} seguidos sin descanso, ` +
    `${exceso(a.diasConsecutivosSinDescanso, u, dias)}${antes(p?.diasConsecutivosSinDescanso, u, dias)}. ` +
    "Evaluar un día de descanso en los próximos días.",
  CT: (a, p) => {
    const cierre = `${n(a.tareasPendientes)} tareas pendientes de ${n(a.tareasActivas)} al cierre`;
    const previa = p ? `; la semana anterior, ${n(p.tareasPendientes)} de ${n(p.tareasActivas)}` : "";
    return a.tareasVencidas > 0
      ? `${cierre}, ${n(a.tareasVencidas)} ${a.tareasVencidas === 1 ? "vencida" : "vencidas"}${previa}. ` +
          "Revisar la asignación y los vencimientos: reasignar tareas o acordar nuevas fechas."
      : `${cierre}, ninguna vencida${previa}. ` +
          "Revisar la asignación: priorizar o redistribuir las pendientes.";
  },
  VP: (a, _p, u) => {
    const desde =
      a.diasDesdeUltimasVacaciones === null
        ? ""
        : `; las últimas vacaciones fueron hace ${dias(a.diasDesdeUltimasVacaciones)}`;
    return (
      `${dias(a.vacacionesPendientesDias)} de vacaciones pendientes, ` +
      `${exceso(a.vacacionesPendientesDias, u, dias)}${desde}. Evaluar un descanso programado.`
    );
  },
};

/**
 * Suggestions for the exceeded factors, in ranking order, written from the week's own data.
 * Pure: it reads only the evaluation's snapshot, so the report, the alert and the person page
 * say the same for the same evaluation. Each line starts with the factor's name and a colon.
 */
export function recomendacionesDe(evaluacion: EntradaRecomendaciones): string[] {
  const { actual, anterior, reglas } = evaluacion.snapshot;
  const excedido = new Set(evaluacion.excedidas);
  const lineas = evaluacion.ranking
    .filter((codigo) => excedido.has(codigo))
    .map((codigo) => `${FACTOR[codigo]}: ${LINEA[codigo](actual, anterior, reglas.thresholds[codigo])}`);
  return lineas.length ? lineas : ["Ningún factor supera su umbral."];
}
