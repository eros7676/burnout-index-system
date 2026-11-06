// Imports beyond the base weekly file: task detail (`tareas-v1`), day detail (`jornadas-v1`) and the
// downloadable templates.
// Merged into API_ROUTES (../api.ts) and cuerposExitoMock (../mocks.ts). Never import ../mocks here.
// Research: work/enterprise/research/task-evidence-scale.md §2.3 (file), §3 (control totals).
import type {
  ApiError,
  FechaISO,
  ResultadoImportacion,
  VistaPrevia,
} from "../contracts";

export const ESQUEMA_INDICADORES = "indicadores-v1" as const;
export const ESQUEMA_TAREAS = "tareas-v1" as const;
export const ESQUEMA_JORNADAS = "jornadas-v1" as const;
export type EsquemaImportacion =
  | typeof ESQUEMA_INDICADORES
  | typeof ESQUEMA_TAREAS
  | typeof ESQUEMA_JORNADAS;
/** The dataset a user chooses at the first step of the import. */
export type PlantillaImportacion = "indicadores" | "tareas" | "jornadas";
export const PLANTILLAS_IMPORTACION: readonly PlantillaImportacion[] = [
  "indicadores",
  "tareas",
  "jornadas",
];

/** Rows a `tareas-v1` file may hold: one week of about 500 people (research §6.6). */
export const MAX_FILAS_TAREAS = 10_000;
/** Errors and warnings listed per validation; the rest are summarised in one entry. */
export const MAX_ERRORES_REPORTADOS = 500;
/** Employee-weeks listed in the reconciliation table of the preview. */
export const MAX_FILAS_CONCILIACION = 100;
/** A task that does not count towards the week: cancelled, or handed to someone else. */
export const MOTIVOS_EXCLUSION = ["CANCELADA", "REASIGNADA"] as const;
export type MotivoExclusion = (typeof MOTIVOS_EXCLUSION)[number];

/** Row codes of `tareas-v1`, besides those of `indicadores-v1` (src/shared/errors.ts). */
export const CODIGOS_ERROR_TAREAS = [
  "FORMATO_INVALIDO",
  "FECHA_INCOHERENTE",
  "VALOR_NO_PERMITIDO",
  "SEMANA_SIN_RESUMEN",
  "TAREAS_NO_COINCIDEN",
  "ERRORES_OMITIDOS",
] as const;
export type CodigoErrorTarea = (typeof CODIGOS_ERROR_TAREAS)[number];
/** Warnings of `tareas-v1`: they never block a confirmation. */
export const CODIGOS_WARNING_TAREAS = ["VENCIMIENTO_ANTERIOR"] as const;

export type EstadoTareaCierre = "COMPLETADA" | "PENDIENTE" | "VENCIDA";
/** The three counts of the weekly summary (tareas_activas, tareas_pendientes, tareas_vencidas). */
export type ConteoTareas = {
  activas: number;
  pendientes: number;
  vencidas: number;
};
export type EstadoConciliacion = "COINCIDE" | "DIFERENCIA" | "SIN_RESUMEN";
/** One employee-week: the stored summary against what the task rows add up to. */
export type ConciliacionSemana = {
  employeeId: string;
  periodStart: FechaISO;
  periodEnd: FechaISO;
  /** Rows of the file that count towards the week. */
  tareas: number;
  /** Rows of the file left out (cancelled or reassigned). */
  excluidas: number;
  /** The week's stored summary; null when the week has none. */
  esperado: ConteoTareas | null;
  derivado: ConteoTareas;
  estado: EstadoConciliacion;
  /** The same detail is already stored: the week is skipped on confirmation. */
  yaCargada: boolean;
};
export type ResumenConciliacion = {
  semanas: number;
  coinciden: number;
  diferencias: number;
  sinResumen: number;
  /** Differences first, then the rest by person and week; at most MAX_FILAS_CONCILIACION. */
  filas: ConciliacionSemana[];
  truncada: boolean;
};
export type MuestraTarea = {
  employeeId: string;
  periodStart: FechaISO;
  taskId: string;
  titulo: string;
  origen: string;
  asignadaEl: FechaISO;
  venceEl: FechaISO | null;
  completadaEl: FechaISO | null;
  estadoCierre: EstadoTareaCierre;
  diasAtraso: number | null;
};

/** VistaPrevia of a task file: `muestra` stays empty, the sample is `muestraTareas`. */
export type VistaPreviaTareas = VistaPrevia & {
  esquema: typeof ESQUEMA_TAREAS;
  /** `nuevas` and `omitidas` count task rows; `excluidas` those left out of the week. */
  excluidas: number;
  semanasNuevas: number;
  semanasOmitidas: number;
  conciliacion: ResumenConciliacion;
  muestraTareas: MuestraTarea[];
};
export type ErrorValidacionImportacionTareas = {
  vistaPrevia: VistaPreviaTareas;
  error: ApiError["error"];
};
/** ResultadoImportacion of a task file: no calculation follows (the counts do not change). */
export type ResultadoImportacionTareas = ResultadoImportacion & {
  esquema: typeof ESQUEMA_TAREAS;
  /** Employee-weeks that received their task detail. */
  semanas: number;
  excluidas: number;
};

/** Rows a `jornadas-v1` file may hold: seven days for about 1,400 people. */
export const MAX_FILAS_JORNADAS = 10_000;
/** What a day was. A leave day carries no reason: no health or family data (PDF §6.3). */
export const TIPOS_DIA = ["TRABAJO", "DESCANSO", "VACACIONES", "LICENCIA"] as const;
export type TipoDia = (typeof TIPOS_DIA)[number];
/** Row and week codes of `jornadas-v1`, besides those of `indicadores-v1`. */
export const CODIGOS_ERROR_JORNADAS = [
  "FECHA_INCOHERENTE",
  "VALOR_NO_PERMITIDO",
  "SEMANA_INCOMPLETA",
  "SEMANA_SIN_RESUMEN",
  "JORNADAS_NO_COINCIDEN",
  "ERRORES_OMITIDOS",
] as const;
export type CodigoErrorJornada = (typeof CODIGOS_ERROR_JORNADAS)[number];

/** The four summary values the days of a week must reproduce. */
export type CampoJornadas =
  | "horasExtra"
  | "horasTrabajadas"
  | "diasConsecutivosSinDescanso"
  | "diasDesdeUltimasVacaciones";
/** The weekly summary's values, as stored; the two optional ones may be null. */
export type ResumenJornadas = {
  horasExtra: number;
  horasTrabajadas: number | null;
  diasConsecutivosSinDescanso: number;
  diasDesdeUltimasVacaciones: number | null;
};
/** What the seven days of the file add up to. */
export type ControlesJornadas = {
  horasExtra: number;
  horasTrabajadas: number;
  /** Working days in a row that end on Sunday. Seven means the streak may have begun earlier. */
  diasSeguidos: number;
  /** Days from the week's last vacation day to Sunday; null when the week has none. */
  diasDesdeVacaciones: number | null;
  /** Days of the week on vacation and on other leave. */
  vacaciones: number;
  licencias: number;
};
/** One employee-week: the stored summary against what its days add up to. */
export type ConciliacionJornadasSemana = {
  employeeId: string;
  periodStart: FechaISO;
  periodEnd: FechaISO;
  /** The week's stored summary; null when the week has none. */
  esperado: ResumenJornadas | null;
  derivado: ControlesJornadas;
  /** The summary values the days contradict; empty when they reconcile. */
  diferencias: CampoJornadas[];
  estado: EstadoConciliacion;
  /** The same days are already stored: the week is skipped on confirmation. */
  yaCargada: boolean;
};
export type ResumenConciliacionJornadas = Omit<ResumenConciliacion, "filas"> & {
  filas: ConciliacionJornadasSemana[];
};
export type MuestraJornada = {
  employeeId: string;
  periodStart: FechaISO;
  fecha: FechaISO;
  tipo: TipoDia;
  horasTrabajadas: number;
  horasExtra: number;
};
/** VistaPrevia of a day file: `nuevas` and `omitidas` count day rows; the sample is `muestraJornadas`. */
export type VistaPreviaJornadas = VistaPrevia & {
  esquema: typeof ESQUEMA_JORNADAS;
  semanasNuevas: number;
  semanasOmitidas: number;
  conciliacion: ResumenConciliacionJornadas;
  muestraJornadas: MuestraJornada[];
};
export type ErrorValidacionImportacionJornadas = {
  vistaPrevia: VistaPreviaJornadas;
  error: ApiError["error"];
};
/** ResultadoImportacion of a day file: no calculation follows (the summary does not change). */
export type ResultadoImportacionJornadas = ResultadoImportacion & {
  esquema: typeof ESQUEMA_JORNADAS;
  /** Employee-weeks that received their day detail. */
  semanas: number;
};

export const RUTAS_IMPORTACIONES = {
  validarImportacionTareas: {
    method: "POST",
    path: "/api/importaciones/tareas/validar",
  },
  validarImportacionJornadas: {
    method: "POST",
    path: "/api/importaciones/jornadas/validar",
  },
  descargarPlantillaImportacion: {
    method: "GET",
    path: "/api/importaciones/plantillas/{tipo}",
  },
} as const;

export type PeticionesImportaciones = {
  validarImportacionTareas: { file: File };
  validarImportacionJornadas: { file: File };
  descargarPlantillaImportacion: {
    params: { tipo: PlantillaImportacion };
    body?: undefined;
  };
};

/** The template is a CSV file (text/csv), so its success body is the file's text. */
export type CuerposImportaciones = {
  validarImportacionTareas: VistaPreviaTareas;
  validarImportacionJornadas: VistaPreviaJornadas;
  descargarPlantillaImportacion: string;
};

export const vistaPreviaTareasMock: VistaPreviaTareas = {
  importId: "mock-import-tareas-1",
  status: "VALIDADA",
  expiresAt: "2026-10-19T12:30:00.000Z",
  totalFilas: 3,
  nuevas: 3,
  omitidas: 0,
  muestra: [],
  errores: [],
  warnings: [],
  esquema: ESQUEMA_TAREAS,
  excluidas: 0,
  semanasNuevas: 1,
  semanasOmitidas: 0,
  conciliacion: {
    semanas: 1,
    coinciden: 1,
    diferencias: 0,
    sinResumen: 0,
    filas: [
      {
        employeeId: "EMP-001",
        periodStart: "2026-10-12",
        periodEnd: "2026-10-18",
        tareas: 3,
        excluidas: 0,
        esperado: { activas: 3, pendientes: 2, vencidas: 1 },
        derivado: { activas: 3, pendientes: 2, vencidas: 1 },
        estado: "COINCIDE",
        yaCargada: false,
      },
    ],
    truncada: false,
  },
  muestraTareas: [
    {
      employeeId: "EMP-001",
      periodStart: "2026-10-12",
      taskId: "OPS-1432",
      titulo: "Conciliar la facturación de septiembre",
      origen: "Mesa de ayuda",
      asignadaEl: "2026-10-01",
      venceEl: "2026-10-09",
      completadaEl: null,
      estadoCierre: "VENCIDA",
      diasAtraso: 9,
    },
  ],
};

/** EMP-001's week of the mock summary: 56 h worked, 16 of them overtime, seven days in a row. */
const SEMANA_MOCK: [FechaISO, TipoDia, number, number][] = [
  ["2026-10-12", "TRABAJO", 10, 2],
  ["2026-10-13", "TRABAJO", 10, 2],
  ["2026-10-14", "TRABAJO", 10, 2],
  ["2026-10-15", "TRABAJO", 10, 2],
  ["2026-10-16", "TRABAJO", 10, 2],
  ["2026-10-17", "TRABAJO", 3, 3],
  ["2026-10-18", "TRABAJO", 3, 3],
];

export const vistaPreviaJornadasMock: VistaPreviaJornadas = {
  importId: "mock-import-jornadas-1",
  status: "VALIDADA",
  expiresAt: "2026-10-19T12:30:00.000Z",
  totalFilas: 7,
  nuevas: 7,
  omitidas: 0,
  muestra: [],
  errores: [],
  warnings: [],
  esquema: ESQUEMA_JORNADAS,
  semanasNuevas: 1,
  semanasOmitidas: 0,
  conciliacion: {
    semanas: 1,
    coinciden: 1,
    diferencias: 0,
    sinResumen: 0,
    filas: [
      {
        employeeId: "EMP-001",
        periodStart: "2026-10-12",
        periodEnd: "2026-10-18",
        esperado: {
          horasExtra: 16,
          horasTrabajadas: 56,
          diasConsecutivosSinDescanso: 16,
          diasDesdeUltimasVacaciones: 127,
        },
        derivado: {
          horasExtra: 16,
          horasTrabajadas: 56,
          diasSeguidos: 7,
          diasDesdeVacaciones: null,
          vacaciones: 0,
          licencias: 0,
        },
        diferencias: [],
        estado: "COINCIDE",
        yaCargada: false,
      },
    ],
    truncada: false,
  },
  muestraJornadas: SEMANA_MOCK.map(([fecha, tipo, horasTrabajadas, horasExtra]) => ({
    employeeId: "EMP-001",
    periodStart: "2026-10-12",
    fecha,
    tipo,
    horasTrabajadas,
    horasExtra,
  })),
};

export const MOCKS_IMPORTACIONES = {
  validarImportacionTareas: vistaPreviaTareasMock,
  validarImportacionJornadas: vistaPreviaJornadasMock,
  descargarPlantillaImportacion:
    "employee_id,period_start,period_end,task_id,titulo,origen,origen_ref,asignada_fecha,vencimiento_fecha,completada_fecha,motivo_exclusion\n",
} satisfies CuerposImportaciones;
