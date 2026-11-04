"use client";
// The product's charts (work/graficos/propuesta.md). Each mark has a readout on hover, keyboard
// focus (one tab stop, arrow keys) and tap; each chart keeps a text alternative (a hidden table
// or an accessible name) with the same numbers, so the readout enhances and never gates.
import type { Factor, Nivel } from "../contracts";
import { escalaLinda } from "../escala";
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
import { Plot } from "./plot";
import { type Lectura, useLectura } from "./tip";

const ORDEN: Nivel[] = ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"];
const porcentaje = (parte: number, total: number) =>
  total ? Math.round((parte / total) * 100) : 0;
/** A level's colour for a readout's key stroke (Incompleto keys with its outline grey). */
export const CLAVE_NIVEL: Record<Nivel, string> = {
  BAJO: "var(--level-bajo)",
  MEDIO: "var(--level-medio)",
  ALTO: "var(--level-alto)",
  INCOMPLETO: "var(--level-incompleto)",
};
const personas = (n: number) => `${entero(n)} ${n === 1 ? "persona" : "personas"}`;

/** Share of each level in one week, low to high, Incompleto set apart. */
export function DistributionBar({
  conteo,
  leyenda = true,
}: {
  conteo: Record<Nivel, number>;
  leyenda?: boolean;
}) {
  const total = ORDEN.reduce((suma, n) => suma + conteo[n], 0);
  const presentes = ORDEN.filter((n) => conteo[n] > 0);
  const lectura = (i: number): Lectura => {
    const n = presentes[i];
    return {
      titulo: NIVEL[n],
      filas: [
        { etiqueta: `de ${personas(total)}`, valor: entero(conteo[n]), clave: CLAVE_NIVEL[n] },
        { etiqueta: "del total", valor: `${porcentaje(conteo[n], total)} %` },
      ],
    };
  };
  const { contenedor, marca, burbuja, vivo } = useLectura(presentes.length, lectura);
  return (
    <div className={s.distribution}>
      <div
        {...contenedor}
        className={s.bar}
        role="group"
        aria-label={`Personas por nivel: ${ORDEN.map((n) => `${NIVEL[n]} ${conteo[n]}`).join(", ")}.`}
      >
        {presentes.map((n, i) => (
          <span
            key={n}
            className={`${s.lvl} ${s.segmento}`}
            data-nivel={n}
            style={{ flexGrow: conteo[n] }}
            {...marca(i)}
          />
        ))}
        {burbuja}
        {vivo}
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

/** Level mix per week on a people axis: Alto sits on the baseline so its growth reads first. */
export function WeekColumns({
  semanas,
  actual,
}: {
  semanas: ColumnaSemana[];
  actual?: string;
}) {
  const totales = semanas.map((c) => ORDEN.reduce((suma, n) => suma + c.conteo[n], 0));
  const { tope, ticks } = escalaLinda(
    // Headroom for the one direct label above the tallest column.
    Math.max(1, ...totales) * 1.1,
    { entero: true, marcas: 5 },
  );
  const pila: Nivel[] = ["ALTO", "MEDIO", "BAJO", "INCOMPLETO"];
  const iActual = semanas.findIndex((c) => c.periodStart === actual);
  const etiquetado = iActual >= 0 ? iActual : semanas.length - 1;
  const lectura = (i: number): Lectura => {
    const c = semanas[i];
    return {
      titulo: textoSemana(c.periodStart, c.periodEnd),
      filas: pila.map((n) => ({
        etiqueta: NIVEL[n],
        valor: entero(c.conteo[n]),
        clave: CLAVE_NIVEL[n],
      })),
      nota: `${personas(totales[i])}; ${porcentaje(c.conteo.ALTO, totales[i])} % en Alto.`,
    };
  };
  return (
    <figure className={s.figura}>
      <Plot
        nombre="Personas por nivel en cada semana"
        etiquetas={semanas.map((c) => diaCorto(c.periodStart))}
        actual={iActual >= 0 ? iActual : undefined}
        tope={tope}
        ticks={ticks}
        lectura={lectura}
        marca={(i) => (
          <div
            className={s.pila}
            style={{ height: `${(totales[i] / tope) * 100}%` }}
          >
            {i === etiquetado && semanas[i].conteo.ALTO > 0 && (
              <span className={`${s.rotulo} num`}>
                {entero(semanas[i].conteo.ALTO)} en Alto
              </span>
            )}
            {pila.map((n) =>
              semanas[i].conteo[n] ? (
                <span
                  key={n}
                  className={s.lvl}
                  data-nivel={n}
                  style={{ flexGrow: semanas[i].conteo[n] }}
                />
              ) : null,
            )}
          </div>
        )}
      />
      <div className="sr-only">
        <table>
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
      </div>
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

/** Why a week reads the way it does, in the readout. */
function notaIndice(p: PuntoIndice, alto: number) {
  if (!p.actualizado)
    return "Resultado desactualizado: cambiaron los datos o las reglas y falta recalcular.";
  if (p.indice === null || p.nivel === null) return "Sin resultado para esta semana.";
  if (p.nivel === "INCOMPLETO")
    return "Falta la semana anterior: no se puede confirmar si la carga se sostiene.";
  if (p.nivel !== "ALTO" && p.indice >= alto)
    return `Superó ${alto}, pero Alto pide dos semanas seguidas sobre ${alto} con factores en común.`;
  if (p.nivel === "ALTO") return `Segunda semana seguida sobre ${alto} con factores en común.`;
  return undefined;
}

/**
 * One person's index per week on 0–100, over quiet bands that mark the two limits. A missing or
 * stale week is a gap, never zero. A week over the Alto limit that is not Alto (persistence not
 * met) gets a hollow point, and its readout says why.
 */
export function IndexChart({
  puntos,
  medio,
  alto,
}: {
  puntos: PuntoIndice[];
  medio: number;
  alto: number;
}) {
  const n = puntos.length;
  const vigente = (p: PuntoIndice) => p.actualizado && p.indice !== null && p.nivel !== null;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - Math.min(100, Math.max(0, v));
  // The line breaks at every gap: one path per run of consecutive weeks with a result.
  const tramos: string[] = [];
  let tramo: string[] = [];
  puntos.forEach((p, i) => {
    if (vigente(p)) tramo.push(`${tramo.length ? "L" : "M"}${x(i)} ${y(p.indice!)}`);
    else {
      if (tramo.length > 1) tramos.push(tramo.join(" "));
      tramo = [];
    }
  });
  if (tramo.length > 1) tramos.push(tramo.join(" "));
  const ultimo = puntos.findLastIndex(vigente);
  const lectura = (i: number): Lectura => {
    const p = puntos[i];
    return {
      titulo: textoSemana(p.periodStart, p.periodEnd),
      filas: vigente(p)
        ? [
            { etiqueta: "Índice", valor: decimal(p.indice), clave: CLAVE_NIVEL[p.nivel!] },
            { etiqueta: "Nivel", valor: NIVEL[p.nivel!] },
          ]
        : [],
      nota: notaIndice(p, alto),
    };
  };
  return (
    <figure className={s.figura}>
      <Plot
        nombre="Índice por semana"
        etiquetas={puntos.map((p) => diaCorto(p.periodStart))}
        actual={n - 1}
        tope={100}
        ticks={[0, medio, alto, 100]}
        bandas={[
          { desde: 0, hasta: medio, tono: "bajo" },
          { desde: medio, hasta: alto, tono: "medio" },
          { desde: alto, hasta: 100, tono: "alto" },
        ]}
        lectura={lectura}
        capa={
          <svg
            className={s.linea}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {tramos.map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
        }
        marca={(i) => {
          const p = puntos[i];
          if (!vigente(p)) return <span className={s.sinDato} />;
          const sinPersistencia = p.nivel !== "ALTO" && p.indice! >= alto;
          return (
            <>
              <span
                className={`${s.punto} ${s.lvl}`}
                data-nivel={p.nivel}
                data-hueco={sinPersistencia || p.nivel === "INCOMPLETO" || undefined}
                style={{ bottom: `${Math.min(100, p.indice!)}%` }}
              />
              {i === ultimo && (
                <span
                  className={`${s.valorFinal} num`}
                  style={{ bottom: `${Math.min(100, p.indice!)}%` }}
                >
                  {decimal(p.indice)}
                </span>
              )}
            </>
          );
        }}
      />
      <div className="sr-only">
        <table>
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
      </div>
    </figure>
  );
}

/** The bullet scale: every row runs from 0 to twice its threshold, so the marks line up. */
const TOPE_UMBRAL = 2;

/**
 * A factor's value against its threshold (a bullet graph). Every row shares one scale, the share
 * of its own threshold from 0 to 200 %, so the threshold mark sits at the same place in every
 * row and the rows compare.
 */
export function FactorBullet({
  factor,
  valor,
  umbral,
  excedido,
  puntaje,
}: {
  factor: Factor;
  valor: number;
  umbral: number;
  excedido: boolean;
  puntaje?: number;
}) {
  const proporcion = umbral > 0 ? valor / umbral : 0;
  const lectura = (): Lectura => ({
    titulo: FACTOR[factor],
    filas: [
      { etiqueta: "valor de la semana", valor: valorFactor(factor, valor) },
      { etiqueta: "umbral", valor: valorFactor(factor, umbral) },
      { etiqueta: "del umbral", valor: `${Math.round(proporcion * 100)} %` },
      ...(puntaje !== undefined
        ? [{ etiqueta: "puntaje del factor", valor: decimal(puntaje) }]
        : []),
    ],
    nota: excedido ? "Supera su umbral." : "Por debajo de su umbral.",
  });
  const { contenedor, marca, burbuja, vivo } = useLectura(1, lectura);
  return (
    <div
      {...contenedor}
      className={s.bullet}
      data-excedido={excedido || undefined}
      role="group"
      aria-label={`${FACTOR[factor]}: ${valorFactor(factor, valor)}, umbral ${valorFactor(factor, umbral)}${excedido ? ", supera el umbral" : ""}.`}
    >
      <span className={s.bulletTrack} {...marca(0)}>
        <span
          className={s.bulletFill}
          style={{ width: `${(Math.min(proporcion, TOPE_UMBRAL) / TOPE_UMBRAL) * 100}%` }}
        />
        <span className={s.bulletMark} />
      </span>
      {burbuja}
      {vivo}
    </div>
  );
}
