import type { ReactNode } from "react";
import s from "./status-tag.module.css";

/**
 * The state of an action or a record, as a word with a tone: neutral, pending
 * or simulated (`aviso`), completed (`exito`) or an incident to fix
 * (`incidencia`). Never a level: levels use LevelTag.
 */
export function StatusTag({
  tono = "neutro",
  children,
}: {
  tono?: "neutro" | "aviso" | "exito" | "incidencia";
  children: ReactNode;
}) {
  return (
    <span className={s.tag} data-tono={tono}>
      {children}
    </span>
  );
}
