import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { validarConfiguracion } from "../src/server/services/reglas";
import { sembrarBase } from "./seed-base";
import { semillaDeEmpresa, semillaGenerica, type CatalogoEmpresa } from "./seed-data";

const prisma = new PrismaClient();

/** DEMO_EMPRESA=<id> seeds that demo company's names and rules (templates/empresas/<id>/). */
function semilla() {
  const empresa = process.env.DEMO_EMPRESA;
  if (!empresa) return semillaGenerica;
  if (!/^[a-z]+$/.test(empresa)) throw new Error("DEMO_EMPRESA admite solo letras minúsculas.");
  const catalogo = JSON.parse(
    readFileSync(`templates/empresas/${empresa}/catalogo.json`, "utf8"),
  ) as CatalogoEmpresa;
  return semillaDeEmpresa(catalogo, validarConfiguracion);
}

async function main() {
  try {
    const datos = semilla();
    const resumen = await prisma.$transaction((tx) => sembrarBase(tx, datos), { timeout: 30_000 });
    console.log(
      "Seed ficticio listo (sin registros laborales ni resultados precalculados):",
      { ...resumen, empresa: process.env.DEMO_EMPRESA ?? "genérica" },
    );
  } catch (error) {
    console.error(
      "No se pudo completar el seed. Revisar MySQL, migraciones, configuración v1 y DEMO_EMPRESA.",
    );
    // No imprimir errores de conexión con URLs/credenciales.
    if (
      error instanceof Error &&
      /^(La configuración v1|El catálogo de|DEMO_EMPRESA|ENOENT)/.test(error.message)
    ) {
      console.error(error.message);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
