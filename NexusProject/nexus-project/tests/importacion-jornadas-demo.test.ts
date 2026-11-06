import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { empleadosSemilla, reglasSemilla } from "../prisma/seed-data";
import { MAX_ARCHIVO_CSV, leerCsvImportacion } from "../src/server/services/csv-importacion";
import {
  leerCsvJornadas,
  validarCsvJornadas,
  type FuenteJornadas,
  type RegistroJornadas,
} from "../src/server/services/jornadas-importacion";
import { MAX_FILAS_JORNADAS } from "../src/shared/contratos/importaciones";

const RESUMEN = "templates/demo-ocho-semanas.csv";
const DETALLE = "templates/jornadas-demo-ocho-semanas.csv";
const ahora = new Date("2026-11-02T12:00:00Z");

/** The demo's weekly summaries, as the database would hold them after importing them. */
function resumenes(): RegistroJornadas[] {
  const opcional = (v: string | undefined) => (v ? Number(v) : null);
  return leerCsvImportacion(readFileSync(RESUMEN)).filas.map(({ celdas: c }, i) => ({
    employeeId: c.employee_id!,
    periodStart: c.period_start!,
    periodEnd: c.period_end!,
    recordId: `r-${i}`,
    periodoId: `p-${i}`,
    horasExtra: Number(c.horas_extra),
    horasTrabajadas: opcional(c.horas_trabajadas),
    diasConsecutivosSinDescanso: Number(c.dias_consecutivos_sin_descanso),
    diasDesdeUltimasVacaciones: opcional(c.dias_desde_ultimas_vacaciones),
    huellaJornadas: null,
  }));
}
const fuente = (semanas: RegistroJornadas[]): FuenteJornadas => ({
  empleados: async () => empleadosSemilla,
  primeraVigencia: async () => reglasSemilla.effectiveFrom,
  semanas: async () => semanas,
});

test("demo de días: cada semana de cada persona tiene sus siete días y reproduce su resumen", async () => {
  const semanas = resumenes();
  assert.equal(semanas.length, 392, "49 people x 8 weeks");
  const r = await validarCsvJornadas(readFileSync(DETALLE), fuente(semanas), ahora);
  assert.equal(r.status, "VALIDADA", JSON.stringify(r.errores.slice(0, 3)));
  assert.equal(r.conciliacion.semanas, 392);
  assert.equal(r.conciliacion.coinciden, 392);
  assert.equal(r.nuevas, 392 * 7);
});

test("demo de días: hay semanas con licencia y con descanso", () => {
  const { filas } = leerCsvJornadas(readFileSync(DETALLE));
  const semanasCon = (tipo: string) =>
    new Set(filas.filter((f) => f.celdas.tipo_dia === tipo).map((f) => `${f.celdas.employee_id}/${f.celdas.period_start}`))
      .size;
  assert.ok(semanasCon("LICENCIA") >= 20, "enough leave weeks to see on screen");
  assert.ok(semanasCon("DESCANSO") >= 50);
  // A worked day stays within a plausible length.
  assert.ok(filas.every((f) => f.celdas.tipo_dia !== "TRABAJO" || Number(f.celdas.horas_trabajadas) <= 12));
});

test("demo de días: cabe en los límites del archivo", () => {
  assert.ok(readFileSync(DETALLE).byteLength < MAX_ARCHIVO_CSV);
  assert.ok(leerCsvJornadas(readFileSync(DETALLE)).filas.length <= MAX_FILAS_JORNADAS);
});

test("demo de días: el archivo es el que produce el generador", () => {
  const r = spawnSync(process.execPath, ["scripts/demo-jornadas-csv.mjs", "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
