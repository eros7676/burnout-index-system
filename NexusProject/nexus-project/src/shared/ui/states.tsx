import type { ReactNode } from "react";
import { Button } from "./button";
import { Icon } from "./icons";
import s from "./states.module.css";

/** A placeholder inside the datum's own box, with the datum's line height. */
export function Skeleton({ ancho = "100%", alto }: { ancho?: string; alto?: string }) {
  return (
    <span
      className={s.skeleton}
      style={{ width: ancho, height: alto }}
      aria-hidden="true"
    />
  );
}

/** Rows of placeholders for a table or list that is loading. */
export function SkeletonRows({ filas = 6 }: { filas?: number }) {
  return (
    <div className={s.rows} role="status" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <Skeleton key={i} alto="20px" ancho={`${92 - (i % 3) * 9}%`} />
      ))}
    </div>
  );
}

/** Nothing to show: say why in one line and offer the next step. */
export function Empty({
  titulo,
  children,
  accion,
}: {
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className={s.empty}>
      <p className={s.emptyTitle}>{titulo}</p>
      {children && <p className={s.emptyText}>{children}</p>}
      {accion}
    </div>
  );
}

/** A failed request: what happened and how to retry, announced to screen readers. */
export function ErrorBox({
  mensaje,
  onRetry,
}: {
  mensaje: string;
  onRetry?: () => void;
}) {
  return (
    <div className={s.error} role="alert">
      <p className={s.message}>
        <Icon nombre="error" />
        {mensaje}
      </p>
      {onRetry && (
        <Button variante="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

/** A short status line: a success, a warning or a simulated action. */
export function Notice({
  tono = "info",
  children,
}: {
  tono?: "info" | "exito" | "aviso";
  children: ReactNode;
}) {
  return (
    <p className={s.notice} data-tono={tono} role="status">
      <Icon nombre={tono === "exito" ? "exito" : "info"} />
      <span>{children}</span>
    </p>
  );
}
