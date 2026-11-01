import { Prisma, type PrismaClient } from "@prisma/client";
import type { Alerta, Evaluacion } from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import {
  bloquearEvaluacionAlerta,
  guardarAlertaNueva,
} from "../repositories/alertas";
import { evaluacionDesdeDb } from "../repositories/evaluaciones";
import { leerAlertaEvaluacion } from "../repositories/informes";
import { contenidoAlerta, resolverDestinatario } from "./destinatario-alerta";

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
        // Las consultas SQL crudas conservan el código de deadlock de MySQL.
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

/**
 * Crea la alerta única de una evaluación ALTO vigente, dentro del tx recibido.
 * Si la fila ya existe, la devuelve sin modificarla: un reintento no duplica.
 * T08 ya marcó SUPERADA la alerta de la evaluación anterior antes de este hook.
 */
export async function asegurarAlerta(
  tx: Prisma.TransactionClient,
  evaluacion: Evaluacion,
): Promise<Alerta | null> {
  const existente = await leerAlertaEvaluacion(tx, evaluacion.evaluationId);
  if (existente) return existente;
  if (evaluacion.nivel !== "ALTO" || !evaluacion.vigente) return null;

  const empleado = await tx.empleado.findUnique({
    where: { employeeId: evaluacion.employeeId },
    include: {
      responsable: {
        select: { employeeId: true, tipo: true, activo: true },
      },
    },
  });
  if (!empleado) {
    throw new ErrorDominio(
      "EMPLEADO_NO_EXISTE",
      "La evaluación no apunta a un empleado del catálogo.",
    );
  }
  const destino = resolverDestinatario(empleado, empleado.responsable);
  return guardarAlertaNueva(tx, {
    evaluationId: evaluacion.evaluationId,
    employeeId: evaluacion.employeeId,
    ...destino,
    ...contenidoAlerta(evaluacion),
  });
}

/** Adaptador de `alPublicar`. Solo usa el tx recibido: sin correo ni otra conexión. */
export async function alPublicarAlerta(
  tx: Prisma.TransactionClient,
  evaluacion: Evaluacion,
): Promise<void> {
  await asegurarAlerta(tx, evaluacion);
}

/**
 * Asegura la alerta de una evaluación ya guardada.
 * El primer argumento es el cliente inyectable; la firma de `ServiciosPrototipo`
 * sigue siendo `crearAlertaSiCorresponde(evaluationId)`.
 */
export async function crearAlertaSiCorresponde(
  db: PrismaClient,
  evaluationId: string,
): Promise<Alerta | null> {
  return serializable(db, async (tx) => {
    // Serializa llamadas al mismo ID antes de adquirir locks compartidos.
    await bloquearEvaluacionAlerta(tx, evaluationId);
    const fila = await tx.evaluacion.findUnique({
      where: { evaluationId },
      include: { periodo: { select: { evaluacionVigenteId: true } } },
    });
    if (!fila) {
      throw new ErrorDominio(
        "NO_ENCONTRADO",
        "No existe una evaluación con ese identificador.",
      );
    }
    return asegurarAlerta(
      tx,
      evaluacionDesdeDb(fila, fila.periodo.evaluacionVigenteId),
    );
  });
}
