// Loads the demo companies into their own databases, reproducibly:
//   1. migrations and the company's seed (names, rules v1), against that company's DATABASE_URL*;
//   2. its weekly indicators, task detail and day detail through the import API, as RR. HH. would,
//      waiting for the index to be computed before the detail files.
//
//   node scripts/demo-empresas.mjs [conecta|rutas|salud|nexus ...] [--url http://127.0.0.1:3000] [--reiniciar]
//
// The variables come from the environment or, failing that, from .env, the same ones the app reads.
// The app must be running at --url. A company whose variable is unset is skipped, as the app does not
// offer it. Import is idempotent: a file already loaded is skipped. Weeks loaded from other files are
// a conflict and stop the import: --reiniciar first empties each company's database (prisma migrate
// reset), so every copy of the demo ends with the same data.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The same ids and variables as src/server/empresas.ts. */
const VARIABLES = {
  conecta: "DATABASE_URL",
  rutas: "DATABASE_URL_TRANSPORTE",
  salud: "DATABASE_URL_SALUD",
  nexus: "DATABASE_URL_NEXUS",
};
const propios = (id) => ({
  semilla: id,
  indicadores: `empresas/${id}/indicadores.csv`,
  tareas: `empresas/${id}/tareas.csv`,
  jornadas: `empresas/${id}/jornadas.csv`,
});
/** Each company's seed catalog and files under templates/. Nexus is the original demo: Conecta's people. */
const DATOS = {
  conecta: propios("conecta"),
  rutas: propios("rutas"),
  salud: propios("salud"),
  nexus: {
    semilla: "conecta",
    indicadores: "demo-ocho-semanas.csv",
    tareas: "tareas-demo-ocho-semanas.csv",
    jornadas: "jornadas-demo-ocho-semanas.csv",
  },
};
const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
const seedScript = fileURLToPath(new URL("./seed.mjs", import.meta.url));

const args = process.argv.slice(2);
const i = args.indexOf("--url");
const base = i >= 0 ? args.splice(i, 2)[1] : "http://127.0.0.1:3000";
const r = args.indexOf("--reiniciar");
const reiniciar = r >= 0 && args.splice(r, 1).length > 0;
const pedidas = args.length ? args : Object.keys(VARIABLES);
for (const id of pedidas)
  if (!(id in VARIABLES)) {
    console.error(`Empresa desconocida: ${id}. Opciones: ${Object.keys(VARIABLES).join(", ")}.`);
    process.exit(2);
  }

function ejecutar(argumentos, env) {
  const r = spawnSync(process.execPath, argumentos, { stdio: "inherit", env: { ...process.env, ...env } });
  if (r.error)
    throw new Error(`No se pudo iniciar ${argumentos.join(" ")}: ${r.error.message}`, { cause: r.error });
  if (r.status !== 0)
    throw new Error(`${argumentos.join(" ")} terminó con ${r.status ?? `la señal ${r.signal}`}.`);
}

async function api(cookie, ruta, init = {}) {
  const pedir = () =>
    fetch(new URL(ruta, base), {
      ...init,
      headers: { Origin: new URL(base).origin, ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
    });
  // After a long migration the kept-alive socket may have been closed by the server: retry once.
  const respuesta = await pedir().catch((error) => {
    if (error?.cause?.code !== "UND_ERR_SOCKET") throw error;
    return pedir();
  });
  const cuerpo = await respuesta.json().catch(() => null);
  return { status: respuesta.status, cuerpo, respuesta };
}

async function esperar(cookie, job) {
  for (let intento = 0; intento < 600; intento++) {
    const { cuerpo } = await api(cookie, `/api/procesamientos/${encodeURIComponent(job.jobId)}`);
    if (cuerpo?.estado === "COMPLETADO") return cuerpo;
    if (cuerpo?.estado === "FALLIDO") throw new Error(`El procesamiento ${job.jobId} falló.`);
    await new Promise((listo) => setTimeout(listo, 1000));
  }
  throw new Error(`El procesamiento ${job.jobId} no terminó en 10 minutos.`);
}

async function importar(cookie, ruta, camino) {
  const datos = new FormData();
  const archivo = readFileSync(new URL(`../templates/${camino}`, import.meta.url));
  const nombre = camino.split("/").at(-1);
  datos.set("file", new Blob([archivo], { type: "text/csv" }), nombre);
  const previa = await api(cookie, ruta, { method: "POST", body: datos });
  if (previa.status !== 200)
    throw new Error(`${nombre}: la validación respondió ${previa.status}: ${JSON.stringify(previa.cuerpo).slice(0, 400)}`);
  if (previa.cuerpo.nuevas === 0) return console.log(`  ${nombre}: ya estaba cargado.`);
  const confirmada = await api(cookie, `/api/importaciones/${encodeURIComponent(previa.cuerpo.importId)}/confirmar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (confirmada.status !== 200)
    throw new Error(`${nombre}: la confirmación respondió ${confirmada.status}: ${JSON.stringify(confirmada.cuerpo).slice(0, 400)}`);
  console.log(`  ${nombre}: ${confirmada.cuerpo.insertados} filas nuevas.`);
  if (confirmada.cuerpo.procesamiento) {
    const job = await esperar(cookie, confirmada.cuerpo.procesamiento);
    console.log(`  índice calculado: ${job.completados} de ${job.totalPares} semanas.`);
  }
}

// Fail before touching any database when the app is not up.
await fetch(new URL("/", base)).catch(() => {
  console.error(`La app no responde en ${base}. Iniciala con npm run dev (o npm run start) y volvé a correr esto.`);
  process.exit(1);
});

for (const empresa of pedidas) {
  const variable = VARIABLES[empresa];
  if (!process.env[variable]) {
    console.log(`${empresa}: sin ${variable}, se omite.`);
    continue;
  }
  const env = { DATABASE_URL: process.env[variable], DEMO_EMPRESA: DATOS[empresa].semilla };
  if (reiniciar) {
    console.log(`${empresa}: vaciando la base.`);
    ejecutar([prismaCli, "migrate", "reset", "--force", "--skip-seed"], env);
  }
  console.log(`${empresa}: migraciones y seed.`);
  ejecutar([prismaCli, "migrate", "deploy"], env);
  ejecutar([seedScript], env);

  const sesion = await api(null, "/api/demo/sesion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "demo-rrhh", empresa }),
  });
  if (sesion.status !== 200) throw new Error(`${empresa}: no se pudo ingresar como RR. HH. (${sesion.status}).`);
  const cookie = sesion.respuesta.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  await importar(cookie, "/api/importaciones/validar", DATOS[empresa].indicadores);
  await importar(cookie, "/api/importaciones/tareas/validar", DATOS[empresa].tareas);
  await importar(cookie, "/api/importaciones/jornadas/validar", DATOS[empresa].jornadas);
}
