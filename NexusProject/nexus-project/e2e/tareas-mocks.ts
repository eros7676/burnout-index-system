// Mocked task-evidence API for the browser specs: contract-typed bodies and the routes that serve them.
// Register after `demo(page, ...)`, because the last route registered for a URL wins.
import type { Page } from "@playwright/test";
import type {
  CierreTareaDTO,
  HistorialTareaDTO,
  MisTareasDTO,
  SemanaTareasDTO,
  TareaDTO,
  TareasEquipoDTO,
  TareasSemanaDTO,
} from "../src/shared/contratos/tareas";
import { resumirGrupos } from "../src/server/services/tareas-consulta-resumen";
import { api } from "./demo";

export const SEMANA_CON_DETALLE = { desde: "2026-10-12", hasta: "2026-10-18" };
export const SEMANA_SIN_DETALLE = { desde: "2026-10-05", hasta: "2026-10-11" };
export const SEMANA_DESAJUSTADA = { desde: "2026-09-28", hasta: "2026-10-04" };

const tarea = (
  t: Partial<TareaDTO> & Pick<TareaDTO, "taskId" | "estado">,
): TareaDTO => ({
  titulo: `Tarea ${t.taskId}`,
  origen: "Jira",
  origenRef: `https://jira.example/browse/${t.taskId}`,
  asignadaEl: "2026-10-01",
  venceEl: null,
  completadaEl: null,
  diasAtraso: null,
  ...t,
});

/** 3 completed, 2 open in time and 5 overdue: the 10, 7 and 5 of EMP-001's newest week. Already in server order. */
export const TAREAS: TareaDTO[] = [
  tarea({
    taskId: "OPS-1436",
    titulo: "Revisar contratos de proveedores",
    estado: "VENCIDA",
    venceEl: "2026-10-01",
    diasAtraso: 17,
  }),
  tarea({
    taskId: "OPS-1432",
    titulo: "Conciliar facturación de septiembre",
    estado: "VENCIDA",
    venceEl: "2026-10-09",
    diasAtraso: 9,
  }),
  tarea({
    taskId: "OPS-1433",
    titulo: "Actualizar el inventario de equipos",
    estado: "VENCIDA",
    venceEl: "2026-10-12",
    diasAtraso: 6,
    origenRef: null,
  }),
  tarea({
    taskId: "OPS-1435",
    estado: "VENCIDA",
    venceEl: "2026-10-16",
    diasAtraso: 2,
  }),
  tarea({
    taskId: "OPS-1434",
    estado: "VENCIDA",
    venceEl: "2026-10-18",
    diasAtraso: 0,
  }),
  tarea({
    taskId: "OPS-1461",
    estado: "PENDIENTE",
    asignadaEl: "2026-10-13",
    venceEl: "2026-10-23",
  }),
  tarea({ taskId: "OPS-1462", estado: "PENDIENTE", asignadaEl: "2026-10-13" }),
  tarea({
    taskId: "OPS-1451",
    estado: "COMPLETADA",
    asignadaEl: "2026-10-13",
    venceEl: "2026-10-15",
    completadaEl: "2026-10-14",
  }),
  tarea({
    taskId: "OPS-1450",
    titulo: "Actualizar tablero de guardias",
    estado: "COMPLETADA",
    asignadaEl: "2026-10-13",
    venceEl: "2026-10-17",
    completadaEl: "2026-10-16",
  }),
  tarea({
    taskId: "OPS-1452",
    estado: "COMPLETADA",
    asignadaEl: "2026-10-13",
    venceEl: "2026-10-18",
    completadaEl: "2026-10-18",
  }),
];

/** 120 tasks, a third of each status: three pages of 50 to walk through. */
export const TAREAS_MUCHAS: TareaDTO[] = Array.from({ length: 120 }, (_, i) => {
  const estado = (["VENCIDA", "PENDIENTE", "COMPLETADA"] as const)[i % 3];
  return tarea({
    taskId: `OPS-${2000 + i}`,
    estado,
    asignadaEl: "2026-10-13",
    venceEl: "2026-10-16",
    completadaEl: estado === "COMPLETADA" ? "2026-10-15" : null,
    diasAtraso: estado === "VENCIDA" ? 2 : null,
  });
});

const PERSONA = {
  employeeId: "EMP-001",
  nombre: "Persona ficticia 001",
  tipo: "TECNICO" as const,
  teamId: "EQ-01",
  equipo: "Célula ficticia 1",
};

const grupos = (tareas: TareaDTO[]) =>
  (["COMPLETADA", "PENDIENTE", "VENCIDA"] as const).flatMap((estado) => {
    const filas = tareas.filter((t) => t.estado === estado);
    return filas.length
      ? [
          {
            estado,
            n: filas.length,
            diasAtrasoMax: Math.max(...filas.map((t) => t.diasAtraso ?? 0)),
            diasAtrasoTotal: filas.reduce(
              (suma, t) => suma + (t.diasAtraso ?? 0),
              0,
            ),
          },
        ]
      : [];
  });

/** What the viewer is allowed to read: the whole week, only its counts, or a week with many tasks. */
export type Perfil = "completo" | "sin-acceso" | "muchas";

type Pedido = { estado?: string | null; page?: number; pageSize?: number };

/** The week as the server answers it for `desde`, narrowed and paged like the real route. */
export function semana(
  w: typeof SEMANA_CON_DETALLE,
  { estado, page = 1, pageSize = 50 }: Pedido = {},
  perfil: Perfil = "completo",
): TareasSemanaDTO {
  const conDetalle = w.desde === SEMANA_CON_DETALLE.desde;
  const desajustada = w.desde === SEMANA_DESAJUSTADA.desde;
  const filas =
    perfil === "muchas"
      ? TAREAS_MUCHAS
      : conDetalle
        ? TAREAS
        : desajustada
          ? TAREAS.slice(0, 3)
          : [];
  const filtradas = estado ? filas.filter((t) => t.estado === estado) : filas;
  const visibles = perfil !== "sin-acceso";
  const resumen = resumirGrupos(grupos(filas));
  const indicadores = {
    horasExtra: 16,
    diasConsecutivosSinDescanso: conDetalle ? 16 : 9,
    // The summary stores what the rows add up to, except in the week that is meant to disagree.
    ...(perfil === "muchas"
      ? {
          tareasActivas: resumen.total,
          tareasPendientes: resumen.pendientes + resumen.vencidas,
          tareasVencidas: resumen.vencidas,
        }
      : {
          tareasActivas: conDetalle || desajustada ? 10 : 12,
          tareasPendientes: conDetalle || desajustada ? 7 : 8,
          tareasVencidas: conDetalle || desajustada ? 5 : 0,
        }),
    vacacionesPendientesDias: 14,
  };
  const coincide =
    indicadores.tareasActivas === resumen.total &&
    indicadores.tareasPendientes === resumen.pendientes + resumen.vencidas &&
    indicadores.tareasVencidas === resumen.vencidas;
  const hayDetalle = filas.length > 0;
  return {
    persona: PERSONA,
    semana: {
      periodStart: w.desde,
      periodEnd: w.hasta,
      recordId: `record-${w.desde}`,
      vigente: true,
    },
    indicadores,
    resultado: conDetalle
      ? {
          evaluationId: "mock-evaluation-2",
          indice: 91.21,
          nivel: "ALTO",
          actualizado: true,
        }
      : {
          evaluationId: "mock-evaluation-1",
          indice: 83.71,
          nivel: "INCOMPLETO",
          actualizado: true,
        },
    detalle: hayDetalle ? "CON_DETALLE" : "SIN_DETALLE",
    resumen,
    conciliacion: hayDetalle
      ? {
          coincide,
          campos: [
            {
              campo: "tareasActivas",
              resumen: indicadores.tareasActivas,
              detalle: resumen.total,
            },
            {
              campo: "tareasPendientes",
              resumen: indicadores.tareasPendientes,
              detalle: resumen.pendientes + resumen.vencidas,
            },
            {
              campo: "tareasVencidas",
              resumen: indicadores.tareasVencidas,
              detalle: resumen.vencidas,
            },
          ],
        }
      : null,
    importacion: hayDetalle
      ? {
          importId: "mock-import-tareas",
          confirmadaEl: "2026-10-19T12:00:00.000Z",
        }
      : null,
    tareasVisibles: visibles,
    tareas: {
      items: visibles
        ? filtradas.slice((page - 1) * pageSize, page * pageSize)
        : [],
      total: visibles ? filtradas.length : 0,
      page,
      pageSize,
    },
  };
}

const fila = (w: typeof SEMANA_CON_DETALLE): SemanaTareasDTO => {
  const s = semana(w);
  return {
    periodStart: w.desde,
    periodEnd: w.hasta,
    recordId: s.semana.recordId,
    indicadores: {
      tareasActivas: s.indicadores.tareasActivas,
      tareasPendientes: s.indicadores.tareasPendientes,
      tareasVencidas: s.indicadores.tareasVencidas,
    },
    detalle: s.detalle,
    resumen: s.resumen,
    coincide: s.conciliacion ? s.conciliacion.coincide : null,
  };
};
export const LIBRO = [
  SEMANA_CON_DETALLE,
  SEMANA_SIN_DETALLE,
  SEMANA_DESAJUSTADA,
].map(fila);

export const CIERRES: CierreTareaDTO[] = [
  {
    periodStart: "2026-10-12",
    periodEnd: "2026-10-18",
    asignadaEl: "2026-10-01",
    venceEl: "2026-10-09",
    completadaEl: null,
    estado: "VENCIDA",
    diasAtraso: 9,
  },
  {
    periodStart: "2026-10-05",
    periodEnd: "2026-10-11",
    asignadaEl: "2026-10-01",
    venceEl: "2026-10-09",
    completadaEl: null,
    estado: "VENCIDA",
    diasAtraso: 2,
  },
];

export function historial(taskId: string): HistorialTareaDTO {
  const t = TAREAS.find((x) => x.taskId === taskId) ?? TAREAS[1];
  return {
    persona: PERSONA,
    taskId: t.taskId,
    titulo: t.titulo,
    origen: t.origen,
    origenRef: t.origenRef,
    cierres: CIERRES,
    truncado: false,
  };
}

export function misTareas(url: URL): MisTareasDTO {
  const desde = url.searchParams.get("periodStart") ?? SEMANA_CON_DETALLE.desde;
  const w = LIBRO.find((x) => x.periodStart === desde);
  const rango = w
    ? { desde: w.periodStart, hasta: w.periodEnd }
    : SEMANA_CON_DETALLE;
  const propia = semana(rango, {
    estado: url.searchParams.get("estado"),
    page: Number(url.searchParams.get("page") ?? 1),
  });
  return {
    nombre: PERSONA.nombre,
    equipo: PERSONA.equipo,
    semanas: LIBRO,
    // RF10: the person's own view never carries an index or level.
    semana: { ...propia, resultado: null },
  };
}

/** EMP-001's week and one overdue task of EMP-003, as a team's list: overdue first, the longest delay first. */
export function tareasEquipo(estado: string | null, page = 1): TareasEquipoDTO {
  const otra = tarea({
    taskId: "OPS-1500",
    titulo: "Revisar el plan de guardias",
    estado: "VENCIDA",
    venceEl: "2026-10-10",
    diasAtraso: 8,
  });
  const filas = [
    ...TAREAS.map((t) => ({ ...t, employeeId: PERSONA.employeeId, nombre: PERSONA.nombre })),
    { ...otra, employeeId: "EMP-003", nombre: "Persona ficticia 003" },
  ];
  const orden = { VENCIDA: 0, PENDIENTE: 1, COMPLETADA: 2 };
  filas.sort((a, b) => orden[a.estado] - orden[b.estado] || (b.diasAtraso ?? -1) - (a.diasAtraso ?? -1));
  const filtradas = estado ? filas.filter((t) => t.estado === estado) : filas;
  return {
    equipo: { teamId: "EQ-01", nombre: "Célula ficticia 1" },
    semana: { periodStart: SEMANA_CON_DETALLE.desde, periodEnd: SEMANA_CON_DETALLE.hasta },
    alcance: "EQUIPO",
    personas: 2,
    sinDetalle: 0,
    resumen: resumirGrupos(grupos(filas)),
    tareas: { items: filtradas.slice((page - 1) * 25, page * 25), total: filtradas.length, page, pageSize: 25 },
  };
}

/** The task routes, with the requests they received so a spec can assert what the screen asked for. */
export async function tareasMocks(page: Page, perfil: Perfil = "completo") {
  const pedidos: URL[] = [];
  await page.route(api("/api/tareas"), (route) => {
    const url = new URL(route.request().url());
    pedidos.push(url);
    const desde =
      url.searchParams.get("periodStart") ?? SEMANA_CON_DETALLE.desde;
    const w = [SEMANA_CON_DETALLE, SEMANA_SIN_DETALLE, SEMANA_DESAJUSTADA].find(
      (x) => x.desde === desde,
    );
    if (!w)
      return route.fulfill({
        status: 404,
        json: {
          error: {
            codigo: "NO_ENCONTRADO",
            mensaje: "No hay datos cargados para esa persona y semana.",
            detalles: [],
          },
        },
      });
    return route.fulfill({
      json: semana(
        w,
        {
          estado: url.searchParams.get("estado"),
          page: Number(url.searchParams.get("page") ?? 1),
          pageSize: Number(url.searchParams.get("pageSize") ?? 50),
        },
        perfil,
      ),
    });
  });
  // Counts per week (the person page reads the newest one for its oldest overdue task).
  await page.route(api("/api/tareas/semanas"), (route) => {
    const url = new URL(route.request().url());
    pedidos.push(url);
    const w = semana(SEMANA_CON_DETALLE, {}, perfil);
    return route.fulfill({
      json: {
        persona: w.persona,
        semanas: [
          {
            periodStart: w.semana.periodStart,
            periodEnd: w.semana.periodEnd,
            recordId: w.semana.recordId,
            indicadores: w.indicadores,
            detalle: w.detalle,
            resumen: w.resumen,
            coincide: true,
          },
        ],
      },
    });
  });
  await page.route(api("/api/tareas/equipo"), (route) => {
    const url = new URL(route.request().url());
    pedidos.push(url);
    return route.fulfill({
      json: tareasEquipo(url.searchParams.get("estado"), Number(url.searchParams.get("page") ?? 1)),
    });
  });
  await page.route(api("/api/tareas/historial"), (route) => {
    const url = new URL(route.request().url());
    pedidos.push(url);
    return route.fulfill({
      json: historial(url.searchParams.get("taskId") ?? ""),
    });
  });
  await page.route(api("/api/mis-datos/tareas"), (route) => {
    const url = new URL(route.request().url());
    pedidos.push(url);
    return route.fulfill({ json: misTareas(url) });
  });
  return pedidos;
}
