import assert from "node:assert/strict";
import { test } from "node:test";
import type { CierreTareaDTO } from "../src/shared/contratos/tareas";
import {
  diasAtrasoTexto,
  ETIQUETA_ESTADO,
  fechaTarea,
  GRUPO_ESTADO,
  textoHistorial,
  hrefTareasSemana,
} from "../src/components/tareas/textos";

const cierre = (
  periodStart: string,
  estado: CierreTareaDTO["estado"],
  extra: Partial<CierreTareaDTO> = {},
): CierreTareaDTO => ({
  periodStart,
  periodEnd: new Date(Date.parse(`${periodStart}T00:00:00Z`) + 6 * 86400000)
    .toISOString()
    .slice(0, 10),
  asignadaEl: "2026-09-21",
  venceEl: "2026-10-09",
  completadaEl: null,
  diasAtraso: null,
  estado,
  ...extra,
});

test("los días de atraso se leen con su unidad y el cero no se confunde con la ausencia", () => {
  assert.equal(diasAtrasoTexto(null), "—");
  assert.equal(diasAtrasoTexto(0), "0 días");
  assert.equal(diasAtrasoTexto(1), "1 día");
  assert.equal(diasAtrasoTexto(9), "9 días");
  assert.equal(diasAtrasoTexto(1200), "1.200 días");
});

test("las fechas de una tarea omiten el año de la semana y lo muestran fuera de ella", () => {
  assert.equal(fechaTarea(null, "2026-10-12"), "—");
  assert.equal(fechaTarea("2026-10-09", "2026-10-12"), "9 oct");
  assert.equal(fechaTarea("2025-12-30", "2026-01-05"), "30 dic 2025");
});

test("estados y grupos usan palabras neutras, nunca un juicio sobre la persona", () => {
  assert.deepEqual(ETIQUETA_ESTADO, {
    COMPLETADA: "Completada",
    PENDIENTE: "Abierta en plazo",
    VENCIDA: "Vencida",
  });
  assert.deepEqual(GRUPO_ESTADO, {
    COMPLETADA: "Completadas en la semana",
    PENDIENTE: "Abiertas al cierre, en plazo",
    VENCIDA: "Abiertas al cierre, vencidas",
  });
  const todo = JSON.stringify([ETIQUETA_ESTADO, GRUPO_ESTADO]).toLowerCase();
  for (const palabra of [
    "incumpl",
    "no hizo",
    "productiv",
    "ranking",
    "vigilancia",
  ])
    assert.ok(!todo.includes(palabra), palabra);
});

test("el historial cuenta los cierres seguidos en que la tarea siguió abierta", () => {
  assert.equal(
    textoHistorial([
      cierre("2026-10-12", "VENCIDA", { diasAtraso: 9 }),
      cierre("2026-10-05", "VENCIDA", { diasAtraso: 2 }),
      cierre("2026-09-28", "PENDIENTE"),
    ]),
    "Abierta en 3 cierres seguidos, con vencimiento el 9 oct.",
  );
  assert.equal(
    textoHistorial([cierre("2026-10-12", "PENDIENTE", { venceEl: null })]),
    "Abierta en 1 cierre, sin fecha de vencimiento.",
  );
});

test("el historial distingue la tarea completada y los cierres que no son consecutivos", () => {
  assert.equal(
    textoHistorial([
      cierre("2026-10-12", "COMPLETADA", { completadaEl: "2026-10-16" }),
    ]),
    "Completada el 16 oct.",
  );
  assert.equal(
    textoHistorial([
      cierre("2026-10-12", "COMPLETADA", { completadaEl: "2026-10-16" }),
      cierre("2026-10-05", "VENCIDA", { diasAtraso: 2 }),
    ]),
    "Abierta en 1 cierre antes de completarse el 16 oct.",
  );
  // A missing week in between breaks the run: only the newest close counts as consecutive.
  assert.equal(
    textoHistorial([
      cierre("2026-10-12", "VENCIDA", { diasAtraso: 9 }),
      cierre("2026-09-28", "VENCIDA", { diasAtraso: 2 }),
    ]),
    "Abierta en 1 cierre, con vencimiento el 9 oct.",
  );
  assert.equal(textoHistorial([]), "Sin cierres registrados.");
});

test("el enlace a las tareas de una semana abre la ficha con esa semana y conserva solo lo que cambia la vista", () => {
  assert.equal(
    hrefTareasSemana({ employeeId: "EMP-001", periodStart: "2026-10-12" }),
    "/employees/EMP-001?semana=2026-10-12",
  );
  assert.equal(
    hrefTareasSemana({
      employeeId: "EMP-001",
      periodStart: "2026-10-12",
      recordId: "mock-record-2",
      estado: "VENCIDA",
      page: 1,
      tarea: "PRJ/a:1",
    }),
    "/employees/EMP-001?semana=2026-10-12&recordId=mock-record-2&estado=VENCIDA&tarea=PRJ%2Fa%3A1",
  );
  assert.equal(
    hrefTareasSemana({
      employeeId: "EMP-001",
      periodStart: "2026-10-12",
      page: 3,
    }),
    "/employees/EMP-001?semana=2026-10-12&page=3",
  );
});
