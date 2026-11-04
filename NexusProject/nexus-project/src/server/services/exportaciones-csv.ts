// CSV writer for the exports. Pure: no database, no HTTP.
// - UTF-8 with BOM so Excel reads accents; semicolon, because an es-AR Excel splits on the Windows list
//   separator and a locale with a decimal comma uses the semicolon (Microsoft Support, «Import or export
//   text (.txt or .csv) files»); CRLF and quoting as RFC 4180 §2.
// - A text cell that could run as a formula is neutralized (OWASP, CSV Injection).
// Research: work/enterprise/research/workforce-admin.md §1.10, §4.5.
import {
  FORMATO_CSV,
  LIMITE_FILAS_EXPORTACION,
} from "../../shared/contratos/exportaciones";

export type Celda = string | number | boolean | null | undefined;

export class ErrorExportacion extends Error {
  constructor(
    public status: 400 | 422,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

const { separador, bom, finDeLinea } = FORMATO_CSV;
const NUMERO = new Intl.NumberFormat("es-AR", {
  useGrouping: false,
  maximumFractionDigits: 10,
});

/**
 * OWASP lists `=`, `+`, `-`, `@`, tab and carriage return as formula starters and prescribes a leading
 * single quote. Leading spaces are skipped too, because a spreadsheet may trim them before parsing.
 */
export function protegerFormula(texto: string): string {
  return /^[\t\r]/.test(texto) || /^\s*[=+\-@]/.test(texto)
    ? `'${texto}`
    : texto;
}

/** One cell as text. Numbers use the es-AR decimal comma and are never guarded; text always is. */
export function celdaCsv(valor: Celda): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number")
    return Number.isFinite(valor) ? NUMERO.format(valor) : "";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  const texto = protegerFormula(valor);
  return /[;"\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

export const filaCsv = (celdas: readonly Celda[]): string =>
  celdas.map(celdaCsv).join(separador);

/**
 * The file as bounded pieces: the first holds the BOM, the optional preamble (who, when, filters) and the
 * header row; each next one holds up to `filasPorFragmento` rows. Nothing builds the whole text at once.
 */
export function* fragmentosCsv({
  preambulo = [],
  encabezados,
  filas,
  filasPorFragmento = 500,
}: {
  preambulo?: readonly string[];
  encabezados: readonly string[];
  filas: Iterable<readonly Celda[]>;
  filasPorFragmento?: number;
}): Generator<string> {
  const cabecera = preambulo.length
    ? [...preambulo.map((linea) => filaCsv([linea])), ""]
    : [];
  yield `${bom}${[...cabecera, filaCsv(encabezados)].join(finDeLinea)}${finDeLinea}`;
  let pendiente: string[] = [];
  for (const fila of filas) {
    pendiente.push(filaCsv(fila));
    if (pendiente.length >= filasPorFragmento) {
      yield pendiente.join(finDeLinea) + finDeLinea;
      pendiente = [];
    }
  }
  if (pendiente.length) yield pendiente.join(finDeLinea) + finDeLinea;
}

/** The pieces as a byte stream the response sends as they are pulled (backpressure included). */
export function flujoCsv(
  fragmentos: Iterable<string>,
): ReadableStream<Uint8Array> {
  const iterador = fragmentos[Symbol.iterator]();
  const codificador = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    pull(control) {
      const siguiente = iterador.next();
      if (siguiente.done) control.close();
      else control.enqueue(codificador.encode(siguiente.value));
    },
    cancel() {
      iterador.return?.();
    },
  });
}

/** More rows than the cap are refused whole: a silently partial file would mislead. */
export function aplicarTope<T>(
  filas: readonly T[],
  limite: number = LIMITE_FILAS_EXPORTACION,
): readonly T[] {
  if (filas.length > limite)
    throw new ErrorExportacion(
      422,
      `La exportación supera el máximo de ${new Intl.NumberFormat("es-AR").format(limite)} filas. Acote los filtros e inténtelo nuevamente.`,
    );
  return filas;
}
