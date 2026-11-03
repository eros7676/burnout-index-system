// personas-v1: the people file (workforce-admin §2.1-C, §4.1). Create-only: an identical person is
// omitted, the same legajo with other data is a conflict, and any error rejects the whole file.
import { createHash } from "node:crypto";
import type { ErrorCampo, FechaISO } from "../../shared/contracts";
import { COLUMNAS_PERSONAS } from "../../shared/contratos/organizacion";
import { ErrorOrganizacion, errorCampo } from "./organizacion-errores";
import {
  claveNombre,
  normalizarNombre,
  validarAlta,
  type AltaValida,
  type EquiposConocidos,
} from "./organizacion-validacion";

export type ColumnaPersonas = (typeof COLUMNAS_PERSONAS)[number];
export type FilaPersonas = {
  /** Line of the file: the header is 1, the first person 2. */
  fila: number;
  celdas: Partial<Record<ColumnaPersonas, string>>;
};

export const MAX_BYTES_PERSONAS = 5 * 1024 * 1024;
export const MAX_FILAS_PERSONAS = 1000;
const OBLIGATORIAS: readonly ColumnaPersonas[] = ["employee_id", "nombre", "tipo"];

const formato = (
  mensaje: string,
  status: 400 | 413 = 400,
  detalles: ErrorCampo[] = [],
) => new ErrorOrganizacion(status, "CONTRATO_INVALIDO", mensaje, detalles);

/** RFC 4180 records with the physical line where each starts. */
function registros(texto: string) {
  const filas: { fila: number; valores: string[] }[] = [];
  let valores: string[] = [];
  let celda = "";
  let entreComillas = false;
  let cerrada = false;
  let linea = 1;
  let inicio = 1;
  const cerrarCelda = () => {
    valores.push(cerrada ? celda : celda.trim());
    celda = "";
    cerrada = false;
  };
  const cerrarFila = () => {
    cerrarCelda();
    if (valores.some((v) => v !== "")) filas.push({ fila: inicio, valores });
    if (filas.length > MAX_FILAS_PERSONAS + 1)
      throw formato("El archivo admite hasta 1.000 filas de datos.", 413);
    valores = [];
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          entreComillas = false;
          cerrada = true;
        }
      } else {
        celda += c;
        if (c === "\n" || (c === "\r" && texto[i + 1] !== "\n")) linea++;
      }
    } else if (c === '"') {
      if (celda.trim() !== "" || cerrada)
        throw formato(`Hay comillas inesperadas en la fila ${linea}.`);
      celda = "";
      entreComillas = true;
    } else if (c === ",") cerrarCelda();
    else if (c === "\r" || c === "\n") {
      cerrarFila();
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linea++;
      inicio = linea;
    } else if (cerrada && c.trim() !== "")
      throw formato(`Hay texto después de las comillas en la fila ${linea}.`);
    else celda += c;
  }
  if (entreComillas) throw formato(`Las comillas de la fila ${inicio} no se cierran.`);
  cerrarFila();
  return filas;
}

export function leerCsvPersonas(bytes: Uint8Array): {
  huella: string;
  filas: FilaPersonas[];
} {
  if (bytes.byteLength > MAX_BYTES_PERSONAS)
    throw formato("El archivo supera el máximo de 5 MB.", 413);
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw formato("El archivo debe estar codificado en UTF-8.");
  }
  if (texto.includes("\0")) throw formato("El archivo contiene caracteres nulos.");
  const todos = registros(texto.replace(/^﻿/, ""));
  const cabecera = todos.shift();
  if (!cabecera) throw formato("El archivo está vacío.");
  const columnas = cabecera.valores;
  const errores: ErrorCampo[] = [];
  for (const c of OBLIGATORIAS)
    if (!columnas.includes(c))
      errores.push(
        errorCampo(c, "COLUMNA_FALTANTE", `Falta la columna ${c}.`, cabecera.fila),
      );
  columnas.forEach((c, i) => {
    if (!(COLUMNAS_PERSONAS as readonly string[]).includes(c))
      errores.push(
        errorCampo(
          c,
          "COLUMNA_DESCONOCIDA",
          `La columna ${c} no pertenece a la plantilla.`,
          cabecera.fila,
        ),
      );
    else if (columnas.indexOf(c) !== i)
      errores.push(
        errorCampo(c, "COLUMNA_REPETIDA", `La columna ${c} está repetida.`, cabecera.fila),
      );
  });
  if (errores.length)
    throw formato("El encabezado no coincide con la plantilla.", 400, errores);
  if (!todos.length) throw formato("El archivo no contiene filas de datos.");
  if (todos.length > MAX_FILAS_PERSONAS)
    throw formato("El archivo admite hasta 1.000 filas de datos.", 413);
  const filas = todos.map(({ fila, valores }) => {
    if (valores.length !== columnas.length)
      throw formato(
        `La fila ${fila} tiene ${valores.length} columnas y el encabezado ${columnas.length}.`,
      );
    return {
      fila,
      celdas: Object.fromEntries(columnas.map((c, i) => [c, valores[i]])),
    } as FilaPersonas;
  });
  return { huella: createHash("sha256").update(bytes).digest("hex"), filas };
}

export type PersonaExistente = {
  nombre: string;
  tipo: string;
  teamId: string | null;
  enCobertura: boolean;
};
export type FilaNueva = AltaValida & { fila: number };

const CAMPOS_CSV = {
  employeeId: "employee_id",
  nombre: "nombre",
  tipo: "tipo",
  teamId: "team_id",
  desde: "vigente_desde",
  enCobertura: "en_cobertura",
} as const;

function cobertura(celda: string | undefined, tipo: string): boolean | string {
  const valor = (celda ?? "").trim();
  if (!valor) return tipo !== "GERENCIA";
  const minuscula = valor.toLowerCase();
  return minuscula === "true" ? true : minuscula === "false" ? false : valor;
}

/** Validates every row against the catalog and against the rest of the file. */
export function validarFilasPersonas(
  filas: readonly FilaPersonas[],
  ctx: {
    lunesActual: FechaISO;
    equipos: EquiposConocidos;
    existentes: ReadonlyMap<string, PersonaExistente>;
    nombresExistentes: ReadonlySet<string>;
  },
) {
  const nuevas: FilaNueva[] = [];
  const errores: ErrorCampo[] = [];
  const advertencias: ErrorCampo[] = [];
  const legajos = new Map<string, number>();
  const nombres = new Set<string>();
  let omitidas = 0;
  for (const { fila, celdas } of filas) {
    const tipo = (celdas.tipo ?? "").trim().toUpperCase();
    const entrada = {
      employeeId: celdas.employee_id,
      nombre: celdas.nombre,
      tipo,
      teamId: celdas.team_id ?? "",
      desde: (celdas.vigente_desde ?? "").trim() || ctx.lunesActual,
      enCobertura: cobertura(celdas.en_cobertura, tipo),
    };
    const { valor, errores: deLaFila } = validarAlta(entrada, ctx, {
      fila,
      campos: CAMPOS_CSV,
    });
    const legajo = (celdas.employee_id ?? "").trim();
    const primera = legajos.get(legajo);
    if (legajo && primera !== undefined)
      deLaFila.push(
        errorCampo(
          "employee_id",
          "DUPLICADO_LOTE",
          `El legajo ya figura en la fila ${primera} del archivo.`,
          fila,
        ),
      );
    else if (legajo) legajos.set(legajo, fila);
    errores.push(...deLaFila);
    if (!valor || deLaFila.length) continue;
    const existente = ctx.existentes.get(valor.employeeId);
    if (existente) {
      const identica =
        normalizarNombre(existente.nombre) === valor.nombre &&
        existente.tipo === valor.tipo &&
        existente.teamId === valor.teamId &&
        existente.enCobertura === valor.enCobertura;
      if (identica) omitidas++;
      else
        errores.push(
          errorCampo(
            "employee_id",
            "CONFLICTO_EXISTENTE",
            "Ya existe una persona con este legajo y datos distintos. El archivo solo crea personas nuevas.",
            fila,
          ),
        );
      continue;
    }
    const clave = claveNombre(valor.nombre);
    if (ctx.nombresExistentes.has(clave) || nombres.has(clave))
      advertencias.push(
        errorCampo(
          "nombre",
          "NOMBRE_REPETIDO",
          "Ya hay una persona con este nombre. Verifique que no sea un duplicado.",
          fila,
        ),
      );
    nombres.add(clave);
    nuevas.push({ fila, ...valor });
  }
  return {
    nuevas: errores.length ? [] : nuevas,
    omitidas,
    errores,
    advertencias,
  };
}
