// Audit trail reads: filters (GET /api/auditoria, in api.ts), event detail, operation view, export.
// Merged into API_ROUTES (../api.ts) and cuerposExitoMock (../mocks.ts). Never import ../mocks here.
// Research: work/enterprise/research/audit-trail.md §4.
import type { EventoAuditoria, FiltrosAuditoria } from "../contracts";

/** Bounds that keep every audit read cheap, and the retention the screens announce (D9). */
export const AUDITORIA_LIMITES = {
  /** `total` stops counting here; the screen then says "más de". */
  conteoMaximo: 10_000,
  /** Rows in one export; beyond it the file is flagged as truncated. */
  exportacionMaxFilas: 10_000,
  /** Events shown in one operation view. */
  operacionMaxEventos: 200,
} as const;

export const RUTAS_AUDITORIA = {
  obtenerEventoAuditoria: { method: "GET", path: "/api/auditoria/{eventoId}" },
  listarOperacionAuditoria: {
    method: "GET",
    path: "/api/auditoria/operaciones/{correlacionId}",
  },
  exportarAuditoria: { method: "GET", path: "/api/auditoria/exportacion" },
} as const;

export type FormatoExportacion = "csv" | "json";
export type FiltrosExportacionAuditoria = Omit<
  FiltrosAuditoria,
  "cursor" | "pageSize"
> & { formato: FormatoExportacion };

export type DetalleAuditoria = {
  evento: EventoAuditoria;
  /** True when `evento.cambios` was derived on read, not stored with the event. */
  cambiosCalculados: boolean;
  /** The operation the event belongs to, when other events share it. */
  operacion: { id: string; eventos: number } | null;
};

export type OperacionAuditoria = {
  operacionId: string;
  /** Oldest first: the order in which the operation happened. */
  eventos: EventoAuditoria[];
  total: number;
  truncada: boolean;
};

/** Names are resolved when read and never exported: the file carries identifiers only. */
export type EventoExportado = Omit<
  EventoAuditoria,
  "recursoNombre" | "sujetoNombre"
>;

/** Body of `formato=json`; `formato=csv` answers text/csv with the same events, one per row. */
export type ExportacionAuditoria = {
  generadoEn: string;
  filtros: Record<string, string | boolean>;
  filas: number;
  /** True when more events matched than the file holds: narrow the period. */
  truncado: boolean;
  limite: number;
  eventos: EventoExportado[];
};

export type PeticionesAuditoria = {
  obtenerEventoAuditoria: { params: { eventoId: string }; body?: undefined };
  listarOperacionAuditoria: {
    params: { correlacionId: string };
    body?: undefined;
  };
  exportarAuditoria: { query: FiltrosExportacionAuditoria; body?: undefined };
};

export type CuerposAuditoria = {
  obtenerEventoAuditoria: DetalleAuditoria;
  listarOperacionAuditoria: OperacionAuditoria;
  exportarAuditoria: ExportacionAuditoria;
};

const eventoMock: EventoAuditoria = {
  eventoId: "mock-event-1",
  accion: "EMPLEADO_ACTUALIZADO",
  etiqueta: "Modificó los datos laborales de una persona",
  entidad: "EMPLEADO",
  recursoId: "EMP-001",
  sujetoId: "EMP-001",
  actorId: "demo-rrhh",
  actorNombre: "RRHH",
  actorRol: "RRHH",
  origen: "WEB",
  resultado: "EXITO",
  motivo: null,
  solicitudId: "mock-request-1",
  correlacionId: "mock-operation-1",
  cambios: [{ campo: "teamId", antes: "EQ-01", despues: "EQ-02" }],
  justificacion: null,
  detalles: {},
  createdAt: "2026-10-19T12:00:00.000Z",
  recursoNombre: "Persona ficticia 001",
  sujetoNombre: "Persona ficticia 001",
};

export const MOCKS_AUDITORIA = {
  obtenerEventoAuditoria: {
    evento: eventoMock,
    cambiosCalculados: false,
    operacion: { id: "mock-operation-1", eventos: 2 },
  },
  listarOperacionAuditoria: {
    operacionId: "mock-operation-1",
    eventos: [eventoMock],
    total: 1,
    truncada: false,
  },
  exportarAuditoria: {
    generadoEn: "2026-10-19T12:05:00.000Z",
    filtros: {},
    filas: 0,
    truncado: false,
    limite: AUDITORIA_LIMITES.exportacionMaxFilas,
    eventos: [],
  },
} satisfies CuerposAuditoria;
