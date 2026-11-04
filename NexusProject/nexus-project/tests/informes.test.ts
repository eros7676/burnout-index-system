import assert from "node:assert/strict";
import test from "node:test";
import type { Evaluacion, Factor } from "../src/shared/contracts";
import {
  evaluacionAltaMock,
  evaluacionIncompletaMock,
  informeMock,
} from "../src/shared/mocks";
import {
  explicarInforme,
  factoresInforme,
} from "../src/server/services/informe-contenido";
import { recomendacionesDe } from "../src/server/services/recomendaciones";

function conNivel(
  base: Evaluacion,
  nivel: Evaluacion["nivel"],
  indice: number,
  persistencia: Evaluacion["persistencia"],
  excedidas: Factor[] = base.excedidas,
): Evaluacion {
  return { ...base, nivel, indice, persistencia, excedidas };
}

test("INCOMPLETO conserva el índice numérico y no se presenta como diagnóstico", () => {
  const texto = explicarInforme(evaluacionIncompletaMock);
  assert.match(texto, /83,71 puntos, nivel INCOMPLETO/);
  assert.match(texto, /HISTORIAL_INSUFICIENTE/);
  assert.match(texto, /no es un diagnóstico/);
  assert.equal(evaluacionIncompletaMock.indice, 83.71);
});

test("BAJO, MEDIO entre cortes y ALTO usan el nivel guardado", () => {
  const bajo = conNivel(evaluacionIncompletaMock, "BAJO", 0, {
    anterior: {
      periodo: {
        employeeId: "EMP-001",
        periodStart: "2026-09-28",
        periodEnd: "2026-10-04",
      },
      indice: 0,
      excedidas: [],
      dataFingerprint: "prev",
    },
    comunesExcedidas: [],
    cumple: false,
    motivo: "NO_SOSTENIDO",
  }, []);
  assert.match(explicarInforme(bajo), /0,00 puntos, nivel BAJO/);

  const medio = conNivel(evaluacionAltaMock, "MEDIO", 55, {
    ...evaluacionAltaMock.persistencia,
    cumple: false,
    motivo: "NO_SOSTENIDO",
    comunesExcedidas: [],
  });
  assert.match(explicarInforme(medio), /55,00 puntos, nivel MEDIO/);
  assert.match(explicarInforme(medio), /NO_SOSTENIDO/);
  assert.doesNotMatch(explicarInforme(medio), /nivel ALTO/);

  const alto = explicarInforme(evaluacionAltaMock);
  assert.match(alto, /91,21 puntos, nivel ALTO/);
  assert.match(alto, /SOSTENIDO/);
  assert.match(alto, /83,71/);
});

test("un pico aislado queda explicado como MEDIO", () => {
  const pico = conNivel(evaluacionAltaMock, "MEDIO", 91.21, {
    ...evaluacionAltaMock.persistencia,
    cumple: false,
    motivo: "NO_SOSTENIDO",
    comunesExcedidas: [],
  });
  const texto = explicarInforme(pico);
  assert.match(texto, /91,21 puntos, nivel MEDIO/);
  assert.match(texto, /límite de Alto \(70\)/);
  assert.match(texto, /NO_SOSTENIDO/);
  assert.doesNotMatch(texto, /nivel ALTO/);
});

test("los factores siguen el ranking y los umbrales del snapshot", () => {
  const ranking: Factor[] = ["VP", "CT", "HE", "DS"];
  const evaluacion: Evaluacion = {
    ...evaluacionAltaMock,
    ranking,
    snapshot: {
      ...evaluacionAltaMock.snapshot,
      reglas: {
        ...evaluacionAltaMock.snapshot.reglas,
        version: "v-snapshot",
        thresholds: { HE: 80, DS: 60, CT: 1, VP: 100 },
      },
    },
  };
  const factores = factoresInforme(evaluacion);
  assert.deepEqual(
    factores.map((factor) => factor.codigo),
    ranking,
  );
  assert.equal(factores[2].umbral, 80);
  assert.equal(factores[2].valor, evaluacion.indicadores.HE);
  assert.equal(factores[2].score, evaluacion.scores.HE);
  assert.equal(factores[2].contribucion, evaluacion.contribuciones.HE);
  assert.equal(factores[2].excedido, true);
});

test("las recomendaciones siguen el ranking de los factores excedidos", () => {
  const textos = recomendacionesDe({
    ...evaluacionAltaMock,
    ranking: ["VP", "HE", "DS", "CT"],
    excedidas: ["HE", "VP"],
  });
  assert.equal(textos.length, 2);
  assert.match(textos[0], /^Vacaciones pendientes: /);
  assert.match(textos[1], /^Horas extra: /);
  assert.deepEqual(recomendacionesDe({ ...evaluacionAltaMock, excedidas: [] }), [
    "Ningún factor supera su umbral.",
  ]);
});

test("cada recomendación dice el dato de la semana, cuánto supera el umbral y la semana anterior", () => {
  // Week: HE 16 h, DS 16 days, 7 of 10 pending with 5 overdue, VP 14 days, last leave 127 days ago.
  // Week before: HE 16 h, DS 9 days, 7 of 10. Thresholds: HE 8, DS 6, VP 10.
  const [he, ds, ct, vp] = recomendacionesDe({ ...evaluacionAltaMock, ranking: ["HE", "DS", "CT", "VP"] });
  assert.equal(
    he,
    "Horas extra: 16 h extra en la semana, el doble del umbral (8 h); también lo superó la semana anterior (16 h). " +
      "Evitar asignaciones adicionales y revisar qué tareas se pueden redistribuir.",
  );
  assert.equal(
    ds,
    "Días consecutivos sin descanso: 16 días seguidos sin descanso, más del doble del umbral (6 días); " +
      "también lo superó la semana anterior (9 días). Evaluar un día de descanso en los próximos días.",
  );
  assert.equal(
    ct,
    "Carga de tareas: 7 tareas pendientes de 10 al cierre, 5 vencidas; la semana anterior, 7 de 10. " +
      "Revisar la asignación y los vencimientos: reasignar tareas o acordar nuevas fechas.",
  );
  assert.equal(
    vp,
    "Vacaciones pendientes: 14 días de vacaciones pendientes, 4 días por encima del umbral (10 días); " +
      "las últimas vacaciones fueron hace 127 días. Evaluar un descanso programado.",
  );
  // The consumers' mock says what the server says for the same evaluation.
  assert.deepEqual(informeMock.recomendaciones, recomendacionesDe(evaluacionAltaMock));
});

test("sin semana anterior no la menciona, y una semana anterior dentro del umbral lo dice", () => {
  const { actual, anterior } = evaluacionAltaMock.snapshot;
  const base = { ...evaluacionAltaMock, ranking: ["HE", "CT"] as Factor[], excedidas: ["HE", "CT"] as Factor[] };
  const sola = recomendacionesDe({ ...base, snapshot: { ...base.snapshot, anterior: null } });
  assert.doesNotMatch(sola.join(" "), /semana anterior/);
  const tranquila = recomendacionesDe({
    ...base,
    snapshot: {
      ...base.snapshot,
      actual: { ...actual, horasExtra: 10.5, tareasVencidas: 0 },
      anterior: anterior && { ...anterior, horasExtra: 3 },
    },
  });
  assert.match(tranquila[0], /10,5 h extra en la semana, 2,5 h por encima del umbral \(8 h\); la semana anterior estaba dentro del umbral \(3 h\)\./);
  assert.match(tranquila[1], /ninguna vencida; .*Revisar la asignación: priorizar o redistribuir las pendientes\.$/);
});
