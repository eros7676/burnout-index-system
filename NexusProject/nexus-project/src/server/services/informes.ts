import type { PrismaClient } from "@prisma/client";
import type { InformeDTO } from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import {
  leerAlertaEvaluacion,
  leerEmpleadoInforme,
} from "../repositories/informes";
import { explicarInforme, factoresInforme } from "./informe-contenido";
import { obtenerEvaluacion } from "./evaluaciones";
import { recomendacionesDe } from "./recomendaciones";

/**
 * Arma el informe desde la evaluación persistida.
 * El primer argumento es el cliente inyectable; la firma de `ServiciosPrototipo`
 * sigue siendo `construirInforme(evaluationId)`.
 * No recalcula, no publica y no crea ni supera alertas.
 */
export async function construirInforme(
  db: PrismaClient,
  evaluationId: string,
): Promise<InformeDTO> {
  const evaluacion = await obtenerEvaluacion(db, evaluationId);
  if (!evaluacion) {
    throw new ErrorDominio(
      "NO_ENCONTRADO",
      "No existe una evaluación con ese identificador.",
    );
  }
  const [empleado, alerta] = await Promise.all([
    leerEmpleadoInforme(db, evaluacion.employeeId),
    leerAlertaEvaluacion(db, evaluationId),
  ]);
  return {
    evaluacion,
    empleado,
    factores: factoresInforme(evaluacion),
    explicacion: explicarInforme(evaluacion),
    recomendaciones: recomendacionesDe(
      evaluacion.ranking,
      evaluacion.excedidas,
    ),
    alerta,
  };
}
