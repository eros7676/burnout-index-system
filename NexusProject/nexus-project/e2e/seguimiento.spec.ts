import { test, expect, type Page } from "@playwright/test";
import {
  alertaListadaMock,
  paginaAlertasMock,
} from "../src/shared/mocks";
import {
  seguimientoMock,
  type CasoSeguimientoDTO,
} from "../src/shared/contratos/seguimiento";
import { alerta as fallo, api, celda, demo } from "./demo";
import {
  RUTA_ALERTA,
  referencia,
  resumenDe,
  servidorSeguimiento,
  type ServidorSeguimiento,
} from "./seguimiento-mocks";

// The alert's page and its follow-up case (D4, D8), and the filters and the CSV export of the list.
// Mocked server (e2e/seguimiento-mocks.ts); who may do what comes from the server's `permisos`.

const lista = (page: Page) =>
  page.getByRole("region", { name: "Alertas activas" });
const seguimiento = (page: Page) =>
  page.getByRole("region", { name: "Seguimiento", exact: true });

/** The list as the server would answer it for the case that the mocked server holds. */
async function listaConSeguimiento(page: Page, servidor: ServidorSeguimiento) {
  await page.route(api("/api/alertas"), (route) =>
    route.fulfill({
      json: {
        ...paginaAlertasMock,
        items: [
          { ...alertaListadaMock, seguimiento: resumenDe(servidor.caso) },
        ],
      },
    }),
  );
}

test("RR. HH. abre el seguimiento desde la alerta, lo gestiona y lo cierra; la lista lo refleja", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const servidor = await servidorSeguimiento(page, "demo-rrhh");
  await listaConSeguimiento(page, servidor);

  // The list has no inline panel: the row's person links to the alert's page.
  await page.goto("/alerts");
  await expect(
    await celda(lista(page), "Persona ficticia 001", "Seguimiento"),
  ).toContainText("Sin seguimiento");
  await expect(lista(page).getByRole("button", { name: /Sugerencias/ })).toHaveCount(0);
  await lista(page).getByRole("link", { name: "Persona ficticia 001" }).click();
  await expect(page).toHaveURL(new RegExp(`${RUTA_ALERTA}$`));
  await expect(
    page.getByRole("main").getByRole("link", { name: "Alertas" }),
  ).toBeVisible();
  const datos = page.getByRole("region", { name: "Datos de la alerta" });
  for (const hecho of [
    "Persona ficticia 001",
    "Célula ficticia 1",
    "12–18 oct 2026",
    "91,21",
    "Alto",
    "Team Lead ficticio 1",
    "Activa",
  ])
    await expect(datos).toContainText(hecho);
  await expect(page.getByRole("region", { name: "Factores" })).toBeVisible();

  // Open it; the owner starts as the alert's recipient.
  const seg = seguimiento(page);
  const abrir = seg.getByRole("form", { name: "Abrir seguimiento" });
  await expect(abrir.getByLabel("Responsable")).toHaveValue("demo-tl-01");
  await abrir.getByRole("button", { name: "Abrir seguimiento" }).click();
  const actualizar = seg.getByRole("form", { name: "Actualizar seguimiento" });
  await expect(actualizar).toBeVisible();
  expect(servidor.escrituras[0]).toMatchObject({
    metodo: "POST",
    cuerpo: { asignadoA: "demo-tl-01" },
  });

  // «En curso» needs a due date: the refusal shows under the field, and only what changed is sent.
  await actualizar.getByLabel("Estado").selectOption("EN_CURSO");
  await actualizar.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(actualizar).toContainText(
    "Un seguimiento en curso requiere fecha de vencimiento.",
  );
  await actualizar.getByLabel("Fecha de vencimiento").fill("2026-11-20");
  await actualizar.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(actualizar.getByRole("status")).toHaveText(
    "Se actualizó el seguimiento.",
  );
  await expect(seg).toContainText("20 nov 2026");
  expect(servidor.escrituras.slice(1).map((e) => e.cuerpo)).toEqual([
    { estado: "EN_CURSO" },
    { estado: "EN_CURSO", vence: "2026-11-20" },
  ]);

  // A measure answers a factor; the closure by measures waits until all are done.
  const medida = seg.getByRole("form", { name: "Registrar medida" });
  await medida.getByLabel("Tipo de medida").selectOption("REDISTRIBUIR_TAREAS");
  await expect(medida.getByLabel("Factor")).toHaveValue("CT");
  await medida.getByRole("button", { name: "Registrar medida" }).click();
  const medidas = seg.getByRole("region", { name: "Medidas del seguimiento" });
  await expect(medidas).toContainText("Redistribuir tareas");
  await expect(medidas).toContainText("Pendiente");

  const nota = seg.getByRole("form", { name: "Agregar nota" });
  await nota
    .getByLabel("Nota")
    .fill("Se acordó revisar las tareas de la semana con el equipo.");
  await nota.getByRole("button", { name: "Agregar nota" }).click();
  await expect(
    seg.getByRole("list", { name: "Notas del seguimiento" }),
  ).toContainText("Se acordó revisar las tareas");

  const cierre = seg.getByRole("form", { name: "Cerrar seguimiento" });
  await cierre.getByLabel("Motivo de cierre").selectOption("MEDIDAS_IMPLEMENTADAS");
  await cierre
    .getByLabel("Justificación")
    .fill("Se redistribuyeron las tareas del equipo.");
  await cierre.getByRole("button", { name: "Cerrar seguimiento" }).click();
  // Closing asks once more; the server then refuses while a measure is pending.
  await expect(cierre).toContainText("¿Cerrar el seguimiento?");
  await cierre.getByRole("button", { name: "Cerrar seguimiento" }).click();
  await expect(cierre).toContainText(
    "registre al menos una medida y marque todas como hechas",
  );
  await expect(seg.getByRole("form", { name: "Actualizar seguimiento" })).toBeVisible();

  await medidas.getByRole("button", { name: "Marcar como hecha" }).click();
  await expect(medidas).toContainText("Hecha");
  await cierre.getByRole("button", { name: "Cerrar seguimiento" }).click();
  await cierre.getByRole("button", { name: "Cerrar seguimiento" }).click();

  // Closed is final: no form is left, the reason and the closing note stay.
  await expect(seg.getByRole("form")).toHaveCount(0);
  await expect(seg).toContainText("Motivo de cierre");
  await expect(seg).toContainText("Medidas implementadas");
  await expect(
    seg.getByRole("list", { name: "Notas del seguimiento" }),
  ).toContainText("Se redistribuyeron las tareas del equipo.");

  // Back to the list, which shows the case.
  await page.getByRole("main").getByRole("link", { name: "Alertas" }).click();
  await expect(
    await celda(lista(page), "Persona ficticia 001", "Seguimiento"),
  ).toContainText("Cerrado");
});

test("un Team Lead toma el seguimiento a su cargo; Gerencia no puede abrirlo sobre un técnico", async ({
  page,
}) => {
  await demo(page, "demo-tl-01");
  const servidor = await servidorSeguimiento(page, "demo-tl-01", {
    permisos: { abrir: true, gestionar: true, anotar: true, reasignar: false },
  });
  await page.goto(RUTA_ALERTA);
  const abrir = seguimiento(page).getByRole("form", { name: "Abrir seguimiento" });
  await expect(abrir).toContainText("El seguimiento quedará a su cargo.");
  await expect(abrir.getByLabel("Responsable")).toHaveCount(0);
  await abrir.getByRole("button", { name: "Abrir seguimiento" }).click();
  await expect(seguimiento(page)).toContainText("Team Lead, Célula ficticia 1 (usted)");
  expect(servidor.escrituras[0].cuerpo).toEqual({});
  // Without the right to reassign, the owner is changed only by taking the case.
  await expect(
    seguimiento(page)
      .getByRole("form", { name: "Actualizar seguimiento" })
      .getByLabel("Responsable"),
  ).toHaveCount(0);

  const otra = await page.context().newPage();
  await demo(otra, "demo-gerencia");
  await servidorSeguimiento(otra, "demo-gerencia", {
    permisos: { abrir: false, gestionar: false, anotar: false, reasignar: false },
  });
  await otra.goto(RUTA_ALERTA);
  await expect(seguimiento(otra)).toContainText(
    "Esta alerta no tiene seguimiento. Puede iniciarlo RR. HH. o el destinatario de la alerta.",
  );
  await expect(seguimiento(otra).getByRole("form")).toHaveCount(0);
});

test("las notas internas solo se leen con permiso; quien no puede leerlas ve cuántas hay", async ({
  page,
}) => {
  await demo(page, "demo-tl-01");
  const caso: CasoSeguimientoDTO = {
    ...seguimientoMock.caso!,
    asignadoA: referencia("demo-rrhh"),
  };
  await servidorSeguimiento(page, "demo-tl-01", {
    caso,
    notasVisibles: false,
    permisos: { abrir: false, gestionar: false, anotar: false, reasignar: false },
  });
  await page.goto(RUTA_ALERTA);
  const seg = seguimiento(page);
  await expect(seg).toContainText("El seguimiento tiene 1 nota interna.");
  await expect(seg).toContainText(
    "Las notas son reservadas a RR. HH. y a quien tiene a cargo el seguimiento.",
  );
  await expect(page.getByText("Se acordó revisar la asignación")).toHaveCount(0);
  // Read-only: no form to change or close the case.
  await expect(seg.getByRole("form")).toHaveCount(0);
  await expect(seg.getByRole("button")).toHaveCount(0);
});

test("la lista filtra en el servidor, guarda los filtros en la dirección y pagina", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos: URLSearchParams[] = [];
  const enCurso = {
    casoId: "mock-caso-1",
    estado: "EN_CURSO" as const,
    asignadoA: referencia("demo-tl-01"),
    vence: "2026-10-01",
    vencido: true,
  };
  await page.route(api("/api/alertas"), (route) => {
    const q = new URL(route.request().url()).searchParams;
    pedidos.push(q);
    return route.fulfill({
      json: {
        ...paginaAlertasMock,
        total: 60,
        page: Number(q.get("page") ?? 1),
        pageSize: 25,
        items: [{ ...alertaListadaMock, seguimiento: enCurso }],
      },
    });
  });
  // The list's own read; the summary's counts are one-row reads beside it.
  const ultimo = () => Object.fromEntries(pedidos.filter((q) => q.get("pageSize") !== "1").at(-1) ?? []);

  await page.goto("/alerts");
  const fila = await celda(lista(page), "Persona ficticia 001", "Seguimiento");
  await expect(fila).toContainText("En curso");
  await expect(fila).toContainText("Vencido");
  await expect(fila).toContainText("Team Lead, Célula ficticia 1, vence el 1 oct 2026");
  expect(ultimo()).toEqual({ page: "1", pageSize: "25" });
  await expect(page.getByRole("status").filter({ hasText: "60 alertas" })).toContainText(
    "60 alertas de 1 persona; 60 sin seguimiento, 60 con el seguimiento vencido.",
  );
  await expect(page.getByRole("link", { name: "60 sin seguimiento" })).toHaveAttribute(
    "href",
    "/alerts?seguimiento=SIN_SEGUIMIENTO",
  );
  await expect(page.getByLabel("Destinatario")).toHaveCount(0);
  await expect(page.getByText("Página 1 de 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "Quitar filtros" })).toHaveCount(0);

  await page.getByLabel("Seguimiento", { exact: true }).selectOption({ label: "En curso" });
  await expect(page).toHaveURL(/seguimiento=EN_CURSO/);
  await expect.poll(ultimo).toMatchObject({ seguimiento: "EN_CURSO", page: "1" });
  await page.getByLabel("Responsable").selectOption("demo-tl-01");
  await page.getByLabel("Vencimiento").selectOption("1");
  await expect
    .poll(ultimo)
    .toMatchObject({ seguimiento: "EN_CURSO", asignadoA: "demo-tl-01", vencido: "1" });

  // Paging keeps the filters; changing a filter goes back to the first page.
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect.poll(ultimo).toMatchObject({ page: "2", seguimiento: "EN_CURSO" });
  await page.getByLabel("Vencimiento").selectOption("");
  await expect(page).not.toHaveURL(/pagina=/);
  await expect.poll(ultimo).toMatchObject({ page: "1" });
  expect(ultimo()).not.toHaveProperty("vencido");

  await page.getByRole("button", { name: "Quitar filtros" }).first().click();
  await expect(page).toHaveURL(/\/alerts$/);
  await expect.poll(ultimo).toEqual({ page: "1", pageSize: "25" });

  // The address is the state: a reload, or a link from a detail page, brings the same list back.
  await page.goto("/alerts?seguimiento=EN_CURSO&pagina=2");
  await expect.poll(ultimo).toMatchObject({ seguimiento: "EN_CURSO", page: "2" });
  await expect(page.getByLabel("Seguimiento", { exact: true })).toHaveValue("EN_CURSO");
});

test("sin alertas que coincidan con los filtros, la lista lo dice y permite quitarlos", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await page.route(api("/api/alertas"), (route) =>
    route.fulfill({
      json: { ...paginaAlertasMock, items: [], total: 0 },
    }),
  );
  await page.goto("/alerts?seguimiento=CERRADO");
  await expect(
    page.getByText("Ninguna alerta coincide con los filtros aplicados"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtros" }).last().click();
  await expect(page).toHaveURL(/\/alerts$/);
  await expect(page.getByText("No hay alertas esperando revisión")).toBeVisible();
});

test("un Team Lead no ve el filtro de equipo; RR. HH. sí", async ({ page }) => {
  await demo(page, "demo-tl-01");
  await page.goto("/alerts");
  await expect(page.getByLabel("Seguimiento", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Equipo", { exact: true })).toHaveCount(0);
  // A Team Lead can narrow to the alerts addressed to them, and the summary counts those waiting.
  const pedidos: URL[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname === "/api/alertas") pedidos.push(url);
  });
  await page.getByLabel("Destinatario").selectOption({ label: "Dirigidas a usted" });
  await expect(page).toHaveURL(/dirigidas=1/);
  await expect.poll(() => pedidos.at(-1)?.searchParams.get("dirigidas")).toBe("1");
  await page.goto("/alerts");
  await expect(page.getByRole("status").filter({ hasText: "alerta" })).toContainText(
    "dirigida a usted, sin seguimiento",
  );

  const otra = await page.context().newPage();
  await demo(otra, "demo-rrhh");
  await otra.goto("/alerts");
  await expect(otra.getByLabel("Equipo", { exact: true })).toBeVisible();
});

test("Exportar a CSV descarga el archivo con los filtros de la lista y avisa cuántas filas tiene", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  let consulta = "";
  let responder: "archivo" | "sin permiso" = "archivo";
  await page.route(api("/api/exportaciones/alertas"), (route) => {
    consulta = new URL(route.request().url()).search;
    if (responder === "sin permiso")
      return route.fulfill({
        status: 403,
        json: {
          error: {
            codigo: "SIN_PERMISO",
            mensaje: "No tiene permiso para exportar datos.",
            detalles: [],
          },
        },
      });
    return route.fulfill({
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="alertas-2026-10-19.csv"',
        "X-Total-Filas": "3",
      },
      body: "﻿Alertas con seguimiento\r\n",
    });
  });
  await page.goto("/alerts?seguimiento=EN_CURSO&vencidos=1");
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar a CSV" }).click(),
  ]);
  expect(descarga.suggestedFilename()).toBe("alertas-2026-10-19.csv");
  expect(consulta).toBe("?seguimiento=EN_CURSO&vencido=1");
  await expect(page.getByText("Archivo generado: 3 filas.")).toBeVisible();

  // A refusal is said in the page, and the button is ready again.
  responder = "sin permiso";
  await page.getByRole("button", { name: "Exportar a CSV" }).click();
  await expect(fallo(page)).toContainText("No tiene permiso para exportar datos.");
  await expect(page.getByRole("button", { name: "Exportar a CSV" })).toBeEnabled();
});
