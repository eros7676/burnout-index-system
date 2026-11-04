// Alert follow-up cases: owner, status, notes, measures.
// Merged into API_ROUTES (../api.ts) and cuerposExitoMock (../mocks.ts). Never import ../mocks here.
// Research: work/enterprise/research/workforce-admin.md §1.8, §1.9, §2.4, §4.4.
import type { Factor, FechaISO } from "../contracts";

// ── Vocabulary ────────────────────────────────────────────────────────────

/** NUEVO → EN_CURSO ⇄ EN_ESPERA → CERRADO. No reopening (Workday: case owners cannot reopen by default). */
export const ESTADOS_SEGUIMIENTO = [
  "NUEVO",
  "EN_CURSO",
  "EN_ESPERA",
  "CERRADO",
] as const;
export type EstadoSeguimiento = (typeof ESTADOS_SEGUIMIENTO)[number];

/** The «Seguimiento» filter of the alerts list: a status, or no case at all. */
export const FILTROS_SEGUIMIENTO = ["SIN_SEGUIMIENTO", ...ESTADOS_SEGUIMIENTO] as const;
export type FiltroSeguimiento = (typeof FILTROS_SEGUIMIENTO)[number];

export const ESTADO_SEGUIMIENTO: Record<EstadoSeguimiento, string> = {
  NUEVO: "Nuevo",
  EN_CURSO: "En curso",
  EN_ESPERA: "En espera",
  CERRADO: "Cerrado",
};

/** Closure outcomes; the research gives no taxonomy, so the list is a design choice (§1.8). */
export const MOTIVOS_CIERRE = [
  "MEDIDAS_IMPLEMENTADAS",
  "SIN_ACCION_NECESARIA",
  "SUPERADA_POR_RECALCULO",
  "BAJA_PERSONA",
] as const;
export type MotivoCierre = (typeof MOTIVOS_CIERRE)[number];

export const MOTIVO_CIERRE: Record<MotivoCierre, string> = {
  MEDIDAS_IMPLEMENTADAS: "Medidas implementadas",
  SIN_ACCION_NECESARIA: "Revisado sin acción necesaria",
  SUPERADA_POR_RECALCULO: "Superada por recálculo",
  BAJA_PERSONA: "Persona dada de baja",
};

/**
 * Organizational measures, never actions on the person (EU-OSHA, WHO: workload, pace, staffing;
 * consultation and monitoring close the cycle). `factor` is the factor a measure usually answers.
 */
export const TIPOS_MEDIDA = {
  REDISTRIBUIR_TAREAS: { etiqueta: "Redistribuir tareas", factor: "CT" },
  AJUSTAR_PLAZOS: { etiqueta: "Ajustar plazos de entrega", factor: "CT" },
  LIMITAR_HORAS_EXTRAS: { etiqueta: "Limitar horas extras", factor: "HE" },
  GARANTIZAR_DESCANSO: { etiqueta: "Garantizar descansos", factor: "DS" },
  PLANIFICAR_VACACIONES: { etiqueta: "Planificar vacaciones", factor: "VP" },
  REVISAR_DOTACION: { etiqueta: "Revisar la dotación del equipo", factor: null },
  CONSULTAR_PERSONA: {
    etiqueta: "Consultar a la persona sobre su carga de trabajo",
    factor: null,
  },
  VERIFICAR_EFECTO: {
    etiqueta: "Verificar el efecto de las medidas",
    factor: null,
  },
} as const satisfies Record<string, { etiqueta: string; factor: Factor | null }>;
export type TipoMedida = keyof typeof TIPOS_MEDIDA;
export const TIPOS_MEDIDA_CLAVES = Object.keys(TIPOS_MEDIDA) as TipoMedida[];

export const LIMITES_SEGUIMIENTO = {
  nota: { min: 1, max: 1000 },
  /** The closing justification is also the audit event's justification (VarChar 280). */
  justificacion: { min: 10, max: 280 },
} as const;

// ── Bodies ────────────────────────────────────────────────────────────────

export type UsuarioReferencia = { userId: string; nombre: string };

export type NotaSeguimientoDTO = {
  notaId: string;
  autor: UsuarioReferencia;
  texto: string;
  createdAt: string;
  /** The note written when the case was closed. */
  esCierre: boolean;
};

export type MedidaSeguimientoDTO = {
  medidaId: string;
  tipo: TipoMedida;
  factor: Factor | null;
  responsable: UsuarioReferencia;
  vence: FechaISO | null;
  hecha: boolean;
  createdAt: string;
};

export type CasoSeguimientoDTO = {
  casoId: string;
  employeeId: string;
  /** The alert the case was opened from; later alerts of the person join it by date. */
  alertaOrigenId: string;
  estado: EstadoSeguimiento;
  asignadoA: UsuarioReferencia;
  vence: FechaISO | null;
  /** Derived: the due date passed while the case is NUEVO or EN_CURSO (EN_ESPERA pauses it). */
  vencido: boolean;
  motivoCierre: MotivoCierre | null;
  abiertoPor: UsuarioReferencia;
  cerradoPor: UsuarioReferencia | null;
  createdAt: string;
  cerradoAt: string | null;
  medidas: MedidaSeguimientoDTO[];
  /** null when the viewer may not read the internal notes (only RR. HH. and the case owner may). */
  notas: NotaSeguimientoDTO[] | null;
  totalNotas: number;
};

/** What a list row shows of the case an alert belongs to. */
export type ResumenSeguimiento = {
  casoId: string;
  estado: EstadoSeguimiento;
  asignadoA: UsuarioReferencia;
  vence: FechaISO | null;
  vencido: boolean;
};

export type PermisosSeguimiento = {
  /** Open a case from this alert (no open case, alert still active). */
  abrir: boolean;
  /** Change status, due date and measures; close. */
  gestionar: boolean;
  /** Read and write internal notes. */
  anotar: boolean;
  /** Assign the case to anyone allowed (RR. HH.); others may only take it themselves. */
  reasignar: boolean;
};

export type SeguimientoAlertaDTO = {
  alertId: string;
  caso: CasoSeguimientoDTO | null;
  /** ORIGEN: opened from this alert. ADJUNTA: the alert joined the person's case by date. */
  relacion: "ORIGEN" | "ADJUNTA" | null;
  permisos: PermisosSeguimiento;
  /** Who may own the case or a measure of it. */
  asignables: UsuarioReferencia[];
  /** The recipient's login; RR. HH. when the alert has none. */
  asignadoPorDefecto: string | null;
};

export type AbrirSeguimiento = { asignadoA?: string };
export type ActualizarSeguimiento = {
  estado?: "EN_CURSO" | "EN_ESPERA";
  asignadoA?: string;
  vence?: FechaISO | null;
};
export type AnotarSeguimiento = { texto: string };
export type RegistrarMedida = {
  tipo: TipoMedida;
  factor?: Factor | null;
  responsableId: string;
  vence?: FechaISO | null;
};
export type MarcarMedida = { medidaId: string; hecha: boolean };
export type CerrarSeguimiento = {
  motivoCierre: MotivoCierre;
  justificacion: string;
};

// ── Routes ────────────────────────────────────────────────────────────────

export const RUTAS_SEGUIMIENTO = {
  obtenerSeguimiento: {
    method: "GET",
    path: "/api/alertas/{alertId}/seguimiento",
  },
  abrirSeguimiento: {
    method: "POST",
    path: "/api/alertas/{alertId}/seguimiento",
  },
  actualizarSeguimiento: {
    method: "PATCH",
    path: "/api/alertas/{alertId}/seguimiento",
  },
  anotarSeguimiento: {
    method: "POST",
    path: "/api/alertas/{alertId}/seguimiento/notas",
  },
  registrarMedida: {
    method: "POST",
    path: "/api/alertas/{alertId}/seguimiento/medidas",
  },
  marcarMedida: {
    method: "PATCH",
    path: "/api/alertas/{alertId}/seguimiento/medidas",
  },
  cerrarSeguimiento: {
    method: "POST",
    path: "/api/alertas/{alertId}/seguimiento/cierre",
  },
} as const;

type Alerta = { params: { alertId: string } };

export type PeticionesSeguimiento = {
  obtenerSeguimiento: Alerta & { body?: undefined };
  abrirSeguimiento: Alerta & { body: AbrirSeguimiento };
  actualizarSeguimiento: Alerta & { body: ActualizarSeguimiento };
  anotarSeguimiento: Alerta & { body: AnotarSeguimiento };
  registrarMedida: Alerta & { body: RegistrarMedida };
  marcarMedida: Alerta & { body: MarcarMedida };
  cerrarSeguimiento: Alerta & { body: CerrarSeguimiento };
};

export type CuerposSeguimiento = {
  obtenerSeguimiento: SeguimientoAlertaDTO;
  abrirSeguimiento: SeguimientoAlertaDTO;
  actualizarSeguimiento: SeguimientoAlertaDTO;
  anotarSeguimiento: SeguimientoAlertaDTO;
  registrarMedida: SeguimientoAlertaDTO;
  marcarMedida: SeguimientoAlertaDTO;
  cerrarSeguimiento: SeguimientoAlertaDTO;
};

// ── Mocks ─────────────────────────────────────────────────────────────────

const ahora = "2026-10-19T12:00:00.000Z";
const rrhh: UsuarioReferencia = { userId: "demo-rrhh", nombre: "RRHH" };
const teamLead: UsuarioReferencia = {
  userId: "demo-tl-01",
  nombre: "Team Lead, Célula ficticia 1",
};

/** Every action answers with the alert's whole follow-up, so a screen never patches pieces together. */
export const seguimientoMock: SeguimientoAlertaDTO = {
  alertId: "mock-alert-1",
  caso: {
    casoId: "mock-caso-1",
    employeeId: "EMP-001",
    alertaOrigenId: "mock-alert-1",
    estado: "EN_CURSO",
    asignadoA: teamLead,
    vence: "2026-11-02",
    vencido: false,
    motivoCierre: null,
    abiertoPor: rrhh,
    cerradoPor: null,
    createdAt: ahora,
    cerradoAt: null,
    medidas: [
      {
        medidaId: "mock-medida-1",
        tipo: "REDISTRIBUIR_TAREAS",
        factor: "CT",
        responsable: teamLead,
        vence: "2026-10-30",
        hecha: false,
        createdAt: ahora,
      },
    ],
    notas: [
      {
        notaId: "mock-nota-1",
        autor: rrhh,
        texto: "Se acordó revisar la asignación de tareas de la semana.",
        createdAt: ahora,
        esCierre: false,
      },
    ],
    totalNotas: 1,
  },
  relacion: "ORIGEN",
  permisos: { abrir: false, gestionar: true, anotar: true, reasignar: true },
  asignables: [rrhh, teamLead],
  asignadoPorDefecto: teamLead.userId,
};

export const MOCKS_SEGUIMIENTO = {
  obtenerSeguimiento: seguimientoMock,
  abrirSeguimiento: seguimientoMock,
  actualizarSeguimiento: seguimientoMock,
  anotarSeguimiento: seguimientoMock,
  registrarMedida: seguimientoMock,
  marcarMedida: seguimientoMock,
  cerrarSeguimiento: seguimientoMock,
} satisfies CuerposSeguimiento;
