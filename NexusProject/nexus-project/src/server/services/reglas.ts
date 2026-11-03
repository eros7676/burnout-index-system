import type { ConfiguracionIndice, Factor, FechaISO } from "../../shared/contracts";
import type { PropuestaReglas } from "../../shared/contratos/reglas";
import { ErrorDominio, type CodigoErrorDominio } from "../../shared/errors";
import { FACTOR } from "../../shared/formato";
import { fechaParaDb } from "../repositories/fechas";

const FACTORES = ["HE", "DS", "CT", "VP"] as const satisfies readonly Factor[];
const PARAMETROS = [
  "effectiveFrom",
  "weights",
  "thresholds",
  "mediumLimit",
  "highLimit",
  "minExceededFactors",
];
const CAMPOS = new Set([
  "version",
  "windowDays",
  "persistencePeriods",
  "createdBy",
  "createdAt",
  ...PARAMETROS,
]);

const PESO_MIN = 0.05;
const PESO_MAX = 0.7;
const SUMA_TOLERANCIA = 0.000001;
const VERSION_MAX = 64;
const PORCENTAJE = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

export type Problema = { campo: string; detalle: string };

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function rechazar(problemas: Problema[]): never {
  throw new ErrorDominio(
    "CONFIGURACION_INVALIDA" satisfies CodigoErrorDominio,
    "La configuración de reglas es inválida.",
    problemas.map((problema) => ({
      fila: null,
      campo: problema.campo,
      codigo: "CONFIGURACION_INVALIDA",
      detalle: problema.detalle,
    })),
  );
}

function leerTexto(
  entrada: Record<string, unknown>,
  campo: string,
  problemas: Problema[],
): string | null {
  const valor = entrada[campo];
  if (typeof valor !== "string" || valor.trim() === "") {
    problemas.push({ campo, detalle: "Se requiere un texto no vacío." });
    return null;
  }
  if (valor !== valor.trim() || valor.length > VERSION_MAX) {
    problemas.push({
      campo,
      detalle: `Se requiere un texto de 1 a ${VERSION_MAX} caracteres, sin espacios al borde.`,
    });
    return null;
  }
  return valor;
}

function leerFecha(
  entrada: Record<string, unknown>,
  campo: string,
  problemas: Problema[],
): FechaISO | null {
  const valor = entrada[campo];
  if (typeof valor !== "string") {
    problemas.push({
      campo,
      detalle: "Se requiere una fecha con formato AAAA-MM-DD.",
    });
    return null;
  }
  try {
    fechaParaDb(valor);
  } catch {
    problemas.push({
      campo,
      detalle: "La fecha no existe o no tiene formato AAAA-MM-DD.",
    });
    return null;
  }
  return valor;
}

function leerEnteroExacto(
  entrada: Record<string, unknown>,
  campo: string,
  esperado: number,
  detalle: string,
  problemas: Problema[],
): boolean {
  if (entrada[campo] !== esperado) {
    problemas.push({ campo, detalle });
    return false;
  }
  return true;
}

function leerFactores(
  entrada: Record<string, unknown>,
  campo: "weights" | "thresholds",
  problemas: Problema[],
): Partial<Record<Factor, number>> | null {
  const valor = entrada[campo];
  if (!esRegistro(valor)) {
    problemas.push({
      campo,
      detalle: `Se requieren los cuatro factores: ${FACTORES.map((f) => FACTOR[f]).join(", ")}.`,
    });
    return null;
  }
  for (const extra of Object.keys(valor)) {
    if (!FACTORES.includes(extra as Factor)) {
      problemas.push({
        campo: `${campo}.${extra}`,
        detalle: "Factor no reconocido.",
      });
    }
  }
  const numeros: Partial<Record<Factor, number>> = {};
  for (const factor of FACTORES) {
    const crudo = valor[factor];
    if (typeof crudo !== "number" || !Number.isFinite(crudo)) {
      problemas.push({
        campo: `${campo}.${factor}`,
        detalle: `El valor de ${FACTOR[factor]} debe ser un número.`,
      });
      continue;
    }
    numeros[factor] = crudo;
  }
  return numeros;
}

function leerLimite(
  entrada: Record<string, unknown>,
  campo: "mediumLimit" | "highLimit",
  problemas: Problema[],
): number | null {
  const valor = entrada[campo];
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    problemas.push({
      campo,
      detalle: `El límite de ${campo === "mediumLimit" ? "Medio" : "Alto"} debe ser un número.`,
    });
    return null;
  }
  return valor;
}

function leerInstanteUtc(
  entrada: Record<string, unknown>,
  problemas: Problema[],
): string | null {
  const valor = entrada.createdAt;
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(valor)) {
    problemas.push({
      campo: "createdAt",
      detalle: "Se requiere un instante UTC, por ejemplo 2026-03-02T00:00:00.000Z.",
    });
    return null;
  }
  const instante = new Date(valor);
  const canonico = valor.length === 20 ? `${valor.slice(0, 19)}.000Z` : valor;
  if (!Number.isFinite(instante.getTime()) || instante.toISOString() !== canonico) {
    problemas.push({
      campo: "createdAt",
      detalle: "El instante UTC no existe en el calendario.",
    });
    return null;
  }
  return valor;
}

/**
 * Parameters shared by a published version and a draft: weights, thresholds,
 * level limits, minimum factors and the start of validity. Pushes every problem
 * it finds and returns the parameters only when there are none.
 */
function revisarParametros(
  entrada: Record<string, unknown>,
  problemas: Problema[],
): PropuestaReglas | null {
  const antes = problemas.length;
  const effectiveFrom = leerFecha(entrada, "effectiveFrom", problemas);
  if (effectiveFrom && fechaParaDb(effectiveFrom).getUTCDay() !== 1) {
    // JS: 1 es lunes. MySQL WEEKDAY 0 también es lunes.
    problemas.push({
      campo: "effectiveFrom",
      detalle: "El inicio de vigencia debe ser un lunes.",
    });
  }

  const pesos = leerFactores(entrada, "weights", problemas);
  const umbrales = leerFactores(entrada, "thresholds", problemas);
  const mediumLimit = leerLimite(entrada, "mediumLimit", problemas);
  const highLimit = leerLimite(entrada, "highLimit", problemas);

  if (pesos && FACTORES.every((factor) => typeof pesos[factor] === "number")) {
    const completos = pesos as Record<Factor, number>;
    for (const factor of FACTORES) {
      const peso = completos[factor];
      if (peso < PESO_MIN || peso > PESO_MAX) {
        problemas.push({
          campo: `weights.${factor}`,
          detalle: `El peso de ${FACTOR[factor]} debe estar entre ${Math.round(PESO_MIN * 100)} % y ${Math.round(PESO_MAX * 100)} %.`,
        });
      }
    }
    const suma = FACTORES.reduce((total, factor) => total + completos[factor], 0);
    if (Math.abs(suma - 1) > SUMA_TOLERANCIA) {
      problemas.push({
        campo: "weights",
        detalle: `Los pesos suman ${PORCENTAJE.format(suma * 100)} %. Deben sumar 100 %.`,
      });
    }
  }

  if (umbrales) {
    for (const factor of FACTORES) {
      const umbral = umbrales[factor];
      if (typeof umbral === "number" && umbral <= 0) {
        problemas.push({
          campo: `thresholds.${factor}`,
          detalle: `El umbral de ${FACTOR[factor]} debe ser mayor que 0.`,
        });
      }
    }
    if (typeof umbrales.CT === "number" && umbrales.CT > 1) {
      problemas.push({
        campo: "thresholds.CT",
        detalle: "El umbral de Carga de tareas no puede superar 1.",
      });
    }
  }

  if (mediumLimit !== null && mediumLimit <= 0) {
    problemas.push({
      campo: "mediumLimit",
      detalle: "El límite de Medio debe ser mayor que 0.",
    });
  }
  if (mediumLimit !== null && highLimit !== null && mediumLimit >= highLimit) {
    problemas.push({
      campo: "mediumLimit",
      detalle: "El límite de Medio debe ser menor que el de Alto.",
    });
  }
  if (highLimit !== null && highLimit > 100) {
    problemas.push({
      campo: "highLimit",
      detalle: "El límite de Alto no puede superar 100.",
    });
  }

  const minimo = entrada.minExceededFactors;
  const minExceededFactors: 2 | 3 | 4 | null =
    minimo === 2 || minimo === 3 || minimo === 4 ? minimo : null;
  if (minExceededFactors === null) {
    problemas.push({
      campo: "minExceededFactors",
      detalle: "El mínimo de factores superados debe ser 2, 3 o 4.",
    });
  } else if (pesos) {
    const activas = FACTORES.filter((factor) => {
      const peso = pesos[factor];
      return typeof peso === "number" && peso > 0;
    }).length;
    if (minExceededFactors > activas) {
      problemas.push({
        campo: "minExceededFactors",
        detalle: "El mínimo no puede superar la cantidad de factores con peso.",
      });
    }
  }

  if (
    problemas.length > antes ||
    effectiveFrom === null ||
    pesos === null ||
    umbrales === null ||
    mediumLimit === null ||
    highLimit === null ||
    minExceededFactors === null ||
    FACTORES.some(
      (factor) =>
        typeof pesos?.[factor] !== "number" ||
        typeof umbrales?.[factor] !== "number",
    )
  )
    return null;
  return {
    effectiveFrom,
    weights: pesos as Record<Factor, number>,
    thresholds: umbrales as Record<Factor, number>,
    mediumLimit,
    highLimit,
    minExceededFactors,
  };
}

/**
 * Revisa la regla completa antes de persistirla.
 * MySQL ya exige lunes, ventana 7, persistencia 2 y cortes básicos.
 * Aquí se rechazan pesos, umbrales y campos faltantes, que viajan en JSON.
 */
export function validarConfiguracion(entrada: unknown): ConfiguracionIndice {
  const problemas: Problema[] = [];
  if (!esRegistro(entrada)) {
    rechazar([
      {
        campo: "configuracion",
        detalle: "Se esperaba un objeto con todos los campos de la regla.",
      },
    ]);
  }

  for (const extra of Object.keys(entrada)) {
    if (!CAMPOS.has(extra)) {
      problemas.push({ campo: extra, detalle: "Campo no reconocido." });
    }
  }

  const version = leerTexto(entrada, "version", problemas);
  const createdBy = leerTexto(entrada, "createdBy", problemas);
  const createdAt = leerInstanteUtc(entrada, problemas);
  const ventanaValida = leerEnteroExacto(
    entrada,
    "windowDays",
    7,
    "La ventana debe ser de 7 días.",
    problemas,
  );
  const persistenciaValida = leerEnteroExacto(
    entrada,
    "persistencePeriods",
    2,
    "La persistencia debe ser de 2 semanas.",
    problemas,
  );
  const parametros = revisarParametros(entrada, problemas);

  if (
    problemas.length > 0 ||
    version === null ||
    createdBy === null ||
    createdAt === null ||
    !ventanaValida ||
    !persistenciaValida ||
    parametros === null
  ) {
    rechazar(
      problemas.length > 0
        ? problemas
        : [{ campo: "configuracion", detalle: "Faltan campos obligatorios." }],
    );
  }

  return {
    version,
    windowDays: 7,
    persistencePeriods: 2,
    createdBy,
    createdAt,
    ...parametros,
  };
}

/**
 * Valida solo lo que edita un borrador. Devuelve los problemas por campo en
 * lugar de lanzar, para mostrarlos junto a cada control y conservar lo escrito.
 */
export function validarPropuesta(
  entrada: unknown,
): { propuesta: PropuestaReglas; problemas: [] } | { propuesta: null; problemas: Problema[] } {
  if (!esRegistro(entrada))
    return {
      propuesta: null,
      problemas: [
        {
          campo: "propuesta",
          detalle: "Se esperaba un objeto con los parámetros de la regla.",
        },
      ],
    };
  const problemas: Problema[] = [];
  for (const extra of Object.keys(entrada))
    if (!PARAMETROS.includes(extra))
      problemas.push({ campo: extra, detalle: "Campo no reconocido." });
  const propuesta = revisarParametros(entrada, problemas);
  return problemas.length > 0 || propuesta === null
    ? {
        propuesta: null,
        problemas: problemas.length
          ? problemas
          : [{ campo: "propuesta", detalle: "Faltan parámetros obligatorios." }],
      }
    : { propuesta, problemas: [] };
}
