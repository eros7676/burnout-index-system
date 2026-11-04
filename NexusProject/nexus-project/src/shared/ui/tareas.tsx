// A week's task counts in words; the counts are few, so words read better than a bar.
import { entero } from "../formato";

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

/** The same words as textoTareas, the overdue count in bold: the number that needs acting on. */
export function TextoTareas({ activas, pendientes, vencidas }: Tareas) {
  if (activas === 0 || !vencidas) return <>{textoTareas({ activas, pendientes, vencidas })}</>;
  return (
    <>
      {contar(pendientes, "pendiente", "pendientes")} de {entero(activas)},{" "}
      <strong>{contar(vencidas, "vencida", "vencidas")}</strong>
    </>
  );
}
