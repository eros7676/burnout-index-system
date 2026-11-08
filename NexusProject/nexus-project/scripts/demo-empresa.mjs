// Writes a demo company's files under templates/empresas/<id>/: its catalog (team and people
// names, index rules; read by the seed with DEMO_EMPRESA=<id>) and its eight weeks of weekly
// indicators, task detail and day detail, from the day-first simulation in lib/simulacion-demo.mjs.
// For the live demo, the week after the eight (semana-siguiente.csv), and the same week with three
// mistakes to show what the validation says (semana-siguiente-con-errores.csv).
//
//   node scripts/demo-empresa.mjs <id>|--todas          write the files
//   node scripts/demo-empresa.mjs <id>|--todas --check  fail if a file on disk differs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { COLUMNAS_INDICADORES, simular } from "./lib/simulacion-demo.mjs";

const EMPRESAS = ["conecta", "rutas", "salud"];

/** A word where a number goes, a day-first date, and a person who is not in the company. */
function conErrores(texto) {
  const lineas = texto.trimEnd().split("\n");
  const cambiar = (persona, columna, valor) => {
    const i = lineas.findIndex((l) => l.startsWith(`${persona},`));
    const celdas = lineas[i].split(",");
    celdas[COLUMNAS_INDICADORES.indexOf(columna)] = valor;
    lineas[i] = celdas.join(",");
  };
  cambiar("EMP-002", "horas_extra", "muchas");
  cambiar("EMP-004", "period_start", "26/10/2026");
  cambiar("EMP-045", "employee_id", "EMP-999");
  return lineas.join("\n") + "\n";
}

async function archivos(id) {
  const { default: perfil } = await import(`./empresas/${id}.mjs`);
  const { indicadores, tareas, jornadas, siguiente } = simular(perfil);
  const catalogo = {
    empresa: perfil.id,
    equipos: perfil.equipos,
    personas: perfil.personas,
    reglas: perfil.reglas,
  };
  return {
    "catalogo.json": JSON.stringify(catalogo, null, 2) + "\n",
    "indicadores.csv": indicadores,
    "tareas.csv": tareas,
    "jornadas.csv": jornadas,
    "semana-siguiente.csv": siguiente,
    "semana-siguiente-con-errores.csv": conErrores(siguiente),
  };
}

const pedidas = process.argv.includes("--todas")
  ? EMPRESAS
  : process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!pedidas.length || pedidas.some((id) => !EMPRESAS.includes(id))) {
  console.error(`Uso: node scripts/demo-empresa.mjs <${EMPRESAS.join("|")}>|--todas [--check]`);
  process.exit(2);
}
for (const id of pedidas) {
  const carpeta = new URL(`../templates/empresas/${id}/`, import.meta.url);
  for (const [nombre, contenido] of Object.entries(await archivos(id))) {
    const destino = new URL(nombre, carpeta);
    if (process.argv.includes("--check")) {
      let actual = "";
      try {
        actual = readFileSync(destino, "utf8").replaceAll("\r\n", "\n");
      } catch {
        // Missing counts as different.
      }
      if (actual !== contenido) {
        console.error(`templates/empresas/${id}/${nombre} no coincide con el generador.`);
        process.exitCode = 1;
      }
    } else {
      mkdirSync(carpeta, { recursive: true });
      writeFileSync(destino, contenido);
      console.log(`templates/empresas/${id}/${nombre}: ${contenido.trim().split("\n").length} líneas`);
    }
  }
}
