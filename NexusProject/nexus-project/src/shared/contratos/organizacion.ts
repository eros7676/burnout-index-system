// People and teams: create, edit, move, deactivate; team pages; personas-v1 import.
// Merged into API_ROUTES (../api.ts) and cuerposExitoMock (../mocks.ts). Never import ../mocks here.
// Research: work/enterprise/research/workforce-admin.md §2.1–2.2, §3, §4.1–4.2; task-evidence-scale.md §6.
import type {
  ErrorCampo,
  FechaISO,
  Nivel,
  Pagina,
  SemanaPersona,
} from "../contracts";

/** Position of a person. GERENCIA is the manager of teams' leads and is not evaluated. */
export type TipoPuesto = "TECNICO" | "TEAM_LEAD" | "GERENCIA";
export type MotivoAsignacion =
  | "ALTA"
  | "CAMBIO_EQUIPO"
  | "CAMBIO_PUESTO"
  | "CAMBIO_LIDER"
  | "BAJA"
  | "CORRECCION";
/** The reasons a user can pick when changing an assignment. */
export type MotivoCambio = Extract<
  MotivoAsignacion,
  "CAMBIO_EQUIPO" | "CAMBIO_PUESTO" | "CORRECCION"
>;
export type EstadoPersona = "ACTIVAS" | "BAJAS";
export type EstadoEquipo = "ACTIVOS" | "INACTIVOS";
export type FiltroNivel = Nivel | "DESACTUALIZADO";
/** «indice» and the load orders read the chosen week; people with no value there come last. */
export type OrdenDirectorio = "indice" | "nombre" | "vencidas" | "horasExtra" | "diasSinDescanso";
export const ORDENES_DIRECTORIO: OrdenDirectorio[] = [
  "indice",
  "nombre",
  "vencidas",
  "horasExtra",
  "diasSinDescanso",
];

export type Referencia = { employeeId: string; nombre: string };

/** Filters of the paged people list. One week per call (D10); the server pages in SQL. */
export type FiltrosDirectorio = {
  periodStart?: FechaISO;
  teamId?: string;
  estado?: EstadoPersona;
  /** Name or legajo, case and accent insensitive. */
  q?: string;
  nivel?: FiltroNivel;
  /** Puesto: Team Lead or Técnico. */
  tipo?: "TECNICO" | "TEAM_LEAD";
  orden?: OrdenDirectorio;
  page?: number;
  pageSize?: number;
};

/** One row of the people list, with the weeks ending at the chosen one (newest first, at most 8). */
export type PersonaFilaDTO = {
  employeeId: string;
  nombre: string;
  tipo: TipoPuesto;
  activo: boolean;
  enCobertura: boolean;
  teamId: string | null;
  equipo: string | null;
  responsable: string | null;
  semanas: SemanaPersona[];
};
export type DirectorioPersonasDTO = Pagina<PersonaFilaDTO> & {
  /** The week the rows are read for; null when nothing is loaded. */
  periodStart: FechaISO | null;
  /** Loaded weeks in the viewer's scope, newest first (the week selector). */
  semanas: FechaISO[];
};

export type AsignacionDTO = {
  asignacionId: string;
  desde: FechaISO;
  hasta: FechaISO | null;
  tipo: TipoPuesto;
  teamId: string | null;
  equipo: string | null;
  responsable: string | null;
  enCobertura: boolean;
  activo: boolean;
  motivo: MotivoAsignacion;
  comentario: string | null;
  /** Display name of who recorded the row. */
  registradoPor: string;
};

export type FichaPersonaDTO = {
  persona: {
    employeeId: string;
    nombre: string;
    tipo: TipoPuesto;
    activo: boolean;
    enCobertura: boolean;
    teamId: string | null;
    equipo: string | null;
    responsableId: string | null;
    responsable: string | null;
    fechaIngreso: FechaISO | null;
    fechaBaja: FechaISO | null;
    /** Start of the current assignment. */
    vigenteDesde: FechaISO | null;
    /** The team this person leads, if any. */
    lidera: { teamId: string; nombre: string } | null;
    /** Teams this person manages (Gerencia responsable). */
    gerenciaDe: number;
  };
  /** Newest first. */
  asignaciones: AsignacionDTO[];
  /** Newest first, at most `semanas` calendar weeks back from the latest loaded week. */
  semanas: SemanaPersona[];
  ultimaSemanaCargada: FechaISO | null;
};

export type EquipoOpcion = {
  teamId: string;
  nombre: string;
  lider: string | null;
  gerente: string | null;
};
export type OpcionesPersonaDTO = {
  legajoSugerido: string;
  /** Monday of the current week: the default and the latest allowed «vigente desde». */
  lunesActual: FechaISO;
  equipos: EquipoOpcion[];
};
export type OpcionesEquipoDTO = {
  codigoSugerido: string;
  lunesActual: FechaISO;
  /** Active Team Leads; `lideraTeamId` is set when they already lead a team. */
  lideres: (Referencia & {
    teamId: string | null;
    equipo: string | null;
    lideraTeamId: string | null;
  })[];
  gerentes: Referencia[];
};

export type EquipoFilaDTO = {
  teamId: string;
  nombre: string;
  activo: boolean;
  lider: Referencia | null;
  gerente: Referencia | null;
  /** Active members, whether or not they are evaluated. */
  personasActivas: number;
  /** Active members in coverage: the group the minimum size of five applies to. */
  personasEvaluables: number;
  /** Why the aggregates below are withheld; null when they are shown. */
  suprimido: null | "GRUPO_PEQUENO" | "COMPLEMENTARIA";
  /** People with at least one active alert (not alert-weeks). */
  alertasActivas: number | null;
  /** People per current level in the chosen week. */
  conteo: Record<Nivel, number> | null;
  promedioIndice: number | null;
  /** People with a current result in the chosen week. */
  evaluadas: number | null;
  /** People in Alto per week, oldest first, ending at the chosen week. */
  tendenciaAlto: { periodStart: FechaISO; alto: number }[] | null;
  /**
   * The chosen week's task counts summed over the covered people with the week loaded; withheld
   * with the other aggregates. `personasConVencidas`: people with a task overdue at the close.
   */
  tareas: { activas: number; vencidas: number; personasConVencidas: number; personas: number } | null;
};
export type EquiposDTO = {
  periodStart: FechaISO | null;
  semanas: FechaISO[];
  items: EquipoFilaDTO[];
};
export type EquipoDTO = EquipoFilaDTO & {
  periodStart: FechaISO | null;
  semanas: FechaISO[];
  /** Active technicians: the people who report to the lead. */
  tecnicosActivos: number;
};

// --- Writes -----------------------------------------------------------------------------

export type CrearPersona = {
  employeeId: string;
  nombre: string;
  tipo: TipoPuesto;
  teamId: string | null;
  desde: FechaISO;
  enCobertura: boolean;
  /** Sent after the server warned about a person with the same name. */
  confirmarNombreRepetido?: boolean;
};
export type EditarPersona = { nombre?: string; fechaIngreso?: FechaISO | null };
export type CambiarAsignacion = {
  motivo: MotivoCambio;
  /** A Monday not after the current week; ignored by CORRECCION, which edits the latest row. */
  desde?: FechaISO;
  tipo: TipoPuesto;
  teamId: string | null;
  enCobertura: boolean;
  /** Required by CORRECCION. */
  comentario?: string;
};
export type DarDeBaja = { fechaBaja: FechaISO; justificacion: string };
export type CrearEquipo = {
  teamId: string;
  nombre: string;
  liderId: string | null;
  gerenteId: string | null;
};
export type EditarEquipo = { nombre?: string; gerenteId?: string | null };
export type CambiarLider = { liderId: string };
export type DesactivarEquipo = { justificacion: string };

export type ResultadoPersona = { employeeId: string };
export type ResultadoEquipo = { teamId: string };

/** Preview of a personas-v1 file. Nothing is written until the file is confirmed. */
export type VistaPreviaPersonas = {
  esquema: "personas-v1";
  estado: "VALIDADA" | "RECHAZADA";
  /** SHA-256 of the file: the confirmation must send the same file. */
  huella: string;
  totalFilas: number;
  nuevas: number;
  omitidas: number;
  /** First rows that would be created. */
  muestra: {
    fila: number;
    employeeId: string;
    nombre: string;
    tipo: TipoPuesto;
    teamId: string | null;
    desde: FechaISO;
    enCobertura: boolean;
  }[];
  errores: ErrorCampo[];
  advertencias: ErrorCampo[];
};
export type ResultadoImportacionPersonas = {
  /** Shared by the audit events of the whole file. */
  correlacionId: string;
  creadas: number;
  omitidas: number;
};

/** Columns of personas-v1, in the order of the template. */
export const COLUMNAS_PERSONAS = [
  "employee_id",
  "nombre",
  "tipo",
  "team_id",
  "vigente_desde",
  "en_cobertura",
] as const;

export const RUTAS_ORGANIZACION = {
  listarDirectorioPersonas: { method: "GET", path: "/api/personas/directorio" },
  consultarOpcionesPersona: { method: "GET", path: "/api/personas/opciones" },
  obtenerFichaPersona: { method: "GET", path: "/api/personas/{employeeId}" },
  crearPersona: { method: "POST", path: "/api/personas" },
  editarPersona: { method: "PATCH", path: "/api/personas/{employeeId}" },
  cambiarAsignacionPersona: {
    method: "POST",
    path: "/api/personas/{employeeId}/asignaciones",
  },
  darDeBajaPersona: { method: "POST", path: "/api/personas/{employeeId}/baja" },
  validarImportacionPersonas: {
    method: "POST",
    path: "/api/personas/importacion/validar",
  },
  confirmarImportacionPersonas: {
    method: "POST",
    path: "/api/personas/importacion/confirmar",
  },
  listarEquipos: { method: "GET", path: "/api/equipos" },
  consultarOpcionesEquipo: { method: "GET", path: "/api/equipos/opciones" },
  crearEquipo: { method: "POST", path: "/api/equipos" },
  obtenerEquipo: { method: "GET", path: "/api/equipos/{teamId}" },
  editarEquipo: { method: "PATCH", path: "/api/equipos/{teamId}" },
  cambiarLiderEquipo: { method: "POST", path: "/api/equipos/{teamId}/lider" },
  desactivarEquipo: { method: "POST", path: "/api/equipos/{teamId}/baja" },
} as const;

export type PeticionesOrganizacion = {
  listarDirectorioPersonas: { query?: FiltrosDirectorio; body?: undefined };
  consultarOpcionesPersona: { body?: undefined };
  obtenerFichaPersona: {
    params: { employeeId: string };
    query?: { semanas?: number };
    body?: undefined;
  };
  crearPersona: { body: CrearPersona };
  editarPersona: { params: { employeeId: string }; body: EditarPersona };
  cambiarAsignacionPersona: {
    params: { employeeId: string };
    body: CambiarAsignacion;
  };
  darDeBajaPersona: { params: { employeeId: string }; body: DarDeBaja };
  /** The file travels as the `file` field of multipart/form-data. */
  validarImportacionPersonas: { file: File };
  /** The same file, plus the `huella` the preview returned (fields of multipart/form-data). */
  confirmarImportacionPersonas: { file: File; huella: string };
  listarEquipos: {
    query?: { periodStart?: FechaISO; estado?: EstadoEquipo; teamId?: string };
    body?: undefined;
  };
  consultarOpcionesEquipo: { body?: undefined };
  crearEquipo: { body: CrearEquipo };
  obtenerEquipo: {
    params: { teamId: string };
    query?: { periodStart?: FechaISO };
    body?: undefined;
  };
  editarEquipo: { params: { teamId: string }; body: EditarEquipo };
  cambiarLiderEquipo: { params: { teamId: string }; body: CambiarLider };
  desactivarEquipo: { params: { teamId: string }; body: DesactivarEquipo };
};

export type CuerposOrganizacion = {
  listarDirectorioPersonas: DirectorioPersonasDTO;
  consultarOpcionesPersona: OpcionesPersonaDTO;
  obtenerFichaPersona: FichaPersonaDTO;
  crearPersona: ResultadoPersona;
  editarPersona: ResultadoPersona;
  cambiarAsignacionPersona: ResultadoPersona;
  darDeBajaPersona: ResultadoPersona;
  validarImportacionPersonas: VistaPreviaPersonas;
  confirmarImportacionPersonas: ResultadoImportacionPersonas;
  listarEquipos: EquiposDTO;
  consultarOpcionesEquipo: OpcionesEquipoDTO;
  crearEquipo: ResultadoEquipo;
  obtenerEquipo: EquipoDTO;
  editarEquipo: ResultadoEquipo;
  cambiarLiderEquipo: ResultadoEquipo;
  desactivarEquipo: ResultadoEquipo;
};

// --- Mocks (fixed data for consumers; not seed, engine or real API) ---------------------

const semanaMock: SemanaPersona = {
  periodStart: "2026-10-12",
  periodEnd: "2026-10-18",
  horasExtra: 16,
  diasConsecutivosSinDescanso: 16,
  tareasActivas: 10,
  tareasPendientes: 7,
  tareasVencidas: 5,
  vacacionesPendientesDias: 14,
  horasTrabajadas: 56,
  diasDesdeUltimasVacaciones: 127,
  actualizado: true,
  processingState: "COMPLETADO",
  evaluationId: "mock-evaluation-2",
  indice: 91.21,
  nivel: "ALTO",
  alertId: "mock-alert-1",
};
const liderMock: Referencia = {
  employeeId: "TL-01",
  nombre: "Team Lead ficticio 1",
};
const gerenteMock: Referencia = {
  employeeId: "GER-01",
  nombre: "Gerente ficticio de Operaciones",
};
const equipoFilaMock: EquipoFilaDTO = {
  teamId: "EQ-01",
  nombre: "Célula ficticia 1",
  activo: true,
  lider: liderMock,
  gerente: gerenteMock,
  personasActivas: 12,
  personasEvaluables: 12,
  suprimido: null,
  alertasActivas: 1,
  conteo: { BAJO: 8, MEDIO: 3, ALTO: 1, INCOMPLETO: 0 },
  promedioIndice: 31.4,
  evaluadas: 12,
  tendenciaAlto: [
    { periodStart: "2026-10-05", alto: 0 },
    { periodStart: "2026-10-12", alto: 1 },
  ],
  tareas: { activas: 96, vencidas: 9, personasConVencidas: 3, personas: 12 },
};
const ficha: FichaPersonaDTO = {
  persona: {
    employeeId: "EMP-001",
    nombre: "Persona ficticia 001",
    tipo: "TECNICO",
    activo: true,
    enCobertura: true,
    teamId: "EQ-01",
    equipo: "Célula ficticia 1",
    responsableId: "TL-01",
    responsable: "Team Lead ficticio 1",
    fechaIngreso: "2026-01-05",
    fechaBaja: null,
    vigenteDesde: "2026-01-05",
    lidera: null,
    gerenciaDe: 0,
  },
  asignaciones: [
    {
      asignacionId: "mock-asignacion-1",
      desde: "2026-01-05",
      hasta: null,
      tipo: "TECNICO",
      teamId: "EQ-01",
      equipo: "Célula ficticia 1",
      responsable: "Team Lead ficticio 1",
      enCobertura: true,
      activo: true,
      motivo: "ALTA",
      comentario: null,
      registradoPor: "Instalación",
    },
  ],
  semanas: [semanaMock],
  ultimaSemanaCargada: "2026-10-12",
};

export const MOCKS_ORGANIZACION = {
  listarDirectorioPersonas: {
    items: [
      {
        employeeId: "EMP-001",
        nombre: "Persona ficticia 001",
        tipo: "TECNICO",
        activo: true,
        enCobertura: true,
        teamId: "EQ-01",
        equipo: "Célula ficticia 1",
        responsable: "Team Lead ficticio 1",
        semanas: [semanaMock],
      },
    ],
    total: 1,
    page: 1,
    pageSize: 50,
    periodStart: "2026-10-12",
    semanas: ["2026-10-12"],
  },
  consultarOpcionesPersona: {
    legajoSugerido: "EMP-046",
    lunesActual: "2026-11-02",
    equipos: [
      {
        teamId: "EQ-01",
        nombre: "Célula ficticia 1",
        lider: liderMock.nombre,
        gerente: gerenteMock.nombre,
      },
    ],
  },
  obtenerFichaPersona: ficha,
  crearPersona: { employeeId: "EMP-046" },
  editarPersona: { employeeId: "EMP-001" },
  cambiarAsignacionPersona: { employeeId: "EMP-001" },
  darDeBajaPersona: { employeeId: "EMP-001" },
  validarImportacionPersonas: {
    esquema: "personas-v1",
    estado: "VALIDADA",
    huella: "0".repeat(64),
    totalFilas: 1,
    nuevas: 1,
    omitidas: 0,
    muestra: [
      {
        fila: 2,
        employeeId: "EMP-046",
        nombre: "Persona ficticia 046",
        tipo: "TECNICO",
        teamId: "EQ-01",
        desde: "2026-11-02",
        enCobertura: true,
      },
    ],
    errores: [],
    advertencias: [],
  },
  confirmarImportacionPersonas: {
    correlacionId: "00000000-0000-4000-8000-000000000002",
    creadas: 1,
    omitidas: 0,
  },
  listarEquipos: {
    periodStart: "2026-10-12",
    semanas: ["2026-10-12"],
    items: [equipoFilaMock],
  },
  consultarOpcionesEquipo: {
    codigoSugerido: "EQ-05",
    lunesActual: "2026-11-02",
    lideres: [
      { ...liderMock, teamId: "EQ-01", equipo: "Célula ficticia 1", lideraTeamId: "EQ-01" },
    ],
    gerentes: [gerenteMock],
  },
  crearEquipo: { teamId: "EQ-05" },
  obtenerEquipo: {
    ...equipoFilaMock,
    periodStart: "2026-10-12",
    semanas: ["2026-10-12"],
    tecnicosActivos: 11,
  },
  editarEquipo: { teamId: "EQ-01" },
  cambiarLiderEquipo: { teamId: "EQ-01" },
  desactivarEquipo: { teamId: "EQ-05" },
} satisfies CuerposOrganizacion;
