import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  actorDemo,
  tokenDemo,
  usuarioDemo,
  usuarioDeSolicitud,
  usuariosDemo,
  proteger,
  seleccionarDemo,
  sesionDemo,
} from "../src/server/http/permisos-demo";
import { MATRIZ_PERMISOS, tienePermiso } from "../src/shared/permisos";
import { empresaActual, empresaValida, empresasDisponibles } from "../src/server/empresas";

const req = (userId?: string, url = "http://local/api/evaluaciones") =>
  new Request(url, {
    headers: userId ? { Cookie: `nexo_demo=${tokenDemo(userId)}` } : {},
  });
type Fila = Record<string, unknown>;
const EQUIPOS = [1, 2, 3, 4].map((n) => ({
  teamId: `EQ-0${n}`,
  nombre: `Célula ficticia ${n}`,
  liderId: `TL-0${n}`,
  activo: true,
}));
/** Catalog teams, a lead's record and the audit table; nothing else is reachable. */
function dbFalsa(
  opciones: {
    equipos?: typeof EQUIPOS;
    empleado?: () => Fila | null;
    enEquipo?: boolean;
  } = {},
) {
  const eventos: Fila[] = [];
  const equipos = opciones.equipos ?? EQUIPOS;
  const db = {
    equipo: {
      findUnique: async ({ where }: { where: { teamId: string } }) =>
        equipos.find((e) => e.teamId === where.teamId) ?? null,
      findMany: async () => equipos.filter((e) => e.activo && e.liderId),
    },
    empleado: {
      findUnique: async () =>
        opciones.empleado?.() ?? {
          activo: true,
          tipo: "TEAM_LEAD",
          teamId: "EQ-01",
        },
      findFirst: async () => (opciones.enEquipo ? { employeeId: "x" } : null),
    },
    alerta: { findFirst: async () => null },
    eventoAuditoria: {
      create: async ({ data }: { data: Fila }) => {
        eventos.push(data);
        return data;
      },
    },
  } as unknown as PrismaClient;
  return { db, eventos };
}
const ok = async () => Response.json({ ok: true });

test("T15a: rechaza sesión vencida y modificación de una firma válida", async () => {
  const { db } = dbFalsa();
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
  await assert.rejects(usuarioDemo(db, request(vencido)));
  const token = tokenDemo("demo-rrhh");
  const [valor, firma] = token.split(".");
  const modificada = (firma[0] === "a" ? "b" : "a") + firma.slice(1);
  await assert.rejects(usuarioDemo(db, request(`${valor}.${modificada}`)));
});

test("T15a: cookie firmada, sin rol confiado al cliente", async () => {
  const { db } = dbFalsa();
  assert.equal((await usuarioDemo(db, req("demo-rrhh"))).rol, "RRHH");
  await assert.rejects(usuarioDemo(db, req()));
  await assert.rejects(
    usuarioDemo(
      db,
      new Request("http://local", {
        headers: { Cookie: "nexo_demo=manipulado.firma", "x-role": "RRHH" },
      }),
    ),
  );
  const body = { userId: "demo-rrhh", rol: "RRHH" };
  assert.equal(
    (
      await seleccionarDemo(
        db,
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
        db,
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
    db,
    new Request("http://local", {
      method: "POST",
      body: JSON.stringify({ userId: "demo-rrhh" }),
    }),
  );
  assert.match(r.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict/);
  const local = await seleccionarDemo(
    db,
    new Request("http://localhost:3106/api/demo/sesion", {
      method: "POST",
      headers: { Host: "127.0.0.1:3106", Origin: "http://127.0.0.1:3106" },
      body: JSON.stringify({ userId: "demo-rrhh" }),
    }),
  );
  assert.equal(local.status, 200);
});

test("D6: un login de Team Lead por equipo activo con líder, tomado del catálogo", async () => {
  const equipos = [
    ...EQUIPOS.slice(0, 2),
    { ...EQUIPOS[2], activo: false },
    { teamId: "EQ-05", nombre: "Equipo Soporte", liderId: "EMP-020", activo: true },
  ];
  const { db } = dbFalsa({ equipos });
  const usuarios = await usuariosDemo(db);
  assert.deepEqual(
    usuarios.map((u) => u.userId),
    ["demo-rrhh", "demo-gerencia", "demo-tl-01", "demo-tl-02", "demo-tl-05", "demo-empleado"],
  );
  const nuevo = await usuarioDemo(db, req("demo-tl-05"));
  assert.deepEqual(
    { employeeId: nuevo.employeeId, teamId: nuevo.teamId, rol: nuevo.rol },
    { employeeId: "EMP-020", teamId: "EQ-05", rol: "TEAM_LEAD" },
  );
  // A team that lost its lead or was deactivated no longer signs anyone in.
  await assert.rejects(usuarioDemo(db, req("demo-tl-03")));
  await assert.rejects(usuarioDemo(db, req("demo-tl-09")));
  const sesion = await (await sesionDemo(db, req("demo-tl-05"))).json();
  assert.equal(sesion.usuario.userId, "demo-tl-05");
  assert.equal(sesion.usuarios.length, 6);
});

test("D6: al cambiar el líder, el login del equipo pasa a la persona nueva", async () => {
  const { db } = dbFalsa({
    equipos: [{ ...EQUIPOS[0], liderId: "TL-09" }],
  });
  assert.equal((await usuarioDemo(db, req("demo-tl-01"))).employeeId, "TL-09");
});

test("D9: el ingreso de demostración queda auditado", async () => {
  const { db, eventos } = dbFalsa();
  const r = await seleccionarDemo(
    db,
    new Request("http://local", {
      method: "POST",
      body: JSON.stringify({ userId: "demo-tl-02" }),
    }),
  );
  assert.equal(r.status, 200);
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].accion, "SESION_DEMO_INICIADA");
  assert.equal(eventos[0].actorId, "demo-tl-02");
  assert.equal(eventos[0].actorRol, "TEAM_LEAD");
  assert.equal(eventos[0].solicitudId, r.headers.get("x-request-id"));
});

test("T15a: deniega sin sesión, empleado y mutaciones del Team Lead antes de leer datos", async () => {
  // Only the audit table exists: any data read would fail with 500.
  const eventos: Fila[] = [];
  const db = {
    eventoAuditoria: {
      create: async ({ data }: { data: Fila }) => eventos.push(data),
    },
  } as unknown as PrismaClient;
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
  // No identity, no event; each 403 leaves one.
  assert.equal(eventos.length, 5);
  assert.ok(eventos.every((e) => e.accion === "ACCESO_DENEGADO" && e.resultado === "DENEGADO"));
  assert.ok(eventos.every((e) => e.motivo === "SIN_PERMISO"));
  assert.equal(
    (await proteger(db, "IMPORTAR", accion)(req("demo-rrhh"))).status,
    200,
  );
});

test("T15a: aplica el equipo del servidor y rechaza filtros ajenos y usuarios inactivos", async () => {
  let activo = true;
  const { db, eventos } = dbFalsa({
    empleado: () => ({ activo, tipo: "TEAM_LEAD", teamId: "EQ-01" }),
  });
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
    const r = await get(new Request(`${request.url}?${query}`, request));
    assert.equal(r.status, 403);
    assert.equal(eventos.at(-1)!.motivo, "FUERA_DE_EQUIPO");
    assert.equal(eventos.at(-1)!.solicitudId, r.headers.get("x-request-id"));
  }
  activo = false;
  assert.equal((await get(req("demo-tl-01"))).status, 403);
  assert.equal(eventos.at(-1)!.motivo, "SIN_ASIGNACION");
});

test("Mis datos: PROPIOS solo para quien tiene legajo vigente", async () => {
  let registro = { activo: true, tipo: "TECNICO", teamId: "EQ-01" };
  const { db } = dbFalsa({ empleado: () => registro });
  const propios = proteger(db, "PROPIOS", async (request) =>
    Response.json({ employeeId: usuarioDeSolicitud(request).employeeId }),
  );
  const r = await propios(req("demo-empleado"));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).employeeId, "EMP-001");
  assert.equal((await propios(req("demo-rrhh"))).status, 403);
  assert.equal((await propios(req())).status, 401);
  registro = { activo: true, tipo: "TEAM_LEAD", teamId: "EQ-01" };
  assert.equal((await propios(req("demo-tl-01"))).status, 200);
  registro = { activo: false, tipo: "TECNICO", teamId: "EQ-01" };
  assert.equal((await propios(req("demo-empleado"))).status, 403);
  registro = { activo: true, tipo: "TEAM_LEAD", teamId: "EQ-01" };
  assert.equal((await propios(req("demo-empleado"))).status, 403);
});

test("Reglas: un recurso global no recibe el equipo del Team Lead", async () => {
  const { db } = dbFalsa();
  const get = proteger(
    db,
    "LEER",
    async (request) => Response.json({ query: new URL(request.url).search }),
    "global",
  );
  assert.equal((await (await get(req("demo-tl-01"))).json()).query, "");
  assert.equal((await get(req("demo-empleado"))).status, 403);
});

test("D9: el handler recibe el contexto de auditoría de la solicitud", async () => {
  const { db } = dbFalsa();
  const r = await proteger(db, "LEER", async (request) =>
    Response.json(actorDemo(request)),
  )(req("demo-tl-01"));
  const contexto = await r.json();
  assert.deepEqual(
    { ...contexto, solicitudId: undefined },
    {
      actorId: "demo-tl-01",
      actorNombre: "Team Lead, Célula ficticia 1",
      actorRol: "TEAM_LEAD",
      origen: "WEB",
      solicitudId: undefined,
    },
  );
  assert.equal(contexto.solicitudId, r.headers.get("x-request-id"));
  assert.deepEqual(actorDemo(req("demo-rrhh")), { actorId: "demo-local" });
});

test("A3: matriz de permisos nuevos por rol", () => {
  assert.deepEqual(MATRIZ_PERMISOS.ADMINISTRAR_PERSONAS, ["RRHH"]);
  assert.deepEqual(MATRIZ_PERMISOS.EDITAR_REGLAS, ["RRHH"]);
  assert.deepEqual(MATRIZ_PERMISOS.APROBAR_REGLAS, ["GERENCIA"]);
  assert.ok(tienePermiso("TEAM_LEAD", "SEGUIMIENTO"));
  assert.ok(tienePermiso("TEAM_LEAD", "EXPORTAR"));
  assert.ok(!tienePermiso("EMPLEADO", "SEGUIMIENTO"));
  assert.ok(!tienePermiso("GERENCIA", "ADMINISTRAR_PERSONAS"));
  assert.ok(!tienePermiso("RRHH", "PROPIOS"));
});

test("A3: el Team Lead opera solo sobre personas, equipos y alertas propios", async () => {
  const mutar = (recurso: "empleado" | "equipo" | "alerta", enEquipo: boolean) =>
    proteger<[string]>(dbFalsa({ enEquipo }).db, "SEGUIMIENTO", ok, recurso);
  const post = (userId: string) =>
    new Request("http://local/api/x", {
      method: "POST",
      headers: { Cookie: `nexo_demo=${tokenDemo(userId)}` },
    });
  assert.equal((await mutar("empleado", true)(post("demo-tl-01"), "EMP-001")).status, 200);
  assert.equal((await mutar("empleado", false)(post("demo-tl-01"), "EMP-031")).status, 403);
  assert.equal((await mutar("equipo", false)(post("demo-tl-01"), "EQ-01")).status, 200);
  assert.equal((await mutar("equipo", false)(post("demo-tl-01"), "EQ-02")).status, 403);
  assert.equal((await mutar("alerta", false)(post("demo-tl-01"), "al-1")).status, 403);
  // RR. HH. is not narrowed to a team.
  assert.equal((await mutar("alerta", false)(post("demo-rrhh"), "al-1")).status, 200);
  const admin = proteger<[string]>(dbFalsa().db, "ADMINISTRAR_PERSONAS", ok, "empleado");
  assert.equal((await admin(post("demo-gerencia"), "EMP-001")).status, 403);
  assert.equal((await admin(post("demo-rrhh"), "EMP-001")).status, 200);
});

test("Empresas: la sesión firma la empresa y cada solicitud lee la base de esa empresa", async () => {
  const antes = process.env.DATABASE_URL_TRANSPORTE;
  process.env.DATABASE_URL_TRANSPORTE = "mysql://demo@localhost:3306/nexus_transporte";
  try {
    assert.deepEqual(
      empresasDisponibles().map((e) => e.id),
      ["conecta", "rutas"],
    );
    // A company without its database variable is not offered, and its id is never accepted.
    assert.equal(empresaValida("salud"), null);
    assert.equal(empresaValida("nexus_salud; DROP"), null);

    const { db, eventos } = dbFalsa();
    const elegir = (body: unknown) =>
      seleccionarDemo(db, new Request("http://local", { method: "POST", body: JSON.stringify(body) }));
    assert.equal((await elegir({ userId: "demo-rrhh", empresa: "salud" })).status, 403);
    assert.equal((await elegir({ userId: "demo-rrhh", empresa: "rutas", rol: "RRHH" })).status, 403);
    const r = await elegir({ userId: "demo-rrhh", empresa: "rutas" });
    assert.equal(r.status, 200);
    assert.deepEqual(eventos.at(-1)!.detalles, { rol: "RRHH", teamId: null, empresa: "rutas" });
    const cookie = r.headers.get("set-cookie")!.split(";")[0];

    // The guarded handler runs in the session's company.
    let leida: string | undefined;
    const respuesta = await proteger(db, "LEER", async () => {
      leida = empresaActual();
      return Response.json({});
    })(new Request("http://local/api/evaluaciones", { headers: { Cookie: cookie } }));
    assert.equal(respuesta.status, 200);
    assert.equal(leida, "rutas");
    assert.equal(empresaActual(), "conecta", "outside a request, the default company");

    // The picker lists another company's logins without signing the user in there.
    const sesion = async (url: string) =>
      (await sesionDemo(db, new Request(url, { headers: { Cookie: cookie } }))).json();
    const propia = await sesion("http://local/api/demo/sesion");
    assert.equal(propia.empresa.id, "rutas");
    assert.equal(propia.usuario.userId, "demo-rrhh");
    assert.equal(propia.empresas.length, 2);
    const otra = await sesion("http://local/api/demo/sesion?empresa=conecta");
    assert.equal(otra.empresa.id, "conecta");
    assert.equal(otra.usuario, null);
    assert.equal((await sesion("http://local/api/demo/sesion?empresa=salud")).empresa.id, "rutas");

    // A session from before companies (no `empresa` in the token) stays in the default company.
    assert.equal((await usuarioDemo(db, req("demo-rrhh"))).rol, "RRHH");
  } finally {
    if (antes === undefined) delete process.env.DATABASE_URL_TRANSPORTE;
    else process.env.DATABASE_URL_TRANSPORTE = antes;
  }
  // With the variable gone, a session signed for that company is no session.
  const { db } = dbFalsa();
  const token = tokenDemo("demo-rrhh", "rutas");
  await assert.rejects(
    usuarioDemo(db, new Request("http://local", { headers: { Cookie: `nexo_demo=${token}` } })),
  );
});
