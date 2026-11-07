import { test, expect, type Page, type Route } from "@playwright/test";
import {
  alerta,
  api,
  celda,
  demo,
  informe,
  PERSONAS,
  type UsuarioDemo,
} from "./demo";
import { directorio, ficha, organizacion } from "./organizacion-mocks";
import type { SemanaPersona } from "../src/shared/contracts";
import { cuerposExitoMock } from "../src/shared/mocks";

// Personas (/employees and /employees/[employeeId]): who is how this week, then one
// person's weeks with their tasks. The list is paged and filtered by the server
// (/api/personas/directorio); the filters themselves are covered in organizacion.spec.ts.

const lista = (page: Page) =>
  page.getByRole("region", { name: "Personas", exact: true });
const equipo = (page: Page) => page.getByRole("combobox", { name: "Equipo" });

test("Personas: elegir la semana, abrir a una persona y ver sus semanas con las tareas y el informe", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await organizacion(page);
  const pedidos: URL[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/api/personas/")) pedidos.push(url);
  });
  await page.goto("/employees");
  await expect(lista(page).getByRole("row")).toHaveCount(PERSONAS.length + 1);

  // The week selector changes the week every row reads.
  await page
    .getByRole("combobox", { name: "Semana" })
    .selectOption("2026-10-05");
  await expect(
    await celda(lista(page), "Persona ficticia 001", "Nivel"),
  ).toHaveText("Incompleto");
  await expect(
    await celda(lista(page), "Persona ficticia 006", "Nivel"),
  ).toHaveText("Sin datos");
  await page
    .getByRole("combobox", { name: "Semana" })
    .selectOption("2026-10-12");

  await lista(page).getByRole("link", { name: "Persona ficticia 001" }).click();
  await expect(page).toHaveURL(/\/employees\/EMP-001$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Persona ficticia 001" }),
  ).toBeVisible();
  await expect(
    page.getByText("Técnico en Célula ficticia 1", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("dl").first()).toContainText("Team Lead ficticio 1");
  // The profile asks for a window of weeks, not the whole history.
  const ficha = pedidos.filter((u) => u.pathname === "/api/personas/EMP-001");
  expect(ficha.map((u) => u.searchParams.get("semanas"))).toEqual(["12"]);

  const semanas = page.getByRole("region", {
    name: "Semanas de Persona ficticia 001",
  });
  // Newest week first, each with its own tasks, hours and level.
  await expect(semanas.getByRole("rowheader")).toHaveText([
    "12–18 oct 2026",
    "5–11 oct 2026",
  ]);
  for (const [semana, tareas, extra, nivelSemana, indice] of [
    [
      "12–18 oct 2026",
      "7 pendientes de 10, 5 vencidas",
      "16 h",
      "Alto",
      "91,21",
    ],
    ["5–11 oct 2026", "8 pendientes de 12", "16 h", "Incompleto", "83,71"],
  ]) {
    await expect(await celda(semanas, semana, "Tareas")).toHaveText(tareas);
    await expect(await celda(semanas, semana, "Horas extra")).toHaveText(extra);
    await expect(await celda(semanas, semana, "Nivel")).toHaveText(nivelSemana);
    await expect(await celda(semanas, semana, "Índice")).toHaveText(indice);
  }
  await expect(
    semanas.getByRole("link", { name: "Ver informe de 5–11 oct 2026" }),
  ).toHaveAttribute("href", "/reports/mock-evaluation-1");
  await semanas
    .getByRole("link", { name: "Ver informe de 12–18 oct 2026" })
    .click();
  await expect(page).toHaveURL(/\/reports\/mock-evaluation-2$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Persona ficticia 001" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Resultado de la semana" }),
  ).toContainText("91,21");
});

test("Personas: el enlace de un equipo desde el resumen abre la página del equipo con sus integrantes", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await organizacion(page);
  await page.goto("/home");
  await page
    .getByRole("region", { name: "Por equipo" })
    .getByRole("link", { name: "Célula ficticia 2" })
    .click();
  await expect(page).toHaveURL(/\/teams\/EQ-02$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Célula ficticia 2" }),
  ).toBeVisible();
  // Its people are listed on the team's own page (the filtered list stays one click away on Equipos).
  await expect(
    page.getByRole("region", { name: "Integrantes de Célula ficticia 2" }).getByRole("rowheader"),
  ).toHaveCount(3);
});

test("Personas/T15a: un Team Lead solo ve a su equipo y no abre a nadie de otro", async ({
  page,
}) => {
  await demo(page, "demo-tl-01");
  await organizacion(page);
  // The server's scope for TL-01: its team is forced, other teams answer 403.
  const ajeno = (route: Route) =>
    route.fulfill({
      status: 403,
      json: {
        error: {
          codigo: "SIN_PERMISO",
          mensaje: "No tiene permiso para consultar personas de otros equipos.",
          detalles: [],
        },
      },
    });
  const pedidos: URL[] = [];
  await page.route(api("/api/personas/directorio"), (route) => {
    const url = new URL(route.request().url());
    pedidos.push(url);
    const filtro = Object.fromEntries(url.searchParams);
    if (filtro.teamId && filtro.teamId !== "EQ-01") return ajeno(route);
    return route.fulfill({ json: directorio({ ...filtro, teamId: "EQ-01" }) });
  });
  await page.route(
    (url) => /^\/api\/personas\/(EMP|TL)-[\w-]+$/.test(url.pathname),
    (route) => {
      const id = new URL(route.request().url()).pathname.split("/").at(-1);
      return PERSONAS.some((p) => p.employeeId === id && p.teamId === "EQ-01")
        ? route.fallback()
        : ajeno(route);
    },
  );
  // A link to another team's list does not widen the scope.
  await page.goto("/employees?equipo=EQ-02");
  await expect(lista(page).getByRole("rowheader")).toHaveText([
    /^Persona ficticia 001/,
    /^Persona ficticia 006/,
    /^Persona ficticia 003/,
    /^Team Lead ficticio 1/,
    /^Persona ficticia 007/,
  ]);
  await expect(equipo(page)).toHaveCount(0);
  await expect(
    page.getByText("Semana 12–18 oct 2026, 5 personas"),
  ).toBeVisible();
  expect(pedidos.every((u) => !u.searchParams.has("teamId"))).toBe(true);

  await page.goto("/employees/EMP-002");
  await expect(
    page.getByRole("heading", { level: 1, name: "No se pudo abrir la ficha" }),
  ).toBeVisible();
  await expect(alerta(page)).toContainText(
    "No tiene permiso para consultar personas de otros equipos.",
  );
  await expect(page.getByRole("main")).not.toContainText(
    "Persona ficticia 002",
  );
});

test("Personas/T15a real: el servidor limita la lista del Team Lead a su equipo", async ({
  page,
}) => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requiere seed MySQL aislado.");
  const entrar = (userId: UsuarioDemo) =>
    page.request.post("/api/demo/sesion", { data: { userId } });
  await entrar("demo-tl-01");
  const respuesta = await page.request.get("/api/personas");
  expect(respuesta.status()).toBe(200);
  const { items } = await respuesta.json();
  expect(items.length).toBeGreaterThan(0);
  expect(items.every((p: { teamId: string }) => p.teamId === "EQ-01")).toBe(
    true,
  );
  expect(
    (await page.request.get("/api/personas?employeeId=EMP-002")).status(),
  ).toBe(403);

  await page.goto("/employees/EMP-002");
  await expect(alerta(page)).toContainText(
    "No tiene permiso para consultar personas de otros equipos.",
  );
  await page.goto("/employees/EMP-001");
  await expect(
    page.getByRole("heading", { level: 1, name: "Persona ficticia 001" }),
  ).toBeVisible();

  await entrar("demo-rrhh");
  const todos = await (await page.request.get("/api/personas")).json();
  expect(
    new Set(todos.items.map((p: { teamId: string }) => p.teamId)).size,
  ).toBe(4);
});

test("Personas: ordenar por carga y filtrar por puesto, con la columna ordenada señalada", async ({ page }) => {
  await demo(page, "demo-gerencia");
  await organizacion(page);
  const pedidos: URL[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname === "/api/personas/directorio") pedidos.push(url);
  });
  await page.goto("/employees");
  await expect(lista(page).getByRole("row")).toHaveCount(PERSONAS.length + 1);

  await page.getByRole("combobox", { name: "Ordenar" }).selectOption({ label: "Por tareas vencidas" });
  await expect.poll(() => pedidos.at(-1)?.searchParams.get("orden")).toBe("vencidas");
  await expect(lista(page).getByRole("columnheader", { name: "Tareas" })).toHaveAttribute("aria-sort", "descending");
  await expect(lista(page).getByRole("columnheader", { name: "Índice" })).not.toHaveAttribute("aria-sort", /./);
  const vencidas = await lista(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader") })
    .evaluateAll((filas) =>
      filas.map((f) => Number(/(\d+) vencidas?/.exec(f.textContent ?? "")?.[1] ?? 0)),
    );
  expect(vencidas).toEqual([...vencidas].sort((a, b) => b - a));

  await page.getByRole("combobox", { name: "Puesto" }).selectOption({ label: "Team Lead" });
  await expect.poll(() => pedidos.at(-1)?.searchParams.get("tipo")).toBe("TEAM_LEAD");
  const lideres = PERSONAS.filter((p) => p.tipo === "TEAM_LEAD").length;
  await expect(lista(page).getByRole("row")).toHaveCount(lideres + 1);
  await expect(page.getByRole("button", { name: "Quitar filtros" }).or(page.getByText("con estos filtros")).first()).toBeVisible();
});

test("Ficha: las sugerencias de la última semana salen de sus datos, y sin umbral superado no hay sección", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await organizacion(page);
  await page.goto("/employees/EMP-001");
  const sugerencias = page.getByRole("region", { name: "Sugerencias de revisión" });
  await expect(sugerencias).toContainText("12–18 oct 2026");
  // One per exceeded factor, in ranking order, each with the week's figure and what to weigh.
  await expect(sugerencias.getByRole("listitem")).toHaveText([
    /^Horas extra: 16 h extra en la semana, el doble del umbral \(8 h\); también lo superó la semana anterior \(16 h\)\. Evitar asignaciones adicionales/,
    /^Días consecutivos sin descanso: 16 días seguidos sin descanso, más del doble del umbral \(6 días\)/,
    /^Carga de tareas: 7 tareas pendientes de 10 al cierre, 5 vencidas; .*acordar nuevas fechas\.$/,
    /^Vacaciones pendientes: 14 días de vacaciones pendientes, 4 días por encima del umbral \(10 días\); las últimas vacaciones fueron hace 127 días\./,
  ]);
  await expect(sugerencias.locator("strong")).toHaveText([
    "Horas extra:",
    "Días consecutivos sin descanso:",
    "Carga de tareas:",
    "Vacaciones pendientes:",
  ]);
  await expect(sugerencias).toContainText("el sistema no cambia asignaciones ni descansos");

  await page.goto("/employees/EMP-002");
  await expect(page.getByRole("region", { name: "Semana a semana" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Sugerencias de revisión" })).toHaveCount(0);
});

test("Ficha, lista e informe: la licencia de la semana se muestra, el índice no la descuenta y los días se leen uno a uno", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await organizacion(page);
  const licencia = { vacaciones: 0, licencias: 2 };
  // EMP-001's newest week (12–18 oct) had two days of leave in its day detail.
  const conLicencia = (w: SemanaPersona) => (w.periodStart === "2026-10-12" ? { ...w, ausencias: licencia } : w);
  await page.route(api("/api/personas/directorio"), (route) => {
    const d = directorio(Object.fromEntries(new URL(route.request().url()).searchParams));
    return route.fulfill({
      json: {
        ...d,
        items: d.items.map((p) => (p.employeeId === "EMP-001" ? { ...p, semanas: p.semanas.map(conLicencia) } : p)),
      },
    });
  });
  await page.route(api("/api/personas/EMP-001"), (route) => {
    const f = ficha("EMP-001")!;
    return route.fulfill({ json: { ...f, semanas: f.semanas.map(conLicencia) } });
  });
  const dias = cuerposExitoMock.listarJornadasSemana;
  await page.route(api("/api/jornadas"), (route) =>
    route.fulfill({
      json: {
        ...dias,
        dias: dias.dias!.map((d, i) =>
          i < 2 ? { ...d, tipo: "LICENCIA", horasTrabajadas: 0, horasExtra: 0 } : d,
        ),
      },
    }),
  );
  await page.route(api("/api/evaluaciones/mock-evaluation-2"), (route) =>
    route.fulfill({ json: { ...informe("mock-evaluation-2"), ausencias: licencia } }),
  );

  await page.goto("/employees");
  const ds = await celda(lista(page), "Persona ficticia 001", "Días consecutivos sin descanso");
  await expect(ds).toContainText("Licencia, 2 de 7 días");
  await expect(
    await celda(lista(page), "Persona ficticia 003", "Días consecutivos sin descanso"),
  ).not.toContainText("de 7 días");

  await page.goto("/employees/EMP-001");
  await expect(page.getByRole("region", { name: "Última semana" })).toContainText(
    "Licencia, 2 de 7 días. El índice no descuenta esos días.",
  );
  const semanas = page.getByRole("region", { name: "Semanas de Persona ficticia 001" });
  await expect(await celda(semanas, "12–18 oct 2026", "Días consecutivos sin descanso")).toContainText(
    "Licencia, 2 de 7 días",
  );
  await expect(await celda(semanas, "5–11 oct 2026", "Días consecutivos sin descanso")).not.toContainText(
    "de 7 días",
  );
  const tabla = page.getByRole("region", { name: "Días de Persona ficticia 001, semana 12–18 oct 2026" });
  await expect(tabla.getByRole("rowheader")).toHaveText([
    "lun 12 oct",
    "mar 13 oct",
    "mié 14 oct",
    "jue 15 oct",
    "vie 16 oct",
    "sáb 17 oct",
    "dom 18 oct",
  ]);
  await expect(await celda(tabla, "lun 12 oct", "Tipo de día")).toHaveText("Licencia");
  await expect(await celda(tabla, "lun 12 oct", "Horas trabajadas")).toHaveText("—");
  await expect(await celda(tabla, "mié 14 oct", "Horas trabajadas")).toHaveText("10 h");
  await expect(await celda(tabla, "mié 14 oct", "Horas extra")).toHaveText("2 h");

  await page.goto("/reports/mock-evaluation-2");
  const resultado = page.getByRole("region", { name: "Resultado de la semana" });
  await expect(resultado.getByText("Licencia, 2 de 7 días", { exact: true })).toBeVisible();
  await expect(resultado).toContainText("El índice no descuenta los días de licencia ni de vacaciones de esta semana.");
});

test("Ficha: una semana sin detalle de días lo dice, y Gerencia no ve los días de un técnico", async ({ page }) => {
  await demo(page, "demo-rrhh");
  await organizacion(page);
  await page.route(api("/api/jornadas"), (route) =>
    route.fulfill({ json: { ...cuerposExitoMock.listarJornadasSemana, dias: null } }),
  );
  await page.goto("/employees/EMP-001");
  await expect(page.getByRole("region", { name: "Días de la semana" })).toContainText(
    "Todavía no hay detalle de días para esta semana",
  );
  await expect(page.getByRole("region", { name: "Última semana" })).not.toContainText("de 7 días");

  await demo(page, "demo-gerencia");
  await organizacion(page);
  await page.goto("/employees/EMP-001");
  await expect(page.getByRole("region", { name: "Semana a semana" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Días de la semana" })).toHaveCount(0);
});

test("Lista: quien no se evalúa dice «No se evalúa» y el encabezado concilia con Resumen", async ({ page }) => {
  await demo(page, "demo-rrhh");
  await organizacion(page);
  await page.route(api("/api/personas/directorio"), (route) => {
    const d = directorio(Object.fromEntries(new URL(route.request().url()).searchParams));
    const gerente = {
      ...d.items[0],
      employeeId: "GER-01",
      nombre: "Gerente ficticio de Operaciones",
      tipo: "GERENCIA" as const,
      enCobertura: false,
      semanas: [],
    };
    return route.fulfill({
      json: { ...d, items: [...d.items, gerente], total: d.total + 1, enSeguimiento: d.total },
    });
  });
  await page.goto("/employees");
  await expect(
    page.getByText(/Semana .*, 9 personas, 8 en seguimiento/),
  ).toBeVisible();
  const fila = lista(page).getByRole("row").filter({ hasText: "GER-01" });
  await expect(fila.getByText("No se evalúa")).toBeVisible();
  await expect(fila.getByText("Gerencia no se incluye en la evaluación")).toBeVisible();
  await expect(fila.getByText("Sin datos")).toHaveCount(0);
});
