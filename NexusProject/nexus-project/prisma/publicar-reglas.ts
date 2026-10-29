import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import type { ConfiguracionIndice } from "../src/shared/contracts";
import { ErrorDominio } from "../src/shared/errors";
import { guardarVersionNueva } from "../src/server/repositories/reglas";
import { validarConfiguracion } from "../src/server/services/reglas";

function uso(): void {
  console.error("Uso: npm run rules:publish -- ruta/regla.json");
}

function dominioDe(error: unknown): ErrorDominio | null {
  if (error instanceof ErrorDominio) return error;
  if (error instanceof Error && error.cause instanceof ErrorDominio) {
    return error.cause;
  }
  return null;
}

function informarFallo(error: unknown): void {
  const dominio = dominioDe(error);
  if (dominio) {
    console.error(dominio.message);
    for (const detalle of dominio.detalles) {
      console.error(`- ${detalle.campo ?? "configuracion"}: ${detalle.detalle}`);
    }
    return;
  }
  console.error(
    "No se pudo publicar la versión. Revisar MySQL, las migraciones y el archivo.",
  );
}

async function main() {
  const ruta = process.argv[2];
  if (!ruta || process.argv.length > 3) {
    uso();
    process.exitCode = 1;
    return;
  }

  let entrada: unknown;
  try {
    const texto = readFileSync(ruta, "utf8").replace(/^\uFEFF/, "");
    entrada = JSON.parse(texto);
  } catch {
    console.error("No se pudo leer el JSON de la regla. Revisar la ruta y el formato.");
    process.exitCode = 1;
    return;
  }

  let reglas: ConfiguracionIndice;
  try {
    reglas = validarConfiguracion(entrada);
  } catch (error) {
    informarFallo(error);
    process.exitCode = 1;
    return;
  }

  try {
    const prisma = new PrismaClient();
    try {
      const resultado = await prisma.$transaction(
        (tx) => guardarVersionNueva(tx, reglas),
        { timeout: 30_000 },
      );
      console.log(
        `Versión ${resultado.version} publicada desde ${resultado.effectiveFrom}. Trabajo ${resultado.jobId}: ${resultado.semanas} semana(s), estado ${resultado.estado}.`,
      );
      if (resultado.estado === "PENDIENTE") {
        console.log("El recálculo queda pendiente hasta T07 y T08.");
      }
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    informarFallo(error);
    process.exitCode = 1;
  }
}

void main();
