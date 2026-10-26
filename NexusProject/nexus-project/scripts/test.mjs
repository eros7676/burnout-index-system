import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Pasar archivos explícitos evita depender de expansión de globs en Windows/Node 22.
function buscarTests(directorio) {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(directorio, entrada.name);
    return entrada.isDirectory()
      ? buscarTests(ruta)
      : entrada.name.endsWith(".test.js")
        ? [ruta]
        : [];
  });
}

const archivos = buscarTests(".test-build/tests").sort();
if (archivos.length === 0)
  throw new Error("No se encontraron pruebas compiladas.");
const resultado = spawnSync(process.execPath, ["--test", ...archivos], {
  stdio: "inherit",
});
if (resultado.error) throw resultado.error;
process.exitCode = resultado.status ?? 1;
