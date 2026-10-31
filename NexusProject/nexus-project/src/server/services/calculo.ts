import type {
  Calculo,
  ConfiguracionIndice,
  Factor,
  RegistroLaboral,
} from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import { fechaParaDb } from "../repositories/fechas";
import { validarConfiguracion } from "./reglas";

const FACTORES = ["HE", "DS", "CT", "VP"] as const;
const DIA_MS = 86_400_000;

function contrato(campo: string, detalle: string): never {
  throw new ErrorDominio(
    "CONTRATO_INVALIDO",
    "El registro no cumple el contrato CU02.",
    [{ fila: null, campo, codigo: "CONTRATO_INVALIDO", detalle }],
  );
}

/** Validación defensiva para llamadas directas; CU01 valida catálogo y semana cerrada. */
function validarRegistro(registro: RegistroLaboral): void {
  if (!registro || typeof registro !== "object" || Array.isArray(registro))
    contrato("registro", "Se requiere un registro laboral confirmado.");
  for (const campo of [
    "employeeId",
    "recordId",
    "sourceImportId",
    "fingerprint",
  ] as const) {
    if (typeof registro[campo] !== "string" || !registro[campo].trim())
      contrato(campo, "Se requiere un identificador o huella no vacío.");
  }
  if (!Number.isInteger(registro.dataVersion) || registro.dataVersion < 1)
    contrato("dataVersion", "La versión de datos debe ser un entero positivo.");

  let inicio: Date;
  let fin: Date;
  try {
    inicio = fechaParaDb(registro.periodStart);
    fin = fechaParaDb(registro.periodEnd);
  } catch {
    contrato("periodStart/periodEnd", "Se requieren fechas reales YYYY-MM-DD.");
  }
  if (
    inicio.getUTCDay() !== 1 ||
    fin.getTime() - inicio.getTime() !== 6 * DIA_MS
  )
    contrato(
      "periodStart/periodEnd",
      "El período debe cubrir lunes a domingo inclusive.",
    );

  for (const campo of [
    "horasExtra",
    "diasConsecutivosSinDescanso",
    "tareasActivas",
    "tareasPendientes",
    "tareasVencidas",
    "vacacionesPendientesDias",
  ] as const) {
    const valor = registro[campo];
    if (
      typeof valor !== "number" ||
      !Number.isFinite(valor) ||
      valor < 0 ||
      (campo !== "horasExtra" && !Number.isInteger(valor))
    )
      contrato(
        campo,
        "Se requiere una magnitud finita no negativa; días y tareas son enteros.",
      );
  }
  if (registro.horasExtra > 168)
    contrato("horasExtra", "No puede superar 168 horas semanales.");
  if (
    registro.tareasVencidas > registro.tareasPendientes ||
    registro.tareasPendientes > registro.tareasActivas
  )
    contrato(
      "tareasActivas/tareasPendientes/tareasVencidas",
      "Se requiere 0 ≤ vencidas ≤ pendientes ≤ activas.",
    );
  const horas = registro.horasTrabajadas;
  if (
    horas != null &&
    (typeof horas !== "number" ||
      !Number.isFinite(horas) ||
      horas < registro.horasExtra ||
      horas > 168)
  )
    contrato(
      "horasTrabajadas",
      "Se requiere horasExtra ≤ horasTrabajadas ≤ 168.",
    );
  const dias = registro.diasDesdeUltimasVacaciones;
  if (
    dias != null &&
    (typeof dias !== "number" || !Number.isInteger(dias) || dias < 0)
  )
    contrato(
      "diasDesdeUltimasVacaciones",
      "Se requiere un entero no negativo o null.",
    );
}

function puntuar(registro: RegistroLaboral, reglas: ConfiguracionIndice) {
  const indicadores: Record<Factor, number> = {
    HE: registro.horasExtra,
    DS: registro.diasConsecutivosSinDescanso,
    CT:
      registro.tareasActivas === 0
        ? 0
        : 0.6 * (registro.tareasVencidas / registro.tareasActivas) +
          0.4 * (registro.tareasPendientes / registro.tareasActivas),
    VP: registro.vacacionesPendientesDias,
  };
  const scores = {} as Record<Factor, number>;
  const contribuciones = {} as Record<Factor, number>;
  for (const factor of FACTORES) {
    scores[factor] = Math.min(
      100,
      (50 * indicadores[factor]) / reglas.thresholds[factor],
    );
    contribuciones[factor] = reglas.weights[factor] * scores[factor];
  }
  const suma = FACTORES.reduce(
    (total, factor) => total + contribuciones[factor],
    0,
  );
  const indice = Math.round((suma + Number.EPSILON) * 100) / 100;
  const ranking = [...FACTORES].sort(
    (a, b) =>
      contribuciones[b] - contribuciones[a] ||
      FACTORES.indexOf(a) - FACTORES.indexOf(b),
  );
  const excedidas = FACTORES.filter(
    (factor) => indicadores[factor] > reglas.thresholds[factor],
  );
  return { indice, indicadores, scores, contribuciones, ranking, excedidas };
}

/** Motor puro CU02: sin IO, reloj, Prisma ni Next.js; nunca modifica las entradas.
 * T08 selecciona la regla aplicable y persiste el resultado/snapshot.
 * Un antecedente separado por un hueco se considera ausente, no persistencia.
 */
export function calcularEvaluacion(
  actual: RegistroLaboral,
  anterior: RegistroLaboral | null,
  reglas: ConfiguracionIndice,
): Calculo {
  const configuracion = validarConfiguracion(reglas);
  validarRegistro(actual);
  if (actual.periodStart < configuracion.effectiveFrom)
    throw new ErrorDominio(
      "CONFIGURACION_INVALIDA",
      "La regla todavía no es aplicable al período actual.",
    );
  if (anterior !== null) {
    validarRegistro(anterior);
    if (anterior.employeeId !== actual.employeeId)
      contrato(
        "anterior.employeeId",
        "El antecedente debe corresponder al mismo empleado.",
      );
    if (anterior.periodStart >= actual.periodStart)
      contrato(
        "anterior.periodStart",
        "El antecedente debe ser anterior al período actual.",
      );
  }
  const resultado = puntuar(actual, configuracion);
  const consecutivo =
    anterior !== null &&
    fechaParaDb(actual.periodStart).getTime() -
      fechaParaDb(anterior.periodStart).getTime() ===
      7 * DIA_MS;
  const previo = consecutivo ? puntuar(anterior, configuracion) : null;
  const comunesExcedidas = previo
    ? resultado.excedidas.filter((factor) => previo.excedidas.includes(factor))
    : [];
  const cumple =
    previo !== null &&
    resultado.indice >= configuracion.highLimit &&
    previo.indice >= configuracion.highLimit &&
    comunesExcedidas.length >= configuracion.minExceededFactors;
  return {
    ...resultado,
    nivel:
      previo === null
        ? "INCOMPLETO"
        : resultado.indice < configuracion.mediumLimit
          ? "BAJO"
          : cumple
            ? "ALTO"
            : "MEDIO",
    persistencia: {
      anterior:
        previo && anterior
          ? {
              periodo: {
                employeeId: anterior.employeeId,
                periodStart: anterior.periodStart,
                periodEnd: anterior.periodEnd,
              },
              indice: previo.indice,
              excedidas: previo.excedidas,
              dataFingerprint: anterior.fingerprint,
            }
          : null,
      comunesExcedidas,
      cumple,
      motivo:
        previo === null
          ? "HISTORIAL_INSUFICIENTE"
          : cumple
            ? "SOSTENIDO"
            : "NO_SOSTENIDO",
    },
  };
}
