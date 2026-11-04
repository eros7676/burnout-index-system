import type { Factor, ResumenDTO } from "@/shared/contracts";
import { FACTOR, entero } from "@/shared/formato";
import { Tip } from "@/shared/ui";
import { DEFINICION_FACTOR } from "../definiciones";
import s from "./condiciones.module.css";

const plural = (n: number) => (n === 1 ? "persona" : "personas");

/** The finding first: the most frequent condition, in words. */
function hallazgo(orden: [Factor, number][], total: number) {
  const [factor, n] = orden[0];
  if (total === 0) return "Nadie tiene un resultado vigente esta semana.";
  if (n === 0) return `Ninguna de ${entero(total)} ${plural(total)} supera un umbral esta semana.`;
  return `La condición más frecuente es ${FACTOR[factor].toLocaleLowerCase("es")}: ${entero(n)} de ${entero(total)} ${plural(total)}.`;
}

/**
 * Answers «¿qué condición de trabajo pesa más esta semana?»: per factor, how many people with a
 * current result exceed its threshold, most frequent first. Four values, each labelled where it
 * is drawn, so the bars carry no hidden number and need no readout.
 */
export function Condiciones({ resumen }: { resumen: ResumenDTO }) {
  const total = resumen.totalEvaluaciones;
  const orden = (Object.entries(resumen.excedidas) as [Factor, number][]).sort(
    (a, b) => b[1] - a[1] || FACTOR[a[0]].localeCompare(FACTOR[b[0]], "es"),
  );
  return (
    <div className={s.cuerpo}>
      <p className={s.hallazgo}>{hallazgo(orden, total)}</p>
      <ol className={s.lista} aria-label="Personas que superan cada umbral">
        {orden.map(([factor, n]) => (
          <li key={factor} className={s.fila}>
            <span className={s.nombre}>
              <Tip contenido={DEFINICION_FACTOR[factor]}>{FACTOR[factor]}</Tip>
            </span>
            <span className={s.valor}>
              {entero(n)} <span className={s.de}>de {entero(total)}</span>
            </span>
            <span className={s.pista} aria-hidden="true">
              <span className={s.barra} style={{ width: total ? `${(n / total) * 100}%` : 0 }} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
