// Hours worked per week, with the extra hours stacked on top of the rest.
// Neutral on purpose: it shows loaded data, never a level.
import { diaCorto, semana as textoSemana } from "../formato";
import s from "./hours-columns.module.css";

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

/** One column per week, oldest to newest; a hidden table carries the numbers. */
export function HoursColumns({ semanas }: { semanas: SemanaHoras[] }) {
  const maximo = Math.max(
    1,
    ...semanas.map((w) => Math.max(w.trabajadas ?? 0, w.extra)),
  );
  const alto = (valor: number) => `${(valor / maximo) * 100}%`;
  return (
    <figure className={s.chart}>
      <ul className={s.legend} aria-hidden="true">
        <li data-serie="resto">Horas trabajadas</li>
        <li data-serie="extra">De ellas, horas extra</li>
      </ul>
      <div className={s.plot} aria-hidden="true">
        {semanas.map((w) => {
          const resto = w.trabajadas === null ? 0 : w.trabajadas - w.extra;
          return (
            <div key={w.periodStart} className={s.column}>
              <span className={s.values}>
                <strong className="num">
                  {w.trabajadas === null ? "Sin dato" : horas(w.trabajadas)}
                </strong>
                <span className="num">{horas(w.extra)} extra</span>
              </span>
              <div className={s.track}>
                <span
                  className={s.resto}
                  style={{ height: alto(resto), bottom: 0 }}
                />
                <span
                  className={s.extra}
                  style={{ height: alto(w.extra), bottom: alto(resto) }}
                />
              </div>
              <span className={s.label}>{diaCorto(w.periodStart)}</span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
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
    </figure>
  );
}
