import assert from "node:assert/strict";
import { test } from "node:test";
import { escalaLinda } from "../src/shared/escala";

test("el eje llega al primer valor redondo que cubre el máximo", () => {
  assert.deepEqual(escalaLinda(59), { tope: 60, ticks: [0, 20, 40, 60] });
  assert.deepEqual(escalaLinda(100), { tope: 100, ticks: [0, 25, 50, 75, 100] });
  assert.deepEqual(escalaLinda(18), { tope: 20, ticks: [0, 5, 10, 15, 20] });
});

test("personas y tareas son enteras: el paso nunca es fraccionario", () => {
  assert.deepEqual(escalaLinda(3, { entero: true }), { tope: 3, ticks: [0, 1, 2, 3] });
  assert.deepEqual(escalaLinda(49, { entero: true }), { tope: 60, ticks: [0, 20, 40, 60] });
  assert.deepEqual(escalaLinda(7, { entero: true }), { tope: 8, ticks: [0, 2, 4, 6, 8] });
});

test("sin datos hay un eje mínimo de 0 a 1", () => {
  assert.deepEqual(escalaLinda(0), { tope: 1, ticks: [0, 1] });
  assert.deepEqual(escalaLinda(Number.NaN), { tope: 1, ticks: [0, 1] });
});
