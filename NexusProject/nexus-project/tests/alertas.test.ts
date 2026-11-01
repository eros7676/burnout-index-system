import assert from "node:assert/strict";
import test from "node:test";
import { evaluacionAltaMock } from "../src/shared/mocks";
import {
  causasDe,
  contenidoAlerta,
  resolverDestinatario,
} from "../src/server/services/destinatario-alerta";
import { recomendacionesDe } from "../src/server/services/recomendaciones";

const teamLead = {
  employeeId: "TL-01",
  tipo: "TEAM_LEAD" as const,
  activo: true,
};
const gerencia = {
  employeeId: "GER-01",
  tipo: "GERENCIA" as const,
  activo: true,
};

test("el técnico avisa a su Team Lead y el Team Lead a Gerencia", () => {
  assert.deepEqual(
    resolverDestinatario(
      { tipo: "TECNICO", responsableId: "TL-01" },
      teamLead,
    ),
    { destinatarioId: "TL-01", motivoDestinatario: "OK" },
  );
  assert.deepEqual(
    resolverDestinatario(
      { tipo: "TEAM_LEAD", responsableId: "GER-01" },
      gerencia,
    ),
    { destinatarioId: "GER-01", motivoDestinatario: "OK" },
  );
});

test("sin responsable válido la incidencia queda sin destinatario", () => {
  const vacio = { destinatarioId: null, motivoDestinatario: "SIN_DESTINATARIO" as const };
  assert.deepEqual(
    resolverDestinatario({ tipo: "TECNICO", responsableId: null }, null),
    vacio,
  );
  assert.deepEqual(
    resolverDestinatario(
      { tipo: "TECNICO", responsableId: "TL-01" },
      { ...teamLead, activo: false },
    ),
    vacio,
  );
  assert.deepEqual(
    resolverDestinatario(
      { tipo: "TECNICO", responsableId: "GER-01" },
      gerencia,
    ),
    vacio,
  );
  assert.deepEqual(
    resolverDestinatario({ tipo: "GERENCIA", responsableId: null }, null),
    vacio,
  );
});

test("causas y sugerencias siguen el ranking de los factores excedidos", () => {
  assert.deepEqual(causasDe(["VP", "HE", "DS", "CT"], ["HE", "VP"]), ["VP", "HE"]);
  const contenido = contenidoAlerta(evaluacionAltaMock);
  assert.deepEqual(contenido.causas, ["HE", "DS", "CT", "VP"]);
  assert.deepEqual(
    contenido.sugerencias,
    recomendacionesDe(evaluacionAltaMock.ranking, evaluacionAltaMock.excedidas),
  );
  assert.match(contenido.sugerencias[0], /horas extra/);
});
