import type { ReactNode } from "react";
import { Icon, type Icono } from "./icons";
import s from "./status-tag.module.css";

const ICONO: Partial<Record<"aviso" | "exito" | "incidencia", Icono>> = {
  aviso: "info",
  exito: "exito",
  incidencia: "error",
};

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
      {tono !== "neutro" && <Icon nombre={ICONO[tono]!} />}
      {children}
    </span>
  );
}
