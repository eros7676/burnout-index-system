import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Misma compilación que el seed: no encadena comandos de shell.
const tsc = resolve("node_modules/typescript/bin/tsc");
const compilacion = spawnSync(
  process.execPath,
  [tsc, "-p", "tsconfig.seed.json"],
  { stdio: "inherit" },
);

if (compilacion.error) throw compilacion.error;
if (compilacion.status !== 0) {
  process.exitCode = compilacion.status ?? 1;
} else {
  const ejecucion = spawnSync(
    process.execPath,
    [".seed-build/prisma/publicar-reglas.js", ...process.argv.slice(2)],
    { stdio: "inherit" },
  );
  if (ejecucion.error) throw ejecucion.error;
  process.exitCode = ejecucion.status ?? 1;
}
