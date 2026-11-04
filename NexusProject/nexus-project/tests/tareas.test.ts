import assert from "node:assert/strict";
import { test } from "node:test";
import { cuerposExitoMock } from "../src/shared/mocks";
import {
  conciliar,
  detalleDe,
  enlaceSeguro,
  puedeVerDetalleTareas,
  resumirGrupos,
} from "../src/server/services/tareas-consulta-resumen";
import {
  filtrosEquipo,
  filtrosHistorial,
  filtrosMisTareas,
  filtrosSemana,
  filtrosSemanas,
} from "../src/server/services/tareas-consulta-filtros";
import { ErrorConsulta } from "../src/server/services/filtros-consultas";

const pedido = (query: string) =>
  new Request(`http://localhost/api/x?${query}`);
const rechaza = (accion: () => unknown, status = 400) =>
  assert.throws(
    accion,
    (e) => e instanceof ErrorConsulta && e.status === status,
  );

test("el resumen por estado suma los grupos y deja en cero los que no existen", () => {
  assert.deepEqual(resumirGrupos([]), {
    total: 0,
    completadas: 0,
    pendientes: 0,
    vencidas: 0,
    diasAtrasoMax: 0,
    diasAtrasoTotal: 0,
  });
  assert.deepEqual(
    resumirGrupos([
      { estado: "VENCIDA", n: 5, diasAtrasoMax: 9, diasAtrasoTotal: 21 },
      {
        estado: "COMPLETADA",
        n: 3,
        diasAtrasoMax: null,
        diasAtrasoTotal: null,
      },
      { estado: "PENDIENTE", n: 2, diasAtrasoMax: null, diasAtrasoTotal: null },
    ]),
    {
      total: 10,
      completadas: 3,
      pendientes: 2,
      vencidas: 5,
      diasAtrasoMax: 9,
      diasAtrasoTotal: 21,
    },
  );
});

test("la conciliación deriva activas, pendientes y vencidas del detalle y marca cada campo", () => {
  const resumen = resumirGrupos([
    { estado: "VENCIDA", n: 5, diasAtrasoMax: 9, diasAtrasoTotal: 21 },
    { estado: "COMPLETADA", n: 3, diasAtrasoMax: null, diasAtrasoTotal: null },
    { estado: "PENDIENTE", n: 2, diasAtrasoMax: null, diasAtrasoTotal: null },
  ]);
  // The week's summary stores P as every open task, overdue ones included.
  assert.deepEqual(
    conciliar(
      { tareasActivas: 10, tareasPendientes: 7, tareasVencidas: 5 },
      resumen,
    ),
    {
      coincide: true,
      campos: [
        { campo: "tareasActivas", resumen: 10, detalle: 10 },
        { campo: "tareasPendientes", resumen: 7, detalle: 7 },
        { campo: "tareasVencidas", resumen: 5, detalle: 5 },
      ],
    },
  );
  const distinta = conciliar(
    { tareasActivas: 10, tareasPendientes: 7, tareasVencidas: 4 },
    resumen,
  );
  assert.equal(distinta.coincide, false);
  assert.deepEqual(
    distinta.campos.filter((c) => c.resumen !== c.detalle),
    [{ campo: "tareasVencidas", resumen: 4, detalle: 5 }],
  );
});

test("sin filas, una semana con tareas queda sin detalle y una semana sin tareas queda verificada", () => {
  const vacio = resumirGrupos([]);
  const con = (tareasActivas: number) => ({
    tareasActivas,
    tareasPendientes: 0,
    tareasVencidas: 0,
  });
  assert.equal(detalleDe(con(4), vacio, false), "SIN_DETALLE");
  assert.equal(detalleDe(con(0), vacio, false), "CON_DETALLE");
  // A recorded fingerprint means detail was attached, even if the rows disagree with the counts.
  assert.equal(detalleDe(con(4), vacio, true), "CON_DETALLE");
  const una = resumirGrupos([
    { estado: "COMPLETADA", n: 1, diasAtrasoMax: null, diasAtrasoTotal: null },
  ]);
  assert.equal(detalleDe(con(4), una, false), "CON_DETALLE");
});

test("solo un enlace https llega al navegador", () => {
  assert.equal(
    enlaceSeguro("https://jira.example/browse/OPS-1"),
    "https://jira.example/browse/OPS-1",
  );
  for (const ref of [
    null,
    "",
    "http://jira.example/x",
    "javascript:alert(1)",
    "data:text/html,x",
    "//jira.example/x",
    "OPS-1432",
    "https://",
    "https://jira.example/a b",
  ])
    assert.equal(enlaceSeguro(ref), null, String(ref));
});

const tecnico = {
  employeeId: "EMP-002",
  tipo: "TECNICO",
  teamId: "EQ-02",
} as const;
const lider = {
  employeeId: "TL-02",
  tipo: "TEAM_LEAD",
  teamId: "EQ-02",
} as const;
const usuario = (
  rol: "RRHH" | "GERENCIA" | "TEAM_LEAD" | "EMPLEADO",
  teamId: string | null,
  employeeId: string | null,
) => ({ rol, teamId, employeeId });

test("visibilidad del detalle: RR. HH. todo, el Team Lead su equipo, Gerencia solo a los Team Leads", () => {
  assert.equal(
    puedeVerDetalleTareas(usuario("RRHH", null, null), tecnico),
    true,
  );
  assert.equal(puedeVerDetalleTareas(usuario("RRHH", null, null), lider), true);

  const tl = usuario("TEAM_LEAD", "EQ-02", "TL-02");
  assert.equal(puedeVerDetalleTareas(tl, tecnico), true);
  assert.equal(puedeVerDetalleTareas(tl, lider), true);
  assert.equal(
    puedeVerDetalleTareas(usuario("TEAM_LEAD", "EQ-01", "TL-01"), tecnico),
    false,
  );

  const gerencia = usuario("GERENCIA", null, "GER-01");
  assert.equal(puedeVerDetalleTareas(gerencia, lider), true);
  assert.equal(puedeVerDetalleTareas(gerencia, tecnico), false);

  // The person's own detail goes through /api/mis-datos/tareas, never through the team routes.
  assert.equal(
    puedeVerDetalleTareas(usuario("EMPLEADO", "EQ-02", "EMP-002"), tecnico),
    false,
  );
});

test("los filtros de una semana exigen persona y lunes, y rechazan lo desconocido o repetido", () => {
  assert.deepEqual(
    filtrosSemana(pedido("employeeId=EMP-001&periodStart=2026-10-12")),
    { employeeId: "EMP-001", periodStart: "2026-10-12", page: 1, pageSize: 50 },
  );
  assert.deepEqual(
    filtrosSemana(
      pedido(
        "employeeId=EMP-001&periodStart=2026-10-12&recordId=abc_1&estado=VENCIDA&page=2&pageSize=100&teamId=EQ-01",
      ),
    ),
    {
      employeeId: "EMP-001",
      periodStart: "2026-10-12",
      recordId: "abc_1",
      estado: "VENCIDA",
      teamId: "EQ-01",
      page: 2,
      pageSize: 100,
    },
  );
  for (const query of [
    "",
    "employeeId=EMP-001",
    "periodStart=2026-10-12",
    "employeeId=EMP-001&periodStart=2026-10-13", // a Tuesday
    "employeeId=EMP-001&periodStart=2026-02-30",
    "employeeId=EMP-001&periodStart=2026-10-12&estado=ABIERTA",
    "employeeId=EMP-001&periodStart=2026-10-12&pageSize=101",
    "employeeId=EMP-001&periodStart=2026-10-12&pageSize=0",
    "employeeId=EMP-001&periodStart=2026-10-12&page=0",
    "employeeId=EMP-001&periodStart=2026-10-12&page=1.5",
    "employeeId=EMP-001&employeeId=EMP-002&periodStart=2026-10-12",
    "employeeId=EMP%20001&periodStart=2026-10-12",
    "employeeId=EMP-001&periodStart=2026-10-12&orden=asc",
    "employeeId=EMP-001&periodStart=2026-10-12&recordId=a%20b",
  ])
    rechaza(() => filtrosSemana(pedido(query)));
});

test("los filtros de semanas, historial y mis tareas acotan cada consulta", () => {
  assert.deepEqual(filtrosSemanas(pedido("employeeId=EMP-001")), {
    employeeId: "EMP-001",
    semanas: 12,
  });
  assert.deepEqual(
    filtrosSemanas(pedido("employeeId=EMP-001&semanas=52&teamId=EQ-01")),
    { employeeId: "EMP-001", teamId: "EQ-01", semanas: 52 },
  );
  for (const query of [
    "",
    "employeeId=EMP-001&semanas=53",
    "employeeId=EMP-001&semanas=0",
  ])
    rechaza(() => filtrosSemanas(pedido(query)));

  assert.deepEqual(
    filtrosHistorial(pedido("employeeId=EMP-001&taskId=OPS-1432")),
    { employeeId: "EMP-001", taskId: "OPS-1432" },
  );
  // Keys of the source system may carry dots, colons and slashes.
  assert.equal(
    filtrosHistorial(pedido("employeeId=EMP-001&taskId=PRJ%2Fa.b%3A1")).taskId,
    "PRJ/a.b:1",
  );
  for (const query of [
    "employeeId=EMP-001",
    "taskId=OPS-1",
    `employeeId=EMP-001&taskId=${"a".repeat(65)}`,
    "employeeId=EMP-001&taskId=a%20b",
    "employeeId=EMP-001&taskId=a%3Cb",
  ])
    rechaza(() => filtrosHistorial(pedido(query)));

  assert.deepEqual(filtrosMisTareas(pedido("")), {
    page: 1,
    pageSize: 50,
    semanas: 12,
  });
  assert.deepEqual(
    filtrosMisTareas(pedido("periodStart=2026-10-12&estado=PENDIENTE&page=3")),
    {
      periodStart: "2026-10-12",
      estado: "PENDIENTE",
      page: 3,
      pageSize: 50,
      semanas: 12,
    },
  );
  // The person is the session's, never a parameter.
  for (const query of ["employeeId=EMP-002", "teamId=EQ-01", "recordId=abc"])
    rechaza(() => filtrosMisTareas(pedido(query)));
});

test("los filtros de un equipo exigen equipo y lunes, y no admiten una persona", () => {
  assert.deepEqual(filtrosEquipo(pedido("teamId=EQ-01&periodStart=2026-10-12")), {
    teamId: "EQ-01",
    periodStart: "2026-10-12",
    page: 1,
    pageSize: 50,
  });
  assert.deepEqual(
    filtrosEquipo(pedido("teamId=EQ-01&periodStart=2026-10-12&estado=VENCIDA&page=2&pageSize=100")),
    { teamId: "EQ-01", periodStart: "2026-10-12", estado: "VENCIDA", page: 2, pageSize: 100 },
  );
  for (const query of [
    "",
    "teamId=EQ-01",
    "periodStart=2026-10-12",
    "teamId=EQ-01&periodStart=2026-10-13",
    "teamId=EQ-01&teamId=EQ-02&periodStart=2026-10-12",
    "teamId=EQ-01&periodStart=2026-10-12&employeeId=EMP-001",
    "teamId=EQ-01&periodStart=2026-10-12&estado=ABIERTA",
    "teamId=EQ-01&periodStart=2026-10-12&pageSize=101",
    "teamId=EQ%2001&periodStart=2026-10-12",
  ])
    rechaza(() => filtrosEquipo(pedido(query)));
});

test("los mocks del contrato de tareas son coherentes con su resumen", () => {
  const semana = cuerposExitoMock.listarTareasSemana;
  assert.equal(semana.conciliacion?.coincide, true);
  assert.deepEqual(
    semana.conciliacion?.campos.map((c) => c.resumen === c.detalle),
    [true, true, true],
  );
  assert.equal(semana.indicadores.tareasActivas, semana.resumen.total);
  assert.equal(
    semana.tareas.items.filter((t) => t.estado === "VENCIDA").length,
    semana.resumen.vencidas,
  );
  // RF10: the person's own view carries no index or level.
  assert.equal(cuerposExitoMock.consultarMisTareas.semana?.resultado, null);
  for (const t of semana.tareas.items)
    assert.ok(t.origenRef === null || t.origenRef.startsWith("https://"));
});
