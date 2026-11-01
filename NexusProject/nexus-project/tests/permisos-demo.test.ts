import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  tokenDemo,
  usuarioDemo,
  proteger,
  seleccionarDemo,
} from "../src/server/http/permisos-demo";
const req = (userId?: string) =>
  new Request("http://local/api/evaluaciones", {
    headers: userId ? { Cookie: `nexo_demo=${tokenDemo(userId)}` } : {},
  });

test("T15a: rechaza sesión vencida y modificación de una firma válida", () => {
  const reloj = Date.now;
  let vencido: string;
  try {
    Date.now = () => reloj() - 9 * 60 * 60 * 1000;
    vencido = tokenDemo("demo-rrhh");
  } finally {
    Date.now = reloj;
  }
  const request = (token: string) =>
    new Request("http://local", { headers: { Cookie: `nexo_demo=${token}` } });
  assert.throws(() => usuarioDemo(request(vencido)));
  const token = tokenDemo("demo-rrhh");
  const [valor, firma] = token.split(".");
  const modificada = (firma[0] === "a" ? "b" : "a") + firma.slice(1);
  assert.throws(() => usuarioDemo(request(`${valor}.${modificada}`)));
});
test("T15a: cookie firmada, sin rol confiado al cliente", async () => {
  assert.equal(usuarioDemo(req("demo-rrhh")).rol, "RRHH");
  assert.throws(() => usuarioDemo(req()));
  assert.throws(() =>
    usuarioDemo(
      new Request("http://local", {
        headers: { Cookie: "nexo_demo=manipulado.firma", "x-role": "RRHH" },
      }),
    ),
  );
  const body = { userId: "demo-rrhh", rol: "RRHH" };
  assert.equal(
    (
      await seleccionarDemo(
        new Request("http://local", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await seleccionarDemo(
        new Request("http://local", {
          method: "POST",
          headers: { Origin: "http://ajeno" },
          body: JSON.stringify({ userId: "demo-rrhh" }),
        }),
      )
    ).status,
    403,
  );
  const r = await seleccionarDemo(
    new Request("http://local", {
      method: "POST",
      body: JSON.stringify({ userId: "demo-rrhh" }),
    }),
  );
  assert.match(r.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict/);
  const local = await seleccionarDemo(
    new Request("http://localhost:3106/api/demo/sesion", {
      method: "POST",
      headers: { Host: "127.0.0.1:3106", Origin: "http://127.0.0.1:3106" },
      body: JSON.stringify({ userId: "demo-rrhh" }),
    }),
  );
  assert.equal(local.status, 200);
});
test("T15a: deniega sin sesión, empleado y mutaciones del Team Lead antes de consultar SQL", async () => {
  const db = {} as PrismaClient;
  let llamadas = 0;
  const accion = async () => {
    llamadas++;
    return Response.json({ ok: true });
  };
  assert.equal((await proteger(db, "LEER", accion)(req())).status, 401);
  for (const permiso of ["LEER", "IMPORTAR", "NOTIFICAR", "AUDITORIA"] as const)
    assert.equal(
      (await proteger(db, permiso, accion)(req("demo-empleado"))).status,
      403,
    );
  assert.equal(
    (await proteger(db, "IMPORTAR", accion)(req("demo-tl-01"))).status,
    403,
  );
  assert.equal(llamadas, 0);
  assert.equal(
    (await proteger(db, "IMPORTAR", accion)(req("demo-rrhh"))).status,
    200,
  );
});
test("T15a: aplica el equipo del servidor y rechaza filtros ajenos y usuarios inactivos", async () => {
  let activo = true;
  const db = {
    empleado: {
      findUnique: async () => ({
        activo,
        tipo: "TEAM_LEAD",
        teamId: "EQ-01",
      }),
      findFirst: async () => null,
    },
  } as unknown as PrismaClient;
  const get = proteger(db, "LEER", async (request) =>
    Response.json({ teamId: new URL(request.url).searchParams.get("teamId") }),
  );
  assert.equal((await (await get(req("demo-tl-01"))).json()).teamId, "EQ-01");
  for (const query of [
    "teamId=EQ-02",
    "employeeId=EMP-002",
    "teamId=EQ-01&teamId=EQ-02",
  ]) {
    const request = req("demo-tl-01");
    assert.equal(
      (await get(new Request(`${request.url}?${query}`, request))).status,
      403,
    );
  }
  activo = false;
  assert.equal((await get(req("demo-tl-01"))).status, 403);
});
