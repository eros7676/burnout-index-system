import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  filtrosConsulta,
  ErrorConsulta,
} from "../src/server/services/filtros-consultas";
import { crearHttpConsultas } from "../src/server/http/consultas";
const request = (query = "") =>
  new Request(`http://localhost/api/evaluaciones${query}`);

test("T13: filtros estrictos, fechas reales, paginación acotada y parámetros repetidos", () => {
  assert.deepEqual(filtrosConsulta(request(), "evaluaciones"), {
    page: 1,
    pageSize: 50,
  });
  assert.equal(
    filtrosConsulta(
      request("?periodStart=2026-10-12&nivel=ALTO&pageSize=100"),
      "evaluaciones",
    ).nivel,
    "ALTO",
  );
  for (const query of [
    "?page=0",
    "?page=-1",
    "?page=1.5",
    "?page=1e2",
    "?pageSize=101",
    "?pageSize=",
    "?page=9007199254740992",
    "?nivel=alto",
    "?teamId=",
    "?employeeId=%20",
    "?teamId=x&teamId=y",
    "?foo=x",
    "?periodStart=2026-02-30",
    "?periodStart=2026-10-13",
    "?periodStart=2026-10-12T00:00:00Z",
  ]) {
    assert.throws(
      () => filtrosConsulta(request(query), "evaluaciones"),
      ErrorConsulta,
      query,
    );
  }
  for (const query of ["?nivel=ALTO", "?page=1", "?pageSize=10"])
    assert.throws(
      () => filtrosConsulta(request(query), "resumen"),
      ErrorConsulta,
    );
  assert.throws(
    () => filtrosConsulta(request("?nivel=ALTO"), "alertas"),
    ErrorConsulta,
  );
});

test("T13: rechaza filtros e ID inválidos antes de abrir conexión MySQL", async () => {
  const db = new PrismaClient();
  const http = crearHttpConsultas(db);
  for (const response of [
    await http.evaluaciones(request("?page=0")),
    await http.resumen(request("?nivel=ALTO")),
    await http.alertas(request("?pageSize=101")),
    await http.informe(request(), "x".repeat(37)),
  ]) {
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).error.codigo, "PETICION_INVALIDA");
  }
  await db.$disconnect();
});

test("T13: fallos inesperados no filtran detalles técnicos", async () => {
  const db = {
    $transaction: async () => {
      throw new Error("datos privados de conexión");
    },
  } as unknown as PrismaClient;
  const response = await crearHttpConsultas(db).resumen(request());
  assert.equal(response.status, 500);
  assert.equal(
    JSON.stringify(await response.json()).includes("privados"),
    false,
  );
});
