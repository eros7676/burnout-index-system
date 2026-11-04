import { test, expect, type Page } from "@playwright/test";
import { alerta, celda, demo, menu, sinDesbordeHorizontal } from "./demo";
import { tareasMocks } from "./tareas-mocks";

// Task evidence: the tasks behind a week's load (/employees/[employeeId]/weeks/[periodStart]), the report's
// link to them and its printable form, and the person's own tasks in Mis datos. Same mocked style as the other
// specs: tareas-mocks.ts answers the four task routes with contract-typed bodies.

const SEMANA = "/employees/EMP-001/weeks/2026-10-12";
const NOMBRE_TABLA = "Tareas de Persona ficticia 001, semana 12–18 oct 2026";

const tabla = (page: Page) => page.getByRole("region", { name: NOMBRE_TABLA });
const filas = (page: Page) => tabla(page).getByRole("row");
const estado = (page: Page) => page.getByRole("combobox", { name: "Estado" });
const conteo = (page: Page) =>
  page
    .getByRole("main")
    .getByRole("status")
    .filter({ hasText: /\btareas?\b/ });
const resumen = (page: Page) =>
  page.getByRole("region", { name: "Estado de las tareas" });
const hechos = (page: Page) =>
  page.getByRole("region", { name: "Datos de la semana" });
const hecho = (page: Page, termino: string) =>
  hechos(page).locator(`dt:text-is("${termino}") + dd`);
const paginacion = (page: Page) =>
  page.getByRole("navigation", { name: "Paginación de tareas" });

test("Tareas de la semana: la persona, la semana, los cuatro indicadores y el detalle que los respalda", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos = await tareasMocks(page);
  await page.goto(SEMANA);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Persona ficticia 001, semana 12–18 oct 2026",
    }),
  ).toBeVisible();
  await expect(page.getByText("Técnico en Célula ficticia 1")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ficha de la persona" }),
  ).toHaveAttribute("href", "/employees/EMP-001");
  await expect(
    page.getByRole("link", { name: "Ver informe de la semana" }),
  ).toHaveAttribute("href", "/reports/mock-evaluation-2");

  // Index, level and the four indicators the calculation used.
  await expect(hecho(page, "Índice")).toHaveText("91,21");
  await expect(hecho(page, "Nivel")).toContainText("Alto");
  await expect(hecho(page, "Horas extra")).toHaveText("16 h");
  await expect(hecho(page, "Días consecutivos sin descanso")).toHaveText("16 días");
  await expect(hecho(page, "Carga de tareas")).toHaveText(
    "7 pendientes de 10, 5 vencidas",
  );
  await expect(hecho(page, "Vacaciones pendientes")).toHaveText("14 días");

  // The summary by status reproduces the stored counts, and says so.
  await expect(resumen(page)).toContainText(
    "10 tareas: 3 completadas, 2 abiertas en plazo, 5 vencidas.",
  );
  await expect(resumen(page)).toContainText(
    "Los conteos de la semana coinciden con el detalle importado",
  );
  await expect(resumen(page)).toContainText("Atraso máximo, 17 días");
  await expect(resumen(page)).toContainText("No miden desempeño");

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
    await expect(
      await celda(tabla(page), id, columna),
      `${id}, ${columna}`,
    ).toContainText(texto);

  // The identifier opens the source system only when it has a reference, in a new tab.
  const origen = tabla(page).getByRole("link", { name: /^OPS-1432/ });
  await expect(origen).toHaveAttribute(
    "href",
    "https://jira.example/browse/OPS-1432",
  );
  await expect(origen).toHaveAttribute("target", "_blank");
  await expect(origen).toHaveAttribute("rel", /noopener/);
  await expect(
    tabla(page).getByRole("link", { name: /^OPS-1433/ }),
  ).toHaveCount(0);

  // One read for the week, for that person and that Monday.
  expect(pedidos.filter((u) => u.pathname === "/api/tareas")).toHaveLength(1);
  const lectura = pedidos[0];
  expect(lectura.searchParams.get("employeeId")).toBe("EMP-001");
  expect(lectura.searchParams.get("periodStart")).toBe("2026-10-12");
  expect(lectura.searchParams.has("estado")).toBe(false);
});

test("Tareas de la semana: el filtro por estado queda en la dirección y se puede compartir", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos = await tareasMocks(page);
  await page.goto(SEMANA);
  await expect(filas(page)).toHaveCount(11);
  await expect(conteo(page)).toHaveText("10 tareas");

  // Each option says how many tasks it leads to.
  await expect(estado(page).locator("option")).toHaveText([
    "Todas (10)",
    "Completadas en la semana (3)",
    "Abiertas al cierre, en plazo (2)",
    "Abiertas al cierre, vencidas (5)",
  ]);
  await estado(page).selectOption({
    label: "Abiertas al cierre, vencidas (5)",
  });
  await expect(page).toHaveURL(/\/weeks\/2026-10-12\?estado=VENCIDA$/);
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
  // The summary does not follow the filter: it always describes the whole week.
  await expect(resumen(page)).toContainText(
    "10 tareas: 3 completadas, 2 abiertas en plazo, 5 vencidas.",
  );

  await estado(page).selectOption({ label: "Completadas en la semana (3)" });
  await expect(page).toHaveURL(/\?estado=COMPLETADA$/);
  await expect(filas(page)).toHaveCount(4);

  await estado(page).selectOption("");
  await expect(page).toHaveURL(/\/weeks\/2026-10-12$/);
  await expect(filas(page)).toHaveCount(11);
  await expect(conteo(page)).toHaveText("10 tareas");

  // A shared link opens already filtered; a status that does not exist is ignored.
  await page.goto(`${SEMANA}?estado=PENDIENTE`);
  await expect(estado(page)).toHaveValue("PENDIENTE");
  await expect(filas(page)).toHaveCount(3);
  await page.goto(`${SEMANA}?estado=ABIERTA`);
  await expect(estado(page)).toHaveValue("");
  await expect(filas(page)).toHaveCount(11);
});

test("Tareas de la semana: el historial de una tarea muestra en cuántos cierres siguió abierta", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos = await tareasMocks(page);
  await page.goto(SEMANA);
  await expect(filas(page)).toHaveCount(11);

  await tabla(page)
    .getByRole("link", { name: "Ver historial de OPS-1432" })
    .click();
  await expect(page).toHaveURL(/\/weeks\/2026-10-12\?tarea=OPS-1432$/);
  const historial = page.getByRole("region", {
    name: "Historial de la tarea OPS-1432",
  });
  await expect(historial).toContainText(
    "Abierta en 2 cierres seguidos, con vencimiento el 9 oct.",
  );
  const lectura = pedidos.find((u) => u.pathname === "/api/tareas/historial")!;
  expect(lectura.searchParams.get("employeeId")).toBe("EMP-001");
  expect(lectura.searchParams.get("taskId")).toBe("OPS-1432");

  const cierres = page.getByRole("region", {
    name: "Cierres de la tarea OPS-1432",
  });
  await expect(cierres.getByRole("rowheader")).toHaveText([
    "12–18 oct 2026",
    "5–11 oct 2026",
  ]);
  await expect(await celda(cierres, "12–18 oct 2026", "Estado")).toContainText(
    "Vencida",
  );
  await expect(
    await celda(cierres, "12–18 oct 2026", "Días de atraso"),
  ).toHaveText("9 días");
  await expect(
    await celda(cierres, "5–11 oct 2026", "Días de atraso"),
  ).toHaveText("2 días");
  // Each close leads back to that week's tasks.
  await expect(
    cierres.getByRole("link", { name: "5–11 oct 2026" }),
  ).toHaveAttribute("href", "/employees/EMP-001/weeks/2026-10-05");

  await historial.getByRole("link", { name: "Cerrar historial" }).click();
  await expect(page).toHaveURL(/\/weeks\/2026-10-12$/);
  await expect(historial).toHaveCount(0);

  // The history link is part of the address too.
  await page.goto(`${SEMANA}?tarea=OPS-1432`);
  await expect(historial).toContainText("Conciliar facturación de septiembre");
});

test("Tareas de la semana: sin detalle importado lo dice, y un resumen que no coincide con las filas se señala", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await tareasMocks(page);

  // A week whose counts came as a summary only: no rows to show, and no claim that they were checked.
  await page.goto("/employees/EMP-001/weeks/2026-10-05");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Persona ficticia 001, semana 5–11 oct 2026",
    }),
  ).toBeVisible();
  await expect(hecho(page, "Carga de tareas")).toHaveText("8 pendientes de 12");
  await expect(
    page.getByText("Todavía no hay detalle de tareas para esta semana"),
  ).toBeVisible();
  await expect(resumen(page)).toContainText(
    "Resumen importado sin detalle de tareas",
  );
  await expect(resumen(page)).toContainText("Sin detalle importado");
  await expect(page.getByRole("main").getByRole("table")).toHaveCount(0);
  await expect(estado(page)).toHaveCount(0);

  // Rows that do not add up to the stored counts: both are shown, with the fields that differ.
  await page.goto("/employees/EMP-001/weeks/2026-09-28");
  await expect(
    page.getByText(
      "Los conteos del resumen no coinciden con el detalle importado",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("tareas vencidas, 5 en el resumen y 3 en el detalle"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", {
        name: "Tareas de Persona ficticia 001, semana 28 sep – 4 oct 2026",
      })
      .getByRole("row"),
  ).toHaveCount(4);
});

test("Tareas de la semana: Gerencia ve los conteos de un técnico, no sus tareas", async ({
  page,
}) => {
  await demo(page, "demo-gerencia");
  await tareasMocks(page, "sin-acceso");
  await page.goto(SEMANA);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Persona ficticia 001, semana 12–18 oct 2026",
    }),
  ).toBeVisible();
  await expect(resumen(page)).toContainText(
    "10 tareas: 3 completadas, 2 abiertas en plazo, 5 vencidas.",
  );
  await expect(
    page.getByText("El detalle de tareas no está disponible para su perfil"),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("table")).toHaveCount(0);
  await expect(estado(page)).toHaveCount(0);
});

test("Tareas de la semana: muchas tareas se paginan de a 50 y un filtro vuelve a la primera página", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos = await tareasMocks(page, "muchas");
  await page.goto(SEMANA);
  await expect(filas(page)).toHaveCount(51);
  await expect(conteo(page)).toHaveText("120 tareas");
  await expect(paginacion(page)).toContainText("Página 1 de 3");
  await expect(
    paginacion(page).getByRole("button", { name: "Anterior" }),
  ).toBeDisabled();

  await paginacion(page).getByRole("button", { name: "Siguiente" }).click();
  await expect(page).toHaveURL(/\?page=2$/);
  await expect(paginacion(page)).toContainText("Página 2 de 3");
  expect(pedidos.at(-1)!.searchParams.get("page")).toBe("2");
  await expect(filas(page)).toHaveCount(51);

  await paginacion(page).getByRole("button", { name: "Siguiente" }).click();
  await expect(paginacion(page)).toContainText("Página 3 de 3");
  await expect(filas(page)).toHaveCount(21);
  await expect(
    paginacion(page).getByRole("button", { name: "Siguiente" }),
  ).toBeDisabled();

  // Narrowing the list starts again from its first page; 40 tasks fit in one.
  await estado(page).selectOption({
    label: "Abiertas al cierre, vencidas (40)",
  });
  await expect(page).toHaveURL(/\/weeks\/2026-10-12\?estado=VENCIDA$/);
  await expect(filas(page)).toHaveCount(41);
  await expect(conteo(page)).toHaveText("40 de 120 tareas");
  await expect(paginacion(page)).toHaveCount(0);
});

test("Tareas de la semana: una semana sin datos muestra el motivo y permite reintentar", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await tareasMocks(page);
  await page.goto("/employees/EMP-001/weeks/2026-08-03");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "No se pudieron abrir las tareas",
    }),
  ).toBeVisible();
  await expect(alerta(page)).toContainText(
    "No hay datos cargados para esa persona y semana.",
  );
  await expect(
    alerta(page).getByRole("button", { name: "Reintentar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ficha de la persona" }),
  ).toHaveAttribute("href", "/employees/EMP-001");
});

test("Tareas de la semana: en pantalla angosta no desborda la página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, "demo-rrhh");
  await tareasMocks(page);
  await page.goto(SEMANA);
  await expect(filas(page)).toHaveCount(11);
  await sinDesbordeHorizontal(page);
});

test("Informe: la carga de tareas enlaza con las tareas de esa semana, con el registro que se calculó", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos = await tareasMocks(page);
  await page.goto("/reports/mock-evaluation-2");
  const factores = page.getByRole("region", {
    name: "Factores, por aporte al índice",
  });
  const enlace = factores.getByRole("link", {
    name: "Ver las 10 tareas de la semana",
  });
  // The data version the result was computed from travels in the link, not "today's" one.
  await expect(enlace).toHaveAttribute(
    "href",
    "/employees/EMP-001/weeks/2026-10-12?recordId=mock-record-2",
  );
  // Only the task factor carries it.
  await expect(factores.getByRole("link")).toHaveCount(1);

  await enlace.click();
  await expect(page).toHaveURL(
    /\/employees\/EMP-001\/weeks\/2026-10-12\?recordId=mock-record-2$/,
  );
  await expect(filas(page)).toHaveCount(11);
  expect(
    pedidos
      .filter((u) => u.pathname === "/api/tareas")
      .at(-1)!
      .searchParams.get("recordId"),
  ).toBe("mock-record-2");
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
    page.getByRole("heading", { level: 2, name: "Recomendaciones" }),
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
  await expect(propias).toContainText(
    "10 tareas: 3 completadas, 2 abiertas en plazo, 5 vencidas.",
  );
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
  await expect(propias).toContainText(
    "10 tareas: 3 completadas, 2 abiertas en plazo, 5 vencidas.",
  );

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
