import { createHash } from "node:crypto";
import type { ErrorCampo } from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import { ErrorImportacion } from "./error-importacion";

/** Transport and parser limit shared by every dataset (5 MiB, shown to users as 5 MB). */
export const MAX_ARCHIVO_CSV = 5 * 1024 * 1024;

export const COLUMNAS_CSV = [
  "employee_id",
  "period_start",
  "period_end",
  "horas_extra",
  "dias_consecutivos_sin_descanso",
  "tareas_activas",
  "tareas_pendientes",
  "tareas_vencidas",
  "vacaciones_pendientes_dias",
  "horas_trabajadas",
  "dias_desde_ultimas_vacaciones",
] as const;
export type ColumnaCsv = (typeof COLUMNAS_CSV)[number];
export type FilaCsvDe<C extends string> = {
  fila: number;
  celdas: Partial<Record<C, string>>;
};
export type FilaCsv = FilaCsvDe<ColumnaCsv>;

/** What a dataset's file looks like: its columns, the ones that must be present, its row cap. */
export type EsquemaCsv<C extends string> = {
  columnas: readonly C[];
  obligatorias: readonly C[];
  maxFilas: number;
};
export const ESQUEMA_CSV_INDICADORES: EsquemaCsv<ColumnaCsv> = {
  columnas: COLUMNAS_CSV,
  obligatorias: COLUMNAS_CSV.slice(0, 9),
  maxFilas: 1000,
};

/** Error previo a la vista previa: T04 traduce estadoHttp al transporte. */
export class ErrorFormatoImportacion extends ErrorDominio {
  constructor(
    mensaje: string,
    readonly estadoHttp: 400 | 413 = 400,
    detalles: ErrorCampo[] = [],
  ) {
    super("CONTRATO_INVALIDO", mensaje, detalles);
  }
}

/** The file must be a CSV by name and type, and fit the transport limit. */
export function comprobarArchivoCsv(archivo: File) {
  if (archivo.size > MAX_ARCHIVO_CSV)
    throw new ErrorImportacion(
      413,
      "ARCHIVO_EXCESIVO",
      "El archivo supera el máximo de 5 MB.",
    );
  const mime = archivo.type.toLowerCase().split(";")[0];
  if (
    !/\.csv$/i.test(archivo.name) ||
    ![
      "",
      "text/csv",
      "application/csv",
      "text/plain",
      "application/octet-stream",
      "application/vnd.ms-excel",
    ].includes(mime)
  )
    throw new ErrorImportacion(
      415,
      "FORMATO_NO_CSV",
      "Seleccione un archivo CSV con codificación UTF-8.",
    );
}

const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * CSV UTF-8 estricto, con comillas escapadas y números de línea físicos. Sin IO.
 * One pass over the text: the cost grows with the file, not with the rows squared.
 */
export function leerCsv<C extends string>(
  bytes: Uint8Array,
  esquema: EsquemaCsv<C>,
): {
  sourceHash: string;
  filas: FilaCsvDe<C>[];
} {
  const { columnas: permitidas, obligatorias, maxFilas } = esquema;
  const excesoFilas = () =>
    new ErrorFormatoImportacion(
      `El archivo supera el máximo de ${miles(maxFilas)} filas de datos.`,
      413,
    );
  if (bytes.byteLength > MAX_ARCHIVO_CSV)
    throw new ErrorFormatoImportacion("El archivo supera el máximo de 5 MB.", 413);
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ErrorFormatoImportacion(
      "El archivo debe tener codificación UTF-8.",
    );
  }
  if (texto.includes("\0"))
    throw new ErrorFormatoImportacion("El archivo contiene bytes nulos.");
  const registros: { fila: number; valores: string[] }[] = [];
  let valores: string[] = [],
    celda = "",
    estado: "inicio" | "texto" | "comillas" | "cerrada" = "inicio";
  let linea = 1,
    inicio = 1;
  const terminarCelda = () => {
    valores.push(celda.trim());
    celda = "";
    estado = "inicio";
  };
  const terminarFila = () => {
    terminarCelda();
    if (valores.some((v) => v !== ""))
      registros.push({ fila: inicio, valores });
    if (registros.length > maxFilas + 1) throw excesoFilas();
    valores = [];
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (estado === "comillas") {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celda += '"';
          i++;
        } else estado = "cerrada";
      } else {
        celda += c;
        if (c === "\n" || (c === "\r" && texto[i + 1] !== "\n")) linea++;
      }
    } else if (c === ",") terminarCelda();
    else if (c === "\r" || c === "\n") {
      terminarFila();
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linea++;
      inicio = linea;
    } else if (c === '"' && estado === "inicio" && celda.trim() === "") {
      celda = "";
      estado = "comillas";
    } else if (c === '"' || (estado === "cerrada" && c.trim() !== "")) {
      throw new ErrorFormatoImportacion(
        `Hay comillas inválidas en la fila ${linea}.`,
      );
    } else {
      celda += c;
      if (estado !== "cerrada" && c.trim() !== "") estado = "texto";
    }
  }
  if (estado === "comillas")
    throw new ErrorFormatoImportacion(
      `Hay comillas sin cerrar en la fila ${inicio}.`,
    );
  terminarFila();
  const cabecera = registros.shift();
  if (!cabecera) throw new ErrorFormatoImportacion("El archivo está vacío.");
  const encabezados = cabecera.valores;
  const errores: ErrorCampo[] = [];
  const error = (campo: string, detalle: string) =>
    errores.push({
      fila: cabecera.fila,
      campo,
      codigo: "CONTRATO_INVALIDO",
      detalle,
    });
  for (const c of obligatorias)
    if (!encabezados.includes(c)) error(c, "Falta una columna obligatoria.");
  for (const [i, c] of encabezados.entries()) {
    if (!(permitidas as readonly string[]).includes(c))
      error(c, "La columna no pertenece a la plantilla.");
    if (encabezados.indexOf(c) !== i) error(c, "La columna está repetida.");
  }
  if (errores.length)
    throw new ErrorFormatoImportacion(
      "Los encabezados del archivo no coinciden con la plantilla.",
      400,
      errores,
    );
  if (!registros.length)
    throw new ErrorFormatoImportacion("El archivo no contiene filas de datos.");
  if (registros.length > maxFilas) throw excesoFilas();
  const filas = registros.map(({ fila, valores }) => {
    if (valores.length !== encabezados.length)
      throw new ErrorFormatoImportacion(
        `La fila ${fila} no tiene la misma cantidad de columnas que el encabezado.`,
      );
    return {
      fila,
      celdas: Object.fromEntries(
        encabezados.map((c, i) => [c, valores[i]]),
      ) as Partial<Record<C, string>>,
    };
  });
  return {
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
    filas,
  };
}

/** CSV de indicadores semanales (`indicadores-v1`). */
export const leerCsvImportacion = (bytes: Uint8Array) =>
  leerCsv(bytes, ESQUEMA_CSV_INDICADORES);

/** Header and one example row of the downloadable `indicadores-v1` template. */
export const PLANTILLA_INDICADORES_CSV = `${COLUMNAS_CSV.join(",")}
EMP-001,2026-10-05,2026-10-11,16,9,10,7,5,14,56,120
`;
