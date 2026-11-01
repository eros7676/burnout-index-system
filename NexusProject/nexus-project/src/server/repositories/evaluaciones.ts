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
  evaluacionVigenteId: string | null;
  snapshot: SnapshotEvaluacion;
};
export type EvaluacionPreparada = EntradaEvaluacion & {
  processingFingerprint: string;
};
export type PropietarioJob = { jobId: string; ownerToken: string };
const reprocesar = (mensaje: string) =>
  new ErrorDominio("REQUIERE_REPROCESO", mensaje);

export function registroDesdeDb(
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
export function reglasDesdeDb(reglas: ReglasDb) {
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
    evaluacionVigenteId: periodo.evaluacionVigenteId,
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
  fuente: EvaluacionPreparada | ParPeriodo,
  propietario?: PropietarioJob,
): Promise<Evaluacion> {
  const preparada = "snapshot" in fuente ? fuente : null;
  // MySQL usa su reloj UTC para validar lease; el bloqueo impide que otro dueño
  // reclame el job durante la publicación. El commit es la frontera del permiso.
  if (propietario) {
    const jobs = await tx.$queryRaw<{ jobId: string }[]>`
      SELECT jobId FROM ProcessingJob WHERE jobId = ${propietario.jobId}
      AND ownerToken = ${propietario.ownerToken} AND estado = 'PROCESANDO'
      AND leaseUntil > UTC_TIMESTAMP(3) FOR UPDATE`;
    if (jobs.length !== 1)
      throw reprocesar(
        "El ejecutor perdió su lease/token o el período no pertenece al job.",
      );
    if (preparada) await comprobarPar(tx, propietario, preparada.periodoId);
  }
  // La ruta directa de un job lee y publica en esta misma transacción
  // SERIALIZABLE. La ruta de snapshot externo sigue revalidando su huella.
  const entrada = await leerEntradaEvaluacion(
    tx,
    preparada ? preparada.snapshot.actual : (fuente as ParPeriodo),
  );
  const actual = entrada.snapshot.actual;
  if (propietario && !preparada)
    await comprobarPar(tx, propietario, entrada.periodoId);
  const fingerprint = huellaEvaluacion(entrada.snapshot);
  if (
    preparada &&
    (entrada.periodoId !== preparada.periodoId ||
      fingerprint !== preparada.processingFingerprint ||
      huellaEvaluacion(preparada.snapshot) !== preparada.processingFingerprint)
  )
    throw reprocesar(
      "Cambiaron los datos, antecedentes o reglas. Volver a calcular antes de publicar.",
    );
  const calculo = calcularEvaluacion(
    entrada.snapshot.actual,
    entrada.snapshot.anterior,
    entrada.snapshot.reglas,
  );
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
        supersedesEvaluationId: entrada.evaluacionVigenteId,
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
  if (entrada.evaluacionVigenteId !== fila.evaluationId) {
    if (entrada.evaluacionVigenteId)
      await tx.alerta.updateMany({
        where: {
          evaluationId: entrada.evaluacionVigenteId,
          vigencia: "ACTIVA",
        },
        data: { vigencia: "SUPERADA" },
      });
    const cambio = await tx.periodoEmpleado.updateMany({
      where: { periodoId: entrada.periodoId },
      data: { evaluacionVigenteId: fila.evaluationId },
    });
    if (cambio.count !== 1)
      throw reprocesar("El período dejó de estar disponible para publicar.");
  }
  return evaluacionDesdeDb(fila, fila.evaluationId);
}

async function comprobarPar(
  tx: Prisma.TransactionClient,
  propietario: PropietarioJob,
  periodoId: string,
) {
  const par = await tx.processingJobPar.findUnique({
    where: { jobId_periodoId: { jobId: propietario.jobId, periodoId } },
    select: { periodoId: true },
  });
  if (!par) throw reprocesar("El período no pertenece al job.");
}
