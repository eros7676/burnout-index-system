import { createHash } from "node:crypto";
import type { ErrorCampo } from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";

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
export type FilaCsv = {
  fila: number;
  celdas: Partial<Record<ColumnaCsv, string>>;
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

/** CSV UTF-8 estricto, con comillas escapadas y números de línea físicos. Sin IO. */
export function leerCsvImportacion(bytes: Uint8Array): {
  sourceHash: string;
  filas: FilaCsv[];
} {
  if (bytes.byteLength > 5 * 1024 * 1024)
    throw new ErrorFormatoImportacion("Máximo 5 MiB.", 413);
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ErrorFormatoImportacion("El CSV debe estar codificado en UTF-8.");
  }
  if (texto.includes("\0"))
    throw new ErrorFormatoImportacion("El CSV contiene bytes nulos.");
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
    if (registros.length > 1001)
      throw new ErrorFormatoImportacion("Máximo 1.000 filas de datos.", 413);
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
        `Comillas CSV inválidas en fila ${linea}.`,
      );
    } else {
      celda += c;
      if (estado !== "cerrada" && c.trim() !== "") estado = "texto";
    }
  }
  if (estado === "comillas")
    throw new ErrorFormatoImportacion(`Comillas sin cerrar en fila ${inicio}.`);
  terminarFila();
  const cabecera = registros.shift();
  if (!cabecera) throw new ErrorFormatoImportacion("El CSV está vacío.");
  const columnas = cabecera.valores;
  const errores: ErrorCampo[] = [];
  const error = (campo: string, detalle: string) =>
    errores.push({
      fila: cabecera.fila,
      campo,
      codigo: "CONTRATO_INVALIDO",
      detalle,
    });
  for (const c of COLUMNAS_CSV.slice(0, 9))
    if (!columnas.includes(c)) error(c, "Falta columna obligatoria.");
  for (const [i, c] of columnas.entries()) {
    if (!(COLUMNAS_CSV as readonly string[]).includes(c))
      error(c, "Columna desconocida.");
    if (columnas.indexOf(c) !== i) error(c, "Columna repetida.");
  }
  if (errores.length)
    throw new ErrorFormatoImportacion("Encabezados inválidos.", 400, errores);
  if (!registros.length)
    throw new ErrorFormatoImportacion("El CSV no contiene filas de datos.");
  if (registros.length > 1000)
    throw new ErrorFormatoImportacion("Máximo 1.000 filas de datos.", 413);
  const filas = registros.map(({ fila, valores }) => {
    if (valores.length !== columnas.length)
      throw new ErrorFormatoImportacion(
        `Cantidad de columnas inválida en fila ${fila}.`,
      );
    return {
      fila,
      celdas: Object.fromEntries(columnas.map((c, i) => [c, valores[i]])),
    };
  });
  return {
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
    filas,
  };
}
