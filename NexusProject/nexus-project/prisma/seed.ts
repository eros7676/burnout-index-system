import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "./seed-base";

const prisma = new PrismaClient();

async function main() {
  try {
    const resumen = await prisma.$transaction(sembrarBase, { timeout: 30_000 });
    console.log(
      "Seed ficticio listo (sin registros laborales ni resultados precalculados):",
      resumen,
    );
  } catch (error) {
    console.error(
      "No se pudo completar el seed. Revisar MySQL, migraciones y configuración v1.",
    );
    // No imprimir errores de conexión con URLs/credenciales.
    if (
      error instanceof Error &&
      error.message.startsWith("La configuración v1")
    ) {
      console.error(error.message);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
