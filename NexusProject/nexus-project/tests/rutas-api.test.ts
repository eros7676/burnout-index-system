import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { API_ROUTES } from "../src/shared/api";
import { cuerposExitoMock } from "../src/shared/mocks";

const API = join("src", "app", "api");
const HTTP = join("src", "server", "http");
const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function rutas(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? rutas(join(directorio, e.name))
      : e.name === "route.ts"
        ? [join(directorio, e.name)]
        : [],
  );
}
const exportados = (codigo: string) =>
  METODOS.filter((m) =>
    new RegExp(`export (async function|const|function) ${m}\\b`).test(codigo),
  );
// /api/alertas/{alertId}/x → src/app/api/alertas/[alertId]/x/route.ts
const archivoDe = (path: string) =>
  join(
    "src",
    "app",
    ...path
      .slice(1)
      .split("/")
      .map((s) => s.replace(/^\{(\w+)\}$/, "[$1]")),
    "route.ts",
  );

test("el catálogo de la API y los Route Handlers coinciden en ambos sentidos", () => {
  const declarados = new Set<string>();
  for (const [operacion, { method, path }] of Object.entries(API_ROUTES)) {
    const archivo = archivoDe(path);
    assert.ok(existsSync(archivo), `${operacion}: falta ${archivo}`);
    assert.ok(
      exportados(readFileSync(archivo, "utf8")).includes(method),
      `${operacion}: ${archivo} no exporta ${method}`,
    );
    declarados.add(`${method} ${archivo}`);
  }
  for (const archivo of rutas(API))
    for (const metodo of exportados(readFileSync(archivo, "utf8")))
      assert.ok(
        declarados.has(`${metodo} ${archivo}`),
        `${metodo} ${archivo} no figura en API_ROUTES`,
      );
});

test("cada operación del catálogo tiene un mock serializable", () => {
  assert.deepEqual(
    Object.keys(cuerposExitoMock).sort(),
    Object.keys(API_ROUTES).sort(),
  );
});

test("toda ruta de la API pasa por proteger, salvo la sesión de demostración", () => {
  for (const archivo of rutas(API)) {
    if (archivo === join(API, "demo", "sesion", "route.ts")) continue;
    const codigo = readFileSync(archivo, "utf8");
    assert.ok(
      /proteger\(/.test(codigo) || /server\/http\/[\w-]+-runtime"/.test(codigo),
      `${archivo} no usa proteger ni un módulo -runtime`,
    );
  }
  for (const nombre of readdirSync(HTTP).filter((n) => n.endsWith("-runtime.ts"))) {
    const codigo = readFileSync(join(HTTP, nombre), "utf8");
    const handlers = [...codigo.matchAll(/^ {2}(\w+):\s*(.*)$/gm)];
    assert.ok(handlers.length > 0, `${nombre} no expone handlers`);
    for (const [, handler, valor] of handlers)
      assert.ok(
        valor.startsWith("proteger("),
        `${nombre}: ${handler} no pasa por proteger`,
      );
  }
});
