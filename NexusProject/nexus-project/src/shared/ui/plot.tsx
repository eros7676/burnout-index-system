"use client";
// The frame every weekly chart shares: a y axis with round ticks and hairline grid, optional
// quiet bands, one slot per week (the slot is the hit target, not the painted mark), week
// labels below, and the readout (hover, arrow keys, tap). Marks are drawn by the caller.
import type { ReactNode } from "react";
import s from "./plot.module.css";
import { type Lectura, useLectura } from "./tip";

export type Banda = {
  desde: number;
  hasta: number;
  tono: "bajo" | "medio" | "alto";
  /** Named inside the band, at its top right, so the limits read without a caption. */
  rotulo?: string;
};

export function Plot({
  nombre,
  etiquetas,
  actual,
  tope,
  ticks,
  formatoTick = String,
  bandas = [],
  marca,
  capa,
  lectura,
}: {
  /** What the chart shows, for its accessible name. */
  nombre: string;
  /** One short label per week (x axis), oldest first. */
  etiquetas: string[];
  /** Index of the week the page is about, if any. */
  actual?: number;
  tope: number;
  ticks: number[];
  formatoTick?: (v: number) => string;
  bandas?: Banda[];
  /** The marks of week i, drawn inside its slot (bottom = 0, top = tope). */
  marca: (i: number) => ReactNode;
  /** Drawn once across the plot area (a line, for instance), under the slots. */
  capa?: ReactNode;
  lectura: (i: number) => Lectura;
}) {
  const n = etiquetas.length;
  const { contenedor, marca: propsMarca, burbuja, vivo } = useLectura(n, lectura);
  const alto = (v: number) => `${(Math.min(v, tope) / tope) * 100}%`;
  return (
    <div
      {...contenedor}
      className={s.plot}
      role="group"
      aria-label={`${nombre}. Use las flechas para recorrer las semanas.`}
      style={{ "--semanas": n } as React.CSSProperties}
    >
      <div className={s.ejeY} aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className={s.tick} style={{ bottom: alto(t) }}>
            {formatoTick(t)}
          </span>
        ))}
      </div>
      <div className={s.area} aria-hidden="true">
        {bandas.map((b) => (
          <span
            key={b.tono}
            className={s.banda}
            data-tono={b.tono}
            style={{ bottom: alto(b.desde), height: `calc(${alto(b.hasta)} - ${alto(b.desde)})` }}
          >
            {b.rotulo && <span className={s.rotuloBanda}>{b.rotulo}</span>}
          </span>
        ))}
        {ticks.map((t) => (
          <span
            key={t}
            className={s.grilla}
            data-base={t === 0 || undefined}
            style={{ bottom: alto(t) }}
          />
        ))}
        {capa}
        <div className={s.semanas}>
          {etiquetas.map((e, i) => (
            <div
              key={`${e}-${i}`}
              className={s.semana}
              data-actual={i === actual || undefined}
              {...propsMarca(i)}
            >
              {marca(i)}
            </div>
          ))}
        </div>
      </div>
      <div className={s.ejeX} aria-hidden="true">
        {etiquetas.map((e, i) => (
          <span key={`${e}-${i}`} data-actual={i === actual || undefined}>
            {e}
          </span>
        ))}
      </div>
      {burbuja}
      {vivo}
    </div>
  );
}
