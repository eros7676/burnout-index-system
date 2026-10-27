import "server-only";
import { PrismaClient } from "@prisma/client";

const globalPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

// Reutilizar el pool durante hot reload. La conexión se abre al consultar, no al importar.
export const prisma = globalPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalPrisma.prisma = prisma;
