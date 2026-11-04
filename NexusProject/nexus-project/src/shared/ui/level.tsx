"use client";
import type { Nivel } from "../contracts";
import { NIVEL, decimal, semana as textoSemana } from "../formato";
import s from "./level.module.css";
import { type Lectura, Tip, useLectura } from "./tip";

/** What each level means, for its tooltip: the rule, in the product's words. */
export const REGLA_NIVEL: Record<Nivel, string> = {
  BAJO: "Índice menor a 40.",
  MEDIO: "Índice de 40 o más, sin cumplir la condición de Alto.",
  ALTO: "Índice de 70 o más durante dos semanas seguidas, con al menos 2 factores superados en ambas.",
  INCOMPLETO: "Falta la semana anterior: no se puede confirmar si la carga se sostiene.",
};
const CLAVE: Record<Nivel, string> = {
  BAJO: "var(--level-bajo)",
  MEDIO: "var(--level-medio)",
  ALTO: "var(--level-alto)",
  INCOMPLETO: "var(--level-incompleto)",
};

/**
 * A level, always as word plus color (RNF03). A result that is not up to date
 * never shows its old level as current (T14): it reads "Desactualizado".
 */
export function LevelTag({
  nivel,
  actualizado = true,
}: {
  nivel: Nivel | null;
  actualizado?: boolean;
}) {
  // The tag's tooltip states the level's rule. It adds no tab stop: tags repeat on every row,
  // and the rules are also on «Reglas del índice».
  if (!nivel)
    return (
      <Tip enfocable={false} contenido="No hay un resultado calculado para esta semana.">
        <span className={s.tag}>Sin evaluación</span>
      </Tip>
    );
  if (!actualizado)
    return (
      <Tip
        enfocable={false}
        contenido="Cambiaron los datos o las reglas de esta semana y falta recalcular: el nivel anterior no se muestra como vigente."
      >
        <span className={s.tag} data-nivel="desactualizado">
          Desactualizado
        </span>
      </Tip>
    );
  return (
    <Tip enfocable={false} contenido={`${NIVEL[nivel]}: ${REGLA_NIVEL[nivel]}`}>
      <span className={s.tag} data-nivel={nivel}>
        {NIVEL[nivel]}
      </span>
    </Tip>
  );
}

/** The level's mark without its word, for a legend or a key. Decorative: the word goes beside it. */
export function LevelMark({ nivel }: { nivel: Nivel }) {
  return <span className={s.mark} data-nivel={nivel} aria-hidden="true" />;
}

export type CeldaSemana = {
  periodStart: string;
  periodEnd: string;
  nivel: Nivel | null;
  indice: number | null;
  actualizado: boolean;
};

/**
 * The product's signature: one cell per week, oldest to newest. Consecutive
 * Alto weeks join into one bar, because sustained load is what the index flags.
 */
export function WeekStrip({
  semanas,
  largo = 8,
}: {
  semanas: CeldaSemana[];
  largo?: number;
}) {
  const recientes = semanas.slice(-largo);
  const vacias = largo - recientes.length;
  const nivelDe = (c: CeldaSemana) => (c.actualizado ? c.nivel : null);
  const conteo = new Map<string, number>();
  for (const c of recientes) {
    const n = nivelDe(c);
    const clave = n ? NIVEL[n] : "sin dato vigente";
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  const ultima = recientes.at(-1);
  const resumen = ultima
    ? `Últimas ${recientes.length} semanas: ${[...conteo]
        .map(([k, v]) => `${v} ${k}`)
        .join(", ")}. Última: ${nivelDe(ultima) ? NIVEL[nivelDe(ultima)!] : "sin dato vigente"}.`
    : "Sin semanas cargadas.";
  const lectura = (i: number): Lectura => {
    const c = recientes[i];
    const n = nivelDe(c);
    return {
      titulo: textoSemana(c.periodStart, c.periodEnd),
      filas: n
        ? [
            { etiqueta: "Nivel", valor: NIVEL[n], clave: CLAVE[n] },
            { etiqueta: "Índice", valor: decimal(c.indice) },
          ]
        : [],
      nota: !c.actualizado
        ? "Resultado desactualizado: falta recalcular."
        : n
          ? n === "INCOMPLETO"
            ? REGLA_NIVEL.INCOMPLETO
            : undefined
          : "Sin resultado para esta semana.",
    };
  };
  const { contenedor, marca, burbuja, vivo } = useLectura(recientes.length, lectura);
  return (
    <span
      {...contenedor}
      className={s.strip}
      role="group"
      aria-label={resumen}
    >
      {Array.from({ length: vacias }, (_, i) => (
        <span key={`v${i}`} className={s.cell} data-vacia />
      ))}
      {recientes.map((c, i) => {
        const n = nivelDe(c);
        const previa = recientes[i - 1];
        const unida = n === "ALTO" && previa && nivelDe(previa) === "ALTO";
        return (
          <span
            key={c.periodStart}
            className={s.cell}
            data-nivel={n ?? "ninguno"}
            data-unida={unida || undefined}
            {...marca(i)}
          />
        );
      })}
      {burbuja}
      {vivo}
    </span>
  );
}
