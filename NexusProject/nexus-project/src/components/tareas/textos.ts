// Words and links of the task evidence, apart from the components so they are tested without a browser.
// Register: formal neutral (D1). Never a judgement of the person: «vencida» describes a task at the week's
// close, not a failing (research/task-evidence-scale.md §4, §5 wording rules).
import { diaCorto, entero } from "../../shared/formato";
import type { CierreTareaDTO, EstadoTarea } from "../../shared/contratos/tareas";

/** One task's status in a table row. */
export const ETIQUETA_ESTADO: Record<EstadoTarea, string> = {
  COMPLETADA: "Completada",
  PENDIENTE: "Abierta en plazo",
  VENCIDA: "Vencida",
};

/** The three groups of a week, as the filter and the summary name them. */
export const GRUPO_ESTADO: Record<EstadoTarea, string> = {
  COMPLETADA: "Completadas en la semana",
  PENDIENTE: "Abiertas al cierre, en plazo",
  VENCIDA: "Abiertas al cierre, vencidas",
};

const plural = (n: number, una: string, varias: string) =>
  `${entero(n)} ${n === 1 ? una : varias}`;

/** "5 días", "1 día", "0 días": zero is a delay of zero days (due on the last day), not a missing value. */
export function diasAtrasoTexto(dias: number | null) {
  return dias === null ? "—" : plural(dias, "día", "días");
}

/** A task date: day and month inside the week's year, with the year outside it. */
export function fechaTarea(fecha: string | null, referencia: string) {
  if (!fecha) return "—";
  return fecha.slice(0, 4) === referencia.slice(0, 4)
    ? diaCorto(fecha)
    : `${diaCorto(fecha)} ${fecha.slice(0, 4)}`;
}

const DIA = 86400000;
const dias = (fecha: string) => Date.parse(`${fecha}T00:00:00Z`) / DIA;

/**
 * Carried-over work in words, from one task's closes (newest first): how many consecutive closes it stayed
 * open, and its due date or its completion. A week missing in between ends the run.
 */
export function textoHistorial(cierres: CierreTareaDTO[]) {
  const [ultimo] = cierres;
  if (!ultimo) return "Sin cierres registrados.";
  const abiertos = (desde: number) => {
    let n = 0;
    for (let i = desde; i < cierres.length; i++) {
      if (cierres[i].estado === "COMPLETADA") break;
      const salto =
        i > 0 &&
        dias(cierres[i - 1].periodStart) - dias(cierres[i].periodStart);
      if (salto !== false && salto !== 7) break;
      n++;
    }
    return n;
  };
  if (ultimo.estado === "COMPLETADA") {
    const antes = abiertos(1);
    const cuando = `el ${fechaTarea(ultimo.completadaEl, ultimo.periodStart)}`;
    return antes === 0
      ? `Completada ${cuando}.`
      : `Abierta en ${plural(antes, "cierre", "cierres")} antes de completarse ${cuando}.`;
  }
  const n = abiertos(0);
  const vence = ultimo.venceEl
    ? `con vencimiento el ${fechaTarea(ultimo.venceEl, ultimo.periodStart)}`
    : "sin fecha de vencimiento";
  return `Abierta en ${n} ${n === 1 ? "cierre" : "cierres seguidos"}, ${vence}.`;
}

/** One person-week of tasks as the person page's URL holds it. */
export type VistaTareas = {
  employeeId: string;
  periodStart: string;
  recordId?: string;
  estado?: EstadoTarea;
  page?: number;
  tarea?: string;
};

/**
 * A week's tasks: the person page with that week chosen (`?semana=`). Page 1 and defaults stay out of
 * the URL so the link is the shortest that means the same.
 */
export function hrefTareasSemana(v: VistaTareas) {
  const query = new URLSearchParams({ semana: v.periodStart });
  if (v.recordId) query.set("recordId", v.recordId);
  if (v.estado) query.set("estado", v.estado);
  if (v.page && v.page > 1) query.set("page", String(v.page));
  if (v.tarea) query.set("tarea", v.tarea);
  return `/employees/${encodeURIComponent(v.employeeId)}?${query}`;
}
