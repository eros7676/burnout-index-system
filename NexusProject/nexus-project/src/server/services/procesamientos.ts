import type { PrismaClient } from "@prisma/client";
import type { JobDTO } from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import {
  comenzarParEnTransaccion,
  completarPar,
  finalizarJob,
  obtenerJob,
  parDePeriodo,
  reclamarJob,
} from "../repositories/procesamientos";
import { evaluarPeriodo, type OpcionesEvaluacion } from "./evaluaciones";
import { alPublicarAlerta } from "./alertas";
import { construirInforme, construirInformePublicado } from "./informes";

/** Inyección explícita para probar fallos; las rutas de producción usan los servicios reales. */
export type OpcionesProcesamiento = {
  alPublicar?: OpcionesEvaluacion["alPublicar"];
  informe?: typeof construirInforme;
};

export async function procesarImportacion(
  db: PrismaClient,
  jobId: string,
  opciones: OpcionesProcesamiento = {},
): Promise<JobDTO> {
  const reclamo = await reclamarJob(db, jobId);
  if (!reclamo) return obtenerJob(db, jobId);
  const { propietario, pares } = reclamo;
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
    } catch (error) {
      // Si se perdió el token/lease, finalizarJob también rechaza sin escribir.
      await finalizarJob(db, propietario, {
        periodoId,
        codigo:
          error instanceof ErrorDominio ? error.codigo : "ERROR_PROCESAMIENTO",
        detalle:
          error instanceof ErrorDominio
            ? error.message
            : "No se pudo completar la evaluación, alerta o informe. Reintente el procesamiento.",
      });
      return obtenerJob(db, jobId);
    }
  }
  await finalizarJob(db, propietario);
  return obtenerJob(db, jobId);
}

export { obtenerJob };
