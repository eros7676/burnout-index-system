import { test, expect, type Page } from "@playwright/test";
import {
  alerta,
  api,
  celda,
  demo,
  PERSONAS,
  personas,
  type UsuarioDemo,
} from "./demo";

// Personas (/employees and /employees/[employeeId]): who is how this week,
// filtered by team and level, then one person's weeks with their tasks.

const lista = (page: Page) =>
  page.getByRole("region", { name: "Personas", exact: true });
const conteo = (page: Page) =>
  page.getByRole("main").getByRole("status").filter({ hasText: "persona" });
const equipo = (page: Page) => page.getByRole("combobox", { name: "Equipo" });
const nivel = (page: Page) => page.getByRole("combobox", { name: "Nivel" });

test("Personas: filtrar por equipo y nivel, abrir a una persona y ver sus tareas semana a semana con el informe", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos: URL[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname === "/api/personas") pedidos.push(url);
  });
  await page.goto("/employees");
  await expect(lista(page).getByRole("row")).toHaveCount(PERSONAS.length + 1);
  await expect(conteo(page)).toHaveText("8 personas");

  await equipo(page).selectOption({ label: "Célula ficticia 2" });
  await expect(lista(page).getByRole("rowheader")).toHaveText([
    /^Persona ficticia 002/,
    /^Persona ficticia 004/,
    /^Persona ficticia 005/,
  ]);
  await expect(conteo(page)).toHaveText("3 de 8 personas");
  await nivel(page).selectOption({ label: "Bajo" });
  await expect(lista(page).getByRole("rowheader")).toHaveText([
    /^Persona ficticia 002/,
  ]);
  await nivel(page).selectOption({ label: "Alto" });
  await expect(
    page.getByText("Nadie coincide con estos filtros"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(lista(page).getByRole("row")).toHaveCount(PERSONAS.length + 1);
  await expect(equipo(page)).toHaveValue("");
  await expect(nivel(page)).toHaveValue("");

  await equipo(page).selectOption({ label: "Célula ficticia 1" });
  await nivel(page).selectOption({ label: "Alto" });
  await expect(lista(page).getByRole("rowheader")).toHaveText([
    /^Persona ficticia 001/,
  ]);
  // Filters are applied to the list in hand: the server is asked once, unfiltered.
  expect(pedidos.map((u) => u.search)).toEqual([""]);

  // The week selector changes the week every row reads.
  await page
    .getByRole("combobox", { name: "Semana" })
    .selectOption("2026-10-05");
  await nivel(page).selectOption("");
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
    page.getByText(
      "Técnico en Célula ficticia 1, responde a Team Lead ficticio 1",
    ),
  ).toBeVisible();
  expect(pedidos.at(-1)!.searchParams.get("employeeId")).toBe("EMP-001");

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

test("Personas: el enlace de un equipo desde el resumen abre la lista filtrada", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await page.goto("/home");
  await page
    .getByRole("region", { name: "Por equipo" })
    .getByRole("link", { name: "Célula ficticia 2" })
    .click();
  await expect(page).toHaveURL(/\/employees\?equipo=EQ-02$/);
  await expect(equipo(page)).toHaveValue("EQ-02");
  await expect(lista(page).getByRole("row")).toHaveCount(4);
});

test("Personas/T15a: un Team Lead solo ve a su equipo y no abre a nadie de otro", async ({
  page,
}) => {
  await demo(page, "demo-tl-01");
  // The server's scope for TL-01: its team is forced, other teams answer 403.
  const pedidos: URL[] = [];
  await page.route(api("/api/personas"), (route) => {
    const url = new URL(route.request().url());
    pedidos.push(url);
    const filtro = Object.fromEntries(url.searchParams);
    const ajeno =
      (filtro.teamId && filtro.teamId !== "EQ-01") ||
      (filtro.employeeId &&
        !PERSONAS.some(
          (p) => p.employeeId === filtro.employeeId && p.teamId === "EQ-01",
        ));
    if (ajeno)
      return route.fulfill({
        status: 403,
        json: {
          error: {
            codigo: "SIN_PERMISO",
            mensaje: "No tiene permiso para consultar personas de otros equipos.",
            detalles: [],
          },
        },
      });
    return route.fulfill({ json: personas({ ...filtro, teamId: "EQ-01" }) });
  });
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
    page.getByText("Semana 12–18 oct 2026, 5 personas de Célula ficticia 1"),
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
