import type { ReactNode } from "react";
import s from "./importaciones.module.css";

/**
 * The footer of a wizard step (visual-system R43): Cancel on the left, Back and the step's
 * main action on the right, the main action last.
 */
export function PieAsistente({
  izquierda,
  derecha,
}: {
  izquierda?: ReactNode;
  derecha: ReactNode;
}) {
  return (
    <div className={s.pie}>
      <div className={s.pieIzquierda}>{izquierda}</div>
      <div className={s.pieDerecha}>{derecha}</div>
    </div>
  );
}
