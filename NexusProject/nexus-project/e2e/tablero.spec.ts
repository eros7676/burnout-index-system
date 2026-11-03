import { test, expect, type Page } from "@playwright/test";
import type { FactorInforme } from "../src/shared/contracts";
import { alertaMock, informeMock, resumenVacioMock } from "../src/shared/mocks";
import {
  alerta,
  api,
  cargando,
  celda,
  datos,
  demo,
  informe,
  menu,
  PERSONAS,
  personas,
  resumen,
  sinDesbordeHorizontal,
} from "./demo";

// T14 on the rebuilt screens: Resumen (/home), Personas (/employees and the
// person's page), Alertas and the Informe page (/reports/[evaluationId]).

const listaPersonas = (page: Page) =>
  page.getByRole("region", { name: "Personas", exact: true });
const semanasDe = (page: Page, nombre: string) =>
  page.getByRole("region", { name: `Semanas de ${nombre}` });

test("T14: cuatro niveles con Incompleto explícito y el procesamiento separado del nivel", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await page.goto("/employees");
  const tabla = listaPersonas(page);
  for (const [persona, nivel, indice] of [
    ["Persona ficticia 001", "Alto", "91,21"],
    ["Persona ficticia 002", "Bajo", "0,00"],
    ["Persona ficticia 003", "Medio", "48,93"],
    // Incompleto keeps its numeric index: it is a gap in history, not a failure.
    ["Persona ficticia 006", "Incompleto", "83,71"],
  ]) {
    await expect(await celda(tabla, persona, "Nivel")).toHaveText(nivel);
    await expect(await celda(tabla, persona, "Índice")).toHaveText(indice);
  }
  // A week waiting for its calculation has no level yet; a failed one keeps none.
  await expect(await celda(tabla, "Persona ficticia 004", "Nivel")).toHaveText(
    "Sin evaluación",
  );
  await expect(await celda(tabla, "Persona ficticia 005", "Nivel")).toHaveText(
    "Desactualizado",
  );
  await expect(await celda(tabla, "Persona ficticia 005", "Índice")).toHaveText(
    "—",
  );

  // The person's page names the processing state beside the level, never as one.
  await tabla.getByRole("link", { name: "Persona ficticia 005" }).click();
  await expect(page).toHaveURL(/\/employees\/EMP-005$/);
  const semanas005 = semanasDe(page, "Persona ficticia 005");
  const fallida = await celda(semanas005, "12–18 oct 2026", "Nivel");
  await expect(fallida).toContainText("Desactualizado");
  await expect(fallida).toContainText("Falló el cálculo");
  await expect(await celda(semanas005, "12–18 oct 2026", "Índice")).toHaveText(
    "—",
  );
  await expect(await celda(semanas005, "5–11 oct 2026", "Nivel")).toHaveText(
    "Medio",
  );
  await expect(page.getByRole("main")).not.toContainText("77,70", {
    useInnerText: true,
  });
  await expect(
    page.getByText("El cálculo falló; el nivel anterior no está vigente."),
  ).toBeVisible();

  await page.goto("/employees/EMP-004");
  const pendiente = await celda(
    semanasDe(page, "Persona ficticia 004"),
    "12–18 oct 2026",
    "Nivel",
  );
  await expect(pendiente).toContainText("Sin evaluación");
  await expect(pendiente).toContainText("Espera recálculo");

  // The overview counts only calculated results and says how many are waiting.
  await page.route(api("/api/resumen"), (route) =>
    route.fulfill({ json: resumen({ noProcesados: 2 }) }),
  );
  await page.goto("/home");
  await expect(
    page.getByText(
      "2 evaluaciones de esta semana esperan cálculo y no se cuentan.",
    ),
  ).toBeVisible();
});

test("T14: un resultado desactualizado nunca se muestra como nivel actual y el informe histórico se identifica", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await page.route(api("/api/evaluaciones/mock-evaluation-stale"), (route) =>
    route.fulfill({
      json: informe("mock-evaluation-stale", {
        empleado: { employeeId: "EMP-007", nombre: "Persona ficticia 007" },
        evaluacion: { indice: 88.88 },
      }),
    }),
  );
  await page.route(api("/api/evaluaciones/mock-evaluation-old"), (route) =>
    route.fulfill({
      json: informe("mock-evaluation-old", {
        evaluacion: { vigente: false },
        alerta: { vigencia: "SUPERADA" },
      }),
    }),
  );

  await page.goto("/home");
  const enAlto = page.getByRole("region", { name: "Personas en nivel Alto" });
  await expect(enAlto.getByRole("row")).toHaveCount(2);
  await expect(enAlto).toContainText("Persona ficticia 001");
  await expect(enAlto).not.toContainText("Persona ficticia 007");
  await expect(enAlto).not.toContainText("Persona ficticia 005");

  await page.goto("/employees");
  const tabla = listaPersonas(page);
  await expect(await celda(tabla, "Persona ficticia 007", "Nivel")).toHaveText(
    "Desactualizado",
  );
  await expect(await celda(tabla, "Persona ficticia 007", "Índice")).toHaveText(
    "—",
  );
  await expect(tabla).not.toContainText("88,88");
  await page
    .getByRole("combobox", { name: "Nivel" })
    .selectOption({ label: "Alto" });
  await expect(tabla.getByRole("row")).toHaveCount(2);
  await expect(tabla).toContainText("Persona ficticia 001");

  // The stale week keeps its report, which says the level is not the current one.
  await page.goto("/employees/EMP-007");
  const semanas = semanasDe(page, "Persona ficticia 007");
  await expect(await celda(semanas, "12–18 oct 2026", "Nivel")).toContainText(
    "Desactualizado",
  );
  await expect(semanas).not.toContainText("88,88");
  await semanas
    .getByRole("link", { name: "Ver informe de 12–18 oct 2026" })
    .click();
  await expect(page).toHaveURL(/\/reports\/mock-evaluation-stale$/);
  await expect(page.getByRole("main")).toContainText(
    "Resultado desactualizado",
  );
  await expect(page.getByText("Nivel calculado")).toBeVisible();

  // A superseded evaluation reads as historical and points to the current one.
  await page.goto("/reports/mock-evaluation-old");
  await expect(page.getByRole("main")).toContainText("Resultado histórico");
  await expect(page.getByText("Nivel calculado")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ver el resultado actual" }),
  ).toHaveAttribute("href", "/reports/mock-evaluation-2");
  const seccionAlerta = page.getByRole("region", { name: "Alerta" });
  await expect(seccionAlerta).toContainText("Superada");
  await expect(seccionAlerta).toContainText(
    "Alerta superada: solo queda su historial.",
  );
  await expect(
    seccionAlerta.getByRole("button", { name: /^Simular/ }),
  ).toHaveCount(0);
});

test("T14: el informe muestra el ranking del servidor, las reglas, la persistencia y la alerta guardada", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  // The server's ranking order is shown as sent; the browser never re-sorts it.
  const orden = ["DS", "HE", "VP", "CT"] as const;
  await page.route(api("/api/evaluaciones/mock-evaluation-2"), (route) =>
    route.fulfill({
      json: informe("mock-evaluation-2", {
        factores: orden.map(
          (codigo) =>
            informeMock.factores.find(
              (f) => f.codigo === codigo,
            ) as FactorInforme,
        ),
      }),
    }),
  );
  await page.goto("/reports/mock-evaluation-2");
  await expect(
    page.getByRole("heading", { level: 1, name: "Persona ficticia 001" }),
  ).toBeVisible();
  await expect(
    page.getByText("Semana 12–18 oct 2026, Célula ficticia 1"),
  ).toBeVisible();
  const resultado = page.getByRole("region", {
    name: "Resultado de la semana",
  });
  await expect(resultado).toContainText("91,21");
  await expect(resultado).toContainText("Alto");
  await expect(
    resultado.getByRole("link", { name: "Reglas v1" }),
  ).toHaveAttribute("href", "/rules-config");
  const factores = page.getByRole("region", {
    name: "Factores, por aporte al índice",
  });
  await expect(factores.getByRole("rowheader")).toHaveText([
    /^Días seguidos sin descanso/,
    /^Horas extra/,
    /^Vacaciones pendientes/,
    /^Carga de tareas/,
    "Índice de la semana",
  ]);
  const anterior = page.getByRole("region", { name: "Semana anterior" });
  await expect(anterior).toContainText(
    "La carga alta se sostiene dos semanas seguidas, con factores en común.",
  );
  await expect(anterior).toContainText("5–11 oct 2026");
  await expect(anterior).toContainText("83,71");
  const seccionAlerta = page.getByRole("region", { name: "Alerta" });
  await expect(seccionAlerta).toContainText("Team Lead ficticio 1");
  await expect(seccionAlerta).toContainText("Solo aviso interno");
  await expect(seccionAlerta).toContainText("Activa");
  await page.screenshot({
    path: "test-results/t14-escritorio.png",
    fullPage: true,
  });
});

test("T14: el resumen se consulta por semana, sin otros filtros, y cambia con la semana elegida", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos: URL[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname === "/api/resumen") pedidos.push(url);
  });
  await page.goto("/home");
  const enAlto = page.getByRole("region", { name: "Personas en nivel Alto" });
  await expect(enAlto).toContainText("Persona ficticia 001");
  await expect(enAlto.getByRole("link", { name: "91,21" })).toHaveAttribute(
    "href",
    "/reports/mock-evaluation-2",
  );
  await expect(page.getByText("de 8 personas")).toBeVisible();
  expect(pedidos.at(-1)!.search).toBe("?periodStart=2026-10-12");

  // Teams: only groups of five or more show their distribution.
  const equipos = page.getByRole("region", { name: "Por equipo" });
  await expect(
    equipos.getByRole("link", { name: "Célula ficticia 1" }),
  ).toHaveAttribute("href", "/employees?equipo=EQ-01");
  await expect(equipos).toContainText("Grupo demasiado chico para mostrar.");

  await page
    .getByRole("combobox", { name: "Semana" })
    .selectOption("2026-10-05");
  await expect(enAlto).toContainText("Persona ficticia 007");
  await expect(enAlto).not.toContainText("Persona ficticia 001");
  await expect
    .poll(() => pedidos.at(-1)!.search)
    .toBe("?periodStart=2026-10-05");

  // A Team Lead reads the same overview of their team, without teams or imports.
  await page.getByLabel("Usuario de demostración").selectOption("demo-tl-01");
  await expect(page.getByLabel("Usuario de demostración")).toHaveValue(
    "demo-tl-01",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Resumen" }),
  ).toBeVisible();
  await expect(enAlto).toBeVisible();
  await expect(page.getByRole("region", { name: "Por equipo" })).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("link", { name: "Importar datos" }),
  ).toHaveCount(0);
});

test("T14: vacío, error HTTP, respuesta no JSON y pérdida de conexión se recuperan con Reintentar", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  let modo = "vacio";
  await page.route(datos, (route) => {
    if (modo === "datos") return route.fallback();
    if (modo === "red") return route.abort();
    if (modo === "html")
      return route.fulfill({
        status: 500,
        contentType: "text/html",
        body: "<h1>Error</h1>",
      });
    if (modo === "http")
      return route.fulfill({
        status: 400,
        json: {
          error: {
            codigo: "PETICION_INVALIDA",
            mensaje: "periodStart debe ser lunes",
            detalles: [],
          },
        },
      });
    const ruta = new URL(route.request().url()).pathname;
    return route.fulfill({
      json:
        ruta === "/api/resumen"
          ? resumenVacioMock
          : ruta === "/api/personas"
            ? // A fresh install: people in the catalog, no week imported yet.
              personas(
                {},
                PERSONAS.map((p) => ({ ...p, semanas: [] })),
              )
            : { items: [], total: 0, page: 1, pageSize: 100 },
    });
  });
  for (const ruta of ["/home", "/employees", "/teams"]) {
    await page.goto(ruta);
    await expect(
      page.getByText("Todavía no hay semanas cargadas"),
    ).toBeVisible();
    await expect(cargando(page)).toHaveCount(0);
  }
  await page.goto("/home");
  await expect(
    page.getByRole("main").getByRole("link", { name: "Importar datos" }),
  ).toHaveCount(2);

  modo = "http";
  await page.reload();
  for (const [siguiente, texto] of [
    ["html", "periodStart debe ser lunes"],
    ["red", "JSON válida"],
    ["datos", "No se pudo conectar"],
  ]) {
    await expect(alerta(page)).toContainText(texto);
    // A failed read shows no results and does not claim to be loading.
    await expect(
      page.getByRole("region", { name: "Personas en nivel Alto" }),
    ).toHaveCount(0);
    await expect(cargando(page)).toHaveCount(0);
    modo = siguiente;
    await alerta(page).getByRole("button", { name: "Reintentar" }).click();
  }
  await expect(
    page.getByRole("region", { name: "Personas en nivel Alto" }),
  ).toContainText("Persona ficticia 001");
  await expect(alerta(page)).toHaveCount(0);

  // The same recovery on the list screens.
  for (const ruta of ["/employees", "/alerts"]) {
    modo = "http";
    await page.goto(ruta);
    await expect(alerta(page)).toContainText("periodStart debe ser lunes");
    await expect(cargando(page)).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("table")).toHaveCount(0);
    modo = "datos";
    await alerta(page).getByRole("button", { name: "Reintentar" }).click();
    await expect(page.getByRole("main").getByRole("table")).toBeVisible();
    await expect(alerta(page)).toHaveCount(0);
  }
});

test("T14: una respuesta demorada no reemplaza la de una semana o persona elegida después", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  let liberar!: () => void;
  const demorada = new Promise<void>((resolve) => (liberar = resolve));
  let entregada!: () => void;
  const fin = new Promise<void>((resolve) => (entregada = resolve));
  await page.route(api("/api/resumen"), async (route) => {
    const semana = new URL(route.request().url()).searchParams.get(
      "periodStart",
    );
    if (semana !== "2026-10-05")
      return route.fulfill({
        json: resumen({ promedioIndice: 47.55, muestraPromedio: 5 }),
      });
    await demorada;
    await route
      .fulfill({ json: resumen({ promedioIndice: 11.11, muestraPromedio: 9 }) })
      .catch(() => {});
    entregada();
  });
  await page.goto("/home");
  const promedio = page.getByText(/^Índice promedio/);
  await expect(promedio).toContainText("47,55 en 5 evaluaciones");

  const enviada = page.waitForRequest((r) =>
    r.url().includes("periodStart=2026-10-05"),
  );
  await page
    .getByRole("combobox", { name: "Semana" })
    .selectOption("2026-10-05");
  await enviada;
  await expect(promedio).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Semana" })
    .selectOption("2026-10-12");
  await expect(promedio).toContainText("47,55 en 5 evaluaciones");
  liberar();
  await fin;
  await expect(promedio).toContainText("47,55 en 5 evaluaciones");
  await expect(page.getByText("11,11")).toHaveCount(0);

  // Same for a person: a late answer for the previous person never shows.
  let liberarPersona!: () => void;
  const personaDemorada = new Promise<void>((r) => (liberarPersona = r));
  let personaEntregada!: () => void;
  const finPersona = new Promise<void>((r) => (personaEntregada = r));
  await page.route(api("/api/personas"), async (route) => {
    const filtro = Object.fromEntries(
      new URL(route.request().url()).searchParams,
    );
    if (filtro.employeeId !== "EMP-001")
      return route.fulfill({ json: personas(filtro) });
    await personaDemorada;
    await route.fulfill({ json: personas(filtro) }).catch(() => {});
    personaEntregada();
  });
  await page.goto("/employees/EMP-001");
  await expect(cargando(page).first()).toBeVisible();
  await menu(page).getByRole("link", { name: "Personas" }).click();
  await listaPersonas(page)
    .getByRole("link", { name: "Persona ficticia 003" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Persona ficticia 003" }),
  ).toBeVisible();
  liberarPersona();
  await finPersona;
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Persona ficticia 003",
  );
  // innerText: Next keeps the previous route mounted but hidden (Activity).
  await expect(page.getByRole("main")).not.toContainText(
    "Persona ficticia 001",
    { useInnerText: true },
  );
});

test("T14: informe 404 recuperable, historial insuficiente y alerta sin destinatario visible", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await page.route(api("/api/alertas"), (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...alertaMock,
            destinatarioId: null,
            motivoDestinatario: "SIN_DESTINATARIO",
            estadoEnvio: "SIN_DESTINATARIO",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      },
    }),
  );
  let falla = true;
  await page.route(api("/api/evaluaciones/mock-evaluation-2"), (route) =>
    falla
      ? route.fulfill({
          status: 404,
          json: {
            error: {
              codigo: "NO_ENCONTRADO",
              mensaje: "Evaluación inexistente",
              detalles: [],
            },
          },
        })
      : route.fulfill({
          json: informe("mock-evaluation-2", {
            evaluacion: {
              nivel: "INCOMPLETO",
              indice: 83.71,
              persistencia: {
                anterior: null,
                motivo: "HISTORIAL_INSUFICIENTE",
                cumple: false,
                comunesExcedidas: [],
              },
            },
            alerta: null,
          }),
        }),
  );
  await page.goto("/alerts");
  const alertas = page.getByRole("region", { name: "Alertas activas" });
  await expect(
    await celda(alertas, "Persona ficticia 001", "Destinatario"),
  ).toHaveText("Sin destinatario");
  await expect(
    page.getByText(
      "1 alerta no tiene a quién avisar: falta el responsable en el catálogo.",
    ),
  ).toBeVisible();

  await alertas.getByRole("link", { name: "Ver informe" }).click();
  await expect(page).toHaveURL(/\/reports\/mock-evaluation-2$/);
  await expect(alerta(page)).toContainText("Evaluación inexistente");
  falla = false;
  await alerta(page).getByRole("button", { name: "Reintentar" }).click();
  const resultado = page.getByRole("region", {
    name: "Resultado de la semana",
  });
  await expect(resultado).toContainText("Incompleto");
  await expect(resultado).toContainText("83,71");
  await expect(
    page.getByText(
      "No hay semana anterior para confirmar si la carga se sostiene.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Esta semana no generó una alerta."),
  ).toBeVisible();
  await expect(alerta(page)).toHaveCount(0);
});

test("T14: en pantalla angosta ninguna página desborda y las tablas se desplazan solas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, "demo-rrhh");
  for (const [ruta, listo] of [
    ["/home", "Personas en nivel Alto"],
    ["/employees", "Personas"],
    ["/employees/EMP-001", "Semanas de Persona ficticia 001"],
    ["/reports/mock-evaluation-2", "Factores, por aporte al índice"],
    ["/alerts", "Alertas activas"],
    ["/teams", null],
  ] as const) {
    await page.goto(ruta);
    if (listo) {
      const tabla = page.getByRole("region", { name: listo, exact: true });
      await expect(tabla).toBeVisible();
      // The table scrolls inside its own keyboard-focusable region.
      await expect(tabla).toHaveAttribute("tabindex", "0");
    } else {
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(cargando(page)).toHaveCount(0);
    }
    await sinDesbordeHorizontal(page);
  }
  await page.goto("/reports/mock-evaluation-2");
  await expect(
    page.getByRole("region", { name: "Factores, por aporte al índice" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/t14-movil.png", fullPage: true });
});
