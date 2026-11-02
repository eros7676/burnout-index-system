import type { PersonaDTO } from "@/shared/contracts";
import { semana as textoSemana } from "@/shared/formato";
import { semanaDe } from "@/shared/semanas";
import { SelectField } from "@/shared/ui";

export type Periodo = { periodStart: string; periodEnd: string };

/** The loaded weeks, newest first, each with its end date from whoever has it loaded. */
export function periodos(personas: PersonaDTO[], semanas: string[]): Periodo[] {
  return semanas.map((periodStart) => ({
    periodStart,
    periodEnd:
      personas.map((p) => semanaDe(p, periodStart)).find(Boolean)?.periodEnd ??
      periodStart,
  }));
}

/** The week a screen shows, newest first, named as a date range. */
export function SelectorSemana({
  opciones,
  valor,
  onCambio,
}: {
  opciones: Periodo[];
  valor: string;
  onCambio: (periodStart: string) => void;
}) {
  return (
    <SelectField
      etiqueta="Semana"
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
    >
      {opciones.map((p) => (
        <option key={p.periodStart} value={p.periodStart}>
          {textoSemana(p.periodStart, p.periodEnd)}
        </option>
      ))}
    </SelectField>
  );
}
