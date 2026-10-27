import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Evita encadenar comandos de shell: funciona igual desde Prisma, PowerShell y cmd.
const tsc = resolve("node_modules/typescript/bin/tsc");
const compilacion = spawnSync(
  process.execPath,
  [tsc, "-p", "tsconfig.seed.json"],
  { stdio: "inherit" },
);

if (compilacion.error) throw compilacion.error;
if (compilacion.status !== 0) {
  process.exitCode = compilacion.status ?? 1;
} else if (process.argv.includes("--compile-only")) {
  console.log("El seed compila correctamente.");
} else {
  const ejecucion = spawnSync(process.execPath, [".seed-build/prisma/seed.js"], {
    stdio: "inherit",
  });
  if (ejecucion.error) throw ejecucion.error;
  process.exitCode = ejecucion.status ?? 1;
}
