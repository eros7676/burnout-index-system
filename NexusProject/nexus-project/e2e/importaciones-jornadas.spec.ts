import { test, expect, type Page, type Route } from "@playwright/test";
import {
  vistaPreviaJornadasMock,
  type ConciliacionJornadasSemana,
  type VistaPreviaJornadas,
} from "../src/shared/contratos/importaciones";
import { resultadoImportacionMock } from "../src/shared/mocks";
import { celda, demo, sinDesbordeHorizontal } from "./demo";

// The day detail on the import screen (/importaciones, RRHH only): choose «Días», validate,
// read the control totals and the first days, confirm. Mocked: the server is not involved.

const archivo = { name: "dias.csv", mimeType: "text/csv", buffer: Buffer.from("employee_id\nEMP-001") };
const vista: VistaPreviaJornadas = { ...vistaPreviaJornadasMock, expiresAt: "2099-01-01T00:00:00.000Z" };

const dias = (page: Page) => page.getByRole("radio", { name: "Días", exact: true });
const elegir = (page: Page) => page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
const validar = (page: Page) => page.getByRole("button", { name: "Validar archivo" });
const confirmar = (page: Page) => page.getByRole("button", { name: "Confirmar importación" });
const previa = (page: Page) => page.getByRole("region", { name: "Vista previa" });
const conciliacion = (page: Page) => page.getByRole("region", { name: "Conciliación de días por semana" });

async function importaciones(page: Page, responder: (route: Route, ruta: string) => unknown) {
  await demo(page, "demo-rrhh");
  await page.route(
    (url) => url.pathname.startsWith("/api/importaciones") || url.pathname.startsWith("/api/procesamientos"),
    (route) => responder(route, new URL(route.request().url()).pathname),
  );
}

test("Días: se elige en el primer paso, con sus límites y su plantilla, y se valida por su ruta", async ({ page }) => {
  const validaciones: string[] = [];
  await importaciones(page, (route, ruta) => {
    if (!ruta.endsWith("/validar")) return route.abort();
    validaciones.push(ruta);
    return route.fulfill({ json: vista });
  });
  await page.goto("/importaciones");
  await dias(page).check();
  await expect(page.getByText("Cada fila es un día; cada semana lleva sus siete días.")).toBeVisible();
  const plantilla = page.getByRole("link", { name: "Descargar plantilla de días" });
  await expect(plantilla).toHaveAttribute("href", "/api/importaciones/plantillas/jornadas");
  await expect(plantilla).toHaveAttribute("download", "");

  await elegir(page);
  await validar(page).click();
  expect(validaciones).toEqual(["/api/importaciones/jornadas/validar"]);
  await expect(previa(page)).toContainText("Días · dias.csv");
  await expect(previa(page)).toContainText("Validada");
  await expect(page.getByRole("region", { name: "Conciliación con el resumen semanal" })).toContainText(
    "1 de 1 semana coincide",
  );
  for (const [columna, valor] of [
    ["Horas extra", "16 h"],
    ["Horas trabajadas", "56 h"],
    ["Días seguidos al domingo", "7 o más"],
    ["Últimas vacaciones", "Antes de la semana"],
    ["Ausencias", "—"],
    ["Resultado", "Coincide"],
  ] as const)
    await expect(await celda(conciliacion(page), "EMP-001", columna)).toHaveText(valor);

  const muestra = page.getByRole("region", { name: "Muestra de días válidos" });
  await expect(muestra.getByRole("row")).toHaveCount(8);
  const primera = muestra.getByRole("row").nth(1);
  await expect(primera).toContainText("lun 12 oct");
  await expect(primera).toContainText("Trabajo");
  await expect(primera).toContainText("10 h");
  await expect(confirmar(page)).toBeEnabled();
});

test("Días: una semana que contradice su resumen rechaza el archivo y muestra el valor del resumen", async ({
  page,
}) => {
  const diferencia: ConciliacionJornadasSemana = {
    ...vista.conciliacion.filas[0]!,
    employeeId: "EMP-002",
    derivado: { ...vista.conciliacion.filas[0]!.derivado, horasExtra: 14, diasSeguidos: 4, licencias: 2 },
    diferencias: ["horasExtra", "diasConsecutivosSinDescanso"],
    estado: "DIFERENCIA",
  };
  const rechazada: VistaPreviaJornadas = {
    ...vista,
    status: "RECHAZADA",
    nuevas: 0,
    errores: [
      {
        fila: 2,
        campo: "horas_extra",
        codigo: "JORNADAS_NO_COINCIDEN",
        detalle:
          "EMP-002, semana del 12/10/2026 al 18/10/2026: el resumen semanal informa 16 h extra y los días del archivo suman 14 h (faltan 2 h).",
      },
    ],
    conciliacion: { ...vista.conciliacion, coinciden: 0, diferencias: 1, filas: [diferencia] },
    muestraJornadas: [],
  };
  await importaciones(page, (route) =>
    route.fulfill({
      status: 422,
      json: {
        vistaPrevia: rechazada,
        error: { codigo: "FILAS_INVALIDAS", mensaje: "El archivo contiene errores.", detalles: rechazada.errores },
      },
    }),
  );
  await page.goto("/importaciones");
  await dias(page).check();
  await elegir(page);
  await validar(page).click();

  await expect(previa(page)).toContainText("Rechazada");
  await expect(previa(page)).toContainText("no se guardó ningún día");
  await expect(previa(page)).toContainText("Para no guardar días que contradigan los indicadores");
  const extra = await celda(conciliacion(page), "EMP-002", "Horas extra");
  await expect(extra).toContainText("14 h");
  await expect(extra).toContainText("Resumen: 16 h");
  await expect(await celda(conciliacion(page), "EMP-002", "Días seguidos al domingo")).toContainText("Resumen: 16");
  await expect(await celda(conciliacion(page), "EMP-002", "Ausencias")).toHaveText("2 días de licencia");
  await expect(await celda(conciliacion(page), "EMP-002", "Horas trabajadas")).not.toContainText("Resumen");
  await expect(page.getByRole("region", { name: "Errores del archivo" })).toContainText("No coincide con el resumen semanal");
  await expect(confirmar(page)).toBeDisabled();
});

test("Días: confirmar informa lo guardado y no inicia ningún cálculo", async ({ page }) => {
  await importaciones(page, (route, ruta) => {
    if (ruta.endsWith("/validar")) return route.fulfill({ json: vista });
    if (ruta.endsWith("/confirmar"))
      return route.fulfill({
        json: {
          ...resultadoImportacionMock,
          esquema: "jornadas-v1",
          insertados: 7,
          omitidos: 0,
          afectados: [],
          procesamiento: null,
          semanas: 1,
        },
      });
    return route.abort();
  });
  await page.goto("/importaciones");
  await dias(page).check();
  await elegir(page);
  await validar(page).click();
  await expect(page.getByRole("list", { name: "Pasos" })).not.toContainText("procesar");
  await confirmar(page).click();

  const confirmada = page.getByRole("region", { name: "Importación confirmada" });
  await expect(confirmada).toContainText(/Guardadas\s*7\s*días nuevos/);
  await expect(confirmada).toContainText(/Semanas\s*1\s*con el detalle de días/);
  await expect(confirmada).toContainText("el detalle de días no requiere un nuevo cálculo");
  await expect(page.getByRole("region", { name: "Procesamiento" })).toHaveCount(0);
});

test("Días: en pantalla angosta la vista previa se lee sin desbordar la página", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importaciones(page, (route) => route.fulfill({ json: vista }));
  await page.goto("/importaciones");
  await dias(page).check();
  await elegir(page);
  await validar(page).click();
  await expect(conciliacion(page)).toBeVisible();
  await sinDesbordeHorizontal(page);
});
