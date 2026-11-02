// Presentation reads over the people series returned by /api/personas. Nothing
// here computes an index: levels and indices come from the server as stored.
import type { Nivel, PersonaDTO, SemanaPersona } from "./contracts";

/** The person's week, or undefined when nothing was loaded for it. */
export const semanaDe = (persona: PersonaDTO, periodStart: string) =>
  persona.semanas.find((s) => s.periodStart === periodStart);

/** The level to show: only an up-to-date evaluation counts (T14 vigencia). */
export const nivelVigente = (s: SemanaPersona | undefined): Nivel | null =>
  s && s.actualizado ? s.nivel : null;

/** Weeks in a row at Alto, counting back from `periodStart` (inclusive). */
export function racha(persona: PersonaDTO, periodStart: string) {
  const ordenadas = persona.semanas
    .filter((s) => s.periodStart <= periodStart)
    .sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
  let n = 0;
  for (const s of ordenadas) {
    if (nivelVigente(s) !== "ALTO") break;
    n++;
  }
  return n;
}

export const conteoVacio = (): Record<Nivel, number> => ({
  BAJO: 0,
  MEDIO: 0,
  ALTO: 0,
  INCOMPLETO: 0,
});

/** Up-to-date levels of one week across people. */
export function conteoSemana(personas: PersonaDTO[], periodStart: string) {
  const conteo = conteoVacio();
  for (const p of personas) {
    const nivel = nivelVigente(semanaDe(p, periodStart));
    if (nivel) conteo[nivel]++;
  }
  return conteo;
}

/** The person's series oldest → newest, up to and including `hasta`. */
export const serieHasta = (persona: PersonaDTO, hasta: string) =>
  persona.semanas
    .filter((s) => s.periodStart <= hasta)
    .sort((a, b) => (a.periodStart < b.periodStart ? -1 : 1));

/** Aggregates below this size are not shown, so no individual can be inferred. */
export const GRUPO_MINIMO = 5;
