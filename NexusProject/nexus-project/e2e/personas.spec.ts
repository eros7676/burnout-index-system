import { test, expect, type Page, type Route } from "@playwright/test";
import {
  alerta,
  api,
  celda,
  demo,
  PERSONAS,
  type UsuarioDemo,
} from "./demo";
import { directorio, organizacion } from "./organizacion-mocks";

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
