import { test, expect, type Page } from "@playwright/test";
import {
  alertaMock,
  filasEscenarioMock,
  informeMock,
  resumenMock,
  resumenVacioMock,
} from "../src/shared/mocks";

async function simular(page: Page) {
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/resumen")
      return route.fulfill({ json: resumenMock });
    if (url.pathname === "/api/alertas")
      return route.fulfill({
        json: { items: [alertaMock], total: 1, page: 1, pageSize: 10 },
      });
    if (url.pathname === "/api/evaluaciones")
      return route.fulfill({
        json: {
          items: filasEscenarioMock,
          total: filasEscenarioMock.length,
          page: 1,
          pageSize: 20,
        },
      });
    return route.fulfill({ json: informeMock });
  });
}

test("T14: niveles, índice incompleto, proceso separado, ranking y alerta real del DTO", async ({
  page,
}) => {
  await simular(page);
  await page.goto("/home");
  const tabla = page.getByRole("region", {
    name: "Resultados de evaluaciones",
  });
  for (const nivel of ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"])
    await expect(tabla.getByText(nivel, { exact: true })).toBeVisible();
  await expect(
    tabla.getByRole("row").filter({ hasText: "INCOMPLETO" }),
  ).toContainText("83,71");
  await expect(
    tabla.getByRole("row").filter({ hasText: "EMP-004" }),
  ).toContainText("PENDIENTE");
  await expect(
    tabla.getByRole("row").filter({ hasText: "EMP-005" }),
  ).toContainText("FALLIDO");
  await tabla
    .getByRole("button", { name: "Ver informe", exact: true })
    .first()
    .click();
  const detalle = page.getByRole("region", {
    name: "Informe individual",
    exact: true,
  });
  await expect(
    detalle.getByRole("heading", { name: "Ranking de contribuciones" }),
  ).toBeVisible();
  await expect(
    detalle.getByRole("table").getByRole("row").nth(1),
  ).toContainText("HE · Horas extra");
  await expect(detalle).toContainText("Reglas v1");
  await expect(detalle).toContainText("SOSTENIDO");
  await expect(detalle).toContainText("Destinatario: TL-01");
  await expect(detalle).toContainText("NO_APLICA");
  await page.screenshot({
    path: "test-results/t14-escritorio.png",
    fullPage: true,
  });
});

test("T14: resultado obsoleto oculta índice/nivel actuales y conserva detalle histórico", async ({
  page,
}) => {
  await simular(page);
  await page.route("**/api/evaluaciones?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...filasEscenarioMock[0],
            actualizado: false,
            processingState: "PENDIENTE",
            alertId: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    }),
  );
  await page.route("**/api/evaluaciones/mock-evaluation-2", (route) =>
    route.fulfill({
      json: {
        ...informeMock,
        evaluacion: { ...informeMock.evaluacion, vigente: false },
        alerta: { ...alertaMock, vigencia: "SUPERADA" },
      },
    }),
  );
  await page.goto("/");
  const tabla = page.getByRole("region", {
    name: "Resultados de evaluaciones",
  });
  await expect(tabla).toContainText("Desactualizado");
  await expect(tabla).not.toContainText("91,21");
  await expect(tabla.getByText("ALTO", { exact: true })).toHaveCount(0);
  await tabla.getByRole("button", { name: "Ver resultado anterior" }).click();
  const detalle = page.getByRole("region", {
    name: "Informe individual",
    exact: true,
  });
  await expect(detalle).toContainText("no representa el nivel actual");
  await expect(detalle).toContainText("SUPERADA");
});

test("T14: filtros y paginaciones independientes preservan el denominador del resumen", async ({
  page,
}) => {
  await simular(page);
  const consultas: URL[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    consultas.push(url);
    if (url.pathname === "/api/resumen")
      return route.fulfill({ json: resumenMock });
    const alertas = url.pathname === "/api/alertas";
    return route.fulfill({
      json: {
        items: alertas ? [alertaMock] : [filasEscenarioMock[0]],
        total: 75,
        page: Number(url.searchParams.get("page")),
        pageSize: alertas ? 10 : 20,
      },
    });
  });
  await page.goto("/home");
  await page.getByLabel("Empleado (ID)").fill("ID inválido!");
  expect(
    await page
      .getByLabel("Empleado (ID)")
      .evaluate((input: HTMLInputElement) => input.validity.patternMismatch),
  ).toBe(true);
  await page.getByLabel("Empleado (ID)").fill("EMP-001");
  await page.getByLabel("Equipo (ID)").fill("EQ-01");
  await page.getByLabel("Semana desde (lunes)").fill("2026-10-12");
  await page.getByLabel("Nivel de evaluación").selectOption("ALTO");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByText("Alcance:", { exact: false })).toContainText(
    "2026-10-12",
  );
  for (const ruta of ["/api/resumen", "/api/alertas", "/api/evaluaciones"]) {
    const url = consultas.filter((u) => u.pathname === ruta).at(-1)!;
    expect(url.searchParams.get("employeeId")).toBe("EMP-001");
    expect(url.searchParams.get("teamId")).toBe("EQ-01");
    expect(url.searchParams.has("nivel")).toBe(ruta === "/api/evaluaciones");
    if (ruta === "/api/resumen")
      expect([...url.searchParams.keys()].sort()).toEqual([
        "employeeId",
        "periodStart",
        "teamId",
      ]);
  }
  await page
    .getByRole("navigation", { name: "Páginas de evaluaciones" })
    .getByRole("button", { name: "Siguiente" })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Páginas de evaluaciones" }),
  ).toContainText("Página 2");
  await page
    .getByRole("navigation", { name: "Páginas de alertas" })
    .getByRole("button", { name: "Siguiente" })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Páginas de alertas" }),
  ).toContainText("Página 2");
  await expect(
    page.getByRole("navigation", { name: "Páginas de evaluaciones" }),
  ).toContainText("Página 2");
  await page.getByRole("button", { name: "Limpiar", exact: true }).click();
  await expect(page.getByLabel("Empleado (ID)")).toHaveValue("");
  await expect(
    page.getByRole("navigation", { name: "Páginas de evaluaciones" }),
  ).toContainText("Página 1");
});

test("T14: vacío, error HTTP, respuesta no JSON y pérdida de conexión permiten recuperar", async ({
  page,
}) => {
  let modo = "vacio";
  await page.route("**/api/**", (route) => {
    if (modo === "red") return route.abort();
    if (modo === "html")
      return route.fulfill({
        status: 500,
        contentType: "text/html",
        body: "Error",
      });
    if (modo === "http")
      return route.fulfill({
        status: 400,
        json: {
          error: {
            mensaje: "periodStart debe ser lunes",
            codigo: "PETICION_INVALIDA",
            detalles: [],
          },
        },
      });
    return route.fulfill({
      json: route.request().url().includes("/resumen")
        ? resumenVacioMock
        : { items: [], total: 0, page: 1, pageSize: 20 },
    });
  });
  await page.goto("/home");
  await expect(
    page.getByText("No hay evaluaciones para estos filtros.", { exact: false }),
  ).toBeVisible();
  for (const [nuevoModo, texto] of [
    ["http", "periodStart debe ser lunes"],
    ["html", "JSON válida"],
    ["red", "No se pudo conectar"],
  ]) {
    modo = nuevoModo;
    await page.getByRole("button", { name: "Actualizar resultados" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      texto,
    );
    await expect(
      page.getByText("No hay evaluaciones para estos filtros.", {
        exact: false,
      }),
    ).toHaveCount(0);
  }
  modo = "vacio";
  await page.getByRole("button", { name: "Reintentar consulta" }).click();
  await expect(
    page.getByText("No hay alertas activas para estos filtros."),
  ).toBeVisible();
});

test("T14: carga y respuestas demoradas no reemplazan una consulta más reciente", async ({
  page,
}) => {
  await simular(page);
  let liberar!: () => void;
  const pendiente = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  await page.route("**/api/evaluaciones?*", async (route) => {
    const viejo =
      new URL(route.request().url()).searchParams.get("employeeId") ===
      "EMP-OLD";
    if (viejo) await pendiente;
    await route
      .fulfill({
        json: {
          items: viejo
            ? [{ ...filasEscenarioMock[0], nombre: "Respuesta anterior" }]
            : [],
          total: viejo ? 1 : 0,
          page: 1,
          pageSize: 20,
        },
      })
      .catch(() => {});
  });
  await page.goto("/home");
  await expect(
    page.getByText("No hay evaluaciones para estos filtros.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Empleado (ID)").fill("EMP-OLD");
  const enviada = page.waitForRequest((r) =>
    r.url().includes("employeeId=EMP-OLD"),
  );
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await enviada;
  await expect(page.getByText("Cargando resultados…")).toBeVisible();
  await page.getByRole("button", { name: "Limpiar", exact: true }).click();
  await expect(
    page.getByText("No hay evaluaciones para estos filtros.", { exact: false }),
  ).toBeVisible();
  liberar();
  await expect(page.getByText("Respuesta anterior")).toHaveCount(0);
});

test("T14: informe 404 recuperable, historial insuficiente y alerta sin destinatario", async ({
  page,
}) => {
  await simular(page);
  let falla = true;
  await page.route("**/api/evaluaciones/mock-evaluation-2", (route) =>
    falla
      ? route.fulfill({
          status: 404,
          json: { error: { mensaje: "Evaluación inexistente" } },
        })
      : route.fulfill({
          json: {
            ...informeMock,
            evaluacion: {
              ...informeMock.evaluacion,
              nivel: "INCOMPLETO",
              persistencia: {
                anterior: null,
                motivo: "HISTORIAL_INSUFICIENTE",
                cumple: false,
                comunesExcedidas: [],
              },
            },
            alerta: null,
          },
        }),
  );
  await page.route("**/api/alertas?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...alertaMock,
            destinatarioId: null,
            motivoDestinatario: "SIN_DESTINATARIO",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      },
    }),
  );
  await page.goto("/home");
  await expect(
    page.getByText("SIN_DESTINATARIO · Revisar", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ver informe de alerta" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Evaluación inexistente",
  );
  falla = false;
  await page.getByRole("button", { name: "Reintentar informe" }).click();
  const detalle = page.getByRole("region", {
    name: "Informe individual",
    exact: true,
  });
  await expect(detalle).toContainText("Historial insuficiente");
  await expect(detalle).toContainText("Sin alerta asociada");
});

test("T14: móvil sin desbordes de página y tablas accesibles por desplazamiento", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simular(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ver informe", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Ranking de contribuciones" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/t14-movil.png", fullPage: true });
});
