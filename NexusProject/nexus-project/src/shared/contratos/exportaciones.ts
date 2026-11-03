// CSV exports of lists. One endpoint per list, same filters and scope as the screen.
// Merged into API_ROUTES (../api.ts) and cuerposExitoMock (../mocks.ts). Never import ../mocks here.
// Research: work/enterprise/research/workforce-admin.md §1.10, §2.5, §4.5; audit-trail.md (EXPORTACION_GENERADA).
import type { FechaISO } from "../contracts";
import type { FiltroSeguimiento } from "./seguimiento";

export const TIPOS_EXPORTACION = ["alertas", "personas", "equipos"] as const;
export type TipoExportacion = (typeof TIPOS_EXPORTACION)[number];

/**
 * Excel in es-AR reads a file by the Windows list separator, and a locale whose decimal mark is a comma
 * uses the semicolon (Microsoft Support: «Import or export text (.txt or .csv) files»). The BOM makes
 * Excel read UTF-8; lines end in CRLF and fields quote as RFC 4180 §2 says.
 */
export const FORMATO_CSV = {
  separador: ";",
  bom: "﻿",
  finDeLinea: "\r\n",
  contentType: "text/csv; charset=utf-8",
} as const;

/** Beyond this the request is refused, never cut: a silently partial file misleads (Excel allows 1.048.576). */
export const LIMITE_FILAS_EXPORTACION = 10_000;

/** The filters the screen has, by list. `alertas` also takes the follow-up filters. */
export type FiltrosExportacion = {
  employeeId?: string;
  teamId?: string;
  /** A Monday; `personas` and `equipos` default to the latest loaded week. */
  periodStart?: FechaISO;
  seguimiento?: FiltroSeguimiento;
  asignadoA?: string;
  vencido?: "1";
};

export const RUTAS_EXPORTACIONES = {
  descargarExportacion: { method: "GET", path: "/api/exportaciones/{tipo}" },
} as const;

export type PeticionesExportaciones = {
  descargarExportacion: {
    params: { tipo: TipoExportacion };
    query?: FiltrosExportacion;
    body?: undefined;
  };
};

/** The body is the CSV text itself (`text/csv`), with the row count in `X-Total-Filas`. */
export type CuerposExportaciones = {
  descargarExportacion: string;
};

export const MOCKS_EXPORTACIONES = {
  descargarExportacion:
    "﻿Alertas con seguimiento\r\nGenerado el 2026-10-19 09:00\r\n\r\nLegajo;Persona\r\nEMP-001;Persona ficticia 001\r\n",
} satisfies CuerposExportaciones;
