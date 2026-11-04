import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import { evaluacionAltaMock } from "../src/shared/mocks";
import {
  causasDe,
  contenidoAlerta,
  resolverDestinatario,
} from "../src/server/services/destinatario-alerta";
import { recomendacionesDe } from "../src/server/services/recomendaciones";
import { crearAlertaSiCorresponde } from "../src/server/services/alertas";

function errorPrisma(code: string, codigoMysql?: string) {
  return new Prisma.PrismaClientKnownRequestError("Fallo de prueba", {
    code,
    clientVersion: Prisma.prismaVersion.client,
    meta: codigoMysql ? { code: codigoMysql } : undefined,
  });
}

/** Simula resultados transaccionales para probar qué errores se reintentan. */
function clienteConFallos(fallos: unknown[]) {
  let intentos = 0;
  return {
    db: {
      $transaction: async () => {
        const fallo = fallos[intentos++];
        if (fallo) throw fallo;
        return null;
      },
    } as unknown as PrismaClient,
    intentos: () => intentos,
  };
}

test("T11 reintenta conflictos Prisma y deadlocks MySQL de SQL crudo", async () => {
  for (const fallo of [errorPrisma("P2034"), errorPrisma("P2010", "1213")]) {
    const cliente = clienteConFallos([fallo]);
    assert.equal(await crearAlertaSiCorresponde(cliente.db, "evaluacion"), null);
    assert.equal(cliente.intentos(), 2);
  }
});

test("T11 no reintenta otros fallos y limita los reintentos de deadlock", async () => {
  for (const fallo of [errorPrisma("P2010", "1064"), new Error("FALLO")]) {
    const cliente = clienteConFallos([fallo]);
    await assert.rejects(
      crearAlertaSiCorresponde(cliente.db, "evaluacion"),
      (error) => error === fallo,
    );
    assert.equal(cliente.intentos(), 1);
  }
  const fallo = errorPrisma("P2010", "1213");
  const cliente = clienteConFallos([fallo, fallo, fallo]);
  await assert.rejects(
    crearAlertaSiCorresponde(cliente.db, "evaluacion"),
    (error) => error === fallo,
  );
  assert.equal(cliente.intentos(), 3);
});

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
    recomendacionesDe(evaluacionAltaMock),
  );
  assert.match(contenido.sugerencias[0], /^Horas extra: 16 h extra en la semana/);
});
