import type { ReactNode } from "react";
import s from "./table.module.css";

/**
 * A data table inside a keyboard-scrollable region. The region scrolls on its
 * own, so it opts out of Lenis (`data-lenis-prevent`).
 */
export function DataTable({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <div
      className={s.scroll}
      role="region"
      aria-label={etiqueta}
      tabIndex={0}
      data-lenis-prevent
    >
      <table className={s.table}>{children}</table>
    </div>
  );
}

export const tabla = s;
