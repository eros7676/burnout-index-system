import type { Prisma, PrismaClient } from "@prisma/client";
import type { ResultadoImportacion } from "../../shared/contracts";
import { ErrorImportacion } from "../services/error-importacion";

export async function bloquearImportacion(
  tx: Prisma.TransactionClient,
  importId: string,
) {
  await tx.$queryRaw`SELECT importId FROM Importacion WHERE importId = ${importId} FOR UPDATE`;
  const carga = await tx.importacion.findUnique({
    where: { importId },
    include: { temporal: true },
  });
  if (!carga)
    throw new ErrorImportacion(
      404,
      "NO_ENCONTRADO",
      "La importación no existe.",
    );
  return carga;
}

/** Limpieza diferida al operar CU01. Conserva todos los metadatos. */
export async function eliminarTemporalesVencidos(
  db: PrismaClient,
  ahora: Date,
) {
  await db.importacionTemporal.deleteMany({
    where: {
      importacion: { status: { not: "CONFIRMADA" }, expiresAt: { lte: ahora } },
    },
  });
}

export function resultadoGuardado(
  valor: Prisma.JsonValue | null,
): ResultadoImportacion {
  if (
    !valor ||
    typeof valor !== "object" ||
    Array.isArray(valor) ||
    valor.status !== "CONFIRMADA"
  )
    throw new Error("Falta el resultado de la importación confirmada.");
  return valor as unknown as ResultadoImportacion;
}

export const jsonImportacion = (valor: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
