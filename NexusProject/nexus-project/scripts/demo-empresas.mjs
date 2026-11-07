// Loads the demo companies into their own databases, reproducibly:
//   1. migrations and the company's seed (names, rules v1), against that company's DATABASE_URL*;
//   2. its weekly indicators, task detail and day detail through the import API, as RR. HH. would,
//      waiting for the index to be computed before the detail files.
//
//   node scripts/demo-empresas.mjs [conecta|rutas|salud ...] [--url http://127.0.0.1:3000]
//
// The app must be running at --url with the same variables. A company whose variable is unset is
// skipped, as the app does not offer it. Import is idempotent: a file already loaded is skipped.
// Run it on fresh databases: weeks loaded from other files are a conflict and stop the import.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** The same ids and variables as src/server/empresas.ts. */
const VARIABLES = { conecta: "DATABASE_URL", rutas: "DATABASE_URL_TRANSPORTE", salud: "DATABASE_URL_SALUD" };

const args = process.argv.slice(2);
const i = args.indexOf("--url");
const base = i >= 0 ? args.splice(i, 2)[1] : "http://127.0.0.1:3000";
const pedidas = args.length ? args : Object.keys(VARIABLES);
for (const id of pedidas)
  if (!(id in VARIABLES)) {
    console.error(`Empresa desconocida: ${id}. Opciones: ${Object.keys(VARIABLES).join(", ")}.`);
    process.exit(2);
  }

function ejecutar(comando, argumentos, env) {
  const r = spawnSync(comando, argumentos, { stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${comando} ${argumentos.join(" ")} terminó con ${r.status}.`);
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

async function importar(cookie, empresa, ruta, nombre) {
  const datos = new FormData();
  const archivo = readFileSync(new URL(`../templates/empresas/${empresa}/${nombre}`, import.meta.url));
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

for (const empresa of pedidas) {
  const variable = VARIABLES[empresa];
  if (!process.env[variable]) {
    console.log(`${empresa}: sin ${variable}, se omite.`);
    continue;
  }
  console.log(`${empresa}: migraciones y seed.`);
  const env = { DATABASE_URL: process.env[variable], DEMO_EMPRESA: empresa };
  ejecutar("npx", ["prisma", "migrate", "deploy"], env);
  ejecutar("npm", ["run", "-s", "db:seed"], env);

  const sesion = await api(null, "/api/demo/sesion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "demo-rrhh", empresa }),
  });
  if (sesion.status !== 200) throw new Error(`${empresa}: no se pudo ingresar como RR. HH. (${sesion.status}).`);
  const cookie = sesion.respuesta.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  await importar(cookie, empresa, "/api/importaciones/validar", "indicadores.csv");
  await importar(cookie, empresa, "/api/importaciones/tareas/validar", "tareas.csv");
  await importar(cookie, empresa, "/api/importaciones/jornadas/validar", "jornadas.csv");
}
