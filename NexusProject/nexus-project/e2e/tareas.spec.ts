import { test, expect, type Page } from "@playwright/test";
import { alerta, celda, demo, menu, sinDesbordeHorizontal } from "./demo";
import { SEMANAS, equipos, organizacion } from "./organizacion-mocks";
import { tareasMocks } from "./tareas-mocks";

// Task evidence: a week's tasks inside the person page (/employees/[employeeId]?semana=), a team's tasks on
// its page, the report's link to them and its printable form, and the person's own tasks in Mis datos. Same
// mocked style as the other specs: tareas-mocks.ts answers the task routes with contract-typed bodies.

const FICHA = "/employees/EMP-001";
const SEMANA = `${FICHA}?semana=2026-10-12`;
const NOMBRE_TABLA = "Tareas de Persona ficticia 001, semana 12–18 oct 2026";

const seccion = (page: Page) => page.getByRole("region", { name: "Tareas de la semana" });
const tabla = (page: Page) => page.getByRole("region", { name: NOMBRE_TABLA });
const filas = (page: Page) => tabla(page).getByRole("row");
const estado = (page: Page) => page.getByRole("combobox", { name: "Estado" });
const conteo = (page: Page) =>
  page
    .getByRole("main")
    .getByRole("status")
    .filter({ hasText: /\btareas?\b/ });
const semanas = (page: Page) => page.getByRole("region", { name: "Semanas de Persona ficticia 001" });
const paginacion = (page: Page) =>
  page.getByRole("navigation", { name: "Paginación de tareas" });
const lecturas = (pedidos: URL[]) => pedidos.filter((u) => u.pathname === "/api/tareas");

/** Signed in, with the person page's and the task routes' answers. */
async function abrir(page: Page, usuario: Parameters<typeof demo>[1], perfil?: Parameters<typeof tareasMocks>[1]) {
  await demo(page, usuario);
  await organizacion(page);
  return tareasMocks(page, perfil);
}

test("Ficha: las tareas de una semana se abren en la misma ficha, sin leerlas hasta que se piden", async ({
  page,
}) => {
  const pedidos = await abrir(page, "demo-rrhh");
  await page.goto(FICHA);

  // Opening the person reads no task rows: RRHH reads them on demand, and each read is recorded.
  await expect(seccion(page)).toContainText("Elija una semana para ver sus tareas");
  await expect(seccion(page).getByRole("button", { name: "Ver las tareas de 12–18 oct 2026" })).toBeVisible();
  // The newest week says how many tasks were overdue and leads straight to them.
  await expect(page.getByRole("region", { name: "Última semana" })).toContainText(/Tareas vencidas\s*5\s*de 10 tareas\./);
  await expect(page.getByRole("link", { name: "Ver cuáles" })).toHaveAttribute("href", `${SEMANA}&estado=VENCIDA`);
  // The weekly table carries the counts and one way in per week.
  await expect(await celda(semanas(page), "12–18 oct 2026", "Tareas")).toHaveText("7 pendientes de 10, 5 vencidas");
  expect(lecturas(pedidos)).toHaveLength(0);

  await semanas(page).getByRole("link", { name: "Ver tareas de 12–18 oct 2026" }).click();
  await expect(page).toHaveURL(/\/employees\/EMP-001\?semana=2026-10-12$/);
  await expect(semanas(page).getByRole("row", { name: /12–18 oct 2026/ })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("combobox", { name: "Semana" })).toHaveValue("2026-10-12");

  // The week at a glance, then the rows that reproduce the stored counts, and the section says so.
  await expect(seccion(page)).toContainText(/Tareas de la semana\s*10/);
  await expect(seccion(page)).toContainText(/Abiertas al cierre, vencidas\s*5\s*Atraso máximo, 17 días/);
  await expect(seccion(page)).toContainText(/Abiertas al cierre, en plazo\s*2/);
  await expect(seccion(page)).toContainText(/Completadas en la semana\s*3/);
  await expect(seccion(page)).toContainText("Los conteos de la semana coinciden con el detalle importado");
  await expect(seccion(page)).toContainText("No miden desempeño");

  // Every task with the columns that let someone check it, overdue ones first.
  await expect(filas(page)).toHaveCount(11);
  await expect(tabla(page).getByRole("columnheader")).toHaveText([
    "Identificador",
    "Título",
    "Origen",
    "Asignada",
    "Vence",
    "Completada",
    "Estado",
    "Días de atraso",
    "Historial",
  ]);
  await expect(tabla(page).getByRole("rowheader")).toHaveText([
    /^OPS-1436/,
    /^OPS-1432/,
    /^OPS-1433/,
    /^OPS-1435/,
    /^OPS-1434/,
    /^OPS-1461/,
    /^OPS-1462/,
    /^OPS-1451/,
    /^OPS-1450/,
    /^OPS-1452/,
  ]);
  for (const [id, columna, texto] of [
    ["OPS-1436", "Título", "Revisar contratos de proveedores"],
    ["OPS-1436", "Origen", "Jira"],
    ["OPS-1436", "Asignada", "1 oct"],
    ["OPS-1436", "Vence", "1 oct"],
    ["OPS-1436", "Estado", "Vencida"],
    ["OPS-1436", "Días de atraso", "17 días"],
    // Due on the last day of the week and still open: a delay of zero days, not a missing value.
    ["OPS-1434", "Días de atraso", "0 días"],
    ["OPS-1461", "Estado", "Abierta en plazo"],
    ["OPS-1461", "Vence", "23 oct"],
    ["OPS-1461", "Completada", "—"],
    ["OPS-1461", "Días de atraso", "—"],
    ["OPS-1462", "Vence", "—"],
    ["OPS-1451", "Estado", "Completada"],
    ["OPS-1451", "Completada", "14 oct"],
    ["OPS-1451", "Días de atraso", "—"],
  ] as const)
    await expect(await celda(tabla(page), id, columna), `${id}, ${columna}`).toContainText(texto);

  // The identifier opens the source system only when it has a reference, in a new tab.
  const origen = tabla(page).getByRole("link", { name: /^OPS-1432/ });
  await expect(origen).toHaveAttribute("href", "https://jira.example/browse/OPS-1432");
  await expect(origen).toHaveAttribute("target", "_blank");
  await expect(origen).toHaveAttribute("rel", /noopener/);
  await expect(tabla(page).getByRole("link", { name: /^OPS-1433/ })).toHaveCount(0);

  // One read for the week, for that person and that Monday.
  expect(lecturas(pedidos)).toHaveLength(1);
  const lectura = lecturas(pedidos)[0];
  expect(lectura.searchParams.get("employeeId")).toBe("EMP-001");
  expect(lectura.searchParams.get("periodStart")).toBe("2026-10-12");
  expect(lectura.searchParams.has("estado")).toBe(false);
});

test("Ficha: el filtro por estado y la semana quedan en la dirección y se pueden compartir", async ({ page }) => {
  const pedidos = await abrir(page, "demo-rrhh");
  await page.goto(SEMANA);
  await expect(filas(page)).toHaveCount(11);
  // The counts are the figures above; the options only name the groups.
  await expect(estado(page).locator("option")).toHaveText([
    "Todas",
    "Completadas en la semana",
    "Abiertas al cierre, en plazo",
    "Abiertas al cierre, vencidas",
  ]);
  await estado(page).selectOption({ label: "Abiertas al cierre, vencidas" });
  await expect(page).toHaveURL(/\?semana=2026-10-12&estado=VENCIDA$/);
  await expect(filas(page)).toHaveCount(6);
  await expect(conteo(page)).toHaveText("5 de 10 tareas");
  await expect(tabla(page).getByRole("rowheader")).toHaveText([
    /^OPS-1436/,
    /^OPS-1432/,
    /^OPS-1433/,
    /^OPS-1435/,
    /^OPS-1434/,
  ]);
  expect(pedidos.at(-1)!.searchParams.get("estado")).toBe("VENCIDA");

  await estado(page).selectOption({ label: "Completadas en la semana" });
  await expect(page).toHaveURL(/&estado=COMPLETADA$/);
  await expect(filas(page)).toHaveCount(4);

  await estado(page).selectOption("");
  await expect(page).toHaveURL(/\?semana=2026-10-12$/);
  await expect(filas(page)).toHaveCount(11);

  // Another week starts without a filter.
  await page.getByRole("combobox", { name: "Semana" }).selectOption("2026-10-05");
  await expect(page).toHaveURL(/\?semana=2026-10-05$/);
  await expect(seccion(page)).toContainText("Todavía no hay detalle de tareas para esta semana");

  // A shared link opens already filtered; a status that does not exist is ignored.
  await page.goto(`${SEMANA}&estado=PENDIENTE`);
  await expect(estado(page)).toHaveValue("PENDIENTE");
  await expect(filas(page)).toHaveCount(3);
  await page.goto(`${SEMANA}&estado=ABIERTA`);
  await expect(estado(page)).toHaveValue("");
  await expect(filas(page)).toHaveCount(11);
});

test("Ficha: el historial de una tarea muestra en cuántos cierres siguió abierta", async ({ page }) => {
  const pedidos = await abrir(page, "demo-rrhh");
  await page.goto(SEMANA);
  await expect(filas(page)).toHaveCount(11);

  await tabla(page).getByRole("link", { name: "Ver historial de OPS-1432" }).click();
  await expect(page).toHaveURL(/\?semana=2026-10-12&tarea=OPS-1432$/);
  const historial = page.getByRole("region", { name: "Historial de la tarea OPS-1432" });
  await expect(historial).toContainText("Abierta en 2 cierres seguidos, con vencimiento el 9 oct.");
  const lectura = pedidos.find((u) => u.pathname === "/api/tareas/historial")!;
  expect(lectura.searchParams.get("employeeId")).toBe("EMP-001");
  expect(lectura.searchParams.get("taskId")).toBe("OPS-1432");

  const cierres = page.getByRole("region", { name: "Cierres de la tarea OPS-1432" });
  await expect(cierres.getByRole("rowheader")).toHaveText(["12–18 oct 2026", "5–11 oct 2026"]);
  await expect(await celda(cierres, "12–18 oct 2026", "Estado")).toContainText("Vencida");
  await expect(await celda(cierres, "12–18 oct 2026", "Días de atraso")).toHaveText("9 días");
  await expect(await celda(cierres, "5–11 oct 2026", "Días de atraso")).toHaveText("2 días");
  // Each close leads back to that week's tasks.
  await expect(cierres.getByRole("link", { name: "5–11 oct 2026" })).toHaveAttribute(
    "href",
    `${FICHA}?semana=2026-10-05`,
  );

  await historial.getByRole("link", { name: "Cerrar historial" }).click();
  await expect(page).toHaveURL(/\?semana=2026-10-12$/);
  await expect(historial).toHaveCount(0);

  // The history link is part of the address too.
  await page.goto(`${SEMANA}&tarea=OPS-1432`);
  await expect(historial).toContainText("Conciliar facturación de septiembre");
});

test("Ficha: sin detalle importado lo dice, y un resumen que no coincide con las filas se señala", async ({
  page,
}) => {
  await abrir(page, "demo-rrhh");

  // A week whose counts came as a summary only: no rows to show, and no claim that they were checked.
  await page.goto(`${FICHA}?semana=2026-10-05`);
  await expect(seccion(page)).toContainText("Todavía no hay detalle de tareas para esta semana");
  await expect(seccion(page)).toContainText("Resumen importado sin detalle de tareas");
  await expect(seccion(page).getByRole("table")).toHaveCount(0);
  await expect(estado(page)).toHaveCount(0);

  // Rows that do not add up to the stored counts: both are shown, with the fields that differ.
  await page.goto(`${FICHA}?semana=2026-09-28`);
  await expect(seccion(page)).toContainText("Los conteos del resumen no coinciden con el detalle importado");
  await expect(seccion(page)).toContainText("tareas vencidas, 5 en el resumen y 3 en el detalle");
  await expect(
    page.getByRole("region", { name: "Tareas de Persona ficticia 001, semana 28 sep – 4 oct 2026" }).getByRole("row"),
  ).toHaveCount(4);
});

test("Ficha: Gerencia ve los conteos de un técnico, no un camino a sus tareas", async ({ page }) => {
  const pedidos = await abrir(page, "demo-gerencia", "sin-acceso");
  await page.goto(SEMANA);
  await expect(await celda(semanas(page), "12–18 oct 2026", "Tareas")).toHaveText("7 pendientes de 10, 5 vencidas");
  await expect(seccion(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Ver (tareas|las \d+ tareas)/ })).toHaveCount(0);
  expect(lecturas(pedidos)).toHaveLength(0);
});

test("Ficha: muchas tareas se paginan de a 50 y un filtro vuelve a la primera página", async ({ page }) => {
  const pedidos = await abrir(page, "demo-rrhh", "muchas");
  await page.goto(SEMANA);
  await expect(filas(page)).toHaveCount(51);
  await expect(seccion(page)).toContainText(/Tareas de la semana\s*120/);
  await expect(paginacion(page)).toContainText("Página 1 de 3");
  await expect(paginacion(page).getByRole("button", { name: "Anterior" })).toBeDisabled();

  await paginacion(page).getByRole("button", { name: "Siguiente" }).click();
  await expect(page).toHaveURL(/&page=2$/);
  await expect(paginacion(page)).toContainText("Página 2 de 3");
  expect(pedidos.at(-1)!.searchParams.get("page")).toBe("2");
  await expect(filas(page)).toHaveCount(51);

  await paginacion(page).getByRole("button", { name: "Siguiente" }).click();
  await expect(paginacion(page)).toContainText("Página 3 de 3");
  await expect(filas(page)).toHaveCount(21);
  await expect(paginacion(page).getByRole("button", { name: "Siguiente" })).toBeDisabled();

  // Narrowing the list starts again from its first page; 40 tasks fit in one.
  await estado(page).selectOption({ label: "Abiertas al cierre, vencidas" });
  await expect(page).toHaveURL(/\?semana=2026-10-12&estado=VENCIDA$/);
  await expect(filas(page)).toHaveCount(41);
  await expect(conteo(page)).toHaveText("40 de 120 tareas");
  await expect(paginacion(page)).toHaveCount(0);
});

test("Ficha: una semana sin datos muestra el motivo y permite reintentar", async ({ page }) => {
  await abrir(page, "demo-rrhh");
  await page.goto(`${FICHA}?semana=2026-08-03`);
  await expect(alerta(page)).toContainText("No hay datos cargados para esa persona y semana.");
  await expect(alerta(page).getByRole("button", { name: "Reintentar" })).toBeVisible();
  // The rest of the person page is still there.
  await expect(page.getByRole("heading", { level: 1, name: "Persona ficticia 001" })).toBeVisible();
});

test("Ficha: la dirección de la antigua página de la semana abre la ficha con la misma vista", async ({ page }) => {
  await abrir(page, "demo-rrhh");
  await page.goto(`${FICHA}/weeks/2026-10-12?estado=VENCIDA`);
  await expect(page).toHaveURL(/\/employees\/EMP-001\?/);
  await expect(page).toHaveURL(/semana=2026-10-12/);
  await expect(estado(page)).toHaveValue("VENCIDA");
  await expect(filas(page)).toHaveCount(6);
});

test("Ficha: con las tareas abiertas, en pantalla angosta no desborda la página", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page, "demo-rrhh");
  await page.goto(SEMANA);
  await expect(filas(page)).toHaveCount(11);
  await sinDesbordeHorizontal(page);
});

test("Equipo: las tareas de todos los integrantes en una lista, primero las vencidas, a pedido", async ({ page }) => {
  const pedidos = await abrir(page, "demo-rrhh");
  await page.goto("/teams/EQ-01");
  // A small team's total is withheld with its other aggregates (minimum group size).
  await expect(page.getByRole("region", { name: "Estado de la semana" })).toContainText("Oculto para proteger");
  await expect(page.getByRole("region", { name: "Estado de la semana" })).not.toContainText("Tareas vencidas");
  const tareas = page.getByRole("region", { name: "Tareas del equipo", exact: true });
  await expect(tareas.getByRole("button", { name: "Ver las tareas del equipo" })).toBeVisible();
  expect(pedidos.filter((u) => u.pathname === "/api/tareas/equipo")).toHaveLength(0);

  // Each member's counts link to that person's week.
  const integrantes = page.getByRole("region", { name: "Integrantes de Célula ficticia 1" });
  await expect(
    integrantes.getByRole("link", { name: "7 pendientes de 10, 5 vencidas (ver las tareas de Persona ficticia 001)" }),
  ).toHaveAttribute("href", SEMANA);

  await tareas.getByRole("button", { name: "Ver las tareas del equipo" }).click();
  await expect(page).toHaveURL(/\/teams\/EQ-01\?tareas=todas$/);
  const lista = tareas.getByRole("region", { name: "Tareas del equipo Célula ficticia 1" });
  await expect(lista.getByRole("row")).toHaveCount(12);
  await expect(tareas.getByRole("status")).toHaveText("11 tareas de 2 personas; 6 vencidas al cierre.");
  await expect(lista.getByRole("row").nth(3)).toContainText("Persona ficticia 003");
  await expect(lista.getByRole("row").nth(3)).toContainText("OPS-1500");
  await expect(lista.getByRole("link", { name: "Persona ficticia 003" })).toHaveAttribute(
    "href",
    "/employees/EMP-003?semana=2026-10-12",
  );
  await expect(tareas).toContainText("No miden desempeño");
  const lectura = pedidos.filter((u) => u.pathname === "/api/tareas/equipo").at(-1)!;
  expect(lectura.searchParams.get("teamId")).toBe("EQ-01");
  expect(lectura.searchParams.get("periodStart")).toBe("2026-10-12");

  await tareas.getByRole("combobox", { name: "Estado" }).selectOption({ label: "Abiertas al cierre, vencidas (6)" });
  await expect(lista.getByRole("row")).toHaveCount(7);
  expect(pedidos.at(-1)!.searchParams.get("estado")).toBe("VENCIDA");
  await expect(page).toHaveURL(/\?tareas=VENCIDA$/);
});

/** EQ-01 as a team large enough to show its aggregates (every mocked team is under the minimum). */
async function equipoVisible(page: Page) {
  const [fila] = equipos(undefined, "ACTIVOS", "EQ-01");
  await page.route(
    (url) => url.pathname === "/api/equipos/EQ-01",
    (route) =>
      route.fulfill({
        json: {
          ...fila,
          suprimido: null,
          alertasActivas: 1,
          conteo: { BAJO: 3, MEDIO: 1, ALTO: 1, INCOMPLETO: 0 },
          promedioIndice: 41.2,
          evaluadas: 5,
          tendenciaAlto: [],
          tareas: { activas: 11, vencidas: 6, personasConVencidas: 2, personas: 5 },
          periodStart: SEMANAS[0],
          semanas: SEMANAS,
          tecnicosActivos: 4,
        },
      }),
  );
}

test("Equipo: el total de tareas vencidas abre la lista en las vencidas, y la dirección la conserva", async ({
  page,
}) => {
  const pedidos = await abrir(page, "demo-rrhh");
  await equipoVisible(page);
  await page.goto("/teams/EQ-01");
  const tareas = page.getByRole("region", { name: "Tareas del equipo", exact: true });
  await expect(tareas.getByRole("button", { name: "Ver las 6 tareas vencidas del equipo" })).toBeVisible();
  const estadoSemana = page.getByRole("region", { name: "Estado de la semana" });
  await expect(estadoSemana).toContainText(/Tareas vencidas\s*6\s*de 11 tareas, en 2 personas/);
  await estadoSemana.getByRole("link", { name: "Ver cuáles" }).click();
  await expect(page).toHaveURL(/\/teams\/EQ-01\?tareas=VENCIDA$/);
  const lista = tareas.getByRole("region", { name: "Tareas del equipo Célula ficticia 1" });
  await expect(lista.getByRole("row")).toHaveCount(7);
  await expect(tareas.getByRole("combobox", { name: "Estado" })).toHaveValue("VENCIDA");
  expect(pedidos.at(-1)!.searchParams.get("estado")).toBe("VENCIDA");

  // The address alone opens the same list.
  await page.goto("/teams/EQ-01?tareas=VENCIDA");
  await expect(lista.getByRole("row")).toHaveCount(7);
  await tareas.getByRole("combobox", { name: "Estado" }).selectOption("");
  await expect(lista.getByRole("row")).toHaveCount(12);
  await expect(page).toHaveURL(/\?tareas=todas$/);
});

test("Equipo: a Gerencia no le promete un total de vencidas que su lista no tiene", async ({ page }) => {
  await abrir(page, "demo-gerencia");
  await equipoVisible(page);
  await page.goto("/teams/EQ-01");
  const tareas = page.getByRole("region", { name: "Tareas del equipo", exact: true });
  await expect(tareas.getByRole("button", { name: "Ver las tareas del equipo" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Estado de la semana" })).toContainText("Tareas vencidas");
  await expect(
    page.getByRole("region", { name: "Estado de la semana" }).getByRole("link", { name: "Ver cuáles" }),
  ).toHaveCount(0);
});

test("Resumen y Equipos: el total de tareas vencidas de la semana está a la vista", async ({ page }) => {
  await abrir(page, "demo-rrhh");
  await page.goto("/home");
  await expect(page.getByRole("region", { name: "Indicadores de la semana" })).toContainText(
    /Tareas vencidas\s*5\s*en 1 persona; 5 más que la semana anterior/,
  );
  await page.goto("/teams");
  const lista = page.getByRole("region", { name: "Equipos por personas en Alto" }).first();
  await expect(lista.getByRole("columnheader", { name: "Tareas vencidas" })).toBeVisible();
});

test("Informe: la carga de tareas enlaza con las tareas de esa semana, con el registro que se calculó", async ({
  page,
}) => {
  const pedidos = await abrir(page, "demo-rrhh");
  await page.goto("/reports/mock-evaluation-2");
  const factores = page.getByRole("region", { name: "Factores, por aporte al índice" });
  const enlace = factores.getByRole("link", { name: "Ver las 10 tareas de la semana" });
  // The data version the result was computed from travels in the link, not "today's" one.
  await expect(enlace).toHaveAttribute("href", `${SEMANA}&recordId=mock-record-2`);
  // Only the task factor carries it.
  await expect(factores.getByRole("link")).toHaveCount(1);

  await enlace.click();
  await expect(page).toHaveURL(/\/employees\/EMP-001\?semana=2026-10-12&recordId=mock-record-2$/);
  await expect(filas(page)).toHaveCount(11);
  expect(lecturas(pedidos).at(-1)!.searchParams.get("recordId")).toBe("mock-record-2");
});

test("Informe: el botón imprime y en papel quedan el encabezado, los hechos, los factores y las recomendaciones", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { __impresiones: number }).__impresiones = 0;
    window.print = () => {
      (window as unknown as { __impresiones: number }).__impresiones += 1;
    };
  });
  await demo(page, "demo-rrhh");
  await page.goto("/reports/mock-evaluation-2");
  const imprimir = page.getByRole("button", { name: "Imprimir informe" });
  await expect(imprimir).toBeVisible();
  await imprimir.click();
  expect(
    await page.evaluate(
      () => (window as unknown as { __impresiones: number }).__impresiones,
    ),
  ).toBe(1);

  const nota = page.getByText(
    "Informe de demostración con datos ficticios. El índice señala posible sobrecarga",
  );
  // On screen the printed-only note does not show; on paper the frame and the controls go.
  await expect(nota).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(menu(page)).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Imprimir informe" }),
  ).toBeHidden();
  await expect(
    page.getByRole("link", { name: /^Ver las \d+ tareas de la semana$/ }),
  ).toBeHidden();
  await expect(
    page.getByRole("heading", { level: 1, name: "Persona ficticia 001" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Resultado de la semana" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Factores, por aporte al índice" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Sugerencias de revisión" }),
  ).toBeVisible();
  await expect(nota).toBeVisible();
});

test("Mis datos: la persona ve sus tareas por semana, sin índice ni nivel ni historial de otros", async ({
  page,
}) => {
  await demo(page, "demo-empleado");
  const pedidos = await tareasMocks(page);
  await page.goto("/my-data");
  const propias = page.getByRole("region", { name: "Tareas por semana" });
  await expect(
    propias.getByRole("combobox", { name: "Semana" }).locator("option"),
  ).toHaveText(["12–18 oct 2026", "5–11 oct 2026", "28 sep – 4 oct 2026"]);
  const tablaPropia = page.getByRole("region", {
    name: "Sus tareas, semana 12–18 oct 2026",
  });
  await expect(tablaPropia.getByRole("row")).toHaveCount(11);
  await expect(propias).toContainText("Completadas en la semana");
  await expect(await celda(tablaPropia, "OPS-1436", "Estado")).toContainText(
    "Vencida",
  );
  await expect(
    await celda(tablaPropia, "OPS-1436", "Días de atraso"),
  ).toHaveText("17 días");
  await expect(propias).toContainText(
    "Si algún dato no coincide con su registro, solicite la corrección a RR. HH.",
  );

  // RF10 and the scope of the route: no index, no level, no way to name another person.
  await expect(propias).not.toContainText(
    /\b(Índice|Nivel|Bajo|Medio|Alto|Incompleto)\b/,
  );
  await expect(propias.getByRole("link", { name: /historial/i })).toHaveCount(
    0,
  );
  expect(pedidos[0].pathname).toBe("/api/mis-datos/tareas");
  expect(pedidos[0].searchParams.has("employeeId")).toBe(false);

  // The status filter narrows the table; the summary still describes the whole week.
  await propias
    .getByRole("combobox", { name: "Estado" })
    .selectOption({ label: "Abiertas al cierre, vencidas (5)" });
  await expect(tablaPropia.getByRole("row")).toHaveCount(6);
  expect(pedidos.at(-1)!.searchParams.get("estado")).toBe("VENCIDA");
  await expect(propias).toContainText("Completadas en la semana");

  // Another week, whose counts came without detail.
  await propias
    .getByRole("combobox", { name: "Semana" })
    .selectOption("2026-10-05");
  await expect(
    propias.getByText("Todavía no hay detalle de tareas para esta semana"),
  ).toBeVisible();
  expect(pedidos.at(-1)!.searchParams.get("periodStart")).toBe("2026-10-05");
  await expect(propias.getByRole("table")).toHaveCount(0);
});
