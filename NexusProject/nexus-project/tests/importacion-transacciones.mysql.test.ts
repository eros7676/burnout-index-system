import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { escenario, peticion } from "./importacion-fixture";

// A preview stores every row of the file in one transaction. On a cold database (right after the
// migrations) a full file took longer than Prisma's 5 s default and the validation answered 500
// (P2028), so every transaction the three validations open must state its own timeout.
test("MySQL: las validaciones de las tres importaciones no usan el plazo de 5 s", async () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url);
  assert.match(new URL(url).pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  await db.$transaction((tx) => sembrarBase(tx));
  const llamadas: { timeout?: number; maxWait?: number }[] = [];
  let grabar = false;
  const espia = new Proxy(db, {
    get(destino, propiedad) {
      if (propiedad !== "$transaction") return Reflect.get(destino, propiedad, destino);
      return (trabajo: unknown, opciones?: { timeout?: number; maxWait?: number }) => {
        if (grabar && typeof trabajo === "function") llamadas.push(opciones ?? {});
        return (destino.$transaction as (...a: unknown[]) => unknown)(trabajo, opciones);
      };
    },
  });
  try {
    await escenario(espia, async (s) => {
      await s.importarIndicadores();
      grabar = true;
      const indicadores = await peticion(s.http.validar, s.indicadores, "indicadores.csv");
      const tareas = await s.validarTareas();
      const jornadas = await s.validarJornadas();
      grabar = false;
      for (const r of [indicadores, tareas, jornadas]) assert.equal(r.status, 200, JSON.stringify(r.body));
      s.imports.push(indicadores.body.importId);
      assert.ok(llamadas.length >= 3, `se esperaban al menos 3 transacciones, hubo ${llamadas.length}`);
      for (const opciones of llamadas) {
        assert.ok((opciones.timeout ?? 5_000) >= 30_000, `plazo ${opciones.timeout ?? "por defecto (5 s)"}`);
        assert.ok((opciones.maxWait ?? 2_000) >= 10_000, `espera ${opciones.maxWait ?? "por defecto (2 s)"}`);
      }
    });
  } finally {
    await db.$disconnect();
  }
});
