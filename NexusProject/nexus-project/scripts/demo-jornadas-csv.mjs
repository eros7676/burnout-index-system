// Writes templates/jornadas-demo-ocho-semanas.csv: the seven days behind every employee-week of
// templates/demo-ocho-semanas.csv (jornadas-v1). The summary file is the input, so each week
// reconciles by construction: the days end on Sunday with as many worked days in a row as the
// summary's days without rest (all seven when it says seven or more), the day before that streak
// is a rest or leave day, and the hours worked and the overtime are spread over the worked days in
// half-hour steps so that they add up to the summary. Some of the days before the streak are
// rest or leave (LICENCIA, no reason). The summaries never have a vacation in the week (their
// last vacations are seven or more days before Sunday), so no day is VACACIONES. Deterministic
// (fixed seed): running it twice produces the same file. Fictional data only.
//
//   node scripts/demo-jornadas-csv.mjs          write the file
//   node scripts/demo-jornadas-csv.mjs --check  fail if the file on disk differs from the output
import { readFileSync, writeFileSync } from "node:fs";

const ENTRADA = new URL("../templates/demo-ocho-semanas.csv", import.meta.url);
const SALIDA = new URL("../templates/jornadas-demo-ocho-semanas.csv", import.meta.url);
const COLUMNAS = ["employee_id", "period_start", "period_end", "fecha", "tipo_dia", "horas_trabajadas", "horas_extra"];

let semilla = 20261106;
function azar() {
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const sumar = (iso, dias) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
};

/** `total` hours over `n` days in half-hour steps, the larger shares first. */
function repartir(total, n) {
  const medias = Math.round(total * 2);
  const base = Math.floor(medias / n);
  const resto = medias - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < resto ? 1 : 0)) / 2);
}

/** Longest a worked day may be once a day before the streak is taken off. */
const JORNADA_MAXIMA = 12;

function diasDeSemana(s) {
  const tipos = Array(7).fill("TRABAJO");
  if (s.ds < 7) {
    // The streak ends on Sunday (index 6); the day before it broke it: a rest day, or a leave
    // day about one time in four.
    tipos[6 - s.ds] = azar() < 0.25 ? "LICENCIA" : "DESCANSO";
    const antes = 6 - s.ds; // indexes 0 .. antes-1 come before that day
    const trabajados = () => tipos.filter((t) => t === "TRABAJO").length;
    const cabe = () => s.ht / (trabajados() - 1) <= JORNADA_MAXIMA;
    // Before it, about one week in four has a leave day and half of the rest a rest day.
    if (antes >= 1 && azar() < 0.25 && cabe()) tipos[0] = "LICENCIA";
    else if (antes >= 2 && azar() < 0.5 && cabe()) tipos[0] = "DESCANSO";
  }
  const trabajo = tipos.flatMap((t, i) => (t === "TRABAJO" ? [i] : []));
  const base = repartir(s.ht - s.he, trabajo.length);
  // Overtime falls on the last worked days: the long days are the ones that end the week.
  const extra = repartir(s.he, trabajo.length).reverse();
  return tipos.map((tipo, i) => {
    const k = trabajo.indexOf(i);
    return k < 0
      ? [sumar(s.inicio, i), tipo, "", ""]
      : [sumar(s.inicio, i), tipo, String(base[k] + extra[k]), String(extra[k])];
  });
}

function generar() {
  const [cabecera, ...lineas] = readFileSync(ENTRADA, "utf8").trim().split(/\r?\n/);
  const col = Object.fromEntries(cabecera.split(",").map((c, i) => [c, i]));
  const salida = [COLUMNAS.join(",")];
  for (const linea of lineas) {
    const v = linea.split(",");
    const s = {
      id: v[col.employee_id],
      inicio: v[col.period_start],
      fin: v[col.period_end],
      he: Number(v[col.horas_extra]),
      ht: Number(v[col.horas_trabajadas]),
      ds: Number(v[col.dias_consecutivos_sin_descanso]),
      desde: v[col.dias_desde_ultimas_vacaciones],
    };
    if (s.desde !== "" && Number(s.desde) < 7)
      throw new Error(`${s.id} ${s.inicio}: las vacaciones dentro de la semana no están previstas.`);
    for (const dia of diasDeSemana(s)) salida.push([s.id, s.inicio, s.fin, ...dia].join(","));
  }
  return salida.join("\n") + "\n";
}

const contenido = generar();
if (process.argv.includes("--check")) {
  // A Windows checkout with autocrlf stores the file with CRLF; the content is the same.
  if (readFileSync(SALIDA, "utf8").replaceAll("\r\n", "\n") !== contenido) {
    console.error("templates/jornadas-demo-ocho-semanas.csv no coincide con el generador.");
    process.exitCode = 1;
  }
} else {
  writeFileSync(SALIDA, contenido);
  console.log(`${contenido.trim().split("\n").length - 1} filas → templates/jornadas-demo-ocho-semanas.csv`);
}
