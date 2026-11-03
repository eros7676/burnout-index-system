import type { Prisma, PrismaClient } from "@prisma/client";
import type { ErrorCampo, ResultadoImportacion } from "../../shared/contracts";
import { ErrorImportacion } from "../services/error-importacion";

/** A validated preview can be confirmed for 30 minutes (T04). */
export const VIGENCIA_PREVIA_MS = 30 * 60 * 1000;

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

/**
 * Stores a validated or rejected file as an Importacion with its temporary rows, inside the
 * caller's transaction. Both datasets share it; `schemaVersion` tells them apart.
 */
export async function crearImportacionTemporal(
  tx: Prisma.TransactionClient,
  d: {
    nombreArchivo: string;
    sourceHash: string;
    schemaVersion: string;
    usuarioId: string;
    ahora: Date;
    validacion: {
      status: "VALIDADA" | "RECHAZADA";
      totalFilas: number;
      nuevas: number;
      omitidas: number;
      errores: ErrorCampo[];
      warnings: ErrorCampo[];
    };
    /** The parsed rows, trimmed strings, so confirmation can validate again. */
    filas: unknown;
    /** The first valid rows, kept as text so numbers keep their precision. */
    muestra: unknown;
  },
) {
  const expiresAt = new Date(d.ahora.getTime() + VIGENCIA_PREVIA_MS);
  const creada = await tx.importacion.create({
    data: {
      sourceName: d.nombreArchivo.slice(0, 255),
      sourceHash: d.sourceHash,
      schemaVersion: d.schemaVersion,
      uploadedBy: d.usuarioId,
      uploadedAt: d.ahora,
      status: d.validacion.status,
      expiresAt,
      totalFilas: d.validacion.totalFilas,
      nuevas: d.validacion.nuevas,
      omitidas: d.validacion.omitidas,
      errores: jsonImportacion(d.validacion.errores),
      warnings: jsonImportacion(d.validacion.warnings),
      temporal: {
        create: {
          datos: jsonImportacion(d.filas),
          // JSON textual evita el recorte numérico de Prisma/MySQL en la muestra temporal.
          muestra: JSON.stringify(d.muestra),
        },
      },
    },
  });
  return { importId: creada.importId, expiresAt };
}
