import { test, expect, type Page, type Route } from "@playwright/test";
import {
  confirmacionFallidaMock,
  jobMock,
  resultadoImportacionMock,
  vistaPreviaMock,
} from "../src/shared/mocks";
import { alerta, celda, demo, menu, sinDesbordeHorizontal } from "./demo";

// T06 on the rebuilt import screen (/importaciones, RRHH only): choose a file,
// validate, review the preview, confirm, then follow the calculation.

const archivo = {
  name: "datos.csv",
  mimeType: "text/csv",
  buffer: Buffer.from("employee_id\nEMP-001"),
};
const vista = { ...vistaPreviaMock, expiresAt: "2099-01-01T00:00:00.000Z" };

const elegir = (page: Page) =>
  page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
const validar = (page: Page) =>
  page.getByRole("button", { name: "Validar archivo" });
const confirmar = (page: Page) =>
  page.getByRole("button", { name: "Confirmar importación" });
const procesamiento = (page: Page) =>
  page.getByRole("region", { name: "Procesamiento" });
const confirmada = (page: Page) =>
  page.getByRole("region", { name: "Importación confirmada" });

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

test("T06: archivo no CSV, tamaño excesivo y respuesta no JSON muestran errores recuperables", async ({
  page,
}) => {
  let status = 415;
  await importaciones(page, (route) =>
    status === 500
      ? route.fulfill({
          status,
          contentType: "text/html",
          body: "Fallo del servidor",
        })
      : route.fulfill({
          status,
          json: {
            error: {
              codigo: status === 413 ? "ARCHIVO_EXCESIVO" : "FORMATO_NO_CSV",
              mensaje:
                status === 413
                  ? "El archivo supera 5 MiB"
                  : "Se requiere un archivo CSV",
              detalles: [],
            },
          },
        }),
  );
  await page.goto("/importaciones");
  await elegir(page);
  await validar(page).click();
  await expect(alerta(page)).toContainText("Se requiere un archivo CSV");
  status = 413;
  await validar(page).click();
  await expect(alerta(page)).toContainText("supera 5 MiB");
  status = 500;
  await validar(page).click();
  await expect(alerta(page)).toContainText("respuesta JSON válida");
  await expect(validar(page)).toBeEnabled();
  await expect(page.getByRole("region", { name: "Vista previa" })).toHaveCount(
    0,
  );
});

test("T06: en pantalla angosta la vista previa se lee sin desbordar la página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importaciones(page, (route) => route.fulfill({ json: vista }));
  await page.goto("/importaciones");
  await elegir(page);
  await validar(page).click();
  await expect(confirmar(page)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Muestra de filas válidas" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/t06-movil.png", fullPage: true });
  await sinDesbordeHorizontal(page);
});

test("T06: sin archivo no se valida; la vista previa se cancela y la confirmación no se duplica", async ({
  page,
}) => {
  let confirmaciones = 0;
  const cancelaciones: string[] = [];
  let liberar!: () => void;
  const retenida = new Promise<void>((resolve) => (liberar = resolve));
  await importaciones(page, async (route, ruta) => {
    if (ruta.endsWith("/validar")) return route.fulfill({ json: vista });
    if (route.request().method() === "DELETE") {
      cancelaciones.push(ruta);
      return route.fulfill({
        json: { importId: vista.importId, status: "CANCELADA" },
      });
    }
    if (ruta.endsWith("/confirmar")) {
      confirmaciones++;
      await retenida;
      return route.fulfill({
        json: {
          ...resultadoImportacionMock,
          procesamiento: { ...jobMock, estado: "COMPLETADO" },
        },
      });
    }
    return route.fulfill({ json: { ...jobMock, estado: "COMPLETADO" } });
  });
  await page.goto("/home");
  await menu(page).getByRole("link", { name: "Importar datos" }).click();
  await expect(page).toHaveURL(/\/importaciones$/);
  await expect(validar(page)).toBeDisabled();
  await elegir(page);
  await validar(page).click();
  const previa = page.getByRole("region", { name: "Vista previa" });
  await expect(previa).toContainText("Validada");
  await expect(previa.getByRole("button", { name: "Cancelar" })).toBeEnabled();
  await previa.getByRole("button", { name: "Cancelar" }).click();
  await expect(
    page.getByText(
      "Vista previa cancelada. No se guardaron registros laborales.",
    ),
  ).toBeVisible();
  expect(cancelaciones).toEqual([`/api/importaciones/${vista.importId}`]);

  await elegir(page);
  await validar(page).click();
  await confirmar(page).dblclick();
  // While the confirmation runs every action is locked.
  await expect(confirmar(page)).toBeDisabled();
  await expect(previa.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  liberar();
  await expect(confirmada(page)).toContainText(/Guardadas\s*2\s*filas nuevas/);
  await expect(procesamiento(page).getByRole("status")).toContainText(
    "Terminado",
  );
  await expect(procesamiento(page)).toContainText(
    "El cálculo terminó para todas las semanas.",
  );
  await expect(page.getByRole("link", { name: "Ver resumen" })).toBeVisible();
  expect(confirmaciones).toBe(1);
});

test("T06: un archivo rechazado muestra fila y campo, no se confirma, y una vista vencida exige validar otra vez", async ({
  page,
}) => {
  let modo = "rechazada";
  await importaciones(page, (route) =>
    modo === "rechazada"
      ? route.fulfill({
          status: 422,
          json: {
            vistaPrevia: {
              ...vista,
              status: "RECHAZADA",
              nuevas: 0,
              muestra: [],
              errores: [
                {
                  fila: 2,
                  campo: "horas_extra",
                  codigo: "OBLIGATORIO",
                  detalle: "Falta horas extra",
                },
              ],
              warnings: [
                {
                  fila: 3,
                  campo: "horas_extra",
                  codigo: "HORAS_EXTREMAS",
                  detalle: "Revisar horas extremas",
                },
              ],
            },
            error: {
              codigo: "FILAS_INVALIDAS",
              mensaje: "CSV inválido",
              detalles: [],
            },
          },
        })
      : route.fulfill({
          json: { ...vista, expiresAt: "2020-01-01T00:00:00.000Z" },
        }),
  );
  await page.goto("/importaciones");
  await elegir(page);
  await validar(page).click();
  await expect(
    page.getByRole("region", { name: "Vista previa" }),
  ).toContainText("Rechazada");
  const errores = page.getByRole("region", { name: "Errores del archivo" });
  const fila = "Falta horas extra";
  await expect(await celda(errores, fila, "Fila")).toHaveText("2");
  await expect(await celda(errores, fila, "Campo")).toHaveText("Horas extra");
  await expect(await celda(errores, fila, "Problema")).toContainText(
    "Falta el dato",
  );
  await expect(
    page.getByRole("region", { name: "Advertencias del archivo" }),
  ).toContainText("Revisar horas extremas");
  await expect(confirmar(page)).toBeDisabled();

  await page.getByRole("button", { name: "Elegir otro archivo" }).click();
  modo = "vencida";
  await elegir(page);
  await validar(page).click();
  await expect(alerta(page)).toContainText(
    "La vista previa venció. Volvé a validar el archivo.",
  );
  await expect(confirmar(page)).toBeDisabled();
});

test("T06: HTTP 200 con el cálculo FALLIDO conserva los datos, no se muestra como éxito y se reintenta tras recargar", async ({
  page,
}) => {
  let estado = "FALLIDO";
  const fallido = confirmacionFallidaMock.body.procesamiento;
  await importaciones(page, (route, ruta) => {
    if (ruta.endsWith("/validar")) return route.fulfill({ json: vista });
    if (ruta.endsWith("/confirmar"))
      return route.fulfill({ json: confirmacionFallidaMock.body });
    if (ruta.endsWith("/reintentar")) estado = "COMPLETADO";
    return route.fulfill({
      json:
        estado === "FALLIDO"
          ? fallido
          : { ...jobMock, estado: "COMPLETADO", completados: 2 },
    });
  });
  await page.goto("/importaciones");
  await elegir(page);
  await validar(page).click();
  await confirmar(page).click();
  // The data is saved; the calculation is reported apart, as failed.
  await expect(confirmada(page)).toContainText(/Guardadas\s*2\s*filas nuevas/);
  await expect(procesamiento(page).getByRole("status")).toContainText(
    "Falló el cálculo",
  );
  await expect(
    page.getByRole("region", { name: "Semanas que no se pudieron calcular" }),
  ).toContainText("Fallo simulado al guardar alerta.");
  await expect(
    page.getByText("El cálculo terminó para todas las semanas."),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver resumen" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel("ID del procesamiento")).toHaveValue(
    jobMock.jobId,
  );
  await page.getByRole("button", { name: "Consultar estado" }).click();
  await expect(procesamiento(page).getByRole("status")).toContainText(
    "Falló el cálculo",
  );
  await page.getByRole("button", { name: "Reintentar procesamiento" }).click();
  await expect(procesamiento(page).getByRole("status")).toContainText(
    "Terminado",
  );
  await expect(procesamiento(page)).toContainText(
    "El cálculo terminó para todas las semanas.",
  );
});

test("T06: si se pierde la respuesta al confirmar, se recupera con el mismo ID sin duplicar la carga", async ({
  page,
}) => {
  const confirmaciones: string[] = [];
  await importaciones(page, (route, ruta) => {
    if (ruta.endsWith("/validar")) return route.fulfill({ json: vista });
    if (ruta.endsWith("/confirmar")) {
      confirmaciones.push(ruta);
      if (confirmaciones.length === 1) return route.abort();
      return route.fulfill({
        json: { ...resultadoImportacionMock, procesamiento: null },
      });
    }
    return route.abort();
  });
  await page.goto("/importaciones");
  await elegir(page);
  await validar(page).click();
  await confirmar(page).click();
  await expect(alerta(page)).toContainText("Se perdió la conexión");
  const pendiente = page.getByRole("region", {
    name: "Confirmación sin respuesta",
  });
  await expect(pendiente).toBeVisible();
  // No other file can start while the confirmation is unresolved.
  await expect(
    page.getByRole("button", { name: "Nueva importación" }),
  ).toHaveCount(0);

  await page.reload();
  await pendiente
    .getByRole("button", { name: "Recuperar confirmación" })
    .click();
  await expect(confirmada(page)).toContainText(/Guardadas\s*2\s*filas nuevas/);
  await expect(confirmada(page)).toContainText(
    "No hay semanas nuevas para calcular. No se duplicó ningún dato.",
  );
  expect(confirmaciones).toEqual([
    `/api/importaciones/${vista.importId}/confirmar`,
    `/api/importaciones/${vista.importId}/confirmar`,
  ]);
});

test("T06: un conflicto al confirmar exige validar otra vez y un cálculo en curso no se reintenta", async ({
  page,
}) => {
  await importaciones(page, (route, ruta) => {
    if (ruta.endsWith("/validar")) return route.fulfill({ json: vista });
    if (ruta.endsWith("/confirmar"))
      return route.fulfill({
        status: 409,
        json: {
          error: {
            codigo: "CONFLICTO_HISTORICO",
            mensaje: "El histórico cambió. Volvé a validar.",
            detalles: [],
          },
        },
      });
    return route.fulfill({ json: { ...jobMock, estado: "PROCESANDO" } });
  });
  await page.goto("/importaciones");
  await elegir(page);
  await validar(page).click();
  await confirmar(page).click();
  await expect(alerta(page)).toContainText("El histórico cambió");
  await expect(
    page.getByRole("button", { name: "Recuperar confirmación" }),
  ).toHaveCount(0);
  await expect(validar(page)).toBeVisible();

  // Recovery by a typed id.
  await page.getByText("¿Se cortó un procesamiento?").click();
  await page.getByLabel("ID del procesamiento").fill(jobMock.jobId);
  await page.getByRole("button", { name: "Consultar estado" }).click();
  await expect(procesamiento(page).getByRole("status")).toContainText(
    "Calculando",
  );
  await expect(
    page.getByRole("button", { name: "Reintentar procesamiento" }),
  ).toBeDisabled();
});

test("T06/T15a: solo RRHH abre la importación", async ({ page }) => {
  for (const [usuario, inicio] of [
    ["demo-gerencia", /\/home$/],
    ["demo-tl-01", /\/home$/],
    ["demo-empleado", /\/my-data$/],
  ] as const) {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await demo(page, usuario);
    await page.goto("/importaciones");
    await expect(page).toHaveURL(inicio);
    await expect(
      menu(page).getByRole("link", { name: "Importar datos" }),
    ).toHaveCount(0);
  }
});
