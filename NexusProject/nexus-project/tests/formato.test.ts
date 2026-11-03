import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ESTADO_ENVIO,
  FACTOR,
  NIVEL,
  decimal,
  diaCorto,
  semana,
  valorFactor,
  variacion,
} from "../src/shared/formato";

test("formato: semanas legibles sin pasar por la zona horaria del navegador", () => {
  assert.equal(semana("2026-10-12", "2026-10-18"), "12–18 oct 2026");
  assert.equal(semana("2026-09-28", "2026-10-04"), "28 sep – 4 oct 2026");
  assert.equal(semana("2026-12-28", "2027-01-03"), "28 dic 2026 – 3 ene 2027");
  assert.equal(diaCorto("2026-10-05"), "5 oct");
});

test("formato: decimales con coma y dos cifras, como el informe", () => {
  assert.equal(decimal(91.21), "91,21");
  assert.equal(decimal(40), "40,00");
  assert.equal(decimal(1234.5), "1.234,50");
  assert.equal(decimal(null), "—");
});

test("formato: niveles, factores y envíos en lenguaje de la persona", () => {
  assert.equal(NIVEL.INCOMPLETO, "Incompleto");
  assert.equal(FACTOR.DS, "Días consecutivos sin descanso");
  assert.equal(ESTADO_ENVIO.NO_APLICA, "Solo aviso interno");
  assert.equal(valorFactor("HE", 16), "16 h");
  assert.equal(valorFactor("DS", 1), "1 día");
  assert.equal(valorFactor("CT", 0.4167), "0,42");
  assert.equal(valorFactor("VP", 14), "14 días");
});

test("formato: variación semanal con signo y sin ruido", () => {
  assert.equal(variacion(91.21, 83.71), "+7,50");
  assert.equal(variacion(40, 45.5), "−5,50");
  assert.equal(variacion(40, 40), "=");
  assert.equal(variacion(40, null), null);
});
