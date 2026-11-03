// Task evidence: the tasks behind one person-week, one task across weeks, the signed-in person's own tasks.
// Merged into API_ROUTES (../api.ts) and cuerposExitoMock (../mocks.ts). Never import ../mocks here.
//
// Model (research/task-evidence-scale.md §2): one TareaSemana row per task per employee-week, as it stood at
// the week's close. The rows are the source of the week's counts; `conciliacion` shows that they agree.
import type { FechaISO, Nivel, Pagina } from "../contracts";

/** Status at the week's close, derived from the dates by the importer. */
export type EstadoTarea = "COMPLETADA" | "PENDIENTE" | "VENCIDA";
export const ESTADOS_TAREA = [
  "COMPLETADA",
  "PENDIENTE",
  "VENCIDA",
] as const satisfies readonly EstadoTarea[];

/** The minimal fields that corroborate a count; the same DTO for every role (ILO 5.7, 10.6). */
export type TareaDTO = {
  /** Key in the source system. */
  taskId: string;
  titulo: string;
  origen: string;
  /** Only an https reference ever reaches the browser. */
  origenRef: string | null;
  asignadaEl: FechaISO;
  venceEl: FechaISO | null;
  completadaEl: FechaISO | null;
  estado: EstadoTarea;
  /** VENCIDA only: week end minus due date, in days (0 = due on the last day). */
  diasAtraso: number | null;
};

/** Counts derived from the task rows. `pendientes` are open and within their deadline. */
export type ResumenTareasDTO = {
  total: number;
  completadas: number;
  pendientes: number;
  vencidas: number;
  diasAtrasoMax: number;
  diasAtrasoTotal: number;
};

/** The three counts the weekly summary stores, which the task rows must reproduce. */
export type CampoConciliado =
  | "tareasActivas"
  | "tareasPendientes"
  | "tareasVencidas";
export type ConciliacionTareasDTO = {
  coincide: boolean;
  campos: { campo: CampoConciliado; resumen: number; detalle: number }[];
};

/**
 * CON_DETALLE: task rows back the counts (or the week has no tasks).
 * SIN_DETALLE: the summary was imported without task rows; the counts cannot be corroborated.
 */
export type DetalleTareas = "CON_DETALLE" | "SIN_DETALLE";

export type PersonaTareasDTO = {
  employeeId: string;
  nombre: string;
  tipo: "TECNICO" | "TEAM_LEAD";
  teamId: string;
  equipo: string;
};

/** The week's loaded counts, as the summary stores them. */
export type IndicadoresSemanaDTO = {
  horasExtra: number;
  diasConsecutivosSinDescanso: number;
  tareasActivas: number;
  tareasPendientes: number;
  tareasVencidas: number;
  vacacionesPendientesDias: number;
};

export type ImportacionTareasDTO = {
  importId: string;
  /** ISO UTC instant of the confirmation. */
  confirmadaEl: string | null;
};

/** One row of the weeks ledger: counts from the summary beside counts from the rows. */
export type SemanaTareasDTO = {
  periodStart: FechaISO;
  periodEnd: FechaISO;
  recordId: string;
  indicadores: Pick<
    IndicadoresSemanaDTO,
    "tareasActivas" | "tareasPendientes" | "tareasVencidas"
  >;
  detalle: DetalleTareas;
  resumen: ResumenTareasDTO;
  /** null when there is no detail to compare with. */
  coincide: boolean | null;
};

export type TareasSemanaDTO = {
  persona: PersonaTareasDTO;
  semana: {
    periodStart: FechaISO;
    periodEnd: FechaISO;
    recordId: string;
    /** false: a report of an earlier data version asked for this record. */
    vigente: boolean;
  };
  indicadores: IndicadoresSemanaDTO;
  /** Index and level of the evaluation that used this record; always null in the person's own view (RF10). */
  resultado: {
    evaluationId: string;
    indice: number;
    nivel: Nivel;
    actualizado: boolean;
  } | null;
  detalle: DetalleTareas;
  resumen: ResumenTareasDTO;
  /** null when there is no detail to compare with. */
  conciliacion: ConciliacionTareasDTO | null;
  importacion: ImportacionTareasDTO | null;
  /** false: the role may read the counts but not the task rows (Gerencia on technicians). */
  tareasVisibles: boolean;
  /** `total` counts the rows matching the status filter. */
  tareas: Pagina<TareaDTO>;
};

export type SemanasConTareasDTO = {
  persona: PersonaTareasDTO;
  /** Newest first, bounded by `semanas` (default 12, maximum 52). */
  semanas: SemanaTareasDTO[];
};

/** One close at which a task appeared. */
export type CierreTareaDTO = {
  periodStart: FechaISO;
  periodEnd: FechaISO;
  asignadaEl: FechaISO;
  venceEl: FechaISO | null;
  completadaEl: FechaISO | null;
  estado: EstadoTarea;
  diasAtraso: number | null;
};

export type HistorialTareaDTO = {
  persona: PersonaTareasDTO;
  taskId: string;
  /** From the newest close. */
  titulo: string;
  origen: string;
  origenRef: string | null;
  /** Newest first, at most 52. */
  cierres: CierreTareaDTO[];
  /** More closes exist than the 52 returned. */
  truncado: boolean;
};

export type MisTareasDTO = {
  nombre: string;
  equipo: string | null;
  semanas: SemanaTareasDTO[];
  /** The requested week, or the newest one; null when no week is loaded. */
  semana: TareasSemanaDTO | null;
};

export type FiltrosTareasSemana = {
  employeeId: string;
  periodStart: FechaISO;
  /** Reads the tasks of that data version (the report's snapshot) instead of the current one. */
  recordId?: string;
  estado?: EstadoTarea;
  page?: number;
  pageSize?: number;
};

export const RUTAS_TAREAS = {
  listarTareasSemana: { method: "GET", path: "/api/tareas" },
  listarSemanasConTareas: { method: "GET", path: "/api/tareas/semanas" },
  consultarHistorialTarea: { method: "GET", path: "/api/tareas/historial" },
  consultarMisTareas: { method: "GET", path: "/api/mis-datos/tareas" },
} as const;

export type PeticionesTareas = {
  listarTareasSemana: { query: FiltrosTareasSemana; body?: undefined };
  listarSemanasConTareas: {
    query: { employeeId: string; semanas?: number };
    body?: undefined;
  };
  consultarHistorialTarea: {
    query: { employeeId: string; taskId: string };
    body?: undefined;
  };
  consultarMisTareas: {
    query?: Pick<
      FiltrosTareasSemana,
      "periodStart" | "estado" | "page" | "pageSize"
    > & { semanas?: number };
    body?: undefined;
  };
};

export type CuerposTareas = {
  listarTareasSemana: TareasSemanaDTO;
  listarSemanasConTareas: SemanasConTareasDTO;
  consultarHistorialTarea: HistorialTareaDTO;
  consultarMisTareas: MisTareasDTO;
};

const personaMock: PersonaTareasDTO = {
  employeeId: "EMP-001",
  nombre: "Persona ficticia 001",
  tipo: "TECNICO",
  teamId: "EQ-01",
  equipo: "Célula ficticia 1",
};
const tareasMock: TareaDTO[] = [
  {
    taskId: "OPS-1432",
    titulo: "Conciliar facturación de septiembre",
    origen: "Jira",
    origenRef: "https://jira.example/browse/OPS-1432",
    asignadaEl: "2026-10-01",
    venceEl: "2026-10-09",
    completadaEl: null,
    estado: "VENCIDA",
    diasAtraso: 9,
  },
  {
    taskId: "OPS-1461",
    titulo: "Preparar el cierre de guardias",
    origen: "Jira",
    origenRef: null,
    asignadaEl: "2026-10-13",
    venceEl: "2026-10-23",
    completadaEl: null,
    estado: "PENDIENTE",
    diasAtraso: null,
  },
  {
    taskId: "OPS-1450",
    titulo: "Actualizar tablero de guardias",
    origen: "Jira",
    origenRef: "https://jira.example/browse/OPS-1450",
    asignadaEl: "2026-10-13",
    venceEl: "2026-10-17",
    completadaEl: "2026-10-16",
    estado: "COMPLETADA",
    diasAtraso: null,
  },
];
const resumenMock: ResumenTareasDTO = {
  total: 3,
  completadas: 1,
  pendientes: 1,
  vencidas: 1,
  diasAtrasoMax: 9,
  diasAtrasoTotal: 9,
};
const semanaMock: SemanaTareasDTO = {
  periodStart: "2026-10-12",
  periodEnd: "2026-10-18",
  recordId: "mock-record-2",
  indicadores: { tareasActivas: 3, tareasPendientes: 2, tareasVencidas: 1 },
  detalle: "CON_DETALLE",
  resumen: resumenMock,
  coincide: true,
};
const tareasSemanaMock: TareasSemanaDTO = {
  persona: personaMock,
  semana: {
    periodStart: "2026-10-12",
    periodEnd: "2026-10-18",
    recordId: "mock-record-2",
    vigente: true,
  },
  indicadores: {
    horasExtra: 16,
    diasConsecutivosSinDescanso: 16,
    tareasActivas: 3,
    tareasPendientes: 2,
    tareasVencidas: 1,
    vacacionesPendientesDias: 14,
  },
  resultado: {
    evaluationId: "mock-evaluation-2",
    indice: 91.21,
    nivel: "ALTO",
    actualizado: true,
  },
  detalle: "CON_DETALLE",
  resumen: resumenMock,
  conciliacion: {
    coincide: true,
    campos: [
      { campo: "tareasActivas", resumen: 3, detalle: 3 },
      { campo: "tareasPendientes", resumen: 2, detalle: 2 },
      { campo: "tareasVencidas", resumen: 1, detalle: 1 },
    ],
  },
  importacion: {
    importId: "mock-import-2",
    confirmadaEl: "2026-10-19T12:00:00.000Z",
  },
  tareasVisibles: true,
  tareas: { items: tareasMock, total: 3, page: 1, pageSize: 50 },
};

export const MOCKS_TAREAS = {
  listarTareasSemana: tareasSemanaMock,
  listarSemanasConTareas: { persona: personaMock, semanas: [semanaMock] },
  consultarHistorialTarea: {
    persona: personaMock,
    taskId: "OPS-1432",
    titulo: "Conciliar facturación de septiembre",
    origen: "Jira",
    origenRef: "https://jira.example/browse/OPS-1432",
    cierres: [
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
    ],
    truncado: false,
  },
  consultarMisTareas: {
    nombre: personaMock.nombre,
    equipo: personaMock.equipo,
    semanas: [semanaMock],
    semana: { ...tareasSemanaMock, resultado: null },
  },
} satisfies CuerposTareas;
