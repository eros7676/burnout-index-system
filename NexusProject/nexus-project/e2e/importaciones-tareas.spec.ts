import { test, expect, type Page, type Route } from "@playwright/test";
import {
  vistaPreviaTareasMock,
  type ConciliacionSemana,
  type VistaPreviaTareas,
} from "../src/shared/contratos/importaciones";
import { resultadoImportacionMock } from "../src/shared/mocks";
import { alerta, celda, demo, sinDesbordeHorizontal } from "./demo";

// S6 on the import screen (/importaciones, RRHH only): choose the dataset in the first step,
// download its template, validate a task file, read the control totals, confirm. Mocked: the
// requests are answered here, so the server is not involved.

const archivo = {
  name: "datos.csv",
  mimeType: "text/csv",
  buffer: Buffer.from("employee_id\nEMP-001"),
};
const vista: VistaPreviaTareas = {
  ...vistaPreviaTareasMock,
  expiresAt: "2099-01-01T00:00:00.000Z",
};

const tareas = (page: Page) =>
  page.getByRole("radio", { name: "Tareas", exact: true });
const elegir = (page: Page) =>
  page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
const validar = (page: Page) =>
  page.getByRole("button", { name: "Validar archivo" });
const cancelar = (page: Page) => page.getByRole("button", { name: "Cancelar" });
const volver = (page: Page) => page.getByRole("button", { name: "Volver" });
const confirmar = (page: Page) =>
  page.getByRole("button", { name: "Confirmar importación" });
const previa = (page: Page) =>
  page.getByRole("region", { name: "Vista previa" });
const conciliacion = (page: Page) =>
  page.getByRole("region", { name: "Conciliación de tareas por semana" });

/** Every import and processing request; the session and reads stay on `demo`. */
async function importaciones(
  page: Page,
  responder: (route: Route, ruta: string) => unknown,
) {
  await demo(page, "demo-rrhh");
  await page.route(
    (url) =>
      url.pathname.startsWith("/api/importaciones") ||
      url.pathname.startsWith("/api/procesamientos"),
    (route) => responder(route, new URL(route.request().url()).pathname),
  );
}

/** A week whose task counts match its weekly summary. */
const coincide = (employeeId: string): ConciliacionSemana => ({
  ...vista.conciliacion.filas[0],
  employeeId,
});

test("S6: el conjunto de datos se elige en el primer paso, con sus límites y su plantilla", async ({
  page,
}) => {
  const descargas: string[] = [];
  await importaciones(page, (route, ruta) => {
    if (!ruta.startsWith("/api/importaciones/plantillas/"))
      return route.abort();
    descargas.push(ruta);
    return route.fulfill({
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="plantilla.csv"',
      },
      body: "employee_id\r\n",
    });
  });
  await page.goto("/importaciones");
  await expect(
    page.getByRole("radio", { name: "Indicadores semanales" }),
  ).toBeChecked();
  await expect(page.getByText("Hasta 5 MB y 1.000 filas.")).toBeVisible();

  await elegir(page);
  await expect(page.getByText("datos.csv")).toBeVisible();
  await tareas(page).check();
  // A file chosen for one dataset is not carried over to the other.
  await expect(
    page.getByText("Arrastre el archivo aquí o selecciónelo"),
  ).toBeVisible();
  await expect(validar(page)).toBeDisabled();
  await expect(page.getByText("Hasta 5 MB y 10.000 filas.")).toBeVisible();

  for (const [tipo, nombre] of [
    ["indicadores", "Descargar plantilla de indicadores semanales"],
    ["tareas", "Descargar plantilla de tareas"],
  ] as const) {
    const enlace = page.getByRole("link", { name: nombre });
    await expect(enlace).toHaveAttribute(
      "href",
      `/api/importaciones/plantillas/${tipo}`,
    );
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      enlace.click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/\.csv$/);
  }
  expect(descargas).toEqual([
    "/api/importaciones/plantillas/indicadores",
    "/api/importaciones/plantillas/tareas",
  ]);
  // The wizard footer: Cancel on the left, the main action on the right.
  const [izquierda, derecha] = await Promise.all([
    page.getByRole("link", { name: "Cancelar" }).boundingBox(),
    validar(page).boundingBox(),
  ]);
  expect(izquierda!.x).toBeLessThan(derecha!.x);
});

test("S6: un archivo de tareas se valida por su ruta y la vista previa muestra la conciliación", async ({
  page,
}) => {
  const validaciones: string[] = [];
  await importaciones(page, (route, ruta) => {
    if (!ruta.endsWith("/validar")) return route.abort();
    validaciones.push(ruta);
    return route.fulfill({ json: vista });
  });
  await page.goto("/importaciones");
  await tareas(page).check();
  await elegir(page);
  await validar(page).click();
  expect(validaciones).toEqual(["/api/importaciones/tareas/validar"]);

  await expect(previa(page)).toContainText("Tareas · datos.csv");
  await expect(previa(page)).toContainText("Validada");
  await expect(previa(page)).toContainText(
    /Excluidas\s*0\s*canceladas o reasignadas/,
  );
  await expect(
    page.getByRole("region", { name: "Conciliación con el resumen semanal" }),
  ).toContainText("1 de 1 semana coincide");
  for (const [columna, valor] of [
    ["Tareas", "3"],
    ["Activas", "3"],
    ["Pendientes", "2"],
    ["Vencidas", "1"],
    ["Resultado", "Coincide"],
  ] as const)
    await expect(
      await celda(conciliacion(page), "EMP-001", columna),
    ).toHaveText(valor);

  const muestra = page.getByRole("region", {
    name: "Muestra de tareas válidas",
  });
  const estado = await celda(muestra, "OPS-1432", "Estado al cierre");
  await expect(estado).toContainText("Vencida");
  await expect(estado).toContainText("9 días de atraso");
  await expect(await celda(muestra, "OPS-1432", "Vence")).toHaveText(
    "9 oct 2026",
  );
  await expect(await celda(muestra, "OPS-1432", "Finalizada")).toHaveText("—");

  // Cancel on the left; Back, then the main action, on the right.
  const [c, v, k] = (
    await Promise.all(
      [cancelar, volver, confirmar].map((boton) => boton(page).boundingBox()),
    )
  ).map((caja) => caja!.x);
  expect(c).toBeLessThan(v);
  expect(v).toBeLessThan(k);
  await expect(confirmar(page)).toBeEnabled();
});

test("S6: una diferencia de totales rechaza el archivo completo y la explica por persona y semana", async ({
  page,
}) => {
  const diferencia: ConciliacionSemana = {
    employeeId: "EMP-002",
    periodStart: "2026-10-12",
    periodEnd: "2026-10-18",
    tareas: 4,
    excluidas: 1,
    esperado: { activas: 3, pendientes: 2, vencidas: 1 },
    derivado: { activas: 4, pendientes: 2, vencidas: 1 },
    estado: "DIFERENCIA",
    yaCargada: false,
  };
  const detalle =
    "EMP-002, semana del 12 oct al 18 oct: el resumen semanal informa 3 tareas activas y el detalle del archivo suma 4 (sobran 1).";
  const rechazada: VistaPreviaTareas = {
    ...vista,
    status: "RECHAZADA",
    nuevas: 0,
    muestraTareas: [],
    errores: [
      {
        fila: 5,
        campo: "tareas_activas",
        codigo: "TAREAS_NO_COINCIDEN",
        detalle,
      },
    ],
    conciliacion: {
      semanas: 2,
      coinciden: 1,
      diferencias: 1,
      sinResumen: 0,
      truncada: false,
      filas: [diferencia, coincide("EMP-001")],
    },
  };
  await importaciones(page, (route) =>
    route.fulfill({
      status: 422,
      json: {
        vistaPrevia: rechazada,
        error: {
          codigo: "FILAS_INVALIDAS",
          mensaje: "CSV inválido",
          detalles: [],
        },
      },
    }),
  );
  await page.goto("/importaciones");
  await tareas(page).check();
  await elegir(page);
  await validar(page).click();

  await expect(previa(page)).toContainText("Rechazada");
  await expect(alerta(page)).toContainText(
    "El archivo tiene 1 error y no se guardó ninguna tarea.",
  );
  await expect(
    page.getByText("se rechaza el archivo completo", { exact: false }),
  ).toBeVisible();
  const errores = page.getByRole("region", { name: "Errores del archivo" });
  await expect(await celda(errores, "sobran 1", "Fila")).toHaveText("5");
  await expect(await celda(errores, "sobran 1", "Campo")).toHaveText(
    "Tareas activas",
  );
  await expect(await celda(errores, "sobran 1", "Problema")).toContainText(
    "No coincide con el resumen semanal",
  );
  await expect(await celda(errores, "sobran 1", "Detalle")).toContainText(
    detalle,
  );

  // The differences come first, with the summary's value beneath the file's.
  await expect(conciliacion(page).getByRole("row").nth(1)).toContainText(
    "EMP-002",
  );
  await expect(
    await celda(conciliacion(page), "EMP-002", "Activas"),
  ).toContainText("Resumen: 3");
  await expect(
    await celda(conciliacion(page), "EMP-002", "Resultado"),
  ).toContainText("No coincide");
  await expect(
    await celda(conciliacion(page), "EMP-001", "Resultado"),
  ).toContainText("Coincide");
  await expect(confirmar(page)).toBeDisabled();

  // Back keeps the dataset and asks for another file.
  await volver(page).click();
  await expect(tareas(page)).toBeChecked();
  await expect(validar(page)).toBeDisabled();
});

test("S6: confirmar tareas informa lo guardado y no inicia ningún cálculo", async ({
  page,
}) => {
  const confirmaciones: string[] = [];
  await importaciones(page, (route, ruta) => {
    if (ruta.endsWith("/validar")) return route.fulfill({ json: vista });
    if (ruta.endsWith("/confirmar")) {
      confirmaciones.push(ruta);
      return route.fulfill({
        json: {
          ...resultadoImportacionMock,
          esquema: "tareas-v1",
          insertados: 3,
          omitidos: 0,
          afectados: [],
          procesamiento: null,
          semanas: 1,
          excluidas: 1,
        },
      });
    }
    return route.abort();
  });
  await page.goto("/importaciones");
  await tareas(page).check();
  await elegir(page);
  await validar(page).click();
  // A task file starts no calculation: the last step is only "Confirmar".
  await expect(page.getByRole("list", { name: "Pasos" })).not.toContainText(
    "procesar",
  );
  await confirmar(page).click();

  const confirmada = page.getByRole("region", {
    name: "Importación confirmada",
  });
  await expect(confirmada).toContainText(/Guardadas\s*3\s*tareas nuevas/);
  await expect(confirmada).toContainText(
    /Semanas\s*1\s*con el detalle de tareas/,
  );
  await expect(confirmada).toContainText(/Excluidas\s*1/);
  await expect(confirmada).toContainText("no requiere un nuevo cálculo");
  await expect(page.getByRole("region", { name: "Procesamiento" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Ver resumen" })).toBeVisible();
  expect(confirmaciones).toEqual([
    `/api/importaciones/${vista.importId}/confirmar`,
  ]);

  await page.getByRole("button", { name: "Nueva importación" }).click();
  await expect(tareas(page)).toBeChecked();
});

test("S6: la conciliación muestra diez semanas y deja ver el resto", async ({
  page,
}) => {
  const filas = Array.from({ length: 25 }, (_, i) =>
    coincide(`EMP-${String(i + 1).padStart(3, "0")}`),
  );
  filas[0] = { ...filas[0], yaCargada: true };
  await importaciones(page, (route) =>
    route.fulfill({
      json: {
        ...vista,
        semanasNuevas: 24,
        semanasOmitidas: 1,
        conciliacion: {
          semanas: 25,
          coinciden: 25,
          diferencias: 0,
          sinResumen: 0,
          truncada: false,
          filas,
        },
      },
    }),
  );
  await page.goto("/importaciones");
  await tareas(page).check();
  await elegir(page);
  await validar(page).click();

  await expect(conciliacion(page).getByRole("row")).toHaveCount(11); // header + 10
  await expect(
    await celda(conciliacion(page), "EMP-001", "Resultado"),
  ).toContainText("Ya cargada");
  const mas = page.getByRole("button", { name: "Ver 15 semanas más" });
  await expect(mas).toHaveAttribute("aria-expanded", "false");
  await mas.click();
  await expect(conciliacion(page).getByRole("row")).toHaveCount(26);
  const menos = page.getByRole("button", { name: "Ver menos semanas" });
  await expect(menos).toHaveAttribute("aria-expanded", "true");
  await menos.click();
  await expect(conciliacion(page).getByRole("row")).toHaveCount(11);
});

test("S6: en pantalla angosta la vista previa de tareas se lee sin desbordar la página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importaciones(page, (route) => route.fulfill({ json: vista }));
  await page.goto("/importaciones");
  await tareas(page).check();
  await elegir(page);
  await validar(page).click();
  await expect(confirmar(page)).toBeVisible();
  await expect(conciliacion(page)).toBeVisible();
  await page.screenshot({
    path: "test-results/s6-tareas-movil.png",
    fullPage: true,
  });
  await sinDesbordeHorizontal(page);
});
