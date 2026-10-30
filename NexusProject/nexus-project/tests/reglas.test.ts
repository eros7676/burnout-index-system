import assert from "node:assert/strict";
import { test } from "node:test";
import { reglasSemilla } from "../prisma/seed-data";
import { validarConfiguracion } from "../src/server/services/reglas";
import { ErrorDominio } from "../src/shared/errors";

const regla = () => structuredClone(reglasSemilla);

function rechaza(entrada: unknown, campo?: string) {
  assert.throws(
    () => validarConfiguracion(entrada),
    (error: unknown) => {
      assert.ok(error instanceof ErrorDominio);
      assert.equal(error.codigo, "CONFIGURACION_INVALIDA");
      assert.ok(error.detalles.length > 0);
      if (campo) assert.ok(error.detalles.some((d) => d.campo === campo));
      return true;
    },
  );
}

test("T09: acepta una regla completa sin modificar la entrada", () => {
  const entrada = regla();
  const copia = structuredClone(entrada);
  assert.deepEqual(validarConfiguracion(entrada), copia);
  assert.deepEqual(entrada, copia);
});

test("T09: rechaza objetos incompletos, campos extra y factores desconocidos", () => {
  for (const entrada of [null, [], "v2", 1]) rechaza(entrada);
  for (const campo of Object.keys(regla())) {
    const entrada: Record<string, unknown> = regla();
    delete entrada[campo];
    rechaza(entrada, campo);
  }
  rechaza({ ...regla(), extra: true }, "extra");
  rechaza(
    { ...regla(), weights: { ...regla().weights, XX: 0.1 } },
    "weights.XX",
  );
  rechaza(
    { ...regla(), thresholds: { ...regla().thresholds, XX: 1 } },
    "thresholds.XX",
  );
});

test("T09: pesos finitos, límites inclusivos y tolerancia de suma", () => {
  for (const valor of [0, 0.049, 0.701, Infinity, NaN, "0.3"]) {
    rechaza(
      { ...regla(), weights: { ...regla().weights, HE: valor } },
      "weights.HE",
    );
  }
  rechaza(
    { ...regla(), weights: { HE: 0.4, DS: 0.3, CT: 0.25, VP: 0.15 } },
    "weights",
  );
  validarConfiguracion({
    ...regla(),
    weights: { HE: 0.7, DS: 0.2, CT: 0.05, VP: 0.05 },
  });
  validarConfiguracion({
    ...regla(),
    weights: { ...regla().weights, HE: 0.3000005 },
  });
  rechaza(
    { ...regla(), weights: { ...regla().weights, HE: 0.300002 } },
    "weights",
  );
});

test("T09: umbrales positivos y CT como máximo uno", () => {
  for (const factor of ["HE", "DS", "CT", "VP"] as const) {
    for (const valor of [0, -1, Infinity, NaN, "1"]) {
      rechaza(
        { ...regla(), thresholds: { ...regla().thresholds, [factor]: valor } },
        `thresholds.${factor}`,
      );
    }
  }
  rechaza(
    { ...regla(), thresholds: { ...regla().thresholds, CT: 1.01 } },
    "thresholds.CT",
  );
  validarConfiguracion({
    ...regla(),
    thresholds: { ...regla().thresholds, CT: 1 },
  });
});

test("T09: vigencia en lunes, textos completos y creación UTC válida", () => {
  for (const fecha of ["2026-03-03", "2026-02-30", "02/03/2026"]) {
    rechaza({ ...regla(), effectiveFrom: fecha }, "effectiveFrom");
  }
  for (const campo of ["version", "createdBy"] as const) {
    for (const valor of ["", " v2", "v2 ", "x".repeat(65)])
      rechaza({ ...regla(), [campo]: valor }, campo);
  }
  for (const instante of [
    "2026-02-30T00:00:00.000Z",
    "2026-03-02",
    "2026-03-02T00:00:00-03:00",
  ]) {
    rechaza({ ...regla(), createdAt: instante }, "createdAt");
  }
  validarConfiguracion({ ...regla(), createdAt: "2026-03-02T00:00:00Z" });
});

test("T09: ventana, persistencia, cortes y mínimo de factores respetan P0", () => {
  rechaza({ ...regla(), windowDays: 14 }, "windowDays");
  rechaza({ ...regla(), persistencePeriods: 3 }, "persistencePeriods");
  for (const [mediumLimit, highLimit] of [
    [0, 70],
    [70, 70],
    [71, 70],
    [40, 101],
    [NaN, 70],
  ]) {
    rechaza({ ...regla(), mediumLimit, highLimit });
  }
  for (const minimo of [1, 5, 2.5, "2"])
    rechaza({ ...regla(), minExceededFactors: minimo }, "minExceededFactors");
  for (const minimo of [2, 3, 4])
    validarConfiguracion({
      ...regla(),
      minExceededFactors: minimo,
      highLimit: 100,
    });
});
