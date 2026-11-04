import assert from "node:assert/strict";
import { test } from "node:test";
import { columnasBalanceadas } from "../src/shared/columnas";

test("una tira de datos se reparte en filas parejas, sin un elemento suelto en la última", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => columnasBalanceadas(n)), [1, 2, 3, 4, 5]);
  assert.equal(columnasBalanceadas(6), 3);
  assert.equal(columnasBalanceadas(7), 4);
  assert.equal(columnasBalanceadas(8), 4);
  assert.equal(columnasBalanceadas(9), 5);
  assert.equal(columnasBalanceadas(10), 5);
});

test("sin elementos hay una columna y el máximo es configurable", () => {
  assert.equal(columnasBalanceadas(0), 1);
  assert.equal(columnasBalanceadas(6, 6), 6);
  assert.equal(columnasBalanceadas(6, 4), 3);
});
