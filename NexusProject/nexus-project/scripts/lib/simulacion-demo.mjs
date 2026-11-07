// Day-first simulation of a demo company's eight weeks. Every person lives each day (worked, rest,
// vacation or leave, with its hours), and the weekly summary is derived from those days, so:
// - the days of each week reconcile with its summary (jornadas-v1) by construction;
// - the streak without rest continues across weeks (a 14-day streak on Sunday is 21 or less than
//   7 the next Sunday, never 9), and the days since the last vacation grow by 7 or restart;
// - the pending vacation balance goes down when vacation is taken.
// Deterministic for a given profile and seed. Fictional data only: no health or family content.
import { crearAzar, sumar } from "./azar.mjs";
import { crearTareas } from "./tareas-demo.mjs";

export const SEMANAS = [
  "2026-08-31",
  "2026-09-07",
  "2026-09-14",
  "2026-09-21",
  "2026-09-28",
  "2026-10-05",
  "2026-10-12",
  "2026-10-19",
];
/** Days lived before the first week, so the first Sunday's streak has a past. */
const PREVIOS = 21;

export const COLUMNAS_INDICADORES = [
  "employee_id",
  "period_start",
  "period_end",
  "horas_extra",
  "dias_consecutivos_sin_descanso",
  "tareas_activas",
  "tareas_pendientes",
  "tareas_vencidas",
  "vacaciones_pendientes_dias",
  "horas_trabajadas",
  "dias_desde_ultimas_vacaciones",
];
export const COLUMNAS_TAREAS = [
  "employee_id",
  "period_start",
  "period_end",
  "task_id",
  "titulo",
  "origen",
  "origen_ref",
  "asignada_fecha",
  "vencimiento_fecha",
  "completada_fecha",
  "motivo_exclusion",
];
export const COLUMNAS_JORNADAS = [
  "employee_id",
  "period_start",
  "period_end",
  "fecha",
  "tipo_dia",
  "horas_trabajadas",
  "horas_extra",
];

/** The 49 people in coverage: four Team Leads and 45 staff over four teams, as the seed has them. */
export const PERSONAS = [
  ...[1, 2, 3, 4].map((n) => ({ id: `TL-0${n}`, equipo: `EQ-0${n}`, indice: n - 1 })),
  ...Array.from({ length: 45 }, (_, i) => ({
    id: `EMP-${String(i + 1).padStart(3, "0")}`,
    equipo: `EQ-0${(i % 4) + 1}`,
    indice: i + 4,
  })),
];

const media = (h) => Math.round(h * 2) / 2;
const dias = (desde, hasta) =>
  (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000;

/**
 * Simulates `perfil` (scripts/empresas/*.mjs) and returns the three CSV texts.
 *
 * The profile decides, per person: the load of each week (0 light … 1 overloaded), which days are
 * normally worked and their hours (`turno`), and the chance of a leave or a vacation block.
 * Overload shows the way it does in the field: rest days worked (the streak grows) and longer days.
 */
export function simular(perfil) {
  const azar = crearAzar(perfil.semilla);
  const { azar: u, entre } = azar;
  const tareasDePersona = crearTareas({ azar, ...perfil.tareas });
  const indicadores = [COLUMNAS_INDICADORES.join(",")];
  const tareas = [COLUMNAS_TAREAS.join(",")];
  const jornadas = [COLUMNAS_JORNADAS.join(",")];
  const inicio = sumar(SEMANAS[0], -PREVIOS);
  const total = PREVIOS + SEMANAS.length * 7;

  for (const persona of PERSONAS) {
    const carga = perfil.carga(persona, azar);
    const turno = perfil.turno(persona, azar);
    let racha = entre(0, 4);
    let saldo = entre(perfil.vacaciones.saldo[0], perfil.vacaciones.saldo[1]);
    const vacacionPrevia = sumar(inicio, -entre(perfil.vacaciones.desde[0], perfil.vacaciones.desde[1]));
    // At most one vacation block in the window, never for someone the story keeps overloaded.
    const bloque =
      u() < perfil.vacaciones.probabilidad && !perfil.sinVacaciones?.includes(persona.id)
        ? { desde: PREVIOS + entre(7, SEMANAS.length * 7 - 10), largo: entre(5, 9) }
        : null;
    const vividos = [];
    for (let d = 0; d < total; d++) {
      const fecha = sumar(inicio, d);
      const semana = Math.max(0, Math.floor((d - PREVIOS) / 7));
      const c = carga(semana);
      const normal = turno(d);
      let tipo;
      let horas = 0;
      let extra = 0;
      if (bloque && d >= bloque.desde && d < bloque.desde + bloque.largo) {
        tipo = "VACACIONES";
        // A vacation day spends balance only when it would have been worked.
        if (normal) saldo = Math.max(0, saldo - 1);
      } else if (normal && u() < perfil.licencia * (0.6 + c)) {
        tipo = "LICENCIA";
      } else if (normal) {
        tipo = "TRABAJO";
        extra = u() < 0.25 + c * 0.7 ? media(c * perfil.extraPorDia * (0.5 + u())) : 0;
        horas = normal + extra;
      } else if (u() < c * c * perfil.descansoTrabajado) {
        // A rest day worked: all of it is overtime.
        tipo = "TRABAJO";
        horas = media(normal || perfil.horasDescanso) * (0.5 + u() * 0.5);
        horas = Math.max(0.5, media(horas));
        extra = horas;
      } else {
        tipo = "DESCANSO";
      }
      racha = tipo === "TRABAJO" ? racha + 1 : 0;
      vividos.push({ fecha, tipo, horas, extra, racha, saldo });
    }

    const semanas = SEMANAS.map((lunes, s) => {
      const semana = vividos.slice(PREVIOS + s * 7, PREVIOS + s * 7 + 7);
      const domingo = semana[6].fecha;
      const ultima = vividos
        .slice(0, PREVIOS + s * 7 + 7)
        .filter((v) => v.tipo === "VACACIONES")
        .at(-1)?.fecha;
      const c = carga(s);
      const activas = entre(perfil.tareasPorSemana[0], perfil.tareasPorSemana[1]);
      const pendientes = Math.round(activas * (0.15 + c * 0.6));
      const vencidas = Math.round(pendientes * c * 0.7);
      return {
        inicio: lunes,
        fin: domingo,
        dias: semana,
        horasExtra: semana.reduce((t, v) => t + v.extra, 0),
        horasTrabajadas: semana.reduce((t, v) => t + v.horas, 0),
        racha: semana[6].racha,
        activas,
        pendientes,
        vencidas,
        desde: dias(ultima ?? vacacionPrevia, domingo),
        saldo: semana[6].saldo,
      };
    });
    for (const w of semanas) {
      indicadores.push(
        [
          persona.id,
          w.inicio,
          w.fin,
          w.horasExtra,
          w.racha,
          w.activas,
          w.pendientes,
          w.vencidas,
          w.saldo,
          w.horasTrabajadas,
          w.desde,
        ].join(","),
      );
      for (const v of w.dias)
        jornadas.push(
          [persona.id, w.inicio, w.fin, v.fecha, v.tipo, v.horas || "", v.tipo === "TRABAJO" ? v.extra : ""].join(","),
        );
    }
    for (const fila of tareasDePersona(persona.id, semanas)) tareas.push(fila.join(","));
  }
  return {
    indicadores: indicadores.join("\n") + "\n",
    tareas: tareas.join("\n") + "\n",
    jornadas: jornadas.join("\n") + "\n",
  };
}
