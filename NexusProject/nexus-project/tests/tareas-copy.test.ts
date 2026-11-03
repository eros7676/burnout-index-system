import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// D1/D2 (ux-writing-es §2.1): formal neutral register in every string of the task-evidence files.
const RAICES = [
  join("src", "components", "tareas"),
  join("src", "components", "informe"),
  join("src", "components", "mis-datos"),
  join("src", "app", "(dashboard)", "reports"),
  join("src", "app", "(dashboard)", "my-data"),
  join("src", "app", "(dashboard)", "employees", "[employeeId]", "weeks"),
  join("src", "server", "http", "tareas.ts"),
  join("src", "server", "http", "tareas-runtime.ts"),
  join("src", "server", "services", "tareas-consulta.ts"),
  join("src", "server", "services", "tareas-consulta-filtros.ts"),
  join("src", "server", "services", "tareas-consulta-resumen.ts"),
  join("src", "shared", "contratos", "tareas.ts"),
];

function archivos(ruta: string): string[] {
  if (!existsSync(ruta)) return [];
  if (!statSync(ruta).isDirectory())
    return /\.(tsx?|css)$/.test(ruta) ? [ruta] : [];
  return readdirSync(ruta).flatMap((n) => archivos(join(ruta, n)));
}

// Voseo and tú forms, "acá", the conversational future, informal fillers.
const INFORMAL =
  /(?<!\p{L})(?:elegí|revisá|pedí|volvé|podés|tenés|querés|sabés|hacé|mirá|probá|intentá|seleccioná|cargá|vos|acá|tuyos?|tuyas?|tus|tu|vas a|va a (?:ver|aparecer)|por favor|ups)(?!\p{L})|¡/iu;

test("ningún texto de la evidencia de tareas usa voseo, tuteo ni coloquialismos", () => {
  const lista = RAICES.flatMap(archivos).filter((f) => !f.endsWith(".css"));
  assert.ok(lista.length > 0);
  for (const archivo of lista) {
    // Comments are English by rule; only code and string literals are read.
    const codigo = readFileSync(archivo, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const hallazgo = INFORMAL.exec(codigo);
    assert.equal(hallazgo, null, `${archivo}: «${hallazgo?.[0]}»`);
  }
});

test("el informe se puede imprimir: sin el marco ni los controles, sin cortar bloques", () => {
  const css = readFileSync(
    join("src", "components", "informe", "informe.module.css"),
    "utf8",
  );
  const impresion = css.slice(css.indexOf("@media print"));
  assert.ok(css.includes("@media print"), "falta el bloque de impresión");
  for (const regla of [
    "@page",
    "break-inside: avoid",
    "print-color-adjust: exact",
    "display: none",
  ])
    assert.ok(css.includes(regla), `falta ${regla}`);
  assert.match(impresion, /\.controles\s*\{\s*display: none/);
  // The shell (sidebar and demo strip) is hidden only when printing, whichever page prints.
  const marco = readFileSync(
    join("src", "components", "shell", "app-shell.module.css"),
    "utf8",
  );
  assert.match(
    marco.slice(marco.indexOf("@media print")),
    /\.demo,\s*\.sidebar\s*\{\s*display: none/,
  );
  const informe = readFileSync(
    join("src", "components", "informe", "informe.tsx"),
    "utf8",
  );
  assert.match(informe, /Imprimir informe/);
  assert.match(informe, /window\.print\(\)/);
});
