import assert from "node:assert/strict";
import { test } from "node:test";
import type { Nivel, PersonaDTO, SemanaPersona } from "../src/shared/contracts";
import { conteoSemana, racha, serieHasta } from "../src/shared/semanas";

const semana = (
  periodStart: string,
  nivel: Nivel,
  actualizado = true,
): SemanaPersona => ({
  periodStart,
  periodEnd: periodStart,
  horasExtra: 0,
  diasConsecutivosSinDescanso: 0,
  tareasActivas: 0,
  tareasPendientes: 0,
  tareasVencidas: 0,
  vacacionesPendientesDias: 0,
  horasTrabajadas: null,
  diasDesdeUltimasVacaciones: null,
  actualizado,
  processingState: "COMPLETADO",
  evaluationId: null,
  indice: 0,
  nivel,
  alertId: null,
  ausencias: null,
});
const persona = (semanas: SemanaPersona[]): PersonaDTO => ({
  employeeId: "EMP-X",
  nombre: "X",
  tipo: "TECNICO",
  teamId: "EQ-01",
  equipo: "Célula 1",
  responsable: null,
  semanas,
});

test("semanas: la racha cuenta Alto consecutivo hacia atrás y se corta en lo desactualizado", () => {
  const p = persona([
    semana("2026-10-19", "ALTO"),
    semana("2026-10-12", "ALTO"),
    semana("2026-10-05", "MEDIO"),
    semana("2026-09-28", "ALTO"),
  ]);
  assert.equal(racha(p, "2026-10-19"), 2);
  assert.equal(racha(p, "2026-10-05"), 0);
  assert.equal(racha(p, "2026-09-28"), 1);
  const desactualizada = persona([
    semana("2026-10-19", "ALTO", false),
    semana("2026-10-12", "ALTO"),
  ]);
  assert.equal(racha(desactualizada, "2026-10-19"), 0);
});

test("semanas: el conteo de una semana solo suma evaluaciones vigentes", () => {
  const personas = [
    persona([semana("2026-10-19", "ALTO")]),
    persona([semana("2026-10-19", "BAJO")]),
    persona([semana("2026-10-19", "MEDIO", false)]),
    persona([semana("2026-10-12", "MEDIO")]),
  ];
  assert.deepEqual(conteoSemana(personas, "2026-10-19"), {
    BAJO: 1,
    MEDIO: 0,
    ALTO: 1,
    INCOMPLETO: 0,
  });
});

test("semanas: la serie va de la más vieja a la elegida", () => {
  const p = persona([
    semana("2026-10-19", "ALTO"),
    semana("2026-10-05", "MEDIO"),
    semana("2026-10-12", "BAJO"),
  ]);
  assert.deepEqual(
    serieHasta(p, "2026-10-12").map((s) => s.periodStart),
    ["2026-10-05", "2026-10-12"],
  );
});
