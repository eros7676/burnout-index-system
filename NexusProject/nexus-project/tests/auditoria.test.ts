import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  filtrosAuditoria,
  crearHttpAuditoria,
} from "../src/server/http/auditoria";
test("T15b: filtros estrictos, fechas UTC reales y paginación acotada", () => {
  const filtros = (query: string) =>
    filtrosAuditoria(new Request(`http://local/api/auditoria?${query}`));
  assert.equal(filtros("actorId=demo-local&pageSize=1").pageSize, 1);
  assert.equal(
    filtros("recursoId=v1.1&actorId=demo%40local").where.recursoId,
    "v1.1",
  );
  for (const q of [
    "actorId=x&actorId=y",
    "q=secret",
    "page=0",
    "pageSize=101",
    "accion=BORRAR",
    "entidad=USUARIO",
    "desde=2026-02-30T00:00:00.000Z",
    "desde=2026-11-02T00:00:00.000Z&hasta=2026-11-01T00:00:00.000Z",
  ])
    assert.throws(() => filtros(q));
});
test("T15b: errores uniformes y sin cache ni detalles de infraestructura", async () => {
  const get = crearHttpAuditoria({} as PrismaClient);
  assert.equal((await get(new Request("http://local/?page=-1"))).status, 400);
  const response = await get(new Request("http://local/"));
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(
    (await response.json()).error.mensaje,
    "No se pudo consultar la auditoría.",
  );
});
