import { test, expect } from "@playwright/test";
import {
  alertaMock,
  filasEscenarioMock,
  resumenMock,
  intentoNotificacionMock,
} from "../src/shared/mocks";
import type { IntentoNotificacion } from "../src/shared/contracts";

test("T12: pendiente recuperable, fallo y reintento exitoso con historial visible", async ({
  page,
}) => {
  const alerta = { ...alertaMock };
  const intentos: IntentoNotificacion[] = [];
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/alertas")
      return route.fulfill({
        json: { items: [alerta], total: 1, page: 1, pageSize: 10 },
      });
    if (url.pathname === "/api/resumen")
      return route.fulfill({ json: resumenMock });
    if (url.pathname === "/api/evaluaciones")
      return route.fulfill({
        json: { items: filasEscenarioMock, total: 6, page: 1, pageSize: 20 },
      });
    if (url.pathname.endsWith("/procesar")) {
      const i = intentos[0];
      i.estado = i.resultado === "FALLO" ? "FALLIDO" : "ENVIADO";
      i.detalle =
        i.estado === "FALLIDO" ? "Fallo simulado." : "Enviado (simulado).";
      alerta.estadoEnvio = i.estado;
      return route.fulfill({ json: i });
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      const i: IntentoNotificacion = {
        ...intentoNotificacionMock,
        ...body,
        intentoId: `intento-${intentos.length + 1}`,
        numero: intentos.length + 1,
      };
      intentos.unshift(i);
      alerta.canal = "SIMULADO";
      alerta.estadoEnvio = "PENDIENTE";
      return route.fulfill({ json: i });
    }
    return route.fulfill({ json: intentos });
  });
  await page.goto("/home");
  const correo = page.getByLabel("Correo simulado", { exact: true });
  await correo.getByRole("button", { name: "Preparar fallo simulado" }).click();
  await expect(correo.getByRole("listitem")).toContainText("PENDIENTE");
  await page.reload();
  await correo
    .getByRole("button", { name: "Ver / actualizar intentos" })
    .click();
  await correo
    .getByRole("button", { name: "Procesar envío pendiente" })
    .click();
  await expect(correo.getByRole("listitem")).toContainText("FALLIDO");
  await correo
    .getByRole("button", { name: "Reintentar correo simulado" })
    .click();
  await correo
    .getByRole("button", { name: "Procesar envío pendiente" })
    .click();
  await expect(correo.getByRole("listitem").first()).toContainText(
    "Enviado (simulado)",
  );
  await expect(correo.getByRole("listitem")).toHaveCount(2);
  await expect(
    correo.getByRole("button", { name: "Reintentar correo simulado" }),
  ).toHaveCount(0);
});

test("T12: un error HTTP deja visible la alerta y permite recuperar el historial", async ({
  page,
}) => {
  let falla = true;
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/alertas")
      return route.fulfill({
        json: { items: [alertaMock], total: 1, page: 1, pageSize: 10 },
      });
    if (url.pathname === "/api/resumen")
      return route.fulfill({ json: resumenMock });
    if (url.pathname === "/api/evaluaciones")
      return route.fulfill({
        json: { items: [], total: 0, page: 1, pageSize: 20 },
      });
    if (falla)
      return route.fulfill({
        status: 500,
        json: { error: { mensaje: "Simulación temporalmente indisponible." } },
      });
    return route.fulfill({
      json: [
        {
          ...intentoNotificacionMock,
          estado: "SIN_DESTINATARIO",
          destinatarioId: null,
          detalle: "Revisar responsable.",
        },
      ],
    });
  });
  await page.goto("/home");
  const correo = page.getByLabel("Correo simulado", { exact: true });
  await correo
    .getByRole("button", { name: "Ver / actualizar intentos" })
    .click();
  await expect(correo.getByRole("alert")).toContainText(
    "temporalmente indisponible",
  );
  await expect(page.getByText("1 activas", { exact: true })).toBeVisible();
  falla = false;
  await correo
    .getByRole("button", { name: "Ver / actualizar intentos" })
    .click();
  await expect(correo.getByRole("listitem")).toContainText("SIN_DESTINATARIO");
  await expect(correo.getByRole("alert")).toHaveCount(0);
});
