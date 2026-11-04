// Screenshot book of every view, per role, against a running app.
//   node scripts/libro-vistas.mjs [outDir] [baseURL]
// Defaults: ../../Docs/libro-de-vistas and http://localhost:3000. Needs the
// demo data imported (npm run demo:csv, then Importar datos) so screens have content.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "@playwright/test";

const outDir = resolve(process.argv[2] ?? "../../Docs/libro-de-vistas");
const baseURL = process.argv[3] ?? "http://localhost:3000";
const ROLES = {
  "demo-rrhh": "RR. HH.",
  "demo-gerencia": "Gerencia",
  "demo-tl-01": "Team Lead",
  "demo-empleado": "Empleado",
};

/**
 * Ids that only exist in data: the person with the highest current index, one of their reports and
 * weeks, their team, an alert, an audited import (event and operation) and a rules draft. The draft
 * is created when none exists, so the book shows the editor with content.
 */
async function idsDeEjemplo(request) {
  const leer = async (ruta) => {
    const r = await request.get(ruta);
    if (!r.ok()) throw new Error(`${ruta} answered ${r.status()}`);
    return r.json();
  };
  const { items } = await leer("/api/personas");
  const conInforme = items
    .map((p) => ({ p, w: p.semanas[0] })) // most recent first
    .filter(({ w }) => w?.evaluationId)
    .sort((a, b) => (b.w.indice ?? 0) - (a.w.indice ?? 0));
  const { p, w } = conInforme[0];
  const alertas = await leer("/api/alertas");
  const evento = (await leer("/api/auditoria?accion=IMPORTACION_CONFIRMADA&pageSize=1")).items[0];
  let borrador = (await leer("/api/reglas/borradores")).items[0];
  if (!borrador) {
    const r = await request.post("/api/reglas/borradores", { data: {}, headers: { Origin: baseURL } });
    if (!r.ok()) throw new Error(`creating a rules draft answered ${r.status()}`);
    borrador = await r.json();
  }
  return {
    employeeId: p.employeeId,
    evaluationId: w.evaluationId,
    periodStart: w.periodStart,
    teamId: p.teamId,
    alertId: alertas.items[0]?.alertId,
    eventoId: evento?.eventoId,
    correlacionId: evento?.correlacionId,
    borradorId: borrador.borradorId ?? borrador.id,
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const vistas = [];
  const capturar = async (rol, ruta, nombre, ancho = 1440) => {
    const ctx = await browser.newContext({
      baseURL,
      viewport: { width: ancho, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
    if (rol)
      await page.request.post("/api/demo/sesion", {
        data: { userId: rol },
        headers: { Origin: baseURL },
      });
    await page.goto(ruta, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const archivo = `${nombre}${ancho < 1000 ? "-angosta" : ""}.png`;
    await page.screenshot({ path: join(outDir, archivo), fullPage: true });
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    // The not-found view answers 404 on purpose; the browser logs that as a resource error.
    const reales = nombre.includes("no-encontrada")
      ? errores.filter((m) => !/status of 404/.test(m))
      : errores;
    vistas.push({ rol: rol ? ROLES[rol] : "Sin sesión", ruta, url: new URL(page.url()).pathname, archivo, ancho, errores: reales, desborde });
    await ctx.close();
  };

  const sesion = await browser.newContext({ baseURL });
  await sesion.request.post("/api/demo/sesion", {
    data: { userId: "demo-rrhh" },
    headers: { Origin: baseURL },
  });
  const ids = await idsDeEjemplo(sesion.request);
  await sesion.close();

  await capturar(null, "/", "00-ingreso");
  const e = `/employees/${ids.employeeId}`;
  const t = `/teams/${ids.teamId}`;
  const rrhh = [
    ["/home", "01-resumen"],
    ["/employees", "02-personas"],
    ["/employees/new", "02a-persona-nueva"],
    ["/employees/import", "02b-personas-importar"],
    [e, "03-ficha-persona"],
    [`${e}/edit`, "03a-persona-editar"],
    [`${e}/move`, "03b-persona-mover"],
    [`${e}/deactivate`, "03c-persona-baja"],
    [`${e}/weeks/${ids.periodStart}`, "03d-semana-tareas"],
    ["/teams", "04-equipos"],
    ["/teams/new", "04a-equipo-nuevo"],
    [t, "05-equipo"],
    [`${t}/edit`, "05a-equipo-editar"],
    [`${t}/lead`, "05b-equipo-lider"],
    [`${t}/deactivate`, "05c-equipo-baja"],
    ["/alerts", "06-alertas"],
    ...(ids.alertId ? [[`/alerts/${ids.alertId}`, "06a-alerta-seguimiento"]] : []),
    [`/reports/${ids.evaluationId}`, "07-informe"],
    ["/importaciones", "08-importacion"],
    ["/rules-config", "09-reglas"],
    [`/rules-config/drafts/${ids.borradorId}`, "09a-reglas-borrador"],
    ["/audit", "10-auditoria"],
    ...(ids.eventoId ? [[`/audit/${ids.eventoId}`, "10a-auditoria-evento"]] : []),
    ...(ids.correlacionId
      ? [[`/audit/operations/${ids.correlacionId}`, "10b-auditoria-operacion"]]
      : []),
    ["/ruta-inexistente", "12-pagina-no-encontrada"],
  ];
  for (const [ruta, nombre] of rrhh) await capturar("demo-rrhh", ruta, `${nombre}-rrhh`);
  for (const [ruta, nombre] of [["/home", "01-resumen"], ["/employees", "02-personas"], ["/alerts", "06-alertas"], ["/audit", "10-auditoria"]])
    await capturar("demo-gerencia", ruta, `${nombre}-gerencia`);
  for (const [ruta, nombre] of [["/home", "01-resumen"], ["/employees", "02-personas"], ["/teams/EQ-01", "05-equipo"], ["/alerts", "06-alertas"], ["/rules-config", "09-reglas"], ["/my-data", "11-mis-datos"]])
    await capturar("demo-tl-01", ruta, `${nombre}-team-lead`);
  await capturar("demo-empleado", "/my-data", "11-mis-datos-empleado");
  for (const [ruta, nombre] of [["/home", "01-resumen"], ["/employees", "02-personas"], [e, "03-ficha-persona"], ...(ids.alertId ? [[`/alerts/${ids.alertId}`, "06a-alerta-seguimiento"]] : []), ["/importaciones", "08-importacion"], ["/audit", "10-auditoria"]])
    await capturar("demo-rrhh", ruta, `${nombre}-rrhh`, 390);
  await browser.close();

  let commit = "";
  try {
    commit = execSync("git rev-parse --short HEAD").toString().trim();
  } catch {}
  const filas = vistas.map(
    (v) =>
      `## ${v.archivo.replace(/\.png$/, "")}\n\n${v.rol}, \`${v.ruta}\`${v.url !== v.ruta ? ` (redirige a \`${v.url}\`)` : ""}, ${v.ancho} px${v.desborde ? ", **desborda horizontalmente**" : ""}${v.errores.length ? `, **errores de consola**: ${v.errores.slice(0, 3).join(" | ")}` : ""}\n\n![${v.archivo}](${v.archivo})\n`,
  );
  await writeFile(
    join(outDir, "README.md"),
    `# Libro de vistas\n\nCapturas de cada pantalla por rol, generadas con \`node scripts/libro-vistas.mjs\` contra ${baseURL}${commit ? ` en el commit \`${commit}\`` : ""}. Movimiento reducido activo; página completa.\n\n${filas.join("\n")}`,
  );
  const problemas = vistas.filter((v) => v.errores.length || v.desborde);
  console.log(JSON.stringify({ outDir, vistas: vistas.length, problemas: problemas.map((v) => v.archivo) }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
