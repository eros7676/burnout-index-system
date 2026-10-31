import assert from "node:assert/strict";
import { test } from "node:test";
import {
  registroActualMock,
  registroAnteriorMock,
  reglasMock,
} from "../src/shared/mocks";
import {
  huellaEvaluacion,
  serializarCanonico,
} from "../src/server/services/huella-evaluacion";

test("T08: huella canónica independiente del orden de claves JSON", () => {
  const snapshot = {
    actual: registroActualMock,
    anterior: registroAnteriorMock,
    reglas: reglasMock,
  };
  const invertido = Object.fromEntries(
    Object.entries(snapshot).reverse(),
  ) as typeof snapshot;
  invertido.actual = Object.fromEntries(
    Object.entries(snapshot.actual).reverse(),
  ) as typeof snapshot.actual;
  assert.match(huellaEvaluacion(snapshot), /^[a-f0-9]{64}$/);
  assert.equal(huellaEvaluacion(snapshot), huellaEvaluacion(invertido));
  assert.equal(
    serializarCanonico({ b: 2, a: { d: 4, c: 3 } }),
    '{"a":{"c":3,"d":4},"b":2}',
  );
});

test("T08: datos, versiones, reglas y ausencia de antecedente cambian la huella", () => {
  const snapshot = {
    actual: registroActualMock,
    anterior: registroAnteriorMock,
    reglas: reglasMock,
  };
  const original = huellaEvaluacion(snapshot);
  for (const cambio of [
    { ...snapshot, anterior: null },
    { ...snapshot, actual: { ...snapshot.actual, dataVersion: 2 } },
    { ...snapshot, actual: { ...snapshot.actual, horasExtra: 0 } },
    { ...snapshot, anterior: { ...snapshot.anterior, fingerprint: "otra" } },
    { ...snapshot, reglas: { ...snapshot.reglas, version: "v2" } },
    {
      ...snapshot,
      reglas: {
        ...snapshot.reglas,
        thresholds: { ...snapshot.reglas.thresholds, HE: 9 },
      },
    },
  ])
    assert.notEqual(huellaEvaluacion(cambio), original);
  assert.equal(huellaEvaluacion(structuredClone(snapshot)), original);
});

test("T08: codec conserva todos los decimales de JSON y rechaza sobres corruptos", async () => {
  const { codificarJsonExacto, decodificarJsonExacto } =
    await import("../src/server/repositories/json-exacto");
  const datos = {
    valor: 9.333300000012345,
    scores: [28.999999999999996, 13.333333333333334],
    ausencia: null,
  };
  assert.deepEqual(
    decodificarJsonExacto(
      codificarJsonExacto(datos) as import("@prisma/client").Prisma.JsonValue,
    ),
    datos,
  );
  assert.throws(() => decodificarJsonExacto({ cu02JsonV1: "{" }));
  assert.throws(() => decodificarJsonExacto({ cu02JsonV1: 1 }));
});
