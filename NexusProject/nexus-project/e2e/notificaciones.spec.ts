import { test, expect, type Page } from "@playwright/test";
import type { Alerta, IntentoNotificacion } from "../src/shared/contracts";
import {
  alertaListadaMock,
  alertaMock,
  intentoNotificacionMock,
  paginaAlertasMock,
} from "../src/shared/mocks";
import { api, celda, demo, type UsuarioDemo } from "./demo";
import { ALERTA_ID, RUTA_ALERTA, seguimientoSinCaso } from "./seguimiento-mocks";

// T12 on the rebuilt screens: the simulated email lives in the alert's page (/alerts/[alertId]) and in
// the report's Alerta section, for RR. HH. only. The list links to the page instead of opening a panel.

const alertas = (page: Page) =>
  page.getByRole("region", { name: "Alertas activas" });
const correo = (page: Page) =>
  page.getByRole("region", { name: "Correo simulado" });
const historial = (page: Page) =>
  correo(page).getByRole("list", { name: "Historial de envíos simulados" });
const datosDeLaAlerta = (page: Page) =>
  page.getByRole("region", { name: "Datos de la alerta" });

/**
 * The T12 server as a state machine over one alert: preparing stores a pending
 * attempt and moves the alert to the simulated channel; processing finishes
 * the attempt as its requested result. `perder` drops the processing request.
 */
async function servidorCorreo(page: Page) {
  const estado = {
    alerta: { ...alertaMock } as Alerta,
    intentos: [] as IntentoNotificacion[],
    solicitudes: [] as { requestId: string; resultado: string }[],
    perder: false,
    fallaListado: null as null | "http" | "html",
    sinDestinatario: false,
  };
  await page.route(api("/api/alertas"), (route) =>
    route.fulfill({
      json: {
        ...paginaAlertasMock,
        items: [{ ...alertaListadaMock, ...estado.alerta }],
      },
    }),
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/alertas/"),
    (route) => {
      const request = route.request();
      const ruta = new URL(request.url()).pathname;
      if (ruta === `/api/alertas/${ALERTA_ID}`)
        return route.fulfill({
          json: { ...alertaListadaMock, ...estado.alerta },
        });
      if (ruta.endsWith("/seguimiento"))
        return route.fulfill({ json: seguimientoSinCaso });
      if (ruta.endsWith("/procesar")) {
        if (estado.perder) return route.abort();
        const intento = estado.intentos.find((i) =>
          ruta.includes(`/${i.intentoId}/`),
        )!;
        intento.estado = intento.resultado === "FALLO" ? "FALLIDO" : "ENVIADO";
        intento.detalle =
          intento.estado === "FALLIDO"
            ? "Fallo simulado."
            : "Enviado (simulado).";
        intento.completedAt = "2026-10-19T12:05:00.000Z";
        estado.alerta.estadoEnvio = intento.estado;
        return route.fulfill({ json: intento });
      }
      if (request.method() === "POST") {
        const solicitud = request.postDataJSON();
        estado.solicitudes.push(solicitud);
        const intento: IntentoNotificacion = {
          ...intentoNotificacionMock,
          ...solicitud,
          intentoId: `intento-${estado.intentos.length + 1}`,
          numero: estado.intentos.length + 1,
        };
        estado.intentos.unshift(intento);
        estado.alerta.canal = "SIMULADO";
        estado.alerta.estadoEnvio = "PENDIENTE";
        return route.fulfill({ json: intento });
      }
      if (estado.fallaListado === "http")
        return route.fulfill({
          status: 500,
          json: {
            error: {
              codigo: "ERROR_INTERNO",
              mensaje: "Simulación temporalmente indisponible.",
              detalles: [],
            },
          },
        });
      if (estado.fallaListado === "html")
        return route.fulfill({
          status: 502,
          contentType: "text/html",
          body: "<h1>Bad gateway</h1>",
        });
      return route.fulfill({ json: estado.intentos });
    },
  );
  return estado;
}

test("T12: un envío pendiente se recupera tras recargar, el fallo se reintenta y todo queda rotulado como simulado", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const servidor = await servidorCorreo(page);
  await page.goto("/alerts");
  const destinatario = await celda(
    alertas(page),
    "Persona ficticia 001",
    "Destinatario",
  );
  await expect(destinatario).toContainText("Team Lead ficticio 1");
  await expect(destinatario).toContainText("Solo aviso interno");
  // The list links to the alert's page, where the mail lives.
  await expect(
    alertas(page).getByRole("button", { name: /correo/ }),
  ).toHaveCount(0);
  await alertas(page)
    .getByRole("link", { name: "Persona ficticia 001" })
    .click();
  await expect(page).toHaveURL(new RegExp(`${RUTA_ALERTA}$`));
  await expect(correo(page)).toContainText("Sin intentos registrados.");

  // The answer to processing is lost: the pending attempt stays recoverable.
  servidor.perder = true;
  await correo(page)
    .getByRole("button", { name: "Simular envío fallido" })
    .click();
  await expect(correo(page).getByRole("alert")).toContainText(
    "No se pudo conectar",
  );
  await expect(historial(page).getByRole("listitem")).toHaveText([
    /Intento 1.*Pendiente de procesar/,
  ]);
  servidor.perder = false;
  await page.reload();
  await expect(datosDeLaAlerta(page)).toContainText("Envío simulado pendiente");
  await expect(historial(page).getByRole("listitem")).toHaveText([
    /Intento 1.*Pendiente de procesar/,
  ]);
  await correo(page)
    .getByRole("button", { name: "Procesar envío pendiente" })
    .click();
  await expect(correo(page).getByRole("status")).toHaveText(
    "Envío registrado como fallido (simulado). Se puede volver a simularlo.",
  );
  await expect(historial(page).getByRole("listitem")).toHaveText([
    /Intento 1.*Fallido \(simulado\).*Fallo simulado\./,
  ]);
  await expect(datosDeLaAlerta(page)).toContainText("Envío simulado fallido");

  // A retry is a new attempt with a new request id; the history keeps both.
  await correo(page)
    .getByRole("button", { name: "Simular envío exitoso" })
    .click();
  await expect(correo(page).getByRole("status")).toHaveText(
    "Envío registrado como enviado (simulado).",
  );
  await expect(historial(page).getByRole("listitem")).toHaveText([
    /Intento 2.*Enviado \(simulado\)/,
    /Intento 1.*Fallido \(simulado\)/,
  ]);
  await expect(datosDeLaAlerta(page)).toContainText("Enviado (simulado)");
  await expect(
    correo(page).getByRole("button", { name: /^Simular/ }),
  ).toHaveCount(0);
  expect(servidor.solicitudes.map((s) => s.resultado)).toEqual([
    "FALLO",
    "EXITO",
  ]);
  const [primera, segunda] = servidor.solicitudes.map((s) => s.requestId);
  expect(primera).toMatch(/^[0-9a-f-]{36}$/);
  expect(segunda).not.toBe(primera);
});

test("T12: un error al leer el historial deja visible la alerta y se recupera; SIN_DESTINATARIO queda visible", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const servidor = await servidorCorreo(page);
  servidor.fallaListado = "http";
  await page.goto(RUTA_ALERTA);
  await expect(correo(page).getByRole("alert")).toContainText(
    "temporalmente indisponible",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Alerta de Persona ficticia 001" }),
  ).toBeVisible();
  await expect(datosDeLaAlerta(page)).toContainText("Team Lead ficticio 1");

  servidor.fallaListado = "html";
  await correo(page)
    .getByRole("button", { name: "Actualizar historial" })
    .click();
  await expect(correo(page).getByRole("alert")).toContainText(
    "respuesta JSON válida",
  );

  servidor.fallaListado = null;
  servidor.intentos.push({
    ...intentoNotificacionMock,
    estado: "SIN_DESTINATARIO",
    destinatarioId: null,
    detalle: "Revisar responsable.",
    completedAt: "2026-10-19T12:05:00.000Z",
  });
  await correo(page)
    .getByRole("button", { name: "Actualizar historial" })
    .click();
  await expect(historial(page).getByRole("listitem")).toHaveText([
    /Intento 1.*Sin destinatario.*Revisar responsable\./,
  ]);
  await expect(correo(page).getByRole("alert")).toHaveCount(0);
});

test("T12: el correo simulado del informe actualiza el envío como simulado", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await servidorCorreo(page);
  await page.goto("/reports/mock-evaluation-2");
  const seccion = page.getByRole("region", { name: "Alerta" });
  await expect(seccion).toContainText("Solo aviso interno");
  await correo(page)
    .getByRole("button", { name: "Simular envío exitoso" })
    .click();
  await expect(seccion.locator('dt:text-is("Envío") + dd')).toHaveText(
    "Enviado (simulado)",
  );
  await expect(historial(page).getByRole("listitem")).toHaveText([
    /Intento 1.*Enviado \(simulado\).*Para Team Lead ficticio 1/,
  ]);
});

for (const [usuario, destinatario] of [
  ["demo-gerencia", "Team Lead ficticio 1"],
  ["demo-tl-01", "Team Lead ficticio 1 (usted)"],
] as [UsuarioDemo, string][]) {
  test(`T12/T15a: ${usuario} lee la alerta y sus sugerencias sin controles de correo`, async ({
    page,
  }) => {
    await demo(page, usuario);
    await servidorCorreo(page);
    await page.goto("/alerts");
    await expect(
      await celda(alertas(page), "Persona ficticia 001", "Destinatario"),
    ).toContainText(destinatario);
    await alertas(page)
      .getByRole("link", { name: "Persona ficticia 001" })
      .click();
    await expect(page.getByRole("region", { name: "Sugerencias de revisión" })).toBeVisible();
    await expect(datosDeLaAlerta(page)).toContainText(destinatario);
    await expect(correo(page)).toHaveCount(0);
    await page.goto("/reports/mock-evaluation-2");
    await expect(page.getByRole("region", { name: "Alerta" })).toContainText(
      "Solo aviso interno",
    );
    await expect(correo(page)).toHaveCount(0);
  });
}
