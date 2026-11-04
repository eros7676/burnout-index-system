import type { Prisma, PrismaClient } from "@prisma/client";
import type { Evaluacion, InformeDTO } from "../../shared/contracts";
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
  db: PrismaClient | Prisma.TransactionClient,
  evaluationId: string,
): Promise<InformeDTO> {
  const evaluacion = await obtenerEvaluacion(db, evaluationId);
  if (!evaluacion) {
    throw new ErrorDominio(
      "NO_ENCONTRADO",
      "No existe una evaluación con ese identificador.",
    );
  }
  return construirInformePublicado(db, evaluacion);
}

/** Solo para el procesamiento de servidor: recibe la evaluación devuelta por
 * una publicación ya confirmada. Las consultas públicas siguen leyendo por ID.
 * Evita leer y decodificar otra vez el mismo snapshot recién persistido. */
export async function construirInformePublicado(
  db: PrismaClient | Prisma.TransactionClient,
  evaluacion: Evaluacion,
): Promise<InformeDTO> {
  const evaluationId = evaluacion.evaluationId;
  const [empleado, alerta] = await Promise.all([
    leerEmpleadoInforme(db, evaluacion.employeeId),
    leerAlertaEvaluacion(db, evaluationId),
  ]);
  return {
    evaluacion,
    empleado,
    factores: factoresInforme(evaluacion),
    explicacion: explicarInforme(evaluacion),
    recomendaciones: recomendacionesDe(evaluacion),
    alerta,
  };
}
