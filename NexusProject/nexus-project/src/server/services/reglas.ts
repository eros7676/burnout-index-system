import type { ConfiguracionIndice, Factor, FechaISO } from "../../shared/contracts";
import { ErrorDominio, type CodigoErrorDominio } from "../../shared/errors";
import { fechaParaDb } from "../repositories/fechas";

const FACTORES = ["HE", "DS", "CT", "VP"] as const satisfies readonly Factor[];
const CAMPOS = new Set([
  "version",
  "effectiveFrom",
  "windowDays",
  "persistencePeriods",
  "weights",
  "thresholds",
  "mediumLimit",
  "highLimit",
  "minExceededFactors",
  "createdBy",
  "createdAt",
]);

const PESO_MIN = 0.05;
const PESO_MAX = 0.7;
const SUMA_TOLERANCIA = 0.000001;
const VERSION_MAX = 64;

type Problema = { campo: string; detalle: string };

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
    problemas.push({ campo, detalle: "Se requiere una fecha YYYY-MM-DD." });
    return null;
  }
  try {
    fechaParaDb(valor);
  } catch {
    problemas.push({
      campo,
      detalle: "La fecha no existe o no tiene formato YYYY-MM-DD.",
    });
    return null;
  }
  return valor;
}

function leerEnteroExacto(
  entrada: Record<string, unknown>,
  campo: string,
  esperado: number,
  problemas: Problema[],
): boolean {
  if (entrada[campo] !== esperado) {
    problemas.push({
      campo,
      detalle: `P0 solo acepta ${campo}=${esperado}.`,
    });
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
      detalle: "Se requieren los cuatro factores HE, DS, CT y VP.",
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
        detalle: "Se requiere un número finito.",
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
    problemas.push({ campo, detalle: "Se requiere un número finito." });
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
 * Revisa la regla completa antes de persistirla.
 * MySQL ya exige lunes, ventana 7, persistencia 2 y cortes básicos.
 * Acá se rechazan pesos, umbrales y campos faltantes, que viajan en JSON.
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
  const effectiveFrom = leerFecha(entrada, "effectiveFrom", problemas);
  if (effectiveFrom && fechaParaDb(effectiveFrom).getUTCDay() !== 1) {
    // JS: 1 es lunes. MySQL WEEKDAY 0 también es lunes.
    problemas.push({
      campo: "effectiveFrom",
      detalle: "El inicio de vigencia tiene que ser un lunes.",
    });
  }

  const ventanaValida = leerEnteroExacto(entrada, "windowDays", 7, problemas);
  const persistenciaValida = leerEnteroExacto(
    entrada,
    "persistencePeriods",
    2,
    problemas,
  );

  const pesos = leerFactores(entrada, "weights", problemas);
  const umbrales = leerFactores(entrada, "thresholds", problemas);
  const mediumLimit = leerLimite(entrada, "mediumLimit", problemas);
  const highLimit = leerLimite(entrada, "highLimit", problemas);

  if (
    pesos &&
    FACTORES.every((factor) => typeof pesos[factor] === "number")
  ) {
    const completos = pesos as Record<Factor, number>;
    for (const factor of FACTORES) {
      const peso = completos[factor];
      if (peso < PESO_MIN || peso > PESO_MAX) {
        problemas.push({
          campo: `weights.${factor}`,
          detalle: "Cada peso tiene que estar entre 0.05 y 0.70.",
        });
      }
    }
    const suma = FACTORES.reduce((total, factor) => total + completos[factor], 0);
    if (Math.abs(suma - 1) > SUMA_TOLERANCIA) {
      const visible = Number(suma.toFixed(6)).toString();
      problemas.push({
        campo: "weights",
        detalle: `Los pesos suman ${visible}. Deben sumar 1 con tolerancia 0.000001.`,
      });
    }
  }

  if (
    umbrales &&
    FACTORES.every((factor) => typeof umbrales[factor] === "number")
  ) {
    const completos = umbrales as Record<Factor, number>;
    for (const factor of FACTORES) {
      const umbral = completos[factor];
      if (umbral <= 0) {
        problemas.push({
          campo: `thresholds.${factor}`,
          detalle: "Cada umbral tiene que ser mayor que 0.",
        });
      }
    }
    if (typeof completos.CT === "number" && completos.CT > 1) {
      problemas.push({
        campo: "thresholds.CT",
        detalle: "El umbral de tareas no puede ser mayor que 1.",
      });
    }
  }

  if (mediumLimit !== null && highLimit !== null) {
    if (!(mediumLimit > 0 && mediumLimit < highLimit && highLimit <= 100)) {
      problemas.push({
        campo: "mediumLimit",
        detalle: "Se requiere 0 < corte medio < corte alto ≤ 100.",
      });
    }
  }

  const minimo = entrada.minExceededFactors;
  const minExceededFactors: 2 | 3 | 4 | null =
    minimo === 2 || minimo === 3 || minimo === 4 ? minimo : null;
  if (minExceededFactors === null) {
    problemas.push({
      campo: "minExceededFactors",
      detalle: "Se requiere un entero 2, 3 o 4.",
    });
  } else if (pesos) {
    const activas = FACTORES.filter((factor) => {
      const peso = pesos[factor];
      return typeof peso === "number" && peso > 0;
    }).length;
    if (minExceededFactors > activas) {
      problemas.push({
        campo: "minExceededFactors",
        detalle: "No puede superar la cantidad de factores con peso.",
      });
    }
  }

  if (
    problemas.length > 0 ||
    version === null ||
    createdBy === null ||
    createdAt === null ||
    effectiveFrom === null ||
    !ventanaValida ||
    !persistenciaValida ||
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
  ) {
    rechazar(
      problemas.length > 0
        ? problemas
        : [
            {
              campo: "configuracion",
              detalle: "Faltan campos obligatorios.",
            },
          ],
    );
  }

  return {
    version,
    effectiveFrom,
    windowDays: 7,
    persistencePeriods: 2,
    weights: pesos as Record<Factor, number>,
    thresholds: umbrales as Record<Factor, number>,
    mediumLimit,
    highLimit,
    minExceededFactors,
    createdBy,
    createdAt,
  };
}
