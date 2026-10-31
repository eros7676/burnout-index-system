import {
  Prisma,
  type RegistroLaboral as RegistroDb,
  type ConfiguracionIndice as ReglasDb,
  type Evaluacion as EvaluacionDb,
} from "@prisma/client";
import type {
  Evaluacion,
  ParPeriodo,
  RegistroLaboral,
} from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import { fechaDesdeDb, fechaParaDb } from "./fechas";
import { codificarJsonExacto, decodificarJsonExacto } from "./json-exacto";
import { validarConfiguracion } from "../services/reglas";
import { calcularEvaluacion } from "../services/calculo";
import {
  ENGINE_VERSION,
  huellaEvaluacion,
  serializarCanonico,
  type SnapshotEvaluacion,
} from "../services/huella-evaluacion";

export type EntradaEvaluacion = {
  periodoId: string;
  snapshot: SnapshotEvaluacion;
};
export type EvaluacionPreparada = EntradaEvaluacion & {
  processingFingerprint: string;
};
export type PropietarioJob = { jobId: string; ownerToken: string };
const reprocesar = (mensaje: string) =>
  new ErrorDominio("REQUIERE_REPROCESO", mensaje);

function registroDesdeDb(
  registro: RegistroDb,
  par: ParPeriodo,
): RegistroLaboral {
  return {
    ...par,
    recordId: registro.recordId,
    sourceImportId: registro.sourceImportId,
    dataVersion: registro.dataVersion,
    fingerprint: registro.fingerprint,
    horasExtra: registro.horasExtra,
    diasConsecutivosSinDescanso: registro.diasConsecutivosSinDescanso,
    tareasActivas: registro.tareasActivas,
    tareasPendientes: registro.tareasPendientes,
    tareasVencidas: registro.tareasVencidas,
    vacacionesPendientesDias: registro.vacacionesPendientesDias,
    horasTrabajadas: registro.horasTrabajadas,
    diasDesdeUltimasVacaciones: registro.diasDesdeUltimasVacaciones,
  };
}
function reglasDesdeDb(reglas: ReglasDb) {
  return validarConfiguracion({
    ...reglas,
    effectiveFrom: fechaDesdeDb(reglas.effectiveFrom),
    createdAt: reglas.createdAt.toISOString(),
  });
}

/** Solo sigue punteros vigentes y fuentes confirmadas, nunca la última fila disponible. */
export async function leerEntradaEvaluacion(
  tx: Prisma.TransactionClient,
  par: ParPeriodo,
): Promise<EntradaEvaluacion> {
  const inicio = fechaParaDb(par.periodStart);
  const fin = fechaParaDb(par.periodEnd);
  const periodo = await tx.periodoEmpleado.findUnique({
    where: {
      employeeId_periodStart_periodEnd: {
        employeeId: par.employeeId,
        periodStart: inicio,
        periodEnd: fin,
      },
    },
    include: {
      registroVigente: {
        include: { importacion: { select: { status: true } } },
      },
    },
  });
  if (
    !periodo?.registroVigente ||
    periodo.registroVigente.importacion.status !== "CONFIRMADA"
  )
    throw new ErrorDominio(
      "CONTRATO_INVALIDO",
      "No existe un registro vigente confirmado para el período.",
    );
  const previoInicio = new Date(inicio.getTime() - 7 * 86_400_000);
  const previoFin = new Date(fin.getTime() - 7 * 86_400_000);
  const anterior = await tx.periodoEmpleado.findUnique({
    where: {
      employeeId_periodStart_periodEnd: {
        employeeId: par.employeeId,
        periodStart: previoInicio,
        periodEnd: previoFin,
      },
    },
    include: {
      registroVigente: {
        include: { importacion: { select: { status: true } } },
      },
    },
  });
  if (
    anterior?.registroVigente &&
    anterior.registroVigente.importacion.status !== "CONFIRMADA"
  )
    throw new ErrorDominio(
      "CONTRATO_INVALIDO",
      "El antecedente no pertenece a una importación confirmada.",
    );
  const reglas = await tx.configuracionIndice.findFirst({
    where: { effectiveFrom: { lte: inicio } },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!reglas)
    throw new ErrorDominio(
      "CONFIGURACION_INVALIDA",
      "No hay reglas aplicables al inicio del período.",
    );
  return {
    periodoId: periodo.periodoId,
    snapshot: {
      actual: registroDesdeDb(periodo.registroVigente, par),
      anterior: anterior?.registroVigente
        ? registroDesdeDb(anterior.registroVigente, {
            employeeId: par.employeeId,
            periodStart: fechaDesdeDb(previoInicio),
            periodEnd: fechaDesdeDb(previoFin),
          })
        : null,
      reglas: reglasDesdeDb(reglas),
    },
  };
}

/** Valida snapshots/resultados leídos y convierte Decimal/DATE a los DTO de T01. */
export function evaluacionDesdeDb(
  fila: EvaluacionDb,
  vigenteId: string | null,
): Evaluacion {
  const snapshot = decodificarJsonExacto(fila.snapshot) as SnapshotEvaluacion;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    !snapshot.actual ||
    !snapshot.reglas ||
    !("anterior" in snapshot)
  )
    throw new ErrorDominio(
      "CONTRATO_INVALIDO",
      "Snapshot de evaluación inválido.",
    );
  const calculo = calcularEvaluacion(
    snapshot.actual,
    snapshot.anterior,
    snapshot.reglas,
  );
  const guardado = {
    indice: Number(fila.indice),
    nivel: fila.nivel,
    indicadores: decodificarJsonExacto(fila.indicadores),
    scores: decodificarJsonExacto(fila.scores),
    contribuciones: decodificarJsonExacto(fila.contribuciones),
    ranking: decodificarJsonExacto(fila.ranking),
    excedidas: decodificarJsonExacto(fila.excedidas),
    persistencia: decodificarJsonExacto(fila.persistencia),
  };
  if (
    fila.engineVersion !== ENGINE_VERSION ||
    serializarCanonico(calculo) !== serializarCanonico(guardado) ||
    fila.processingFingerprint !== huellaEvaluacion(snapshot)
  )
    throw new ErrorDominio(
      "CONTRATO_INVALIDO",
      "La evaluación guardada no coincide con su snapshot o motor.",
    );
  return {
    ...calculo,
    employeeId: fila.employeeId,
    periodStart: snapshot.actual.periodStart,
    periodEnd: snapshot.actual.periodEnd,
    evaluationId: fila.evaluationId,
    rulesVersion: fila.rulesVersion,
    engineVersion: ENGINE_VERSION,
    processingFingerprint: fila.processingFingerprint,
    snapshot,
    supersedesEvaluationId: fila.supersedesEvaluationId,
    vigente: fila.evaluationId === vigenteId,
    createdAt: fila.createdAt.toISOString(),
  };
}

/** Debe ejecutarse en una transacción SERIALIZABLE (servicio publicarEvaluacion).
 * Las lecturas bloquean las versiones/rangos hasta el commit, incluyendo ausencias.
 */
export async function guardarEvaluacion(
  tx: Prisma.TransactionClient,
  preparada: EvaluacionPreparada,
  propietario?: PropietarioJob,
): Promise<Evaluacion> {
  // MySQL usa su reloj UTC para validar lease; el bloqueo impide que otro dueño
  // reclame el job durante la publicación. El commit es la frontera del permiso.
  if (propietario) {
    const jobs = await tx.$queryRaw<{ jobId: string }[]>`
      SELECT jobId FROM ProcessingJob WHERE jobId = ${propietario.jobId}
      AND ownerToken = ${propietario.ownerToken} AND estado = 'PROCESANDO'
      AND leaseUntil > UTC_TIMESTAMP(3) FOR UPDATE`;
    const par = await tx.processingJobPar.findUnique({
      where: {
        jobId_periodoId: {
          jobId: propietario.jobId,
          periodoId: preparada.periodoId,
        },
      },
    });
    if (jobs.length !== 1 || !par)
      throw reprocesar(
        "El ejecutor perdió su lease/token o el período no pertenece al job.",
      );
  }
  const actual = preparada.snapshot.actual;
  const entrada = await leerEntradaEvaluacion(tx, actual);
  const fingerprint = huellaEvaluacion(entrada.snapshot);
  if (
    entrada.periodoId !== preparada.periodoId ||
    fingerprint !== preparada.processingFingerprint ||
    huellaEvaluacion(preparada.snapshot) !== preparada.processingFingerprint
  )
    throw reprocesar(
      "Cambiaron los datos, antecedentes o reglas. Volver a calcular antes de publicar.",
    );
  const calculo = calcularEvaluacion(
    entrada.snapshot.actual,
    entrada.snapshot.anterior,
    entrada.snapshot.reglas,
  );
  const periodo = await tx.periodoEmpleado.findUniqueOrThrow({
    where: { periodoId: entrada.periodoId },
  });
  let fila = await tx.evaluacion.findUnique({
    where: {
      periodoId_processingFingerprint: {
        periodoId: entrada.periodoId,
        processingFingerprint: fingerprint,
      },
    },
  });
  if (!fila) {
    fila = await tx.evaluacion.create({
      data: {
        periodoId: entrada.periodoId,
        employeeId: actual.employeeId,
        actualRecordId: entrada.snapshot.actual.recordId,
        anteriorRecordId: entrada.snapshot.anterior?.recordId ?? null,
        rulesVersion: entrada.snapshot.reglas.version,
        engineVersion: ENGINE_VERSION,
        processingFingerprint: fingerprint,
        supersedesEvaluationId: periodo.evaluacionVigenteId,
        indice: calculo.indice,
        nivel: calculo.nivel,
        indicadores: codificarJsonExacto(calculo.indicadores),
        scores: codificarJsonExacto(calculo.scores),
        contribuciones: codificarJsonExacto(calculo.contribuciones),
        ranking: codificarJsonExacto(calculo.ranking),
        excedidas: codificarJsonExacto(calculo.excedidas),
        persistencia: codificarJsonExacto(calculo.persistencia),
        snapshot: codificarJsonExacto(entrada.snapshot),
      },
    });
  }
  if (periodo.evaluacionVigenteId !== fila.evaluationId) {
    if (periodo.evaluacionVigenteId)
      await tx.alerta.updateMany({
        where: {
          evaluationId: periodo.evaluacionVigenteId,
          vigencia: "ACTIVA",
        },
        data: { vigencia: "SUPERADA" },
      });
    await tx.periodoEmpleado.update({
      where: { periodoId: entrada.periodoId },
      data: { evaluacionVigenteId: fila.evaluationId },
    });
  }
  return evaluacionDesdeDb(fila, fila.evaluationId);
}
