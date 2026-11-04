import assert from "node:assert/strict";
import { test } from "node:test";
import { columnasBalanceadas } from "../src/shared/columnas";

test("hasta seis datos van en una fila, como en la grilla de 12 columnas", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => columnasBalanceadas(n)), [1, 2, 3, 4, 5, 6]);
});

test("con más de seis, las filas son parejas y la última no queda con un dato suelto", () => {
  assert.equal(columnasBalanceadas(7), 4);
  assert.equal(columnasBalanceadas(8), 4);
  assert.equal(columnasBalanceadas(9), 5);
  assert.equal(columnasBalanceadas(10), 5);
  assert.equal(columnasBalanceadas(12), 6);
  assert.equal(columnasBalanceadas(13), 5);
});

test("sin elementos hay una columna y el máximo es configurable", () => {
  assert.equal(columnasBalanceadas(0), 1);
  assert.equal(columnasBalanceadas(6, 5), 3);
  assert.equal(columnasBalanceadas(6, 4), 3);
});
