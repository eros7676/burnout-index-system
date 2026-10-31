import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { reglasSemilla } from "../prisma/seed-data";
import { calcularEvaluacion } from "../src/server/services/calculo";
import type {
  RegistroLaboral,
  ConfiguracionIndice,
} from "../src/shared/contracts";
import type { ServiciosPrototipo } from "../src/shared/services";
import { ErrorDominio } from "../src/shared/errors";

// La función pública satisface T01 sin adaptadores.
const calcular: ServiciosPrototipo["calcularEvaluacion"] = calcularEvaluacion;
const regla = (): ConfiguracionIndice => structuredClone(reglasSemilla);
function registro(cambios: Partial<RegistroLaboral> = {}): RegistroLaboral {
  return {
    employeeId: "EMP-001",
    periodStart: "2026-10-12",
    periodEnd: "2026-10-18",
    recordId: "r1",
    sourceImportId: "i1",
    fingerprint: "huella-actual",
    dataVersion: 1,
    horasExtra: 16,
    diasConsecutivosSinDescanso: 9,
    tareasActivas: 10,
    tareasPendientes: 7,
    tareasVencidas: 5,
    vacacionesPendientesDias: 14,
    horasTrabajadas: null,
    diasDesdeUltimasVacaciones: null,
    ...cambios,
  };
}
const previo = (cambios: Partial<RegistroLaboral> = {}) =>
  registro({
    periodStart: "2026-10-05",
    periodEnd: "2026-10-11",
    fingerprint: "huella-previa",
    ...cambios,
  });
const cero = {
  horasExtra: 0,
  diasConsecutivosSinDescanso: 0,
  tareasActivas: 0,
  tareasPendientes: 0,
  tareasVencidas: 0,
  vacacionesPendientesDias: 0,
};
function cerca(actual: number, esperado: number) {
  assert.ok(Math.abs(actual - esperado) < 1e-12);
}
function rechaza(
  actual: RegistroLaboral,
  anterior: RegistroLaboral | null = null,
  reglas = regla(),
) {
  assert.throws(() => calcular(actual, anterior, reglas), ErrorDominio);
}

test("T07: ejemplo 83,71, precisión completa y primera semana", () => {
  const r = calcular(registro(), null, regla());
  assert.equal(r.indice, 83.71);
  assert.equal(r.nivel, "INCOMPLETO");
  cerca(r.indicadores.CT, 0.58);
  assert.deepEqual(r.scores, {
    HE: 100,
    DS: 75,
    CT: (50 * r.indicadores.CT) / 0.35,
    VP: 70,
  });
  cerca(r.contribuciones.CT, 20.714285714285715);
  assert.deepEqual(r.ranking, ["HE", "DS", "CT", "VP"]);
  assert.deepEqual(r.excedidas, ["HE", "DS", "CT", "VP"]);
  assert.deepEqual(r.persistencia, {
    anterior: null,
    comunesExcedidas: [],
    cumple: false,
    motivo: "HISTORIAL_INSUFICIENTE",
  });
});

test("T07: cero, igualdad estricta y saturación de scores", () => {
  const r = calcular(registro(cero), null, regla());
  assert.equal(r.indice, 0);
  assert.equal(r.indicadores.CT, 0);
  assert.equal(r.nivel, "INCOMPLETO");
  assert.deepEqual(r.ranking, ["HE", "DS", "CT", "VP"]);
  assert.equal(calcular(registro(cero), previo(cero), regla()).nivel, "BAJO");
  const iguales = calcular(
    registro({
      horasExtra: 8,
      diasConsecutivosSinDescanso: 6,
      tareasActivas: 20,
      tareasPendientes: 10,
      tareasVencidas: 5,
      vacacionesPendientesDias: 10,
    }),
    null,
    regla(),
  );
  for (const score of Object.values(iguales.scores)) cerca(score, 50);
  assert.deepEqual(iguales.excedidas, []);
  const max = calcular(
    registro({
      horasExtra: 168,
      diasConsecutivosSinDescanso: 500,
      tareasActivas: 1,
      tareasPendientes: 1,
      tareasVencidas: 1,
      vacacionesPendientesDias: 100,
    }),
    previo(),
    regla(),
  );
  assert.deepEqual(max.scores, { HE: 100, DS: 100, CT: 100, VP: 100 });
  assert.equal(max.indice, 100);
});

test("T07: ranking desempata en orden fijo y distingue diferencias invisibles al redondear", () => {
  assert.deepEqual(
    calcular(registro({ diasConsecutivosSinDescanso: 16 }), null, regla())
      .ranking,
    ["HE", "DS", "CT", "VP"],
  );
  const r = calcular(
    registro({ ...cero, horasExtra: 7.999999, diasConsecutivosSinDescanso: 6 }),
    null,
    regla(),
  );
  assert.equal(r.contribuciones.HE.toFixed(2), r.contribuciones.DS.toFixed(2));
  assert.deepEqual(r.ranking, ["DS", "HE", "CT", "VP"]);
});

test("T07: CT incluye pendientes y vencidas sobre el total, incluidas completadas", () => {
  assert.equal(
    calcular(
      registro({ tareasActivas: 10, tareasPendientes: 10, tareasVencidas: 0 }),
      null,
      regla(),
    ).indicadores.CT,
    0.4,
  );
  assert.equal(
    calcular(
      registro({ tareasActivas: 10, tareasPendientes: 0, tareasVencidas: 0 }),
      null,
      regla(),
    ).indicadores.CT,
    0,
  );
});

test("T07: persistencia, pico aislado, hueco y mínimo configurable de factores comunes", () => {
  const alto = calcular(
    registro({ diasConsecutivosSinDescanso: 16 }),
    previo(),
    regla(),
  );
  assert.equal(alto.indice, 91.21);
  assert.equal(alto.nivel, "ALTO");
  assert.equal(alto.persistencia.anterior?.indice, 83.71);
  assert.equal(alto.persistencia.anterior?.dataFingerprint, "huella-previa");
  assert.equal(alto.persistencia.motivo, "SOSTENIDO");
  const pico = calcular(
    registro(),
    previo({ ...cero, diasConsecutivosSinDescanso: 2 }),
    regla(),
  );
  assert.equal(pico.nivel, "MEDIO");
  assert.equal(pico.persistencia.motivo, "NO_SOSTENIDO");
  const hueco = calcular(
    registro(),
    previo({ periodStart: "2026-09-28", periodEnd: "2026-10-04" }),
    regla(),
  );
  assert.equal(hueco.nivel, "INCOMPLETO");
  assert.equal(hueco.persistencia.anterior, null);
  const soloDos = {
    horasExtra: 8,
    diasConsecutivosSinDescanso: 6,
    tareasActivas: 1,
    tareasPendientes: 1,
    tareasVencidas: 1,
    vacacionesPendientesDias: 20,
  };
  assert.equal(
    calcular(registro(soloDos), previo(soloDos), regla()).nivel,
    "ALTO",
  );
  assert.equal(
    calcular(registro(soloDos), previo(soloDos), {
      ...regla(),
      minExceededFactors: 3,
    }).nivel,
    "MEDIO",
  );
});

test("T07: compara índices redondeados en 39,99 / 40 / 69,99 / 70", () => {
  for (const [he, ds, tareas, esperado, nivel] of [
    [9.328, 6, 0, 39.99, "BAJO"],
    [9.3333, 6, 0, 40, "MEDIO"],
    [3.9946667, 19, 1, 69.99, "MEDIO"],
    [4, 19, 1, 70, "ALTO"],
  ] as const) {
    const valores = {
      horasExtra: he,
      diasConsecutivosSinDescanso: ds,
      tareasActivas: tareas,
      tareasPendientes: tareas,
      tareasVencidas: tareas,
      vacacionesPendientesDias: 10,
    };
    const r = calcular(
      registro(valores),
      previo({ ...valores, diasConsecutivosSinDescanso: ds === 19 ? 12 : ds }),
      regla(),
    );
    assert.equal(r.indice, esperado);
    assert.equal(r.nivel, nivel);
  }
});

test("T07: usa reglas actuales también para el antecedente y respeta cortes configurables", () => {
  const reglas = {
    ...regla(),
    effectiveFrom: "2026-10-12",
    highLimit: 95,
    mediumLimit: 90,
  };
  const r = calcular(registro(), previo(), reglas);
  assert.equal(r.nivel, "BAJO");
  assert.equal(r.persistencia.anterior?.indice, 83.71);
  const nuevas = {
    ...regla(),
    thresholds: { HE: 80, DS: 60, CT: 0.7, VP: 100 },
  };
  const recalculado = calcular(registro(), previo(), nuevas);
  assert.equal(
    recalculado.persistencia.anterior?.indice,
    calcular(previo(), null, nuevas).indice,
  );
  assert.notEqual(recalculado.persistencia.anterior?.indice, 83.71);
});

test("T07: entradas inválidas producen error técnico, nunca un nivel", () => {
  for (const campo of [
    "horasExtra",
    "diasConsecutivosSinDescanso",
    "tareasActivas",
    "tareasPendientes",
    "tareasVencidas",
    "vacacionesPendientesDias",
  ] as const) {
    for (const valor of [undefined, null, NaN, Infinity, -1, "2"]) {
      rechaza(
        registro({ [campo]: valor } as unknown as Partial<RegistroLaboral>),
      );
    }
    if (campo !== "horasExtra") rechaza(registro({ [campo]: 1.5 }));
  }
  for (const cambios of [
    { tareasActivas: 0 },
    { tareasVencidas: 8 },
    { tareasPendientes: 11 },
    { horasExtra: 169 },
    { horasTrabajadas: 15 },
    { horasTrabajadas: 169 },
    { diasDesdeUltimasVacaciones: 1.5 },
    { diasDesdeUltimasVacaciones: Infinity },
    { periodStart: "2026-02-30" },
    { periodStart: "2026-10-13" },
    { periodEnd: "2026-10-19" },
    { employeeId: "" },
    { dataVersion: 0 },
  ])
    rechaza(registro(cambios));
  rechaza(null as unknown as RegistroLaboral);
  rechaza(registro(), previo({ employeeId: "OTRO" }));
  rechaza(registro(), registro());
  rechaza(registro(), previo({ horasExtra: NaN }));
  for (const reglas of [
    null,
    { ...regla(), weights: { HE: 1 } },
    { ...regla(), thresholds: { ...regla().thresholds, HE: 0 } },
    { ...regla(), effectiveFrom: "2026-10-19" },
  ]) {
    rechaza(registro(), null, reglas as ConfiguracionIndice);
  }
});

test("T07: determinismo y entradas congeladas sin mutaciones", () => {
  const actual = registro(),
    anterior = previo(),
    reglas = regla();
  Object.freeze(actual);
  Object.freeze(anterior);
  Object.freeze(reglas.weights);
  Object.freeze(reglas.thresholds);
  Object.freeze(reglas);
  const copia = structuredClone({ actual, anterior, reglas });
  assert.deepEqual(
    calcular(actual, anterior, reglas),
    calcular(actual, anterior, reglas),
  );
  assert.deepEqual({ actual, anterior, reglas }, copia);
});

// Parser acotado a fixtures T03 sin campos escapados; no sustituye CU01.
function csv(ruta: string) {
  const [cabecera, ...lineas] = readFileSync(ruta, "utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  return lineas.map((linea) =>
    Object.fromEntries(
      cabecera.split(",").map((campo, i) => [campo, linea.split(",")[i]]),
    ),
  );
}
test("T07: motor real reproduce las 138 filas del oráculo T03", () => {
  const lote = csv("templates/indicadores.csv").map((fila, i) =>
    registro({
      employeeId: fila.employee_id,
      periodStart: fila.period_start,
      periodEnd: fila.period_end,
      recordId: `r${i}`,
      fingerprint: `f${i}`,
      horasExtra: Number(fila.horas_extra),
      diasConsecutivosSinDescanso: Number(fila.dias_consecutivos_sin_descanso),
      tareasActivas: Number(fila.tareas_activas),
      tareasPendientes: Number(fila.tareas_pendientes),
      tareasVencidas: Number(fila.tareas_vencidas),
      vacacionesPendientesDias: Number(fila.vacaciones_pendientes_dias),
      horasTrabajadas: fila.horas_trabajadas
        ? Number(fila.horas_trabajadas)
        : null,
      diasDesdeUltimasVacaciones: fila.dias_desde_ultimas_vacaciones
        ? Number(fila.dias_desde_ultimas_vacaciones)
        : null,
    }),
  );
  const esperados = csv("tests/data/resultados_esperados.csv");
  assert.equal(lote.length, 138);
  assert.equal(esperados.length, 138);
  for (const actual of lote) {
    const fecha = new Date(`${actual.periodStart}T00:00:00Z`);
    fecha.setUTCDate(fecha.getUTCDate() - 7);
    const anterior =
      lote.find(
        (r) =>
          r.employeeId === actual.employeeId &&
          r.periodStart === fecha.toISOString().slice(0, 10),
      ) ?? null;
    const esperado = esperados.find(
      (r) =>
        r.employee_id === actual.employeeId &&
        r.period_start === actual.periodStart,
    )!;
    const r = calcular(actual, anterior, regla());
    assert.equal(
      r.indice,
      Number(esperado.indice),
      `${actual.employeeId}/${actual.periodStart}`,
    );
    assert.equal(r.nivel, esperado.nivel);
  }
});
