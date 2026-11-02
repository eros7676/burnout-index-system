import type { Nivel } from "../contracts";
import { NIVEL, decimal, semana as textoSemana } from "../formato";
import s from "./level.module.css";

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
  if (!nivel) return <span className={s.tag}>Sin evaluación</span>;
  if (!actualizado)
    return (
      <span className={s.tag} data-nivel="desactualizado">
        Desactualizado
      </span>
    );
  return (
    <span className={s.tag} data-nivel={nivel}>
      {NIVEL[nivel]}
    </span>
  );
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
  return (
    <span className={s.strip} role="img" aria-label={resumen}>
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
            title={`${textoSemana(c.periodStart, c.periodEnd)}: ${
              n ? `${NIVEL[n]} · ${decimal(c.indice)}` : "sin dato vigente"
            }`}
          />
        );
      })}
    </span>
  );
}
