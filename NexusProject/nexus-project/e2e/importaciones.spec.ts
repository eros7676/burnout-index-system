import { test, expect } from "@playwright/test";
import {
  vistaPreviaMock,
  resultadoImportacionMock,
  jobMock,
} from "../src/shared/mocks";

const archivo = {
  name: "datos.csv",
  mimeType: "text/csv",
  buffer: Buffer.from("employee_id\nEMP-001"),
};
const vista = { ...vistaPreviaMock, expiresAt: "2099-01-01T00:00:00.000Z" };

test("archivo no CSV, tamaño excesivo y respuesta no JSON muestran errores recuperables", async ({
  page,
}) => {
  let status = 415;
  await page.route("**/api/**", (route) =>
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
              codigo: "ARCHIVO",
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
  await page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Se requiere un archivo CSV",
  );
  status = 413;
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "supera 5 MiB",
  );
  status = 500;
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "respuesta JSON válida",
  );
  await expect(page.getByRole("button", { name: "Validar CSV" })).toBeEnabled();
});

test("pantalla móvil mantiene formularios accesibles y muestra sin desbordar la página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/**", (route) => route.fulfill({ json: vista }));
  await page.goto("/importaciones");
  await page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar importación" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/t06-movil.png", fullPage: true });
  const desbordes = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter(
        (el) =>
          el.getBoundingClientRect().right > window.innerWidth &&
          getComputedStyle(el).overflowX !== "auto",
      )
      .map((el) => ({
        tag: el.tagName,
        clase: el.className,
        width: el.getBoundingClientRect().width,
      }))
      .slice(0, 8),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    JSON.stringify(desbordes),
  ).toBe(true);
});

test("selección vacía, vista previa, cancelación y bloqueo de doble confirmación", async ({
  page,
}) => {
  let confirmar = 0;
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/validar")) return route.fulfill({ json: vista });
    if (route.request().method() === "DELETE")
      return route.fulfill({
        json: { importId: vista.importId, status: "CANCELADA" },
      });
    if (url.endsWith("/confirmar")) {
      confirmar++;
      await new Promise((resolve) => setTimeout(resolve, 200));
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
  await page.getByRole("link", { name: "Importar datos", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Validar CSV" }),
  ).toBeDisabled();
  await page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await expect(
    page.getByRole("heading", { name: "Vista previa · Validada" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar vista previa" }).click();
  await expect(
    page.getByText("Vista previa cancelada.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar importación" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Datos confirmados" }),
  ).toBeVisible();
  await expect(
    page.getByText("Procesamiento: COMPLETADO", { exact: true }),
  ).toBeVisible();
  expect(confirmar).toBe(1);
});

test("422 muestra fila/campo, advertencias y bloquea confirmación; vista vencida exige revalidación", async ({
  page,
}) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 422,
      json: {
        vistaPrevia: {
          ...vista,
          status: "RECHAZADA",
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
    }),
  );
  await page.goto("/importaciones");
  await page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await expect(page.getByText("Falta horas extra")).toBeVisible();
  await expect(page.getByText("Revisar horas extremas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar importación" }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Seleccionar CSV corregido / volver a validar",
    })
    .click();
  await page.unroute("**/api/**");
  await page.route("**/api/**", (route) =>
    route.fulfill({ json: { ...vista, expiresAt: "2020-01-01T00:00:00Z" } }),
  );
  await page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await expect(
    page.getByText("La vista previa venció.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar importación" }),
  ).toBeDisabled();
});

test("200 con job FALLIDO conserva datos, permite reintento y recuperación tras recarga", async ({
  page,
}) => {
  let estado = "FALLIDO";
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("/validar")) return route.fulfill({ json: vista });
    if (url.endsWith("/confirmar"))
      return route.fulfill({
        json: {
          ...resultadoImportacionMock,
          procesamiento: { ...jobMock, estado },
        },
      });
    if (url.endsWith("/reintentar")) estado = "COMPLETADO";
    return route.fulfill({ json: { ...jobMock, estado } });
  });
  await page.goto("/importaciones");
  await page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(
    page.getByRole("heading", { name: "Datos confirmados" }),
  ).toBeVisible();
  await expect(
    page.getByText("Procesamiento: FALLIDO", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("El cálculo de todos los pares terminó correctamente."),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("ID del procesamiento")).toHaveValue(
    jobMock.jobId,
  );
  await page.getByRole("button", { name: "Consultar estado" }).click();
  await page.getByRole("button", { name: "Reintentar procesamiento" }).click();
  await expect(
    page.getByText("Procesamiento: COMPLETADO", { exact: true }),
  ).toBeVisible();
});

test("conexión perdida al confirmar recupera el mismo ID sin duplicar la carga", async ({
  page,
}) => {
  let intentos = 0;
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("/validar")) return route.fulfill({ json: vista });
    if (url.endsWith("/confirmar")) {
      intentos++;
      if (intentos === 1) return route.abort();
      expect(url).toContain(encodeURIComponent(vista.importId));
      return route.fulfill({
        json: { ...resultadoImportacionMock, procesamiento: null },
      });
    }
    return route.abort();
  });
  await page.goto("/importaciones");
  await page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Se perdió la conexión",
  );
  await page.reload();
  await page.getByRole("button", { name: "Recuperar confirmación" }).click();
  await expect(
    page.getByRole("heading", { name: "Datos confirmados" }),
  ).toBeVisible();
  expect(intentos).toBe(2);
});

test("conflicto al confirmar exige validar otra vez; job activo no permite reintento", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => {
    if (route.request().url().endsWith("/validar"))
      return route.fulfill({ json: vista });
    if (route.request().url().endsWith("/confirmar"))
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
  await page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "El histórico cambió",
  );
  await expect(
    page.getByRole("button", { name: "Recuperar confirmación" }),
  ).toHaveCount(0);
  await page.getByLabel("ID del procesamiento").fill(jobMock.jobId);
  await page.getByRole("button", { name: "Consultar estado" }).click();
  await expect(
    page.getByRole("button", { name: "Reintentar procesamiento" }),
  ).toBeDisabled();
});
