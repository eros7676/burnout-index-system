"use client";
import { entero } from "../formato";
import s from "./task-bar.module.css";
import { type Lectura, useLectura } from "./tip";

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
    { clave: "vencidas", nombre: "Vencidas", valor: vencidas, color: "var(--ink)" },
    {
      clave: "pendientes",
      nombre: "Pendientes sin vencer",
      valor: pendientes - vencidas,
      color: "var(--ink-3)",
    },
    {
      clave: "completadas",
      nombre: "Completadas",
      valor: activas - pendientes,
      color: "var(--chart-quiet)",
    },
  ].filter((p) => p.valor > 0);
  const lectura = (i: number): Lectura => ({
    titulo: partes[i].nombre,
    filas: [
      {
        etiqueta: `de ${contar(activas, "tarea", "tareas")}`,
        valor: entero(partes[i].valor),
        clave: partes[i].color,
      },
    ],
  });
  const { contenedor, marca, burbuja, vivo } = useLectura(partes.length, lectura);
  return (
    <span className={s.tasks}>
      <span className={s.frame}>
        {activas > 0 && (
          <span
            {...contenedor}
            className={s.bar}
            role="group"
            aria-label={`Tareas: ${partes.map((p) => `${p.nombre} ${p.valor}`).join(", ")}.`}
            style={{ width: `${(activas / Math.max(escala, activas)) * 100}%` }}
          >
            {partes.map(({ clave, valor }, i) => (
              <span
                key={clave}
                className={s.part}
                data-parte={clave}
                style={{ flexGrow: valor }}
                {...marca(i)}
              />
            ))}
            {burbuja}
            {vivo}
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
