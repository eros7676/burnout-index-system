import { Prisma, type PrismaClient } from "@prisma/client";
import type { Evaluacion, ParPeriodo } from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import { fechaDesdeDb, fechaParaDb } from "../repositories/fechas";
import {
  evaluacionDesdeDb,
  guardarEvaluacion,
  leerEntradaEvaluacion,
  type EvaluacionPreparada,
  type PropietarioJob,
} from "../repositories/evaluaciones";
import { calcularEvaluacion } from "./calculo";
import { ENGINE_VERSION, huellaEvaluacion } from "./huella-evaluacion";
import {
  filtroPeriodo,
  lotes,
  parDesdePeriodo,
} from "../repositories/registros-importacion";

export type OpcionesEvaluacion = {
  propietario?: PropietarioJob;
  /** Orquestación interna: iniciar/renovar el par en la misma transacción.
   * Solo IO transaccional local; una excepción revierte inicio y publicación. */
  alIniciar?: (tx: Prisma.TransactionClient) => Promise<void>;
  /** Adaptador de T11/T10: se ejecuta también al reutilizar la evaluación.
   * Solo IO transaccional local; no enviar correo ni hacer llamadas externas.
   * Si falla, se revierte la publicación. T04 registra el fallo fuera de esta tx.
   */
  alPublicar?: (
    tx: Prisma.TransactionClient,
    evaluacion: Evaluacion,
  ) => Promise<void>;
};

async function serializable<T>(
  db: PrismaClient,
  trabajo: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await db.$transaction(trabajo, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30_000,
        maxWait: 10_000,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !(
          error.code === "P2034" ||
          (error.code === "P2010" && error.meta?.code === "1213")
        ) ||
        intento >= 2
      )
        throw error;
    }
  }
}

/** Lee un snapshot consistente. La publicación volverá a comprobar las versiones. */
export async function prepararEvaluacion(
  db: PrismaClient,
  par: ParPeriodo,
): Promise<EvaluacionPreparada> {
  return db.$transaction(
    async (tx) => {
      const entrada = await leerEntradaEvaluacion(tx, par);
      // Un error técnico no produce una evaluación ni un nivel de riesgo.
      calcularEvaluacion(
        entrada.snapshot.actual,
        entrada.snapshot.anterior,
        entrada.snapshot.reglas,
      );
      return {
        ...entrada,
        processingFingerprint: huellaEvaluacion(entrada.snapshot),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

/** Publicación idempotente y atómica: evaluación, puntero y alerta anterior.
 * Un cálculo obsoleto devuelve REQUIERE_REPROCESO en lugar de pisar el vigente.
 */
export async function publicarEvaluacion(
  db: PrismaClient,
  preparada: EvaluacionPreparada,
  opciones: OpcionesEvaluacion = {},
): Promise<Evaluacion> {
  return serializable(db, (tx) =>
    publicarDentroDeTransaccion(tx, preparada, opciones),
  );
}

async function publicarDentroDeTransaccion(
  tx: Prisma.TransactionClient,
  fuente: EvaluacionPreparada | ParPeriodo,
  opciones: OpcionesEvaluacion,
) {
  await opciones.alIniciar?.(tx);
  const evaluacion = await guardarEvaluacion(tx, fuente, opciones.propietario);
  await opciones.alPublicar?.(tx, evaluacion);
  if (opciones.propietario) {
    const { jobId, ownerToken } = opciones.propietario;
    const permiso = await tx.$queryRaw<{ jobId: string }[]>`
        SELECT jobId FROM ProcessingJob WHERE jobId = ${jobId} AND ownerToken = ${ownerToken}
        AND estado = 'PROCESANDO' AND leaseUntil > UTC_TIMESTAMP(3) FOR UPDATE`;
    if (permiso.length !== 1)
      throw new ErrorDominio(
        "REQUIERE_REPROCESO",
        "El procesamiento se interrumpió antes de terminar. Reintente el procesamiento.",
      );
  }
  return evaluacion;
}

export async function evaluarPeriodo(
  db: PrismaClient,
  par: ParPeriodo,
  opciones: OpcionesEvaluacion = {},
): Promise<Evaluacion> {
  if (opciones.propietario) {
    // El job queda bloqueado antes de leer fuentes/reglas. Estas permanecen
    // protegidas hasta publicar evaluación+alerta y volver a comprobar el lease.
    return serializable(db, (tx) =>
      publicarDentroDeTransaccion(tx, par, opciones),
    );
  }
  return publicarEvaluacion(db, await prepararEvaluacion(db, par), opciones);
}

/** Unión de nuevos y sucesores inmediatos existentes, sin propagar a W+2.
 * T04 conserva esta lista en el job, ejecuta los pares y gestiona lease/reintento.
 */
export async function obtenerParesAfectados(
  tx: Prisma.TransactionClient,
  nuevos: ParPeriodo[],
): Promise<ParPeriodo[]> {
  const pares = new Map<string, ParPeriodo>();
  const agregar = (par: ParPeriodo) =>
    pares.set(
      JSON.stringify([par.employeeId, par.periodStart, par.periodEnd]),
      par,
    );
  for (const par of nuevos) agregar(par);
  const sucesores = nuevos.map((par) => ({
    employeeId: par.employeeId,
    periodStart: fechaDesdeDb(
      new Date(fechaParaDb(par.periodStart).getTime() + 7 * 86_400_000),
    ),
    periodEnd: fechaDesdeDb(
      new Date(fechaParaDb(par.periodEnd).getTime() + 7 * 86_400_000),
    ),
  }));
  for (const lote of lotes(sucesores)) {
    const siguientes = await tx.periodoEmpleado.findMany({
      where: { OR: lote.map(filtroPeriodo), registroVigenteId: { not: null } },
      select: { employeeId: true, periodStart: true, periodEnd: true },
    });
    for (const siguiente of siguientes) agregar(parDesdePeriodo(siguiente));
  }
  return [...pares.values()].sort((a, b) =>
    a.employeeId < b.employeeId
      ? -1
      : a.employeeId > b.employeeId
        ? 1
        : a.periodStart.localeCompare(b.periodStart),
  );
}

/** Conveniencia para importaciones fuera de orden; cada par tiene su propio commit.
 * Si falla un par, se detiene y se conservan los anteriores. El job es dueño de
 * la recuperación y no debe contar el par hasta terminar CU03.
 */
export async function evaluarAfectados(
  db: PrismaClient,
  nuevos: ParPeriodo[],
  opciones: OpcionesEvaluacion = {},
): Promise<Evaluacion[]> {
  const pares = await db.$transaction((tx) =>
    obtenerParesAfectados(tx, nuevos),
  );
  const resultados: Evaluacion[] = [];
  for (const par of pares)
    resultados.push(await evaluarPeriodo(db, par, opciones));
  return resultados;
}

/** Detalle histórico: vigente deriva del puntero, no de la fecha de creación. */
export async function obtenerEvaluacion(
  db: PrismaClient | Prisma.TransactionClient,
  evaluationId: string,
): Promise<Evaluacion | null> {
  const fila = await db.evaluacion.findUnique({
    where: { evaluationId },
    include: { periodo: { select: { evaluacionVigenteId: true } } },
  });
  return fila
    ? evaluacionDesdeDb(fila, fila.periodo.evaluacionVigenteId)
    : null;
}

/** T13 puede distinguir vigente de actualizado durante un reprocesamiento. */
export async function evaluacionActualizada(
  db: PrismaClient,
  evaluationId: string,
): Promise<boolean> {
  return db.$transaction(
    async (tx) => {
      const fila = await tx.evaluacion.findUnique({
        where: { evaluationId },
        include: { periodo: true },
      });
      if (
        !fila ||
        fila.periodo.evaluacionVigenteId !== evaluationId ||
        fila.engineVersion !== ENGINE_VERSION
      )
        return false;
      const entrada = await leerEntradaEvaluacion(tx, {
        employeeId: fila.employeeId,
        periodStart: fechaDesdeDb(fila.periodo.periodStart),
        periodEnd: fechaDesdeDb(fila.periodo.periodEnd),
      });
      return huellaEvaluacion(entrada.snapshot) === fila.processingFingerprint;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
