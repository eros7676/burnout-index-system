// Rules for team aggregates that need no database: the minimum group size and the average.
import { GRUPO_MINIMO } from "../../shared/semanas";
import type { EquipoFilaDTO } from "../../shared/contratos/organizacion";

type Suprimido = EquipoFilaDTO["suprimido"];

/**
 * Hides the aggregates of teams under the minimum group size (Viva Insights: «at least five»).
 * When exactly one team with people is hidden, the smallest visible team is hidden too: otherwise
 * the company total minus the visible teams gives the hidden team's mix (Viva Glint: «the next
 * smallest group is also suppressed»). A team with nobody holds nothing to infer.
 */
export function suprimirGrupos<T extends { teamId: string; personasEvaluables: number }>(
  equipos: readonly T[],
): (T & { suprimido: Suprimido })[] {
  const pequenos = equipos.filter((e) => e.personasEvaluables < GRUPO_MINIMO);
  const conPersonas = pequenos.filter((e) => e.personasEvaluables > 0);
  const visibles = equipos.filter((e) => e.personasEvaluables >= GRUPO_MINIMO);
  const arrastrado =
    conPersonas.length === 1 && visibles.length > 0
      ? [...visibles].sort(
          (a, b) =>
            a.personasEvaluables - b.personasEvaluables ||
            (a.teamId < b.teamId ? -1 : 1),
        )[0]
      : undefined;
  return equipos.map((e) => ({
    ...e,
    suprimido: pequenos.includes(e)
      ? "GRUPO_PEQUENO"
      : e === arrastrado
        ? "COMPLEMENTARIA"
        : null,
  }));
}

/** Mean of two-decimal indices summed as integer hundredths, rounded half up, like the summary. */
export function promedioDesdeCentesimos(suma: number, personas: number): number | null {
  return personas ? Math.round(suma / personas) / 100 : null;
}
