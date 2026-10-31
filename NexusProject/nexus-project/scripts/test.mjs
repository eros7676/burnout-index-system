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

const mysql = process.argv.includes("--mysql");
if (mysql && !process.env.TEST_DATABASE_URL) {
  throw new Error(
    "db:test requiere TEST_DATABASE_URL apuntando a una base MySQL de pruebas migrada.",
  );
}
if (mysql) {
  const destino = new URL(process.env.TEST_DATABASE_URL);
  if (
    destino.protocol !== "mysql:" ||
    !/^\/[A-Za-z0-9_]+_test$/.test(destino.pathname)
  ) {
    throw new Error(
      "TEST_DATABASE_URL debe apuntar a una base MySQL cuyo nombre termine en _test.",
    );
  }
}
const archivos = buscarTests(".test-build/tests")
  .filter((archivo) => archivo.endsWith(".mysql.test.js") === mysql)
  .sort();
if (archivos.length === 0)
  throw new Error("No se encontraron pruebas compiladas.");
const argumentos = ["--test"];
// Las suites MySQL comparten fixtures de catálogo como v1; ejecutarlas en
// procesos paralelos provoca conflictos aunque cada escenario revierta.
if (mysql) argumentos.push("--test-concurrency=1");
const resultado = spawnSync(process.execPath, [...argumentos, ...archivos], {
  stdio: "inherit",
});
if (resultado.error) throw resultado.error;
process.exitCode = resultado.status ?? 1;
