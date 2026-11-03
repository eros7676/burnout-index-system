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
  "demo-rrhh": "RRHH",
  "demo-gerencia": "Gerencia",
  "demo-tl-01": "Team Lead",
  "demo-empleado": "Empleado",
};

/** Ids that only exist in data: the person with the highest current index, one of their reports, and one team. */
async function idsDeEjemplo(request) {
  const r = await request.get("/api/personas");
  if (!r.ok()) throw new Error(`/api/personas answered ${r.status()}`);
  const { items } = await r.json();
  const conInforme = items
    .map((p) => ({ p, w: p.semanas[0] })) // most recent first
    .filter(({ w }) => w?.evaluationId)
    .sort((a, b) => (b.w.indice ?? 0) - (a.w.indice ?? 0));
  const { p, w } = conInforme[0];
  return { employeeId: p.employeeId, evaluationId: w.evaluationId, teamId: p.teamId };
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
    vistas.push({ rol: rol ? ROLES[rol] : "Sin sesión", ruta, url: new URL(page.url()).pathname, archivo, ancho, errores, desborde });
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
  const rrhh = [
    ["/home", "01-resumen"],
    ["/employees", "02-personas"],
    [`/employees/${ids.employeeId}`, "03-ficha-persona"],
    ["/teams", "04-equipos"],
    [`/teams/${ids.teamId}`, "05-celula"],
    ["/alerts", "06-alertas"],
    [`/reports/${ids.evaluationId}`, "07-informe"],
    ["/importaciones", "08-importacion"],
    ["/rules-config", "09-reglas"],
    ["/audit", "10-auditoria"],
  ];
  for (const [ruta, nombre] of rrhh) await capturar("demo-rrhh", ruta, `${nombre}-rrhh`);
  for (const [ruta, nombre] of [["/home", "01-resumen"], ["/audit", "10-auditoria"]])
    await capturar("demo-gerencia", ruta, `${nombre}-gerencia`);
  for (const [ruta, nombre] of [["/home", "01-resumen"], ["/employees", "02-personas"], ["/alerts", "06-alertas"], ["/rules-config", "09-reglas"], ["/my-data", "11-mis-datos"]])
    await capturar("demo-tl-01", ruta, `${nombre}-team-lead`);
  await capturar("demo-empleado", "/my-data", "11-mis-datos-empleado");
  for (const [ruta, nombre] of [["/home", "01-resumen"], [`/employees/${ids.employeeId}`, "03-ficha-persona"], ["/importaciones", "08-importacion"]])
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
