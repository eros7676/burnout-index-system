import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { empleadosSemilla, reglasSemilla } from "../prisma/seed-data";
import {
  MAX_ARCHIVO_CSV,
  leerCsvImportacion,
} from "../src/server/services/csv-importacion";
import {
  leerCsvTareas,
  validarCsvTareas,
  type FuenteTareas,
  type RegistroSemana,
} from "../src/server/services/tareas-importacion";
import { MAX_FILAS_TAREAS } from "../src/shared/contratos/importaciones";

const RESUMEN = "templates/demo-ocho-semanas.csv";
const DETALLE = "templates/tareas-demo-ocho-semanas.csv";
const ahora = new Date("2026-11-02T12:00:00Z");

/** The demo's weekly summaries, as the database would hold them after importing them. */
function resumenes(): RegistroSemana[] {
  return leerCsvImportacion(readFileSync(RESUMEN)).filas.map(({ celdas: c }, i) => ({
    employeeId: c.employee_id!,
    periodStart: c.period_start!,
    periodEnd: c.period_end!,
    recordId: `r-${i}`,
    periodoId: `p-${i}`,
    tareasActivas: Number(c.tareas_activas),
    tareasPendientes: Number(c.tareas_pendientes),
    tareasVencidas: Number(c.tareas_vencidas),
    huellaTareas: null,
  }));
}
const fuente = (semanas: RegistroSemana[]): FuenteTareas => ({
  empleados: async () => empleadosSemilla,
  primeraVigencia: async () => reglasSemilla.effectiveFrom,
  semanas: async () => semanas,
});

test("demo de tareas: cada semana de cada persona reproduce su resumen", async () => {
  const semanas = resumenes();
  assert.equal(semanas.length, 392, "49 people x 8 weeks");
  const r = await validarCsvTareas(readFileSync(DETALLE), fuente(semanas), ahora);
  assert.equal(r.status, "VALIDADA", JSON.stringify(r.errores.slice(0, 3)));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.conciliacion.semanas, 392);
  assert.equal(r.conciliacion.coinciden, 392);
  assert.equal(r.conciliacion.diferencias, 0);
  assert.equal(r.nuevas + r.excluidas, r.totalFilas);
  // Every row counts toward exactly the week it is listed in.
  const porSemana = new Map(
    r.grupos.map((g) => [`${g.employeeId}/${g.periodStart}`, g.tareas.length]),
  );
  for (const s of semanas)
    assert.equal(
      porSemana.get(`${s.employeeId}/${s.periodStart}`),
      s.tareasActivas,
      `${s.employeeId} ${s.periodStart}`,
    );
});

test("demo de tareas: hay tareas que pasan de una semana a otra y bajas explícitas", () => {
  const { filas } = leerCsvTareas(readFileSync(DETALLE));
  const veces = new Map<string, number>();
  for (const f of filas)
    veces.set(f.celdas.task_id!, (veces.get(f.celdas.task_id!) ?? 0) + 1);
  assert.ok([...veces.values()].some((n) => n >= 3), "open tasks carry over");
  assert.ok(veces.size < filas.length);
  assert.ok(filas.some((f) => f.celdas.motivo_exclusion === "REASIGNADA"));
  assert.ok(filas.some((f) => f.celdas.motivo_exclusion === "CANCELADA"));
  // Weeks of every state exist, and so does the Sunday boundary.
  assert.ok(filas.some((f) => f.celdas.vencimiento_fecha === f.celdas.period_end));
});

test("demo de tareas: cabe en los límites del archivo", () => {
  assert.ok(readFileSync(DETALLE).byteLength < MAX_ARCHIVO_CSV);
  assert.ok(leerCsvTareas(readFileSync(DETALLE)).filas.length <= MAX_FILAS_TAREAS);
});

test("demo de tareas: el archivo es el que produce el generador", () => {
  const r = spawnSync(process.execPath, ["scripts/demo-tareas-csv.mjs", "--check"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
});
