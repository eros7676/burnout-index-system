import { test, expect, type Page } from "@playwright/test";
import type { EventoAuditoria, PaginaAuditoria } from "../src/shared/contracts";
import type {
  DetalleAuditoria,
  OperacionAuditoria,
} from "../src/shared/contratos/auditoria";
import { alerta, celda, demo, sinDesbordeHorizontal } from "./demo";

// Auditoría (S5): the list with its filters, one event, one operation and the export. The server is
// mocked; the contract bodies are typed, so a change in the shapes breaks this file at compile time.

const IMPORTACION = "cmvyxbwvi00mut1tc6hs32lco";
const JOB = "cmvyxc0aa00muz9job000abcd";
const SOLICITUD = "6928b55a-7bb2-4dff-9ec1-b0be8c394216";

const evento = (parcial: Partial<EventoAuditoria>): EventoAuditoria => ({
  eventoId: "evento-0",
  accion: "EMPLEADO_ACTUALIZADO",
  etiqueta: "Modificó los datos laborales de una persona",
  entidad: "EMPLEADO",
  recursoId: "EMP-001",
  sujetoId: null,
  actorId: "demo-rrhh",
  actorNombre: "RRHH",
  actorRol: "RRHH",
  origen: "WEB",
  resultado: "EXITO",
  motivo: null,
  solicitudId: SOLICITUD,
  correlacionId: null,
  cambios: null,
  justificacion: null,
  detalles: {},
  createdAt: "2026-10-19T12:00:00.000Z",
  recursoNombre: null,
  sujetoNombre: null,
  ...parcial,
});

const confirmada = evento({
  eventoId: "evento-1",
  accion: "IMPORTACION_CONFIRMADA",
  etiqueta: "Confirmó una importación",
  entidad: "IMPORTACION",
  recursoId: IMPORTACION,
  correlacionId: "op-1",
  detalles: { insertados: 2, omitidos: 0, jobId: JOB },
});
const publicada = evento({
  eventoId: "evento-2",
  accion: "REGLAS_PUBLICADAS",
  etiqueta: "Publicó una versión de reglas",
  entidad: "REGLAS",
  recursoId: "v2",
  correlacionId: "op-2",
  cambios: [
    { campo: "highLimit", antes: 70, despues: 72 },
    { campo: "weights.HE", antes: 0.3, despues: 0.35 },
  ],
  justificacion: "Ajuste del límite acordado con Gerencia.",
  detalles: { version: "v2", versionAnterior: "v1", effectiveFrom: "2026-10-12" },
  createdAt: "2026-10-18T23:30:00.000Z",
});
const denegado = evento({
  eventoId: "evento-3",
  accion: "ACCESO_DENEGADO",
  etiqueta: "Intentó una operación sin permiso",
  entidad: "ACCESO",
  recursoId: "/api/auditoria",
  actorId: "demo-tl-01",
  actorNombre: "Team Lead, Célula ficticia 1",
  actorRol: "TEAM_LEAD",
  resultado: "DENEGADO",
  motivo: "SIN_PERMISO",
  createdAt: "2026-10-17T13:15:00.000Z",
});
const ficha = evento({
  eventoId: "evento-4",
  recursoNombre: "Persona ficticia 001",
  sujetoId: "EMP-001",
  sujetoNombre: "Persona ficticia 001",
  cambios: [{ campo: "estado", antes: "ACTIVO", despues: "INACTIVO" }],
  createdAt: "2026-10-16T09:00:00.000Z",
});
const EVENTOS = [confirmada, publicada, denegado];

const pagina = (
  items: EventoAuditoria[],
  extra: Partial<PaginaAuditoria> = {},
): PaginaAuditoria => ({
  items,
  total: items.length,
  totalAcotado: false,
  pageSize: 25,
  siguiente: null,
  consultasOcultas: 0,
  ...extra,
});

const OPERACION: OperacionAuditoria = {
  operacionId: "op-2",
  eventos: [
    evento({
      eventoId: "evento-5",
      accion: "REGLAS_BORRADOR_APROBADO",
      etiqueta: "Aprobó un borrador de reglas",
      entidad: "REGLAS",
      recursoId: "v2",
      correlacionId: "op-2",
      createdAt: "2026-10-18T23:29:00.000Z",
    }),
    publicada,
  ],
  total: 2,
  truncada: false,
};

const EXPORTACION = (filas: number, truncado: boolean) => ({
  status: 200,
  headers: {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition":
      'attachment; filename="auditoria_inicio_20261019T150000Z.csv"',
    "x-exportacion-filas": String(filas),
    "x-exportacion-truncada": String(truncado),
  },
  body: "evento_id\r\n",
});

type Servidor = {
  lista?: (url: URL) => PaginaAuditoria | null;
  exportacion?: ReturnType<typeof EXPORTACION>;
};

/** Answers every /api/auditoria route; `lista` returns null to fail. Returns the requests seen. */
async function servir(page: Page, { lista, exportacion }: Servidor = {}) {
  const pedidos: URL[] = [];
  await page.route(
    (url) => url.pathname.startsWith("/api/auditoria"),
    (route) => {
      const url = new URL(route.request().url());
      pedidos.push(url);
      if (url.pathname === "/api/auditoria") {
        const cuerpo = lista ? lista(url) : pagina(EVENTOS);
        return cuerpo
          ? route.fulfill({ json: cuerpo })
          : route.fulfill({
              status: 500,
              json: {
                error: {
                  codigo: "ERROR_INTERNO",
                  mensaje: "No se pudo consultar la auditoría.",
                  detalles: [],
                },
              },
            });
      }
      if (url.pathname === "/api/auditoria/exportacion")
        return route.fulfill(exportacion ?? EXPORTACION(3, false));
      if (url.pathname.startsWith("/api/auditoria/operaciones/"))
        return route.fulfill({ json: OPERACION });
      const id = decodeURIComponent(url.pathname.split("/").at(-1)!);
      const buscado = [...EVENTOS, ficha].find((e) => e.eventoId === id);
      if (!buscado)
        return route.fulfill({
          status: 404,
          json: {
            error: {
              codigo: "NO_ENCONTRADO",
              mensaje: "No se encontró el evento.",
              detalles: [],
            },
          },
        });
      const cuerpo: DetalleAuditoria = {
        evento: buscado,
        cambiosCalculados: buscado.eventoId === "evento-2",
        operacion: buscado.correlacionId
          ? { id: buscado.correlacionId, eventos: 2 }
          : null,
      };
      return route.fulfill({ json: cuerpo });
    },
  );
  return pedidos;
}

const tablaDeEventos = (page: Page) =>
  page.getByRole("region", { name: "Eventos de auditoría" });
/** The value of one key fact of the detail page. */
const hecho = (page: Page, termino: string) =>
  page
    .locator("dl > div")
    .filter({
      has: page.getByRole("term").filter({
        hasText: new RegExp(`^${termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      }),
    })
    .getByRole("definition");

test("Auditoría: los eventos se leen en palabras, con actor, rol, recurso y resultado, y un fallo se reintenta", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  let falla = true;
  await servir(page, {
    lista: () => (falla ? null : pagina(EVENTOS, { consultasOcultas: 4 })),
  });
  await page.goto("/audit");
  await expect(alerta(page)).toContainText("No se pudo consultar la auditoría.");
  await expect(tablaDeEventos(page)).toHaveCount(0);
  falla = false;
  await alerta(page).getByRole("button", { name: "Reintentar" }).click();

  const tabla = tablaDeEventos(page);
  // Dates in the product's zone (UTC−3), with year and seconds: 12:00 UTC is 09:00 on 19 Oct.
  await expect(tabla.getByRole("rowheader")).toHaveText([
    "19 oct 2026, 09:00:00",
    "18 oct 2026, 20:30:00",
    "17 oct 2026, 10:15:00",
  ]);
  const importacion = "19 oct 2026";
  await expect(await celda(tabla, importacion, "Actor")).toHaveText(/RRHH\s*RR\. HH\./);
  await expect(await celda(tabla, importacion, "Acción")).toHaveText(
    "Confirmó una importación",
  );
  await expect(await celda(tabla, importacion, "Recurso")).toHaveText("Importación");
  await expect(await celda(tabla, importacion, "Resultado")).toHaveText("Exitoso");
  const reglas = "18 oct 2026";
  await expect(await celda(tabla, reglas, "Recurso")).toContainText("Versión v2");
  const acceso = "17 oct 2026";
  await expect(await celda(tabla, acceso, "Actor")).toHaveText(
    /Team Lead, Célula ficticia 1\s*Team Lead/,
  );
  const resultado = await celda(tabla, acceso, "Resultado");
  await expect(resultado).toContainText("Denegado");
  await expect(resultado).toContainText("Sin permiso para la operación");

  await expect(page.getByRole("main").getByText("3 eventos")).toBeVisible();
  await expect(
    page.getByText("Los eventos se conservan 12 meses."),
  ).toBeVisible();

  // Words, not codes: no raw id, enum, user id or ISO instant reaches the list.
  const main = page.getByRole("main");
  for (const crudo of [
    IMPORTACION,
    JOB,
    SOLICITUD,
    "demo-rrhh",
    "demo-tl-01",
    "IMPORTACION_CONFIRMADA",
    "ACCESO_DENEGADO",
    "SIN_PERMISO",
    "2026-10-19",
    "T12:00",
  ])
    await expect(main).not.toContainText(crudo);
});

test("Auditoría: las consultas se ocultan por defecto, con su cantidad, y se incluyen a pedido", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos = await servir(page, {
    lista: (url) =>
      pagina(EVENTOS, { consultasOcultas: url.searchParams.has("consultas") ? 0 : 4 }),
  });
  await page.goto("/audit");
  const casilla = page.getByRole("checkbox", { name: "Incluir consultas (4 ocultas)" });
  await expect(casilla).not.toBeChecked();
  expect(pedidos.at(-1)!.searchParams.has("consultas")).toBe(false);
  // The default period is the last 30 days.
  expect(pedidos.at(-1)!.searchParams.has("desde")).toBe(true);

  await casilla.check();
  await expect(page).toHaveURL(/consultas=1/);
  await expect
    .poll(() => pedidos.at(-1)!.searchParams.get("consultas"))
    .toBe("1");
  await expect(page.getByRole("checkbox", { name: "Incluir consultas" })).toBeChecked();
});

test("Auditoría: los filtros viven en la URL, se combinan y se quitan con una sola acción", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos = await servir(page);
  await page.goto("/audit");
  const ultimo = (clave: string) => pedidos.at(-1)!.searchParams.get(clave);

  await page.getByLabel("Resultado", { exact: true }).selectOption("DENEGADO");
  await expect(page).toHaveURL(/resultado=DENEGADO/);
  await expect.poll(() => ultimo("resultado")).toBe("DENEGADO");

  // The actions offered follow the chosen type, and the labels come from the catalog.
  await page.getByLabel("Tipo de recurso", { exact: true }).selectOption("REGLAS");
  const acciones = page.getByLabel("Acción", { exact: true });
  await expect(
    acciones.getByRole("option", { name: "Publicó una versión de reglas" }),
  ).toHaveCount(1);
  await expect(
    acciones.getByRole("option", { name: "Confirmó una importación" }),
  ).toHaveCount(0);
  await acciones.selectOption({ label: "Publicó una versión de reglas" });
  await expect.poll(() => ultimo("entidad")).toBe("REGLAS");
  await expect.poll(() => ultimo("accion")).toBe("REGLAS_PUBLICADAS");

  await page.getByLabel("Origen", { exact: true }).selectOption("CLI");
  await page.getByLabel("Usuario", { exact: true }).selectOption("demo-rrhh");
  await expect.poll(() => ultimo("origen")).toBe("CLI");
  await expect.poll(() => ultimo("actorId")).toBe("demo-rrhh");

  await page.getByLabel("Buscar por código", { exact: true }).fill("op-1");
  await page.getByLabel("Buscar por código", { exact: true }).press("Enter");
  await expect.poll(() => ultimo("q")).toBe("op-1");

  await page.getByRole("button", { name: "Quitar filtros" }).click();
  await expect(page).toHaveURL(/\/audit$/);
  await expect(page.getByLabel("Resultado", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Buscar por código", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Quitar filtros" })).toHaveCount(0);
  expect(ultimo("resultado")).toBeNull();
});

test("Auditoría: el período usa días de Buenos Aires y un rango invertido no consulta", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos = await servir(page);
  await page.goto("/audit");

  await page.getByLabel("Desde", { exact: true }).fill("2026-10-10");
  await page.getByLabel("Hasta", { exact: true }).fill("2026-10-12");
  await expect(page.getByLabel("Período", { exact: true })).toHaveValue("personalizado");
  // Each fill is its own query; wait for the one that carries both ends.
  await expect
    .poll(() => {
      const ultimo = pedidos.at(-1)!.searchParams;
      return [ultimo.get("desde"), ultimo.get("hasta")];
    })
    .toEqual(["2026-10-10T03:00:00.000Z", "2026-10-13T02:59:59.999Z"]);

  const consultas = pedidos.length;
  await page.getByLabel("Desde", { exact: true }).fill("2026-10-20");
  await expect(
    page.getByText("La fecha desde es posterior a la fecha hasta."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Exportar a CSV" })).toBeDisabled();
  expect(pedidos.length).toBe(consultas);

  await page.getByLabel("Período", { exact: true }).selectOption("todo");
  await expect(page.getByLabel("Desde", { exact: true })).toHaveValue("");
  await expect.poll(() => pedidos.at(-1)!.searchParams.has("desde")).toBe(false);
});

test("Auditoría: un enlace con una persona la muestra como filtro, por nombre, y se quita", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos = await servir(page, { lista: () => pagina([ficha]) });
  await page.goto("/audit?sujetoId=EMP-001");
  await expect(page.getByText("Persona: Persona ficticia 001")).toBeVisible();
  // A person's whole history, not only the last 30 days.
  expect(pedidos.at(-1)!.searchParams.get("sujetoId")).toBe("EMP-001");
  expect(pedidos.at(-1)!.searchParams.has("desde")).toBe(false);

  await page
    .getByRole("button", { name: "Quitar el filtro: Persona: Persona ficticia 001" })
    .click();
  await expect(page.getByText("Persona: Persona ficticia 001")).toHaveCount(0);
  await expect.poll(() => pedidos.at(-1)!.searchParams.has("sujetoId")).toBe(false);
});

test("Auditoría: las páginas se recorren una tras otra con la posición del último evento", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos = await servir(page, {
    lista: (url) =>
      url.searchParams.get("cursor") === "cursor-2"
        ? pagina([denegado], { total: 3 })
        : pagina([confirmada, publicada], { total: 3, siguiente: "cursor-2" }),
  });
  await page.goto("/audit");
  const tabla = tablaDeEventos(page);
  await expect(tabla.getByRole("rowheader")).toHaveCount(2);
  await expect(page.getByText("Página 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Anterior" })).toBeDisabled();

  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(tabla.getByRole("rowheader")).toHaveCount(1);
  await expect(page.getByText("Página 2")).toBeVisible();
  expect(pedidos.at(-1)!.searchParams.get("cursor")).toBe("cursor-2");
  await expect(page.getByRole("button", { name: "Siguiente" })).toBeDisabled();

  await page.getByRole("button", { name: "Anterior" }).click();
  await expect(tabla.getByRole("rowheader")).toHaveCount(2);
  await expect(page.getByText("Página 1")).toBeVisible();
  expect(pedidos.at(-1)!.searchParams.has("cursor")).toBe(false);
});

test("Auditoría: un total acotado lo dice, y sin eventos se explica qué falta", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  let respuesta = pagina(EVENTOS, { total: 10000, totalAcotado: true });
  await servir(page, { lista: () => respuesta });
  await page.goto("/audit");
  await expect(page.getByText("Más de 10.000 eventos").first()).toBeVisible();

  respuesta = pagina([]);
  await page.goto("/audit");
  await expect(page.getByText("Todavía no hay eventos")).toBeVisible();
  await page.getByLabel("Resultado", { exact: true }).selectOption("FALLO");
  await expect(page.getByText("No hay eventos con estos filtros")).toBeVisible();
});

test("Auditoría: del listado se abre el evento con sus cambios y se vuelve con los mismos filtros", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await servir(page);
  await page.goto("/audit?resultado=EXITO");
  await tablaDeEventos(page)
    .getByRole("link", { name: "18 oct 2026, 20:30:00" })
    .click();

  await expect(page).toHaveURL(/\/audit\/evento-2/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Detalle del evento" }),
  ).toBeVisible();
  await expect(page.getByText("RRHH publicó una versión de reglas")).toBeVisible();
  await expect(hecho(page, "Fecha y hora")).toHaveText("18 oct 2026, 20:30:00");
  await expect(hecho(page, "Actor")).toHaveText("RRHH");
  await expect(hecho(page, "Rol")).toHaveText("RR. HH.");
  await expect(hecho(page, "Origen")).toHaveText("Aplicación web");
  await expect(hecho(page, "Resultado")).toHaveText("Exitoso");
  await expect(hecho(page, "Motivo")).toHaveText("No aplica");
  await expect(hecho(page, "Código de la solicitud")).toHaveText(SOLICITUD);

  const cambios = page.getByRole("region", { name: "Cambios del evento" });
  await expect(cambios.getByRole("columnheader")).toHaveText([
    "Campo",
    "Antes",
    "Después",
  ]);
  await expect(await celda(cambios, "Límite de Alto", "Antes")).toHaveText("70");
  await expect(await celda(cambios, "Límite de Alto", "Después")).toHaveText("72");
  await expect(await celda(cambios, "Peso de Horas extra", "Antes")).toHaveText(
    "30 %",
  );
  await expect(await celda(cambios, "Peso de Horas extra", "Después")).toHaveText(
    "35 %",
  );
  // Derived on read, so the screen says so.
  await expect(
    page.getByText("Los cambios se calcularon al consultar el evento"),
  ).toBeVisible();
  await expect(
    page.getByText("Ajuste del límite acordado con Gerencia."),
  ).toBeVisible();

  await page.getByRole("main").getByRole("link", { name: "Auditoría" }).click();
  await expect(page).toHaveURL(/\/audit\?resultado=EXITO$/);
});

test("Auditoría: un evento sin cambios lo dice, y uno inexistente se informa", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await servir(page);
  await page.goto("/audit/evento-1");
  await expect(page.getByText("Sin cambios registrados")).toBeVisible();
  await expect(hecho(page, "Persona")).toHaveText("Ninguna");

  await page.goto("/audit/inexistente");
  await expect(alerta(page)).toContainText("No se encontró el evento.");
});

test("Auditoría: un evento con persona enlaza a su ficha y a su recurso", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await servir(page);
  await page.goto("/audit/evento-4");
  await expect(
    hecho(page, "Persona").getByRole("link", { name: "Persona ficticia 001" }),
  ).toHaveAttribute("href", "/employees/EMP-001");
  await expect(
    hecho(page, "Recurso").getByRole("link", { name: "Persona ficticia 001" }),
  ).toHaveAttribute("href", "/employees/EMP-001");
});

test("Auditoría: la operación completa reúne sus eventos en el orden en que ocurrieron", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await servir(page);
  await page.goto("/audit/evento-2");
  await page.getByRole("link", { name: "Ver operación completa" }).click();

  await expect(page).toHaveURL(/\/audit\/operations\/op-2$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Operación completa" }),
  ).toBeVisible();
  const pasos = page
    .getByRole("list", { name: "Eventos de la operación" })
    .getByRole("listitem");
  await expect(pasos).toHaveCount(2);
  await expect(pasos.nth(0)).toContainText("Aprobó un borrador de reglas");
  await expect(pasos.nth(1)).toContainText("Publicó una versión de reglas");
  await expect(pasos.nth(0)).toContainText("18 oct 2026, 20:29:00");
  await expect(page.getByText("2 eventos").first()).toBeVisible();

  await pasos.nth(1).getByRole("link").click();
  await expect(page).toHaveURL(/\/audit\/evento-2$/);
});

test("Auditoría: exportar descarga el archivo con los filtros vigentes y dice cuántos eventos tiene", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const pedidos = await servir(page);
  await page.goto("/audit?resultado=EXITO");
  await expect(tablaDeEventos(page)).toBeVisible();

  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar a CSV" }).click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe("auditoria_inicio_20261019T150000Z.csv");
  await expect(
    page
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: "generado con 3 eventos" }),
  ).toBeVisible();
  const pedido = pedidos.find((u) => u.pathname === "/api/auditoria/exportacion")!;
  expect(pedido.searchParams.get("formato")).toBe("csv");
  expect(pedido.searchParams.get("resultado")).toBe("EXITO");
  // The whole filtered set, not a page of it.
  expect(pedido.searchParams.has("pageSize")).toBe(false);
  expect(pedido.searchParams.has("cursor")).toBe(false);

  const json = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar a JSON" }).click();
  await json;
  expect(
    pedidos.filter((u) => u.pathname === "/api/auditoria/exportacion").at(-1)!
      .searchParams.get("formato"),
  ).toBe("json");
});

test("Auditoría: un archivo recortado por el tope avisa que hay que acotar el período", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await servir(page, { exportacion: EXPORTACION(10000, true) });
  await page.goto("/audit");
  await page.getByRole("button", { name: "Exportar a CSV" }).click();
  await expect(
    page
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: "contiene los primeros 10.000 eventos" }),
  ).toContainText("Acote el período");
});

test("Auditoría: Gerencia la abre y un Team Lead no, ni el detalle ni la operación", async ({
  page,
}) => {
  await demo(page, "demo-gerencia");
  await servir(page);
  await page.goto("/audit");
  await expect(
    page.getByRole("heading", { level: 1, name: "Auditoría" }),
  ).toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await demo(page, "demo-tl-01");
  for (const ruta of ["/audit", "/audit/evento-1", "/audit/operations/op-1"]) {
    await page.goto(ruta);
    await expect(page).toHaveURL(/\/home$/);
  }
});

test("Auditoría: el listado, el detalle y la operación no desbordan una pantalla angosta", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, "demo-rrhh");
  await servir(page);
  for (const [ruta, visible] of [
    ["/audit", tablaDeEventos(page)],
    ["/audit/evento-2", page.getByRole("region", { name: "Cambios del evento" })],
    ["/audit/operations/op-2", page.getByRole("list", { name: "Eventos de la operación" })],
  ] as const) {
    await page.goto(ruta);
    await expect(visible).toBeVisible();
    await sinDesbordeHorizontal(page);
  }
});
