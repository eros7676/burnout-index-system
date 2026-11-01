import { Prisma } from "@prisma/client";
import type { Alerta, Factor } from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import { leerAlertaEvaluacion } from "./informes";

export type AlertaNueva = {
  evaluationId: string;
  employeeId: string;
  destinatarioId: string | null;
  motivoDestinatario: "OK" | "SIN_DESTINATARIO";
  causas: Factor[];
  sugerencias: string[];
};

/**
 * Inserta la alerta interna de una evaluación si todavía no existe.
 * El bloqueo de la evaluación evita dos filas cuando dos procesos llegan juntos.
 */
export async function guardarAlertaNueva(
  tx: Prisma.TransactionClient,
  datos: AlertaNueva,
): Promise<Alerta> {
  const bloqueo = await tx.$queryRaw<{ evaluationId: string }[]>`
    SELECT evaluationId FROM Evaluacion
    WHERE evaluationId = ${datos.evaluationId} FOR UPDATE`;
  if (bloqueo.length !== 1) {
    throw new ErrorDominio(
      "NO_ENCONTRADO",
      "No existe una evaluación con ese identificador.",
    );
  }
  const existente = await leerAlertaEvaluacion(tx, datos.evaluationId);
  if (existente) return existente;
  await tx.alerta.create({
    data: {
      evaluationId: datos.evaluationId,
      employeeId: datos.employeeId,
      destinatarioId: datos.destinatarioId,
      motivoDestinatario: datos.motivoDestinatario,
      causas: datos.causas,
      sugerencias: datos.sugerencias,
      vigencia: "ACTIVA",
      canal: "INTERNO",
      estadoEnvio: "NO_APLICA",
    },
  });
  const creada = await leerAlertaEvaluacion(tx, datos.evaluationId);
  if (!creada) {
    throw new ErrorDominio(
      "CONTRATO_INVALIDO",
      "No se pudo leer la alerta recién guardada.",
    );
  }
  return creada;
}
