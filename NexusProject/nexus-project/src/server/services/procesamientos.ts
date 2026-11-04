import type { PrismaClient } from "@prisma/client";
import type { JobDTO } from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import {
  registrarEvento,
  type Actor,
  type ContextoAuditoria,
} from "../repositories/auditoria";
import {
  comenzarParEnTransaccion,
  completarPar,
  finalizarJob,
  obtenerJob,
  parDePeriodo,
  reclamarJob,
  type DatosJob,
} from "../repositories/procesamientos";
import { evaluarPeriodo, type OpcionesEvaluacion } from "./evaluaciones";
import { alPublicarAlerta } from "./alertas";
import { construirInforme, construirInformePublicado } from "./informes";

/** Inyección explícita para probar fallos; las rutas de producción usan los servicios reales. */
export type OpcionesProcesamiento = {
  alPublicar?: OpcionesEvaluacion["alPublicar"];
  informe?: typeof construirInforme;
  /** Who started the work: its request id is carried into the events the system writes. */
  actor?: Actor;
  /** Set when a person asked for a retry: records PROCESAMIENTO_REINTENTADO under this actor. */
  reintentadoPor?: Actor;
};

/** The job worker acts as the system; the request that started it stays traceable. */
function actorSistema(actor?: Actor): ContextoAuditoria {
  return {
    actorId: "sistema",
    actorNombre: "Sistema",
    origen: "SISTEMA",
    ...(typeof actor === "object" && actor.solicitudId
      ? { solicitudId: actor.solicitudId }
      : {}),
  };
}

/** The business operation a job belongs to: its import, or the rules version it applies. */
const correlacion = (job: DatosJob) => job.importId ?? job.rulesVersion ?? null;

export async function procesarImportacion(
  db: PrismaClient,
  jobId: string,
  opciones: OpcionesProcesamiento = {},
): Promise<JobDTO> {
  const { reintentadoPor } = opciones;
  const reclamo = await reclamarJob(
    db,
    jobId,
    reintentadoPor
      ? (tx, job) =>
          registrarEvento(tx, {
            accion: "PROCESAMIENTO_REINTENTADO",
            recursoId: jobId,
            correlacionId: correlacion(job),
            actor: reintentadoPor,
            detalles: {
              origenJob: job.origen,
              intentos: job.intentos,
              estadoAnterior: job.estadoAnterior,
              pares: job.totalPares,
            },
          }).then(() => undefined)
      : undefined,
  );
  if (!reclamo) return obtenerJob(db, jobId);
  const { propietario, pares, job } = reclamo;
  let completados = 0;
  for (const { periodoId, periodo } of pares) {
    try {
      const evaluacion = await evaluarPeriodo(db, parDePeriodo(periodo), {
        propietario,
        alIniciar: (tx) => comenzarParEnTransaccion(tx, propietario, periodoId),
        alPublicar: opciones.alPublicar ?? alPublicarAlerta,
      });
      if (opciones.informe) await opciones.informe(db, evaluacion.evaluationId);
      else await construirInformePublicado(db, evaluacion);
      await completarPar(db, propietario, periodoId);
      completados++;
    } catch (error) {
      const codigo =
        error instanceof ErrorDominio ? error.codigo : "ERROR_PROCESAMIENTO";
      // Si se perdió el token/lease, finalizarJob también rechaza sin escribir.
      await finalizarJob(
        db,
        propietario,
        {
          periodoId,
          codigo,
          detalle:
            error instanceof ErrorDominio
              ? error.message
              : "No se pudo completar la evaluación, alerta o informe. Reintente el procesamiento.",
        },
        // Server-defined metadata only: the code, never the raw message.
        (tx) =>
          registrarEvento(tx, {
            accion: "PROCESAMIENTO_FALLIDO",
            recursoId: jobId,
            correlacionId: correlacion(job),
            actor: actorSistema(opciones.actor),
            resultado: "FALLO",
            motivo: "ERROR_TECNICO",
            detalles: {
              origenJob: job.origen,
              intentos: job.intentos,
              pares: pares.length,
              completados,
              fallidos: 1,
              codigoError: codigo,
            },
          }).then(() => undefined),
      );
      return obtenerJob(db, jobId);
    }
  }
  await finalizarJob(db, propietario, undefined, (tx) =>
    registrarEvento(tx, {
      accion: "PROCESAMIENTO_COMPLETADO",
      recursoId: jobId,
      correlacionId: correlacion(job),
      actor: actorSistema(opciones.actor),
      detalles: {
        origenJob: job.origen,
        intentos: job.intentos,
        pares: pares.length,
        completados,
        fallidos: 0,
      },
    }).then(() => undefined),
  );
  return obtenerJob(db, jobId);
}

export { obtenerJob };
