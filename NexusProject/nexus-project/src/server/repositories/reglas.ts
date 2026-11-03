import { registrarEvento, type Actor } from "./auditoria";
import { Prisma } from "@prisma/client";
import type { ConfiguracionIndice, FechaISO } from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import { cambiosEntre, propuestaDesde } from "../services/reglas-parametros";
import { reglasDesdeDb } from "./evaluaciones";
import { fechaDesdeDb, fechaParaDb } from "./fechas";

/** Rows per INSERT when a reprocessing job lists its weeks. */
const LOTE_PARES = 2_000;

/** Who published and under which operation, for the audit event. A bare command-line run has none of it. */
export type ContextoPublicacion = {
  actor?: Actor;
  /** The draft that produced the version. */
  correlacionId?: string;
  justificacion?: string;
};

/**
 * The weeks a version starting at `inicio` takes over: every week with loaded data
 * up to the start of the next version. One definition for the job it creates and
 * for the draft's retroactivity.
 */
export const periodosAfectados = (
  inicio: Date,
  siguiente: Date | null,
): Prisma.PeriodoEmpleadoWhereInput => ({
  periodStart: siguiente ? { gte: inicio, lt: siguiente } : { gte: inicio },
  registros: { some: {} },
});

export type VersionPublicada = {
  version: string;
  effectiveFrom: FechaISO;
  jobId: string;
  semanas: number;
  estado: "PENDIENTE" | "COMPLETADO";
};

function yaExiste(
  campo: "version" | "effectiveFrom",
  valor: string,
): ErrorDominio {
  const detalle =
    campo === "version"
      ? `Ya existe la versión ${valor}. Cada versión es inmutable.`
      : `Ya hay una regla con inicio ${valor}. La fecha de inicio es única.`;
  return new ErrorDominio("CONFIGURACION_INVALIDA", detalle, [
    { fila: null, campo, codigo: "CONFIGURACION_INVALIDA", detalle },
  ]);
}

function conflictoUnico(error: unknown): ErrorDominio | null {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return null;
  }
  const target = error.meta?.target;
  const texto = Array.isArray(target) ? target.join(",") : String(target ?? "");
  if (texto.includes("effectiveFrom") || texto.includes("effective_from")) {
    return yaExiste("effectiveFrom", "indicado");
  }
  return yaExiste("version", "indicada");
}

/**
 * Inserta una versión ya validada y el trabajo de las semanas confirmadas
 * que pasan a usarla. El intervalo es [inicio, inicio de la versión siguiente).
 * No actualiza filas anteriores ni calcula evaluaciones.
 */
export async function guardarVersionNueva(
  tx: Prisma.TransactionClient,
  reglas: ConfiguracionIndice,
  contexto: ContextoPublicacion = {},
): Promise<VersionPublicada> {
  const inicio = fechaParaDb(reglas.effectiveFrom);
  const mismaVersion = await tx.configuracionIndice.findUnique({
    where: { version: reglas.version },
    select: { version: true },
  });
  if (mismaVersion) throw yaExiste("version", reglas.version);

  const mismoInicio = await tx.configuracionIndice.findUnique({
    where: { effectiveFrom: inicio },
    select: { effectiveFrom: true },
  });
  if (mismoInicio) throw yaExiste("effectiveFrom", reglas.effectiveFrom);

  const siguiente = await tx.configuracionIndice.findFirst({
    where: { effectiveFrom: { gt: inicio } },
    orderBy: { effectiveFrom: "asc" },
    select: { effectiveFrom: true },
  });

  const periodos = await tx.periodoEmpleado.findMany({
    where: periodosAfectados(inicio, siguiente?.effectiveFrom ?? null),
    orderBy: [{ employeeId: "asc" }, { periodStart: "asc" }],
    select: { periodoId: true },
  });

  const sinSemanas = periodos.length === 0;
  try {
    await tx.configuracionIndice.create({
      data: {
        version: reglas.version,
        effectiveFrom: inicio,
        windowDays: reglas.windowDays,
        persistencePeriods: reglas.persistencePeriods,
        weights: reglas.weights,
        thresholds: reglas.thresholds,
        mediumLimit: reglas.mediumLimit,
        highLimit: reglas.highLimit,
        minExceededFactors: reglas.minExceededFactors,
        createdBy: reglas.createdBy,
        createdAt: new Date(reglas.createdAt),
      },
    });
    const trabajo = await tx.processingJob.create({
      data: {
        origen: "CAMBIO_REGLAS",
        rulesVersion: reglas.version,
        estado: sinSemanas ? "COMPLETADO" : "PENDIENTE",
        createdBy: reglas.createdBy,
        finishedAt: sinSemanas ? new Date() : null,
      },
      select: { jobId: true },
    });
    // A long history lists tens of thousands of weeks: insert them in batches.
    for (let desde = 0; desde < periodos.length; desde += LOTE_PARES)
      await tx.processingJobPar.createMany({
        data: periodos.slice(desde, desde + LOTE_PARES).map((periodo, i) => ({
          jobId: trabajo.jobId,
          periodoId: periodo.periodoId,
          orden: desde + i,
        })),
      });
    const anterior = await tx.configuracionIndice.findFirst({
      where: { effectiveFrom: { lt: inicio } },
      orderBy: { effectiveFrom: "desc" },
    });
    await registrarEvento(tx, {
      accion: "REGLAS_PUBLICADAS",
      recursoId: reglas.version,
      actor: contexto.actor ?? reglas.createdBy,
      correlacionId: contexto.correlacionId ?? null,
      justificacion: contexto.justificacion,
      cambios: anterior
        ? cambiosEntre(
            propuestaDesde(reglasDesdeDb(anterior)),
            propuestaDesde(reglas),
          )
        : [],
      detalles: {
        versionAnterior: anterior?.version ?? null,
        version: reglas.version,
        effectiveFrom: reglas.effectiveFrom,
        weights: reglas.weights,
        thresholds: reglas.thresholds,
        mediumLimit: reglas.mediumLimit,
        highLimit: reglas.highLimit,
        minExceededFactors: reglas.minExceededFactors,
        jobId: trabajo.jobId,
        semanas: periodos.length,
      },
    });
    return {
      version: reglas.version,
      effectiveFrom: fechaDesdeDb(inicio),
      jobId: trabajo.jobId,
      semanas: periodos.length,
      estado: sinSemanas ? "COMPLETADO" : "PENDIENTE",
    };
  } catch (error) {
    const conflicto = conflictoUnico(error);
    if (conflicto) throw conflicto;
    throw error;
  }
}
