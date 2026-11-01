import { randomUUID } from "node:crypto";
import type {
  Prisma,
  PrismaClient,
  ProcessingJob,
  ProcessingJobPar,
  PeriodoEmpleado,
} from "@prisma/client";
import type { JobDTO, ParPeriodo } from "../../shared/contracts";
import { fechaDesdeDb } from "./fechas";
import type { PropietarioJob } from "./evaluaciones";
import { transaccionImportacion } from "./transaccion-importacion";
import { ErrorImportacion } from "../services/error-importacion";

type JobConPares = ProcessingJob & {
  pares: (ProcessingJobPar & { periodo: PeriodoEmpleado })[];
};
const incluirPares = {
  pares: { include: { periodo: true }, orderBy: { orden: "asc" as const } },
};

export function parDePeriodo(p: PeriodoEmpleado): ParPeriodo {
  return {
    employeeId: p.employeeId,
    periodStart: fechaDesdeDb(p.periodStart),
    periodEnd: fechaDesdeDb(p.periodEnd),
  };
}

function dto(job: JobConPares, ahora: Date): JobDTO {
  return {
    jobId: job.jobId,
    // Un trabajo abandonado se ofrece como pendiente recuperable, sin mutarlo en GET.
    estado:
      job.estado === "PROCESANDO" &&
      (!job.leaseUntil || job.leaseUntil <= ahora)
        ? "PENDIENTE"
        : job.estado,
    totalPares: job.pares.length,
    completados: job.pares.filter((p) => p.estado === "COMPLETADO").length,
    errores: job.pares
      .filter((p) => p.errorCodigo)
      .map((p) => ({
        par: parDePeriodo(p.periodo),
        codigo: p.errorCodigo!,
        detalle: p.errorDetalle ?? "Error de procesamiento.",
      })),
    updatedAt: job.updatedAt.toISOString(),
  };
}

async function leerJob(tx: Prisma.TransactionClient, jobId: string) {
  const job = await tx.processingJob.findUnique({
    where: { jobId },
    include: incluirPares,
  });
  if (!job)
    throw new ErrorImportacion(
      404,
      "NO_ENCONTRADO",
      "El procesamiento no existe.",
    );
  return job;
}

export async function obtenerJob(
  db: PrismaClient,
  jobId: string,
): Promise<JobDTO> {
  return db.$transaction(async (tx) => {
    const [{ ahora }] = await tx.$queryRaw<
      { ahora: Date }[]
    >`SELECT UTC_TIMESTAMP(3) AS ahora`;
    return dto(await leerJob(tx, jobId), ahora);
  });
}

export async function reclamarJob(db: PrismaClient, jobId: string) {
  return transaccionImportacion(db, async (tx) => {
    await tx.$queryRaw`SELECT jobId FROM ProcessingJob WHERE jobId = ${jobId} FOR UPDATE`;
    const job = await leerJob(tx, jobId);
    if (job.estado === "COMPLETADO") return null;
    const ownerToken = randomUUID();
    const cantidad = await tx.$executeRaw`
      UPDATE ProcessingJob SET estado = 'PROCESANDO', ownerToken = ${ownerToken},
      leaseUntil = TIMESTAMPADD(SECOND, 120, UTC_TIMESTAMP(3)), intentos = intentos + 1,
      startedAt = UTC_TIMESTAMP(3), finishedAt = NULL, updatedAt = UTC_TIMESTAMP(3)
      WHERE jobId = ${jobId} AND (estado IN ('PENDIENTE', 'FALLIDO') OR
        (estado = 'PROCESANDO' AND (leaseUntil IS NULL OR leaseUntil <= UTC_TIMESTAMP(3))))`;
    if (cantidad !== 1)
      throw new ErrorImportacion(
        409,
        "JOB_RECLAMADO",
        "Otro ejecutor está procesando este trabajo.",
      );
    return { propietario: { jobId, ownerToken }, pares: job.pares };
  });
}

async function conPropietario<T>(
  db: PrismaClient,
  p: PropietarioJob,
  ejecutar: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return transaccionImportacion(db, (tx) => conPropietarioTx(tx, p, ejecutar));
}

async function conPropietarioTx<T>(
  tx: Prisma.TransactionClient,
  p: PropietarioJob,
  ejecutar: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  const permiso = await tx.$queryRaw<{ jobId: string }[]>`
      SELECT jobId FROM ProcessingJob WHERE jobId = ${p.jobId} AND ownerToken = ${p.ownerToken}
      AND estado = 'PROCESANDO' AND leaseUntil > UTC_TIMESTAMP(3) FOR UPDATE`;
  if (permiso.length !== 1)
    throw new ErrorImportacion(
      409,
      "JOB_RECLAMADO",
      "El ejecutor perdió su lease o token; reintente el trabajo.",
    );
  const resultado = await ejecutar(tx);
  // Comprobar también después del trabajo, antes de permitir su commit.
  const vigente = await tx.$queryRaw<{ jobId: string }[]>`
      SELECT jobId FROM ProcessingJob WHERE jobId = ${p.jobId} AND ownerToken = ${p.ownerToken}
      AND leaseUntil > UTC_TIMESTAMP(3) FOR UPDATE`;
  if (vigente.length !== 1)
    throw new ErrorImportacion(
      409,
      "JOB_RECLAMADO",
      "Venció el permiso del ejecutor.",
    );
  return resultado;
}

export async function comenzarPar(
  db: PrismaClient,
  p: PropietarioJob,
  periodoId: string,
) {
  await conPropietario(db, p, (tx) => iniciarPar(tx, p, periodoId));
}

/** Permite publicar el inicio junto con la evaluación, sin una segunda conexión
 * o un commit por separado. El llamador debe confirmar/revertir esta transacción. */
export async function comenzarParEnTransaccion(
  tx: Prisma.TransactionClient,
  p: PropietarioJob,
  periodoId: string,
) {
  await conPropietarioTx(tx, p, (cliente) => iniciarPar(cliente, p, periodoId));
}

async function iniciarPar(
  tx: Prisma.TransactionClient,
  p: PropietarioJob,
  periodoId: string,
) {
  const cantidad = await tx.$executeRaw`
      UPDATE ProcessingJob j JOIN ProcessingJobPar par ON par.jobId = j.jobId
      SET j.leaseUntil = TIMESTAMPADD(SECOND, 120, UTC_TIMESTAMP(3)), j.updatedAt = UTC_TIMESTAMP(3),
        par.estado = 'PROCESANDO', par.errorCodigo = NULL, par.errorDetalle = NULL, par.completedAt = NULL
      WHERE j.jobId = ${p.jobId} AND par.periodoId = ${periodoId}`;
  comprobarActualizacion(cantidad);
}

export async function completarPar(
  db: PrismaClient,
  p: PropietarioJob,
  periodoId: string,
) {
  await conPropietario(db, p, async (tx) => {
    const cantidad = await tx.$executeRaw`
      UPDATE ProcessingJob j JOIN ProcessingJobPar par ON par.jobId = j.jobId
      SET j.updatedAt = UTC_TIMESTAMP(3), par.estado = 'COMPLETADO',
        par.completedAt = UTC_TIMESTAMP(3), par.errorCodigo = NULL, par.errorDetalle = NULL
      WHERE j.jobId = ${p.jobId} AND par.periodoId = ${periodoId}`;
    comprobarActualizacion(cantidad);
  });
}

export async function finalizarJob(
  db: PrismaClient,
  p: PropietarioJob,
  fallo?: { periodoId: string; codigo: string; detalle: string },
) {
  await conPropietario(db, p, async (tx) => {
    if (fallo)
      await actualizarPar(tx, p.jobId, fallo.periodoId, {
        estado: "FALLIDO",
        errorCodigo: fallo.codigo,
        errorDetalle: fallo.detalle,
        completedAt: null,
      });
    else if (
      await tx.processingJobPar.count({
        where: { jobId: p.jobId, estado: { not: "COMPLETADO" } },
      })
    )
      throw new Error("El trabajo todavía tiene pares pendientes.");
    // Conservar token hasta el commit para la última comprobación de propiedad.
    await tx.processingJob.updateMany({
      where: { jobId: p.jobId },
      data: {
        estado: fallo ? "FALLIDO" : "COMPLETADO",
        finishedAt: new Date(),
      },
    });
  });
}

/** No leer de nuevo una fila cuyo resultado se descarta. El job ya está bloqueado
 * y conPropietario comprueba token y lease antes y después de esta escritura. */
async function actualizarPar(
  tx: Prisma.TransactionClient,
  jobId: string,
  periodoId: string,
  data: Prisma.ProcessingJobParUpdateManyMutationInput,
) {
  const cambio = await tx.processingJobPar.updateMany({
    where: { jobId, periodoId },
    data,
  });
  if (cambio.count !== 1)
    throw new ErrorImportacion(
      409,
      "JOB_RECLAMADO",
      "El período no pertenece al trabajo de procesamiento.",
    );
}

function comprobarActualizacion(cantidad: number) {
  // UPDATE multitabla cuenta filas modificadas de ambas tablas. El par siempre
  // cambia de estado; cero implica que no pertenece a este job y revierte el tx.
  if (cantidad < 1)
    throw new ErrorImportacion(
      409,
      "JOB_RECLAMADO",
      "El período no pertenece al trabajo de procesamiento.",
    );
}
