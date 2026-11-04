"use client";
// Hours worked per week on an hours axis, the extra hours stacked on the regular ones.
// Neutral on purpose: it shows loaded data, never a level or the index.
import { escalaLinda } from "../escala";
import { diaCorto, semana as textoSemana } from "../formato";
import s from "./hours-columns.module.css";
import { Plot } from "./plot";
import type { Lectura } from "./tip";

export type SemanaHoras = {
  periodStart: string;
  periodEnd: string;
  /** Total hours worked, extra hours included; null when the file left it empty. */
  trabajadas: number | null;
  extra: number;
};

// Hours are not rounded: a loaded 7,5 h stays 7,5 h.
const HORAS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const horas = (valor: number) => `${HORAS.format(valor)} h`;

/** One column per week, oldest to newest; the readout and a hidden table carry the numbers. */
export function HoursColumns({ semanas }: { semanas: SemanaHoras[] }) {
  const { tope, ticks } = escalaLinda(
    Math.max(1, ...semanas.map((w) => Math.max(w.trabajadas ?? 0, w.extra))),
  );
  const ultima = semanas.findLastIndex((w) => w.trabajadas !== null);
  const alto = (v: number) => `${(v / tope) * 100}%`;
  const lectura = (i: number): Lectura => {
    const w = semanas[i];
    return {
      titulo: textoSemana(w.periodStart, w.periodEnd),
      filas:
        w.trabajadas === null
          ? []
          : [
              { etiqueta: "trabajadas", valor: horas(w.trabajadas), clave: "var(--chart-quiet)" },
              { etiqueta: "de ellas, extra", valor: horas(w.extra), clave: "var(--ink-2)" },
            ],
      nota: w.trabajadas === null ? "El archivo no trae las horas de esta semana." : undefined,
    };
  };
  return (
    <figure className={s.chart}>
      <ul className={s.legend} aria-hidden="true">
        <li data-serie="resto">Horas trabajadas</li>
        <li data-serie="extra">De ellas, horas extra</li>
      </ul>
      <Plot
        nombre="Horas trabajadas por semana"
        etiquetas={semanas.map((w) => diaCorto(w.periodStart))}
        actual={semanas.length - 1}
        tope={tope}
        ticks={ticks}
        formatoTick={(v) => `${HORAS.format(v)}`}
        lectura={lectura}
        marca={(i) => {
          const w = semanas[i];
          if (w.trabajadas === null) return <span className={s.sinDato} />;
          return (
            <span className={s.columna} style={{ height: alto(w.trabajadas) }}>
              {i === ultima && (
                <span className={`${s.rotulo} num`}>{horas(w.trabajadas)}</span>
              )}
              {w.extra > 0 && (
                <span className={s.extra} style={{ flexGrow: w.extra }} />
              )}
              {w.trabajadas - w.extra > 0 && (
                <span className={s.resto} style={{ flexGrow: w.trabajadas - w.extra }} />
              )}
            </span>
          );
        }}
      />
      <div className="sr-only">
        <table>
          <caption>Horas por semana</caption>
          <thead>
            <tr>
              <th scope="col">Semana</th>
              <th scope="col">Horas trabajadas</th>
              <th scope="col">Horas extra</th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((w) => (
              <tr key={w.periodStart}>
                <th scope="row">{textoSemana(w.periodStart, w.periodEnd)}</th>
                <td>{w.trabajadas === null ? "Sin dato" : horas(w.trabajadas)}</td>
                <td>{horas(w.extra)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
