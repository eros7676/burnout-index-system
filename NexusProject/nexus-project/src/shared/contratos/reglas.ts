// Rules drafts: create, simulate, submit, approve, publish.
// Merged into API_ROUTES (../api.ts) and cuerposExitoMock (../mocks.ts). Never import ../mocks here.
// Lifecycle and decisions: work/enterprise/research/workforce-admin.md §1.7, §2.3, §4.3.
import type { CambioAuditoria } from "../auditoria-catalogo";
import type {
  ConfiguracionIndice,
  ErrorCampo,
  Factor,
  FechaISO,
  Nivel,
  Pagina,
  UsuarioDemoDTO,
} from "../contracts";

export const RUTAS_REGLAS = {
  listarVersionesReglas: { method: "GET", path: "/api/reglas/versiones" },
  listarBorradoresReglas: { method: "GET", path: "/api/reglas/borradores" },
  crearBorradorReglas: { method: "POST", path: "/api/reglas/borradores" },
  obtenerBorradorReglas: {
    method: "GET",
    path: "/api/reglas/borradores/{borradorId}",
  },
  actualizarBorradorReglas: {
    method: "PUT",
    path: "/api/reglas/borradores/{borradorId}",
  },
  simularBorradorReglas: {
    method: "POST",
    path: "/api/reglas/borradores/{borradorId}/simular",
  },
  enviarBorradorReglas: {
    method: "POST",
    path: "/api/reglas/borradores/{borradorId}/enviar",
  },
  aprobarBorradorReglas: {
    method: "POST",
    path: "/api/reglas/borradores/{borradorId}/aprobar",
  },
  rechazarBorradorReglas: {
    method: "POST",
    path: "/api/reglas/borradores/{borradorId}/rechazar",
  },
  publicarBorradorReglas: {
    method: "POST",
    path: "/api/reglas/borradores/{borradorId}/publicar",
  },
  descartarBorradorReglas: {
    method: "POST",
    path: "/api/reglas/borradores/{borradorId}/descartar",
  },
} as const;

export type EstadoBorradorReglas =
  | "BORRADOR"
  | "EN_REVISION"
  | "PUBLICADO"
  | "DESCARTADO";
export type EstadoVersionReglas = "PROGRAMADA" | "VIGENTE" | "REEMPLAZADA";

/** The part of a rules version a draft edits. Version, author and creation time are set by the server. */
export type PropuestaReglas = {
  weights: Record<Factor, number>;
  thresholds: Record<Factor, number>;
  mediumLimit: number;
  highLimit: number;
  minExceededFactors: 2 | 3 | 4;
  effectiveFrom: FechaISO;
};

/** Longest reason accepted: it is also the audit trail's justification column. */
export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 280;

/** A person named by the server, so screens never show a user id. */
export type UsuarioRefDTO = {
  userId: string;
  nombre: string;
  rol: UsuarioDemoDTO["rol"] | null;
};

export type VersionReglasDTO = {
  version: string;
  effectiveFrom: FechaISO;
  createdAt: string;
  createdBy: UsuarioRefDTO;
  estado: EstadoVersionReglas;
  /** The reason and the approver come from the draft that published the version; seed and command-line versions have none. */
  motivo: string | null;
  aprobadoPor: UsuarioRefDTO | null;
  borradorId: string | null;
};

/** `vigente` is the version in force this week; `versiones` newest first, each labelled. */
export type VersionesReglasDTO = {
  vigente: ConfiguracionIndice;
  versiones: VersionReglasDTO[];
};

export type EquipoSimulacionDTO = {
  teamId: string;
  nombre: string;
} & (
  | { suprimido: true }
  | {
      suprimido: false;
      personas: number;
      semanas: number;
      semanasConCambio: number;
      antes: Record<Nivel, number>;
      despues: Record<Nivel, number>;
    }
);

/** Dry-run result: weeks recomputed with the draft against the version in force, nothing written. */
export type SimulacionReglasDTO = {
  calculadaAt: string;
  alcance: {
    desde: FechaISO;
    /** Start of the next version (exclusive), or null when the draft governs every later week. */
    hasta: FechaISO | null;
    semanas: number;
    personas: number;
    /** Weeks the engine could not evaluate; they are not counted anywhere below. */
    omitidas: number;
  };
  /** What the simulation read; publication compares it with the data of that moment. */
  contexto: {
    versionEnVigor: string;
    versionSiguiente: string | null;
    ultimaSemana: FechaISO | null;
    semanas: number;
  };
  antes: Record<Nivel, number>;
  despues: Record<Nivel, number>;
  transiciones: { de: Nivel; a: Nivel; semanas: number }[];
  semanasConCambio: number;
  personasConCambio: number;
  alertas: { nuevas: number; superadas: number };
  equipos: EquipoSimulacionDTO[];
};

export type CambioParametroDTO = {
  campo: string;
  antes: string | number;
  despues: string | number;
};

export type EventoBorradorDTO = {
  eventoId: string;
  accion: string;
  etiqueta: string;
  actor: UsuarioRefDTO;
  createdAt: string;
  justificacion: string | null;
  cambios: CambioAuditoria[];
};

export type BorradorResumenDTO = {
  borradorId: string;
  estado: EstadoBorradorReglas;
  baseVersion: string;
  effectiveFrom: FechaISO;
  motivo: string;
  retroactivo: boolean;
  /** The last simulation describes exactly the current content. */
  simulado: boolean;
  creadoPor: UsuarioRefDTO;
  aprobadoPor: UsuarioRefDTO | null;
  aprobadoAt: string | null;
  versionPublicada: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BorradorReglasDTO = BorradorResumenDTO & {
  /** Content fingerprint: every change request must quote the one it read. */
  huella: string;
  propuesta: PropuestaReglas;
  /** The version that would govern the draft's first week if the draft did not exist. */
  versionEnVigor: string;
  base: PropuestaReglas;
  cambios: CambioParametroDTO[];
  simulacion: SimulacionReglasDTO | null;
  /** False when the data changed since the simulation: simulate again before publishing. */
  simulacionVigente: boolean;
  /** Live: the draft governs weeks already evaluated, so it needs a different person's approval. */
  requiereAprobacion: boolean;
  /** What still prevents moving forward, as field errors. */
  problemas: ErrorCampo[];
  /** Reprocessing job of the published version. */
  publicacion: { version: string; jobId: string | null } | null;
  historial: EventoBorradorDTO[];
};

export type PublicacionReglasDTO = {
  borrador: BorradorReglasDTO;
  version: {
    version: string;
    effectiveFrom: FechaISO;
    jobId: string;
    semanas: number;
    estado: "PENDIENTE" | "COMPLETADO";
  };
};

export type FiltrosBorradoresReglas = {
  estado?: EstadoBorradorReglas;
  page?: number;
  pageSize?: number;
};

type CuerpoVacio = Record<string, never>;
type ConHuella = { huella: string };

export type PeticionesReglas = {
  listarVersionesReglas: { body?: undefined };
  listarBorradoresReglas: { query?: FiltrosBorradoresReglas; body?: undefined };
  crearBorradorReglas: { body: CuerpoVacio };
  obtenerBorradorReglas: { params: { borradorId: string }; body?: undefined };
  actualizarBorradorReglas: {
    params: { borradorId: string };
    body: ConHuella & { motivo: string; propuesta: PropuestaReglas };
  };
  simularBorradorReglas: { params: { borradorId: string }; body: ConHuella };
  enviarBorradorReglas: { params: { borradorId: string }; body: ConHuella };
  aprobarBorradorReglas: { params: { borradorId: string }; body: ConHuella };
  rechazarBorradorReglas: {
    params: { borradorId: string };
    body: ConHuella & { justificacion: string };
  };
  publicarBorradorReglas: { params: { borradorId: string }; body: ConHuella };
  descartarBorradorReglas: { params: { borradorId: string }; body: ConHuella };
};

export type CuerposReglas = {
  listarVersionesReglas: VersionesReglasDTO;
  listarBorradoresReglas: Pagina<BorradorResumenDTO>;
  crearBorradorReglas: BorradorReglasDTO;
  obtenerBorradorReglas: BorradorReglasDTO;
  actualizarBorradorReglas: BorradorReglasDTO;
  simularBorradorReglas: BorradorReglasDTO;
  enviarBorradorReglas: BorradorReglasDTO;
  aprobarBorradorReglas: BorradorReglasDTO;
  rechazarBorradorReglas: BorradorReglasDTO;
  publicarBorradorReglas: PublicacionReglasDTO;
  descartarBorradorReglas: BorradorReglasDTO;
};

const rrhh: UsuarioRefDTO = { userId: "demo-rrhh", nombre: "RRHH", rol: "RRHH" };
const gerencia: UsuarioRefDTO = {
  userId: "demo-gerencia",
  nombre: "Gerencia",
  rol: "GERENCIA",
};
const niveles = (bajo: number, medio: number, alto: number, incompleto: number) => ({
  BAJO: bajo,
  MEDIO: medio,
  ALTO: alto,
  INCOMPLETO: incompleto,
});

const vigenteMock: ConfiguracionIndice = {
  version: "v1",
  effectiveFrom: "2026-01-05",
  windowDays: 7,
  persistencePeriods: 2,
  weights: { HE: 0.3, DS: 0.3, CT: 0.25, VP: 0.15 },
  thresholds: { HE: 8, DS: 6, CT: 0.35, VP: 10 },
  mediumLimit: 40,
  highLimit: 70,
  minExceededFactors: 2,
  createdBy: "demo-local",
  createdAt: "2026-10-19T12:00:00.000Z",
};
const baseMock: PropuestaReglas = {
  weights: vigenteMock.weights,
  thresholds: vigenteMock.thresholds,
  mediumLimit: vigenteMock.mediumLimit,
  highLimit: vigenteMock.highLimit,
  minExceededFactors: vigenteMock.minExceededFactors,
  effectiveFrom: "2026-10-12",
};
const propuestaMock: PropuestaReglas = {
  ...baseMock,
  thresholds: { ...baseMock.thresholds, HE: 10 },
};
const simulacionMock: SimulacionReglasDTO = {
  calculadaAt: "2026-10-19T12:05:00.000Z",
  alcance: {
    desde: "2026-10-12",
    hasta: null,
    semanas: 8,
    personas: 8,
    omitidas: 0,
  },
  contexto: {
    versionEnVigor: "v1",
    versionSiguiente: null,
    ultimaSemana: "2026-10-12",
    semanas: 8,
  },
  antes: niveles(2, 3, 2, 1),
  despues: niveles(3, 3, 1, 1),
  transiciones: [
    { de: "ALTO", a: "BAJO", semanas: 1 },
  ],
  semanasConCambio: 1,
  personasConCambio: 1,
  alertas: { nuevas: 0, superadas: 1 },
  equipos: [
    {
      teamId: "EQ-01",
      nombre: "Célula ficticia 1",
      suprimido: false,
      personas: 5,
      semanas: 5,
      semanasConCambio: 1,
      antes: niveles(1, 2, 1, 1),
      despues: niveles(2, 2, 0, 1),
    },
    { teamId: "EQ-02", nombre: "Célula ficticia 2", suprimido: true },
  ],
};
const borradorMock: BorradorReglasDTO = {
  borradorId: "mock-borrador-1",
  estado: "BORRADOR",
  baseVersion: "v1",
  effectiveFrom: propuestaMock.effectiveFrom,
  motivo: "Ajuste del umbral de horas extra por convenio.",
  retroactivo: true,
  simulado: true,
  creadoPor: rrhh,
  aprobadoPor: null,
  aprobadoAt: null,
  versionPublicada: null,
  createdAt: "2026-10-19T12:00:00.000Z",
  updatedAt: "2026-10-19T12:05:00.000Z",
  huella: "a".repeat(64),
  propuesta: propuestaMock,
  versionEnVigor: "v1",
  base: baseMock,
  cambios: [{ campo: "thresholds.HE", antes: 8, despues: 10 }],
  simulacion: simulacionMock,
  simulacionVigente: true,
  requiereAprobacion: true,
  problemas: [],
  publicacion: null,
  historial: [
    {
      eventoId: "mock-evento-1",
      accion: "REGLAS_BORRADOR_CREADO",
      etiqueta: "Creó un borrador de reglas",
      actor: rrhh,
      createdAt: "2026-10-19T12:00:00.000Z",
      justificacion: null,
      cambios: [],
    },
  ],
};

export const MOCKS_REGLAS = {
  listarVersionesReglas: {
    vigente: vigenteMock,
    versiones: [
      {
        version: "v1",
        effectiveFrom: "2026-01-05",
        createdAt: vigenteMock.createdAt,
        createdBy: { userId: "demo-local", nombre: "demo-local", rol: null },
        estado: "VIGENTE",
        motivo: null,
        aprobadoPor: null,
        borradorId: null,
      },
    ],
  },
  listarBorradoresReglas: {
    items: [
      {
        borradorId: borradorMock.borradorId,
        estado: borradorMock.estado,
        baseVersion: borradorMock.baseVersion,
        effectiveFrom: borradorMock.effectiveFrom,
        motivo: borradorMock.motivo,
        retroactivo: borradorMock.retroactivo,
        simulado: borradorMock.simulado,
        creadoPor: borradorMock.creadoPor,
        aprobadoPor: null,
        aprobadoAt: null,
        versionPublicada: null,
        createdAt: borradorMock.createdAt,
        updatedAt: borradorMock.updatedAt,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 50,
  },
  crearBorradorReglas: borradorMock,
  obtenerBorradorReglas: borradorMock,
  actualizarBorradorReglas: borradorMock,
  simularBorradorReglas: borradorMock,
  enviarBorradorReglas: {
    ...borradorMock,
    estado: "EN_REVISION",
  },
  aprobarBorradorReglas: {
    ...borradorMock,
    estado: "EN_REVISION",
    aprobadoPor: gerencia,
    aprobadoAt: "2026-10-19T12:10:00.000Z",
  },
  rechazarBorradorReglas: borradorMock,
  publicarBorradorReglas: {
    borrador: {
      ...borradorMock,
      estado: "PUBLICADO",
      versionPublicada: "v2",
      aprobadoPor: gerencia,
      aprobadoAt: "2026-10-19T12:10:00.000Z",
      publicacion: { version: "v2", jobId: "mock-job-reglas" },
    },
    version: {
      version: "v2",
      effectiveFrom: propuestaMock.effectiveFrom,
      jobId: "mock-job-reglas",
      semanas: 8,
      estado: "PENDIENTE",
    },
  },
  descartarBorradorReglas: { ...borradorMock, estado: "DESCARTADO" },
} satisfies CuerposReglas;
