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

export type PuntoTendencia = {
  periodStart: string;
  periodEnd: string;
  /** null: no data for the week; the line breaks there, it never drops to zero. */
  valor: number | null;
};

// Axis ticks are round numbers (escalaLinda): at most one decimal, never an index-like «7,50».
const TICK = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/** The y position of v on a 0–tope axis, in the plot's 0–100 viewBox (0 at the top). */
const alturaEn = (v: number, tope: number) => 100 - (Math.min(v, tope) / tope) * 100;

/** One path per run of consecutive weeks with a value: a gap breaks the line. */
function tramosDeLinea(valores: (number | null)[], y: (v: number) => number) {
  const n = valores.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const tramos: string[] = [];
  let tramo: string[] = [];
  valores.forEach((v, i) => {
    if (v !== null) tramo.push(`${tramo.length ? "L" : "M"}${x(i)} ${y(v)}`);
    else {
      if (tramo.length > 1) tramos.push(tramo.join(" "));
      tramo = [];
    }
  });
  if (tramo.length > 1) tramos.push(tramo.join(" "));
  return tramos;
}

/**
 * One quantity per week, oldest to newest: a 2 px line broken at weeks without data, a point on
 * every week and the value of the week the page is about labelled beside its point. It answers
 * "is it rising or falling?"; the finding goes in the section's text, above it.
 */
export function TrendLine({
  nombre,
  puntos,
  actual,
  etiqueta,
  formato,
  tono = "neutro",
  enteros = false,
  nota,
}: {
  /** What the line measures, for its accessible name and hidden table. */
  nombre: string;
  puntos: PuntoTendencia[];
  /** periodStart of the week the page is about; the newest week with a value otherwise. */
  actual?: string;
  /** The readout's row label (e.g. «personas en Alto»). */
  etiqueta: string;
  formato: (v: number) => string;
  /** "alto": the line counts people in Alto and wears its colour and diamond. */
  tono?: "alto" | "neutro";
  enteros?: boolean;
  /** An extra line for a week's readout. */
  nota?: (i: number) => string | undefined;
}) {
  const valores = puntos.map((p) => p.valor);
  const maximo = Math.max(0, ...valores.filter((v): v is number => v !== null));
  // Headroom so the labelled value never meets the top of the plot.
  const { tope, ticks } = escalaLinda(Math.max(1, maximo * 1.15), { entero: enteros });
  const iActual = puntos.findIndex((p) => p.periodStart === actual);
  const rotulado = iActual >= 0 && valores[iActual] !== null ? iActual : valores.findLastIndex((v) => v !== null);
  const clave = tono === "alto" ? "var(--level-alto)" : "var(--ink)";
  const lectura = (i: number): Lectura => {
    const v = valores[i];
    return {
      titulo: textoSemana(puntos[i].periodStart, puntos[i].periodEnd),
      filas: v === null ? [] : [{ etiqueta, valor: formato(v), clave }],
      nota: nota?.(i) ?? (v === null ? "Sin dato para esta semana." : undefined),
    };
  };
  return (
    <figure className={s.figura}>
      <Plot
        nombre={nombre}
        etiquetas={puntos.map((p) => diaCorto(p.periodStart))}
        actual={iActual >= 0 ? iActual : puntos.length - 1}
        tope={tope}
        ticks={ticks}
        formatoTick={(v) => TICK.format(v)}
        lectura={lectura}
        capa={
          <svg
            className={s.linea}
            data-tono={tono}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {tramosDeLinea(valores, (v) => alturaEn(v, tope)).map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
        }
        marca={(i) => {
          const v = valores[i];
          if (v === null) return <span className={s.sinDato} />;
          const alto = `${(Math.min(v, tope) / tope) * 100}%`;
          return (
            <>
              <span className={s.punto} data-tono={tono} style={{ bottom: alto }} />
              {i === rotulado && (
                <span className={`${s.valorFinal} num`} style={{ bottom: alto }}>
                  {formato(v)}
                </span>
              )}
            </>
          );
        }}
      />
      <div className="sr-only">
        <table>
          <caption>{nombre}</caption>
          <thead>
            <tr>
              <th scope="col">Semana</th>
              <th scope="col">{etiqueta}</th>
            </tr>
          </thead>
          <tbody>
            {puntos.map((p) => (
              <tr key={p.periodStart}>
                <th scope="row">{textoSemana(p.periodStart, p.periodEnd)}</th>
                <td>{p.valor === null ? "Sin dato" : formato(p.valor)}</td>
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
  // The line breaks at every gap: one path per run of consecutive weeks with a result.
  const tramos = tramosDeLinea(
    puntos.map((p) => (vigente(p) ? Math.max(0, p.indice!) : null)),
    (v) => alturaEn(v, 100),
  );
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
          { desde: 0, hasta: medio, tono: "bajo", rotulo: NIVEL.BAJO },
          { desde: medio, hasta: alto, tono: "medio", rotulo: NIVEL.MEDIO },
          { desde: alto, hasta: 100, tono: "alto", rotulo: NIVEL.ALTO },
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
