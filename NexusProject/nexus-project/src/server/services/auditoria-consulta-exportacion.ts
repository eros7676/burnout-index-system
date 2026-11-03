// The audit export as a file. CSV follows RFC 4180 (comma, CRLF, doubled quotes) with a UTF-8 BOM
// so Excel reads accents; every cell is quoted and neutralized against formula injection
// (OWASP "CSV Injection": no cell may begin with = + - @ tab CR LF or their full-width forms).
// The file carries identifiers only: names are resolved on screen, never copied out (CNIL §6).
import type {
  EventoExportado,
  ExportacionAuditoria,
  FormatoExportacion,
} from "../../shared/contratos/auditoria";

export const COLUMNAS_CSV = [
  "evento_id",
  "fecha_hora_utc",
  "accion",
  "accion_etiqueta",
  "entidad",
  "recurso_id",
  "persona_id",
  "usuario_id",
  "usuario_nombre",
  "usuario_rol",
  "origen",
  "resultado",
  "motivo",
  "solicitud_id",
  "operacion_id",
  "justificacion",
  "cambios",
  "detalles",
] as const;

// Leading blanks are skipped because spreadsheets trim them before reading a formula.
const INICIO_DE_FORMULA = /^\s*[=+\-@\t\r\n＝＋－＠]/;

/** Prefixes a single quote to text a spreadsheet could take for a formula, so it stays text. */
export const neutralizar = (texto: string) =>
  INICIO_DE_FORMULA.test(texto) ? `'${texto}` : texto;

const celda = (valor: string | null | undefined) =>
  `"${neutralizar(valor ?? "").replaceAll('"', '""')}"`;

const json = (valor: unknown) => (valor == null ? "" : JSON.stringify(valor));

const fila = (e: EventoExportado) =>
  [
    e.eventoId,
    e.createdAt,
    e.accion,
    e.etiqueta,
    e.entidad,
    e.recursoId,
    e.sujetoId,
    e.actorId,
    e.actorNombre,
    e.actorRol,
    e.origen,
    e.resultado,
    e.motivo,
    e.solicitudId,
    e.correlacionId,
    e.justificacion,
    json(e.cambios),
    json(e.detalles),
  ]
    .map(celda)
    .join(",");

export const aCsv = (eventos: EventoExportado[]) =>
  `﻿${[COLUMNAS_CSV.map(celda).join(","), ...eventos.map(fila)].join("\r\n")}\r\n`;

export function aJson(datos: {
  eventos: EventoExportado[];
  filtros: Record<string, string | boolean>;
  truncado: boolean;
  limite: number;
  generadoEn: string;
}): ExportacionAuditoria {
  return {
    generadoEn: datos.generadoEn,
    filtros: datos.filtros,
    filas: datos.eventos.length,
    truncado: datos.truncado,
    limite: datos.limite,
    eventos: datos.eventos,
  };
}

/** Keeps the first `max` rows and says whether any were left out. */
export const recortar = <T>(filas: T[], max: number) => ({
  filas: filas.slice(0, max),
  truncado: filas.length > max,
});

const compacto = (iso: string) =>
  iso.replaceAll("-", "").replaceAll(":", "").replace(/\.\d+Z$/, "Z");

/** `auditoria_{desde}_{hasta}.csv` in UTC; an open end reads `inicio` or the generation time. */
export const nombreArchivo = (
  periodo: { desde?: string; hasta?: string },
  formato: FormatoExportacion,
  generadoEn: string,
) =>
  `auditoria_${periodo.desde ? compacto(periodo.desde) : "inicio"}_${compacto(
    periodo.hasta ?? generadoEn,
  )}.${formato}`;
