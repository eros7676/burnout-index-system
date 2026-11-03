// Small, dependency-free charts. Each one carries a text alternative: a
// visually hidden table or an aria-label with the same numbers.
import type { Factor, Nivel } from "../contracts";
import {
  FACTOR,
  NIVEL,
  decimal,
  diaCorto,
  entero,
  semana as textoSemana,
  valorFactor,
} from "../formato";
import s from "./charts.module.css";

const ORDEN: Nivel[] = ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"];
const porcentaje = (parte: number, total: number) =>
  total ? Math.round((parte / total) * 100) : 0;

/** Share of each level in one week, low to high, Incompleto set apart. */
export function DistributionBar({
  conteo,
  leyenda = true,
}: {
  conteo: Record<Nivel, number>;
  leyenda?: boolean;
}) {
  const total = ORDEN.reduce((suma, n) => suma + conteo[n], 0);
  return (
    <div className={s.distribution}>
      <div
        className={s.bar}
        role={leyenda ? undefined : "img"}
        aria-hidden={leyenda || undefined}
        aria-label={
          leyenda
            ? undefined
            : ORDEN.map((n) => `${NIVEL[n]} ${conteo[n]}`).join(", ")
        }
      >
        {ORDEN.map((n) =>
          conteo[n] ? (
            <span
              key={n}
              className={s.lvl}
              data-nivel={n}
              style={{ flexGrow: conteo[n] }}
              title={`${NIVEL[n]}: ${conteo[n]}`}
            />
          ) : null,
        )}
      </div>
      {leyenda && (
        <ul className={s.legend}>
          {ORDEN.map((n) => (
            <li key={n} className={s.lvl} data-nivel={n}>
              <span className={s.legendLabel}>{NIVEL[n]}</span>
              <strong className="num">{entero(conteo[n])}</strong>
              <span className={`${s.legendShare} num`}>
                {porcentaje(conteo[n], total)} %
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type ColumnaSemana = {
  periodStart: string;
  periodEnd: string;
  conteo: Record<Nivel, number>;
};

/** Level mix per week: Alto sits on the baseline so its growth reads first. */
export function WeekColumns({
  semanas,
  actual,
}: {
  semanas: ColumnaSemana[];
  actual?: string;
}) {
  const maximo = Math.max(
    1,
    ...semanas.map((c) => ORDEN.reduce((suma, n) => suma + c.conteo[n], 0)),
  );
  const pila: Nivel[] = ["ALTO", "MEDIO", "BAJO", "INCOMPLETO"];
  return (
    <figure className={s.columns}>
      <div className={s.columnsPlot} aria-hidden="true">
        {semanas.map((c) => (
          <div
            key={c.periodStart}
            className={s.column}
            data-actual={c.periodStart === actual || undefined}
          >
            <span className={`${s.columnTop} num`}>
              {c.conteo.ALTO ? (
                <>
                  {c.conteo.ALTO}
                  <span className={s.topWord}> en Alto</span>
                </>
              ) : (
                ""
              )}
            </span>
            <div className={s.stack}>
              {pila.map((n) =>
                c.conteo[n] ? (
                  <span
                    key={n}
                    className={s.lvl}
                    data-nivel={n}
                    style={{ height: `${(c.conteo[n] / maximo) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <span className={s.columnLabel}>{diaCorto(c.periodStart)}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Personas por nivel en cada semana</caption>
        <thead>
          <tr>
            <th scope="col">Semana</th>
            {ORDEN.map((n) => (
              <th key={n} scope="col">
                {NIVEL[n]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((c) => (
            <tr key={c.periodStart}>
              <th scope="row">{textoSemana(c.periodStart, c.periodEnd)}</th>
              {ORDEN.map((n) => (
                <td key={n}>{c.conteo[n]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export type PuntoIndice = {
  periodStart: string;
  periodEnd: string;
  indice: number | null;
  nivel: Nivel | null;
  actualizado: boolean;
};

/** One person's index per week against the two limits that define the levels. */
export function IndexChart({
  puntos,
  medio,
  alto,
}: {
  puntos: PuntoIndice[];
  medio: number;
  alto: number;
}) {
  return (
    <figure className={s.index}>
      <div className={s.indexPlot} aria-hidden="true">
        <div className={s.limits}>
          {[alto, medio].map((limite) => (
            <span
              key={limite}
              className={s.limit}
              style={{ bottom: `${limite}%` }}
            >
              <span className="num">{limite}</span>
            </span>
          ))}
        </div>
        {puntos.map((p) => {
          const vigente = p.actualizado && p.indice !== null;
          return (
            <div key={p.periodStart} className={s.indexColumn}>
              <div className={s.indexTrack}>
                <span
                  className={`${s.indexBar} ${s.lvl}`}
                  data-nivel={vigente ? p.nivel : "ninguno"}
                  style={{ height: `${Math.min(100, p.indice ?? 0)}%` }}
                >
                  <span className={`${s.indexValue} num`}>
                    {vigente ? decimal(p.indice) : "—"}
                  </span>
                </span>
              </div>
              <span className={s.columnLabel}>{diaCorto(p.periodStart)}</span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>Índice por semana</caption>
        <thead>
          <tr>
            <th scope="col">Semana</th>
            <th scope="col">Índice</th>
            <th scope="col">Nivel</th>
          </tr>
        </thead>
        <tbody>
          {puntos.map((p) => (
            <tr key={p.periodStart}>
              <th scope="row">{textoSemana(p.periodStart, p.periodEnd)}</th>
              <td>{p.actualizado ? decimal(p.indice) : "Desactualizado"}</td>
              <td>{p.actualizado && p.nivel ? NIVEL[p.nivel] : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A factor's value against its threshold (a bullet graph): the marker is the limit. */
export function FactorBullet({
  factor,
  valor,
  umbral,
  excedido,
}: {
  factor: Factor;
  valor: number;
  umbral: number;
  excedido: boolean;
}) {
  const escala = Math.max(valor, umbral) * 1.25 || 1;
  return (
    <div
      className={s.bullet}
      data-excedido={excedido || undefined}
      role="img"
      aria-label={`${FACTOR[factor]}: ${valorFactor(factor, valor)}, umbral ${valorFactor(factor, umbral)}${excedido ? ", supera el umbral" : ""}.`}
    >
      <span className={s.bulletTrack} aria-hidden="true">
        <span
          className={s.bulletFill}
          style={{ width: `${(valor / escala) * 100}%` }}
        />
        <span
          className={s.bulletMark}
          style={{ left: `${(umbral / escala) * 100}%` }}
        />
      </span>
    </div>
  );
}
