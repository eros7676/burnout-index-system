import assert from "node:assert/strict";
import test from "node:test";
import type { Evaluacion, Factor } from "../src/shared/contracts";
import {
  evaluacionAltaMock,
  evaluacionIncompletaMock,
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
  const textos = recomendacionesDe(["VP", "HE", "DS", "CT"], ["HE", "VP"]);
  assert.equal(textos.length, 2);
  assert.match(textos[0], /vacaciones/);
  assert.match(textos[1], /horas extra/);
  assert.deepEqual(recomendacionesDe(["HE", "DS", "CT", "VP"], []), [
    "Ningún factor supera su umbral.",
  ]);
});
