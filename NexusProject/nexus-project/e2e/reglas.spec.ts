import { expect, test, type Page } from "@playwright/test";
import type { ApiError } from "../src/shared/contracts";
import {
  MOCKS_REGLAS,
  type BorradorReglasDTO,
  type VersionesReglasDTO,
} from "../src/shared/contratos/reglas";
import { alerta, api, celda, demo, menu, sinDesbordeHorizontal } from "./demo";

// Rules editor (/rules-config and /rules-config/drafts/[borradorId]): read the versions,
// draft a change, simulate it, and publish it or send it to Gerencia. Mocked browser specs:
// each test scripts the server's answers; none of them touches the database.

const REGLAS = MOCKS_REGLAS.obtenerBorradorReglas;
const HUELLA_1 = "a".repeat(64);
const HUELLA_2 = "b".repeat(64);
const RRHH = REGLAS.creadoPor;
const GERENCIA = { userId: "demo-gerencia", nombre: "Gerencia", rol: "GERENCIA" } as const;

const VERSIONES: VersionesReglasDTO = {
  vigente: MOCKS_REGLAS.listarVersionesReglas.vigente,
  versiones: [
    {
      version: "v2",
      effectiveFrom: "2026-11-30",
      createdAt: "2026-10-26T12:00:00.000Z",
      createdBy: RRHH,
      estado: "PROGRAMADA",
      motivo: "Ajuste del límite de Alto por convenio.",
      aprobadoPor: null,
      borradorId: "b-publicado",
    },
    {
      version: "v1",
      effectiveFrom: "2026-01-05",
      createdAt: "2026-01-02T12:00:00.000Z",
      createdBy: { userId: "demo-local", nombre: "demo-local", rol: null },
      estado: "VIGENTE",
      motivo: null,
      aprobadoPor: null,
      borradorId: null,
    },
  ],
};

/** A draft as the server sends it; `cambios` and `problemas` follow what the test says. */
const borrador = (parcial: Partial<BorradorReglasDTO> = {}): BorradorReglasDTO => ({
  ...REGLAS,
  ...parcial,
});
const NUEVO = borrador({
  borradorId: "b-nuevo",
  huella: HUELLA_1,
  propuesta: REGLAS.base,
  motivo: "",
  cambios: [],
  simulacion: null,
  simulado: false,
  simulacionVigente: false,
  requiereAprobacion: false,
  retroactivo: false,
  problemas: [
    { fila: null, campo: "motivo", codigo: "CONFIGURACION_INVALIDA", detalle: "Indique el motivo del cambio." },
    {
      fila: null,
      campo: "propuesta",
      codigo: "CONFIGURACION_INVALIDA",
      detalle: "Sin cambios respecto de v1. Modifique al menos un parámetro.",
    },
  ],
});
/** Simulated, valid, governing only future weeks: RR. HH. publishes it directly. */
const A_FUTURO = borrador({
  requiereAprobacion: false,
  retroactivo: false,
  simulacion: {
    ...REGLAS.simulacion!,
    alcance: { desde: "2026-11-30", hasta: null, semanas: 0, personas: 0, omitidas: 0 },
    contexto: { versionEnVigor: "v1", versionSiguiente: null, ultimaSemana: "2026-10-12", semanas: 0 },
    transiciones: [],
    semanasConCambio: 0,
    personasConCambio: 0,
    alertas: { nuevas: 0, superadas: 0 },
    equipos: [],
  },
});
const ERROR = (codigo: string, mensaje: string, detalles: ApiError["error"]["detalles"] = []) => ({
  error: { codigo, mensaje, detalles },
});

type Respuesta = { status?: number; json: unknown };

/** The rules API of the page: the answers a test scripts, in order, and a record of the requests. */
async function servidorReglas(
  page: Page,
  inicial: { borrador?: BorradorReglasDTO; versiones?: VersionesReglasDTO } = {},
) {
  const pedidos: { metodo: string; ruta: string; cuerpo: unknown }[] = [];
  const guion = new Map<string, Respuesta[]>();
  let actual = inicial.borrador ?? REGLAS;
  await page.route(
    (url) => url.pathname.startsWith("/api/reglas/"),
    (route) => {
      const pedido = route.request();
      const ruta = new URL(pedido.url()).pathname.replace("/api/reglas/", "");
      const clave = `${pedido.method()} ${ruta.replace(/^borradores\/[^/]+/, "borradores/:id")}`;
      pedidos.push({ metodo: pedido.method(), ruta, cuerpo: pedido.postDataJSON() });
      const scripted = guion.get(clave)?.shift();
      if (scripted) {
        const json = scripted.json as Partial<BorradorReglasDTO> & {
          borrador?: BorradorReglasDTO;
        };
        if ((scripted.status ?? 200) < 400)
          actual = json.borrador ?? (json as BorradorReglasDTO);
        return route.fulfill({ status: scripted.status ?? 200, json: scripted.json });
      }
      if (clave === "GET versiones")
        return route.fulfill({ json: inicial.versiones ?? VERSIONES });
      if (clave === "GET borradores")
        return route.fulfill({
          json: {
            ...MOCKS_REGLAS.listarBorradoresReglas,
            items: [{ ...MOCKS_REGLAS.listarBorradoresReglas.items[0], borradorId: actual.borradorId }],
          },
        });
      if (clave === "GET borradores/:id") return route.fulfill({ json: actual });
      return route.fulfill({
        status: 500,
        json: ERROR("SIN_GUION", `Sin respuesta preparada para ${clave}.`),
      });
    },
  );
  return {
    pedidos,
    /** The next answers to `METODO ruta` (the draft's id is written `:id`). */
    responder(clave: string, ...respuestas: Respuesta[]) {
      guion.set(clave, [...(guion.get(clave) ?? []), ...respuestas]);
    },
    de: (clave: string) => pedidos.filter((p) => `${p.metodo} ${p.ruta.replace(/^borradores\/[^/]+/, "borradores/:id")}` === clave),
  };
}

const pagina = (page: Page) => page.getByRole("main");
const boton = (page: Page, nombre: string) =>
  pagina(page).getByRole("button", { name: nombre, exact: true });
const grupo = (page: Page, nombre: string) =>
  page.getByRole("group", { name: nombre, exact: true });

test("Reglas: las versiones se rotulan Programada, Vigente o Reemplazada y RR. HH. ve sus borradores", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const [programada, inicial] = VERSIONES.versiones;
  const vigente = {
    ...VERSIONES.vigente,
    version: "v2",
    effectiveFrom: "2026-03-02",
  };
  await servidorReglas(page, {
    versiones: {
      vigente,
      versiones: [
        { ...programada, version: "v3" },
        { ...programada, version: "v2", effectiveFrom: "2026-03-02", estado: "VIGENTE" },
        { ...inicial, estado: "REEMPLAZADA" },
      ],
    },
  });
  await page.goto("/rules-config");
  await expect(
    page.getByText(
      "Versión v2, vigente desde el 2 mar 2026. La versión v3 comienza el 30 nov 2026.",
    ),
  ).toBeVisible();
  const versiones = page.getByRole("region", { name: "Versiones de las reglas" });
  await expect(await celda(versiones, "v3", "Estado")).toHaveText("Programada");
  await expect(await celda(versiones, "v2", "Estado")).toHaveText("Vigente");
  await expect(await celda(versiones, "v1", "Estado")).toHaveText("Reemplazada");
  await expect(await celda(versiones, "v3", "Versión")).toContainText("Publicada por RRHH");
  await expect(await celda(versiones, "v1", "Versión")).toContainText("Publicada por el sistema");

  const borradores = page.getByRole("region", { name: "Borradores de reglas" });
  await expect(await celda(borradores, "Inicio el 12 oct 2026", "Estado")).toHaveText("Borrador");
  await expect(await celda(borradores, "Inicio el 12 oct 2026", "Alcance")).toHaveText(
    "Semanas ya evaluadas",
  );
  await expect(boton(page, "Nuevo borrador")).toBeVisible();
});

test("Reglas: RR. HH. crea un borrador, corrige lo que el servidor rechaza sin perder lo escrito y guarda", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const servidor = await servidorReglas(page, { borrador: NUEVO });
  servidor.responder("POST borradores", { status: 201, json: NUEVO });
  await page.goto("/rules-config");
  await boton(page, "Nuevo borrador").click();
  await expect(page).toHaveURL(/\/rules-config\/drafts\/b-nuevo$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Borrador de reglas" }),
  ).toBeVisible();
  // What still blocks the next step is stated before anything is typed.
  await expect(page.locator("#pendientes")).toContainText("Indique el motivo del cambio.");
  await expect(boton(page, "Simular impacto")).toBeDisabled();

  const pesos = grupo(page, "Pesos de los factores");
  await pesos.getByLabel("Horas extra").fill("35");
  await expect(pesos.locator("..")).toContainText("Suma: 105 %. Deben sumar 100 %.");
  await grupo(page, "Umbrales de los factores").getByLabel("Horas extra").fill("10");
  await page.getByLabel("Motivo", { exact: true }).fill("Ajuste del umbral de horas extra por convenio.");

  servidor.responder(
    "PUT borradores/:id",
    {
      status: 422,
      json: ERROR("CONFIGURACION_INVALIDA", "El borrador tiene datos para corregir.", [
        {
          fila: null,
          campo: "weights",
          codigo: "CONFIGURACION_INVALIDA",
          detalle: "Los pesos suman 105 %. Deben sumar 100 %.",
        },
      ]),
    },
    {
      json: borrador({
        borradorId: "b-nuevo",
        huella: HUELLA_2,
        motivo: "Ajuste del umbral de horas extra por convenio.",
        problemas: [],
        simulado: false,
        simulacionVigente: false,
        simulacion: null,
      }),
    },
  );
  await boton(page, "Guardar cambios").click();
  await expect(
    alerta(page).filter({ hasText: "Hay datos para corregir. Revise los campos señalados." }),
  ).toBeVisible();
  await expect(pesos.locator("..")).toContainText("Los pesos suman 105 %. Deben sumar 100 %.");
  // The refusal keeps what was typed.
  await expect(pesos.getByLabel("Horas extra")).toHaveValue("35");
  await expect(page.getByLabel("Motivo", { exact: true })).toHaveValue(
    "Ajuste del umbral de horas extra por convenio.",
  );

  await pesos.getByLabel("Horas extra").fill("30");
  await boton(page, "Guardar cambios").click();
  await expect(pagina(page).getByRole("status").filter({ hasText: "Se guardaron los cambios del borrador." })).toBeVisible();
  const [rechazado, aceptado] = servidor.de("PUT borradores/:id");
  expect(rechazado.cuerpo).toMatchObject({ huella: HUELLA_1, propuesta: { weights: { HE: 0.35 } } });
  expect(aceptado.cuerpo).toMatchObject({
    huella: HUELLA_1,
    motivo: "Ajuste del umbral de horas extra por convenio.",
    propuesta: { weights: { HE: 0.3 }, thresholds: { HE: 10 } },
  });
  const cambios = page.getByRole("region", { name: "Parámetros que cambian respecto de v1" });
  await expect(await celda(cambios, "Umbral de horas extra", "v1")).toHaveText("8 h");
  await expect(await celda(cambios, "Umbral de horas extra", "Borrador")).toHaveText("10 h");
});

test("Reglas: un borrador a futuro se simula, se publica tras confirmar y muestra el estado del recálculo", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const servidor = await servidorReglas(page, { borrador: A_FUTURO });
  await page.route(api("/api/procesamientos/mock-job-reglas"), (route) =>
    route.fulfill({
      json: {
        jobId: "mock-job-reglas",
        estado: "COMPLETADO",
        totalPares: 0,
        completados: 0,
        errores: [],
        updatedAt: "2026-10-26T12:10:00.000Z",
      },
    }),
  );
  await page.goto("/rules-config/drafts/mock-borrador-1");
  const impacto = page.getByRole("region", { name: "Impacto estimado", exact: true });
  await expect(impacto).toContainText("Ninguna semana evaluada queda dentro del alcance del borrador.");
  // Rules that govern only future weeks need no approval: there is no step to Gerencia.
  await expect(boton(page, "Enviar a revisión")).toHaveCount(0);
  await expect(boton(page, "Aprobar borrador")).toHaveCount(0);

  await boton(page, "Publicar versión").click();
  const dialogo = page.getByRole("dialog", { name: "¿Publicar la versión con inicio el 12 oct 2026?" });
  await expect(dialogo).toContainText("No se recalculará ninguna semana");
  await expect(dialogo).toContainText("La versión publicada no puede modificarse.");
  servidor.responder("POST borradores/:id/publicar", {
    json: {
      ...MOCKS_REGLAS.publicarBorradorReglas,
      borrador: { ...MOCKS_REGLAS.publicarBorradorReglas.borrador, simulacion: A_FUTURO.simulacion },
    },
  });
  await dialogo.getByRole("button", { name: "Publicar versión" }).click();
  await expect(dialogo).toBeHidden();
  await expect(pagina(page).getByRole("status").filter({ hasText: "Se publicó la versión v2." })).toBeVisible();
  expect(servidor.de("POST borradores/:id/publicar")[0].cuerpo).toEqual({ huella: REGLAS.huella });
  const publicada = page.getByRole("region", { name: "Versión v2" });
  await expect(publicada.getByText("Al día")).toBeVisible();
  // A published draft offers no further step.
  await expect(boton(page, "Descartar borrador")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Pesos de los factores" })).toHaveCount(0);
});

test("Reglas: un cambio sobre semanas ya evaluadas se envía a Gerencia y RR. HH. no puede publicarlo", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const servidor = await servidorReglas(page, { borrador: REGLAS });
  await page.goto("/rules-config/drafts/mock-borrador-1");
  const impacto = page.getByRole("region", { name: "Impacto estimado", exact: true });
  await expect(impacto).toContainText("Se recalcularon 8 semanas de 8 personas, desde el 12 oct 2026 en adelante.");
  const niveles = impacto.getByRole("region", { name: "Semanas por nivel, antes y después del borrador" });
  await expect(await celda(niveles, "Alto", "Diferencia")).toHaveText("−1");
  await expect(await celda(niveles, "Bajo", "Diferencia")).toHaveText("+1");
  const equipos = impacto.getByRole("region", { name: "Impacto del borrador por equipo" });
  await expect(equipos).toContainText("Resultado reservado: protege a los grupos de menos de 5 personas.");
  // Two steps are needed: Gerencia approves, then RR. HH. publishes.
  await expect(boton(page, "Publicar versión")).toHaveCount(0);

  servidor.responder("POST borradores/:id/enviar", {
    json: { ...REGLAS, estado: "EN_REVISION", huella: HUELLA_1 },
  });
  await boton(page, "Enviar a revisión").click();
  await expect(
    pagina(page).getByRole("status").filter({ hasText: "El borrador se envió a revisión." }),
  ).toBeVisible();
  await expect(boton(page, "Publicar versión")).toHaveCount(0);
  await expect(boton(page, "Enviar a revisión")).toHaveCount(0);
  await expect(page.getByText("Requerida de Gerencia")).toBeVisible();
});

test("Reglas: Gerencia lee el borrador sin poder editarlo, lo rechaza con justificación o lo aprueba", async ({
  page,
}) => {
  await demo(page, "demo-gerencia");
  const enRevision = borrador({ estado: "EN_REVISION", simulado: true, simulacionVigente: true });
  const servidor = await servidorReglas(page, { borrador: enRevision });
  await page.goto("/rules-config/drafts/mock-borrador-1");
  await expect(boton(page, "Aprobar borrador")).toBeEnabled();
  await expect(boton(page, "Rechazar borrador")).toBeEnabled();
  // Read-only: the parameters are shown, not offered as fields.
  await expect(pagina(page).getByRole("textbox")).toHaveCount(0);
  for (const accion of ["Guardar cambios", "Simular impacto", "Publicar versión", "Descartar borrador"])
    await expect(boton(page, accion)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Parámetros", exact: true })).toContainText("Umbrales de los factores");
  await expect(page.getByRole("region", { name: "Impacto estimado", exact: true })).toContainText("Semanas por nivel");

  await boton(page, "Rechazar borrador").click();
  const rechazo = page.getByRole("dialog", { name: "¿Rechazar el borrador?" });
  const confirmar = rechazo.getByRole("button", { name: "Rechazar borrador" });
  await expect(confirmar).toBeDisabled();
  await rechazo.getByLabel("Justificación del rechazo").fill("Falta el aval del área legal.");
  await expect(confirmar).toBeEnabled();
  servidor.responder("POST borradores/:id/rechazar", {
    json: { ...enRevision, estado: "BORRADOR" },
  });
  await confirmar.click();
  await expect(
    pagina(page).getByRole("status").filter({ hasText: "Se rechazó el borrador." }),
  ).toBeVisible();
  expect(servidor.de("POST borradores/:id/rechazar")[0].cuerpo).toEqual({
    huella: REGLAS.huella,
    justificacion: "Falta el aval del área legal.",
  });
  await expect(boton(page, "Aprobar borrador")).toHaveCount(0);

  // The same draft back in review: approving asks first and then reports it.
  servidor.responder("GET borradores/:id", { json: enRevision });
  await page.reload();
  await boton(page, "Aprobar borrador").click();
  const aprobacion = page.getByRole("dialog", { name: "¿Aprobar el borrador?" });
  await expect(aprobacion).toContainText("El cambio rige desde el 12 oct 2026");
  servidor.responder("POST borradores/:id/aprobar", {
    json: { ...enRevision, aprobadoPor: GERENCIA, aprobadoAt: "2026-10-26T13:00:00.000Z" },
  });
  await aprobacion.getByRole("button", { name: "Aprobar borrador" }).click();
  await expect(
    pagina(page).getByRole("status").filter({ hasText: "Se aprobó el borrador." }),
  ).toBeVisible();
  await expect(boton(page, "Aprobar borrador")).toHaveCount(0);
});

test("Reglas: si el borrador cambió mientras se editaba, se informa y se recarga sin perder la sesión", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const servidor = await servidorReglas(page, { borrador: REGLAS });
  await page.goto("/rules-config/drafts/mock-borrador-1");
  await grupo(page, "Umbrales de los factores").getByLabel("Horas extra").fill("12");
  await expect(page.getByText("Hay cambios sin guardar.")).toBeVisible();
  // Unsaved changes hold back the steps that read the stored draft.
  await expect(boton(page, "Simular impacto")).toBeDisabled();

  servidor.responder("PUT borradores/:id", {
    status: 409,
    json: ERROR(
      "CONFLICTO_EDICION",
      "El borrador cambió desde que se abrió. Recargue la página para ver la versión actual.",
    ),
  });
  await boton(page, "Guardar cambios").click();
  await expect(alerta(page)).toContainText("El borrador cambió desde que se abrió.");
  servidor.responder("GET borradores/:id", { json: borrador({ huella: HUELLA_2 }) });
  await alerta(page).getByRole("button", { name: "Reintentar" }).click();
  await expect(alerta(page)).toHaveCount(0);
  await expect(grupo(page, "Umbrales de los factores").getByLabel("Horas extra")).toHaveValue("10");
});

test("Reglas: el Team Lead lee las reglas en palabras, sin borradores ni controles para editarlas", async ({
  page,
}) => {
  await demo(page, "demo-tl-01");
  const servidor = await servidorReglas(page);
  await page.goto("/home");
  await menu(page).getByRole("link", { name: "Reglas del índice" }).click();
  await expect(page).toHaveURL(/\/rules-config$/);
  const factores = page.getByRole("region", { name: "Factores del índice" });
  for (const [factor, umbral, peso] of [
    ["Horas extra", "8 h", "30 %"],
    ["Días seguidos sin descanso", "6 días", "30 %"],
    ["Carga de tareas", "0,35", "25 %"],
    ["Vacaciones pendientes", "10 días", "15 %"],
  ]) {
    await expect(await celda(factores, factor, "Umbral")).toHaveText(umbral);
    await expect(await celda(factores, factor, "Peso en el índice")).toHaveText(peso);
  }
  const main = pagina(page);
  await expect(main).toContainText("Índice menor a 40.");
  await expect(main).toContainText(
    "Índice de 70 o más durante dos semanas consecutivas, con al menos 2 factores superados en las dos.",
  );
  await expect(main).toContainText("Un diagnóstico médico.");
  await expect(page.getByRole("region", { name: "Versiones de las reglas" })).toContainText("Vigente");
  // Read-only: no field, no action, no drafts, no codes or raw values.
  for (const rol of ["textbox", "spinbutton", "checkbox", "radio", "combobox", "button"] as const)
    await expect(main.getByRole(rol)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Borradores de reglas" })).toHaveCount(0);
  await expect(main).not.toContainText(/\b(HE|DS|CT|VP)\b|0\.3|0\.35/, { useInnerText: true });

  await page.goto("/rules-config/drafts/mock-borrador-1");
  await expect(page.getByText("No tiene permiso para ver borradores de reglas.")).toBeVisible();
  expect(servidor.pedidos.filter((p) => p.ruta.startsWith("borradores"))).toEqual([]);
});

test("Reglas: en pantalla angosta la página no desborda", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, "demo-rrhh");
  await servidorReglas(page, { borrador: REGLAS });
  for (const ruta of ["/rules-config", "/rules-config/drafts/mock-borrador-1"]) {
    await page.goto(ruta);
    await expect(page.getByRole("region", { name: /Borradores de reglas|Parámetros/ }).first()).toBeVisible();
    await sinDesbordeHorizontal(page);
  }
});
