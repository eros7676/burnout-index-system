import { Prisma, type PrismaClient } from "@prisma/client";

/** Reintentar la transacción entera: nunca una escritura aislada de un lote. */
export async function transaccionImportacion<T>(
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
