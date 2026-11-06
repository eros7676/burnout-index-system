// Shared stubs for the mocked browser specs. Every signed-in screen reads
// GET /api/demo/sesion first and goes back to "/" without a user, so each
// mocked spec signs in here; data reads answer with contract-typed bodies.
import { expect, type Locator, type Page } from "@playwright/test";
import { USUARIOS_DEMO } from "../src/server/http/permisos-demo";
import type {
  Alerta,
  InformeDTO,
  Nivel,
  PersonaDTO,
  PersonasDTO,
  ResumenDTO,
  SemanaPersona,
} from "../src/shared/contracts";
import {
  alertaMock,
  cuerposExitoMock,
  informeMock,
  resumenMock,
} from "../src/shared/mocks";

export type UsuarioDemo = (typeof USUARIOS_DEMO)[number]["userId"];

/** Route matcher for one API path, whatever its query string. */
export const api = (ruta: string) => (url: URL) => url.pathname === ruta;
/** Every data read and action, never the demo session. */
export const datos = (url: URL) =>
  url.pathname.startsWith("/api/") && url.pathname !== "/api/demo/sesion";

/** Weeks of the mocked dataset, newest first (as /api/personas sends them). */
export const W1 = { periodStart: "2026-10-12", periodEnd: "2026-10-18" };
export const W2 = { periodStart: "2026-10-05", periodEnd: "2026-10-11" };
export const W3 = { periodStart: "2026-09-28", periodEnd: "2026-10-04" };

type Resultado = Partial<
  Pick<
    SemanaPersona,
    | "actualizado"
    | "processingState"
    | "evaluationId"
    | "indice"
    | "nivel"
    | "alertId"
  >
>;
type Carga = Partial<
  Pick<
    SemanaPersona,
    | "horasExtra"
    | "diasConsecutivosSinDescanso"
    | "tareasActivas"
    | "tareasPendientes"
    | "tareasVencidas"
    | "vacacionesPendientesDias"
    | "horasTrabajadas"
    | "ausencias"
  >
>;

/** One loaded week with a current, completed evaluation unless told otherwise. */
export function semana(
  periodo: typeof W1,
  nivel: Nivel | null,
  indice: number | null,
  resultado: Resultado = {},
  carga: Carga = {},
): SemanaPersona {
  return {
    ...periodo,
    horasExtra: 4,
    diasConsecutivosSinDescanso: 5,
    tareasActivas: 8,
    tareasPendientes: 3,
    tareasVencidas: 0,
    vacacionesPendientesDias: 6,
    horasTrabajadas: 44,
    diasDesdeUltimasVacaciones: 60,
    ausencias: null,
    ...carga,
    actualizado: true,
    processingState: "COMPLETADO",
    evaluationId: nivel ? `ev-${periodo.periodStart}-${indice}` : null,
    indice,
    nivel,
    alertId: null,
    ...resultado,
  };
}

const EQ1 = { teamId: "EQ-01", equipo: "Célula ficticia 1" };
const EQ2 = { teamId: "EQ-02", equipo: "Célula ficticia 2" };
const tecnico = (
  n: number,
  equipo: typeof EQ1,
  semanas: SemanaPersona[],
): PersonaDTO => ({
  employeeId: `EMP-00${n}`,
  nombre: `Persona ficticia 00${n}`,
  tipo: "TECNICO",
  ...equipo,
  responsable: `Team Lead ficticio ${equipo.teamId.slice(-1)}`,
  semanas,
});

/**
 * Eight people in two teams over three weeks. In the newest week each level
 * appears once as current (Alto, Bajo, Medio, Incompleto), plus a week waiting
 * for its calculation, a failed recalculation over a stale Alto and a stale
 * Alto waiting for recalculation.
 */
export const PERSONAS: PersonaDTO[] = [
  tecnico(1, EQ1, [
    semana(
      W1,
      "ALTO",
      91.21,
      { evaluationId: "mock-evaluation-2", alertId: alertaMock.alertId },
      {
        horasExtra: 16,
        diasConsecutivosSinDescanso: 16,
        tareasActivas: 10,
        tareasPendientes: 7,
        tareasVencidas: 5,
        vacacionesPendientesDias: 14,
        horasTrabajadas: 56,
      },
    ),
    semana(
      W2,
      "INCOMPLETO",
      83.71,
      { evaluationId: "mock-evaluation-1" },
      {
        horasExtra: 16,
        diasConsecutivosSinDescanso: 9,
        tareasActivas: 12,
        tareasPendientes: 8,
        tareasVencidas: 0,
        vacacionesPendientesDias: 14,
        horasTrabajadas: 55,
      },
    ),
  ]),
  tecnico(2, EQ2, [semana(W1, "BAJO", 0), semana(W2, "BAJO", 12.5)]),
  tecnico(3, EQ1, [semana(W1, "MEDIO", 48.93), semana(W2, "MEDIO", 41)]),
  tecnico(4, EQ2, [
    semana(W1, null, null, {
      actualizado: false,
      processingState: "PENDIENTE",
    }),
    semana(W2, "BAJO", 20),
  ]),
  tecnico(5, EQ2, [
    semana(W1, "ALTO", 77.7, {
      actualizado: false,
      processingState: "FALLIDO",
      evaluationId: "mock-evaluation-failed",
    }),
    semana(W2, "MEDIO", 55),
  ]),
  tecnico(6, EQ1, [semana(W1, "INCOMPLETO", 83.71)]),
  tecnico(7, EQ1, [
    semana(W1, "ALTO", 88.88, {
      actualizado: false,
      processingState: "PENDIENTE",
      evaluationId: "mock-evaluation-stale",
    }),
    semana(W2, "ALTO", 86.5),
    semana(W3, "MEDIO", 60),
  ]),
  {
    employeeId: "TL-01",
    nombre: "Team Lead ficticio 1",
    tipo: "TEAM_LEAD",
    ...EQ1,
    responsable: "Gerente ficticio de Operaciones",
    semanas: [semana(W1, "BAJO", 10), semana(W2, "BAJO", 9)],
  },
];

/** /api/personas as the server answers it, optionally narrowed like its filters. */
export function personas(
  filtro: { teamId?: string; employeeId?: string } = {},
  lista: PersonaDTO[] = PERSONAS,
): PersonasDTO {
  const items = lista.filter(
    (p) =>
      (!filtro.teamId || p.teamId === filtro.teamId) &&
      (!filtro.employeeId || p.employeeId === filtro.employeeId),
  );
  const semanas = [
    ...new Set(items.flatMap((p) => p.semanas.map((w) => w.periodStart))),
  ].sort((a, b) => (a < b ? 1 : -1));
  return { items, semanas };
}

/** The report of one evaluation, from the contract mock. */
export function informe(
  evaluationId: string,
  cambios: {
    evaluacion?: Partial<InformeDTO["evaluacion"]>;
    empleado?: Partial<InformeDTO["empleado"]>;
    factores?: InformeDTO["factores"];
    alerta?: Partial<Alerta> | null;
  } = {},
): InformeDTO {
  const empleado = { ...informeMock.empleado, ...cambios.empleado };
  return {
    ...informeMock,
    empleado,
    evaluacion: {
      ...informeMock.evaluacion,
      evaluationId,
      employeeId: empleado.employeeId,
      ...cambios.evaluacion,
    },
    factores: cambios.factores ?? informeMock.factores,
    alerta:
      cambios.alerta === null
        ? null
        : {
            ...alertaMock,
            evaluationId,
            employeeId: empleado.employeeId,
            ...cambios.alerta,
          },
  };
}

export const resumen = (cambios: Partial<ResumenDTO> = {}): ResumenDTO => ({
  ...resumenMock,
  ...cambios,
});

/**
 * Signs in as a demo user (switchable from the strip) and answers every data
 * read with the dataset above. Routes added after this one take precedence.
 */
/** `correo: "REAL"` answers the session as a server with SMTP configured. */
export async function demo(
  page: Page,
  inicial: UsuarioDemo | null,
  { correo = "SIMULADO" }: { correo?: "REAL" | "SIMULADO" } = {},
) {
  let actual: string | null = inicial;
  await page.route(datos, (route) => {
    const url = new URL(route.request().url());
    const ruta = url.pathname;
    const filtro = Object.fromEntries(url.searchParams);
    if (ruta === "/api/personas")
      return route.fulfill({ json: personas(filtro) });
    if (ruta === "/api/resumen") return route.fulfill({ json: resumen() });
    if (ruta === "/api/alertas")
      return route.fulfill({ json: cuerposExitoMock.listarAlertas });
    if (ruta === "/api/mis-datos")
      return route.fulfill({ json: cuerposExitoMock.consultarMisDatos });
    // The person page opens with its newest week's tasks.
    if (ruta === "/api/tareas")
      return route.fulfill({ json: cuerposExitoMock.listarTareasSemana });
    // Counts per week; the person page reads the newest one for its oldest overdue task.
    if (ruta === "/api/jornadas")
      return route.fulfill({ json: cuerposExitoMock.listarJornadasSemana });
    if (ruta === "/api/tareas/semanas")
      return route.fulfill({ json: cuerposExitoMock.listarSemanasConTareas });
    if (ruta === "/api/reglas")
      return route.fulfill({ json: cuerposExitoMock.consultarReglas });
    if (ruta === "/api/auditoria")
      return route.fulfill({ json: cuerposExitoMock.listarAuditoria });
    // An alert's page and its follow-up case (shapes of the contract mocks, keyed by the path's id).
    const alertaDe = /^\/api\/alertas\/([^/]+)(\/seguimiento)?$/.exec(ruta);
    if (alertaDe && route.request().method() === "GET") {
      const alertId = decodeURIComponent(alertaDe[1]);
      return route.fulfill({
        json: {
          ...(alertaDe[2]
            ? cuerposExitoMock.obtenerSeguimiento
            : cuerposExitoMock.obtenerAlerta),
          alertId,
        },
      });
    }
    if (ruta.endsWith("/notificaciones")) return route.fulfill({ json: [] });
    if (ruta.startsWith("/api/evaluaciones/"))
      return route.fulfill({
        json: informe(decodeURIComponent(ruta.split("/").at(-1)!)),
      });
    return route.fulfill({ json: {} });
  });
  await page.route(api("/api/demo/sesion"), (route) => {
    if (route.request().method() === "POST") {
      actual = route.request().postDataJSON().userId;
      return route.fulfill({
        json: { usuario: USUARIOS_DEMO.find((u) => u.userId === actual) },
      });
    }
    return route.fulfill({
      json: {
        usuario: USUARIOS_DEMO.find((u) => u.userId === actual) ?? null,
        usuarios: USUARIOS_DEMO,
        correo,
      },
    });
  });
}

/** The sidebar of the shell. */
export const menu = (page: Page) =>
  page.getByRole("navigation", { name: "Secciones" });

/** A failure inside the page, not Next.js's route announcer. */
export const alerta = (page: Page) => page.getByRole("main").getByRole("alert");

/** The loading placeholder of a block (SkeletonRows). */
export const cargando = (page: Page) =>
  page.getByRole("main").getByRole("status", { name: "Cargando" });

/** The cell of `fila` (a row containing that text) under the column header `columna`. */
export async function celda(tabla: Locator, fila: string, columna: string) {
  await expect(tabla.getByRole("columnheader").first()).toBeVisible();
  const encabezados = (
    await tabla.getByRole("columnheader").allInnerTexts()
  ).map((t) => t.trim());
  const i = encabezados.indexOf(columna);
  expect(i, `columna ${columna} en ${encabezados.join(" | ")}`).toBeGreaterThan(
    -1,
  );
  return tabla
    .getByRole("row")
    .filter({ hasText: fila })
    .locator(":scope > th, :scope > td")
    .nth(i);
}

/** Nothing on the page scrolls sideways; inner table regions may. */
export async function sinDesbordeHorizontal(page: Page) {
  const anchos = await page.evaluate(() => ({
    pagina: document.documentElement.scrollWidth,
    ventana: window.innerWidth,
    culpables: [...document.querySelectorAll("body *")]
      .filter((el) => {
        const caja = el.getBoundingClientRect();
        // A scrollable table region is reported; what scrolls inside it is not.
        return (
          caja.right > window.innerWidth + 1 &&
          !el.parentElement?.closest('[role="region"][tabindex]')
        );
      })
      .slice(0, 6)
      .map((el) => `${el.tagName}.${el.className}`),
  }));
  expect(anchos.pagina, anchos.culpables.join(", ")).toBeLessThanOrEqual(
    anchos.ventana,
  );
}
