// Writes templates/demo-ocho-semanas.csv: eight closed weeks for the 49 people
// in coverage, so every screen of the demo has trends, teams and alerts to show.
// Deterministic (fixed seed): running it twice produces the same file, and a
// re-import is skipped as identical rows. Fictional data only.
import { writeFileSync } from "node:fs";

const SEMANAS = [
  "2026-08-31",
  "2026-09-07",
  "2026-09-14",
  "2026-09-21",
  "2026-09-28",
  "2026-10-05",
  "2026-10-12",
  "2026-10-19",
];
// The two weeks of templates/ejemplo-dos-semanas.csv stay identical, so a
// database that already imported that file accepts this one without conflict.
const PLANTILLA = {
  "EMP-001/2026-10-05": [16, 9, 10, 7, 5, 14, 56, 120],
  "EMP-001/2026-10-12": [16, 16, 10, 7, 5, 14, 56, 127],
};

let semilla = 20261102;
function azar() {
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entre = (min, max) => min + Math.floor(azar() * (max - min + 1));
const fin = (lunes) => {
  const [y, m, d] = lunes.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 6)).toISOString().slice(0, 10);
};

// Load profile per person: how heavy each week is, from 0 (light) to 1 (overloaded).
function perfil(id, equipo, indice) {
  if (id === "EMP-001") return () => 0.9;
  if (indice % 11 === 3) return (s) => (s >= 5 ? 0.95 : 0.25 + s * 0.05); // rising, sustained
  if (indice % 13 === 5) return (s) => (s === 4 ? 0.9 : 0.3); // a single spike
  const base = equipo === "EQ-03" ? 0.55 : id.startsWith("TL-") ? 0.5 : 0.25;
  return () => Math.min(1, Math.max(0, base + (azar() - 0.5) * 0.3));
}

function fila(id, semana, carga, vacaciones, desdeVacaciones) {
  const activas = entre(6, 12);
  const pendientes = Math.round(activas * (0.15 + carga * 0.6));
  const vencidas = Math.round(pendientes * carga * 0.7);
  const extra = Math.round(carga * 18 * (0.8 + azar() * 0.4));
  const racha = Math.min(14, Math.round(3 + carga * 10 + azar() * 2));
  return [extra, racha, activas, pendientes, vencidas, vacaciones, 40 + extra, desdeVacaciones];
}

const personas = [
  ...[1, 2, 3, 4].map((n) => [`TL-0${n}`, `EQ-0${n}`]),
  ...Array.from({ length: 45 }, (_, i) => [
    `EMP-${String(i + 1).padStart(3, "0")}`,
    `EQ-0${(i % 4) + 1}`,
  ]),
];
const lineas = [
  "employee_id,period_start,period_end,horas_extra,dias_consecutivos_sin_descanso,tareas_activas,tareas_pendientes,tareas_vencidas,vacaciones_pendientes_dias,horas_trabajadas,dias_desde_ultimas_vacaciones",
];
personas.forEach(([id, equipo], indice) => {
  const carga = perfil(id, equipo, indice);
  const vacaciones = id === "EMP-001" ? 14 : entre(2, 16);
  let desde = id === "EMP-001" ? 85 : entre(20, 140);
  SEMANAS.forEach((semana, s) => {
    const valores =
      PLANTILLA[`${id}/${semana}`] ??
      fila(id, semana, carga(s), vacaciones, desde);
    lineas.push([id, semana, fin(semana), ...valores].join(","));
    desde += 7;
  });
});
const destino = new URL("../templates/demo-ocho-semanas.csv", import.meta.url);
writeFileSync(destino, lineas.join("\n") + "\n");
console.log(`${lineas.length - 1} filas → templates/demo-ocho-semanas.csv`);
