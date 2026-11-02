import { entero } from "../formato";
import s from "./task-bar.module.css";

/** A week's task counts as imported: vencidas ⊆ pendientes ⊆ activas. */
export type Tareas = { activas: number; pendientes: number; vencidas: number };

const contar = (n: number, una: string, varias: string) =>
  `${entero(n)} ${n === 1 ? una : varias}`;

/** "8 pendientes de 12, 5 vencidas": the week's tasks in words. */
export function textoTareas({ activas, pendientes, vencidas }: Tareas) {
  if (activas === 0) return "Sin tareas";
  const base = `${contar(pendientes, "pendiente", "pendientes")} de ${entero(activas)}`;
  return vencidas ? `${base}, ${contar(vencidas, "vencida", "vencidas")}` : base;
}

/**
 * A week's tasks as one bar, read left to right: overdue, pending on time,
 * completed. `escala` (the largest total in view) keeps the bars of several
 * weeks comparable. The words beside it carry the same numbers.
 */
export function TaskBar({
  activas,
  pendientes,
  vencidas,
  escala = activas,
}: Tareas & { escala?: number }) {
  const partes = [
    { clave: "vencidas", valor: vencidas },
    { clave: "pendientes", valor: pendientes - vencidas },
    { clave: "completadas", valor: activas - pendientes },
  ];
  return (
    <span className={s.tasks}>
      <span className={s.frame} aria-hidden="true">
        {activas > 0 && (
          <span
            className={s.bar}
            style={{ width: `${(activas / Math.max(escala, activas)) * 100}%` }}
          >
            {partes.map(({ clave, valor }) =>
              valor > 0 ? (
                <span
                  key={clave}
                  className={s.part}
                  data-parte={clave}
                  style={{ flexGrow: valor }}
                />
              ) : null,
            )}
          </span>
        )}
      </span>
      <span className={s.label}>
        {textoTareas({ activas, pendientes, vencidas })}
      </span>
    </span>
  );
}

/** The key to TaskBar's three parts, shown once beside the block that uses it. */
export function TaskLegend() {
  return (
    <ul className={s.legend} aria-label="Referencia de tareas">
      <li className={s.key} data-parte="vencidas">
        Vencidas
      </li>
      <li className={s.key} data-parte="pendientes">
        Pendientes sin vencer
      </li>
      <li className={s.key} data-parte="completadas">
        Completadas
      </li>
    </ul>
  );
}
