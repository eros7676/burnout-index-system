import assert from "node:assert/strict";
import { test } from "node:test";
import { API_ROUTES } from "../src/shared/api";
import { ErrorDominio } from "../src/shared/errors";
import {
  confirmacionFallidaMock,
  crearRespuestaMock,
  cuerposExitoMock,
  evaluacionAltaMock,
  evaluacionIncompletaMock,
  filasEscenarioMock,
  importacionRepetidaMock,
  informeMock,
  validacionRechazadaMock,
} from "../src/shared/mocks";

test("todas las rutas P0 tienen un mock serializable con su contrato de respuesta", () => {
  assert.equal(Object.keys(API_ROUTES).length, 9);
  assert.deepEqual(
    Object.keys(cuerposExitoMock).sort(),
    Object.keys(API_ROUTES).sort(),
  );
  for (const operacion of Object.keys(
    API_ROUTES,
  ) as (keyof typeof API_ROUTES)[]) {
    const respuesta = crearRespuestaMock(operacion);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(
      JSON.parse(JSON.stringify(respuesta.body)),
      respuesta.body,
    );
  }
});

test("cada consumidor recibe una copia sin modificar otros mocks", () => {
  const primera = crearRespuestaMock("obtenerInforme");
  if (primera.status !== 200) assert.fail("Se esperaba mock exitoso");
  primera.body.evaluacion.snapshot.actual.horasExtra = 0;
  const segunda = crearRespuestaMock("obtenerInforme");
  if (segunda.status !== 200) assert.fail("Se esperaba mock exitoso");
  assert.equal(segunda.body.evaluacion.snapshot.actual.horasExtra, 16);
});

test("el ejemplo integral conserva índice incompleto y alerta solo en la segunda semana", () => {
  assert.equal(evaluacionIncompletaMock.indice, 83.71);
  assert.equal(evaluacionIncompletaMock.nivel, "INCOMPLETO");
  assert.equal(evaluacionIncompletaMock.persistencia.anterior, null);
  assert.equal(evaluacionAltaMock.indice, 91.21);
  assert.equal(evaluacionAltaMock.persistencia.anterior?.indice, 83.71);
  assert.equal(evaluacionAltaMock.persistencia.cumple, true);
  assert.equal(
    informeMock.alerta?.evaluationId,
    evaluacionAltaMock.evaluationId,
  );
  assert.equal(informeMock.alerta?.canal, "INTERNO");
  assert.equal(informeMock.alerta?.estadoEnvio, "NO_APLICA");
  assert.deepEqual(
    informeMock.factores.map((f) => f.codigo),
    evaluacionAltaMock.ranking,
  );
  assert.equal(
    informeMock.factores
      .reduce((suma, f) => suma + f.contribucion, 0)
      .toFixed(2),
    "91.21",
  );
});

test("rechazo 422 conserva vista previa y errores por fila sin simular confirmación", () => {
  const { body } = validacionRechazadaMock;
  assert.equal(body.vistaPrevia.status, "RECHAZADA");
  assert.equal(body.error.detalles[0].fila, 2);
  assert.deepEqual(body.error.detalles, body.vistaPrevia.errores);
});

test("un fallo técnico queda en el job, separado del nivel y de la importación", () => {
  assert.equal(confirmacionFallidaMock.status, 200);
  assert.equal(confirmacionFallidaMock.body.status, "CONFIRMADA");
  assert.equal(confirmacionFallidaMock.body.procesamiento.estado, "FALLIDO");
  assert.equal(confirmacionFallidaMock.body.procesamiento.completados, 1);
  const fallida = filasEscenarioMock.find(
    (fila) => fila.processingState === "FALLIDO",
  );
  assert.ok(fallida);
  assert.equal(fallida.nivel, null);
  assert.equal(fallida.indice, null);
  assert.equal(filasEscenarioMock[0].processingState, "COMPLETADO");
});

test("reimportar un archivo idéntico representa omisiones sin trabajo nuevo", () => {
  assert.equal(importacionRepetidaMock.insertados, 0);
  assert.equal(importacionRepetidaMock.omitidos, 2);
  assert.deepEqual(importacionRepetidaMock.afectados, []);
  assert.equal(importacionRepetidaMock.procesamiento, null);
});

test("el error de dominio expone solo el formato público acordado", () => {
  const error = new ErrorDominio("CONFIGURACION_INVALIDA", "Pesos inválidos.");
  assert.ok(error instanceof Error);
  assert.equal(error.name, "ErrorDominio");
  assert.deepEqual(error.toApiError(), {
    error: {
      codigo: "CONFIGURACION_INVALIDA",
      mensaje: "Pesos inválidos.",
      detalles: [],
    },
  });
  assert.equal("stack" in error.toApiError().error, false);
});
