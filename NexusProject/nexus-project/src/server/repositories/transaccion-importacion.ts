import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * Time limits for the import transactions. Storing a preview writes every row of the file at once
 * and, on a freshly migrated database, outlasts Prisma's 5 s default.
 */
export const PLAZO_IMPORTACION = { timeout: 30_000, maxWait: 10_000 } as const;

/** Reintentar la transacción entera: nunca una escritura aislada de un lote. */
export async function transaccionImportacion<T>(
  db: PrismaClient,
  trabajo: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await db.$transaction(trabajo, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        ...PLAZO_IMPORTACION,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        intento >= 2 ||
        !(
          error.code === "P2034" ||
          error.code === "P2002" ||
          (error.code === "P2010" && error.meta?.code === "1213")
        )
      )
        throw error;
    }
  }
}
