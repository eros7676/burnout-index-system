"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/shared/ui";
import s from "./confirmacion.module.css";

/**
 * A modal question before an action that cannot be undone: the title asks it, the body
 * states the consequence, and the buttons repeat the verb. Built on the native <dialog>,
 * which traps focus, closes on Escape and returns focus to the button that opened it.
 * The element marked `data-foco` receives focus first (Cancel for destructive actions).
 */
export function Confirmacion({
  abierta,
  titulo,
  confirmar,
  enCurso,
  ocupado,
  error,
  bloqueada = false,
  peligrosa = false,
  onConfirmar,
  onCancelar,
  children,
}: {
  abierta: boolean;
  titulo: string;
  confirmar: string;
  /** Gerund shown on the confirm button while the request runs. */
  enCurso: string;
  ocupado: boolean;
  error?: string | null;
  /** Keeps the confirm button disabled (a required field is incomplete). */
  bloqueada?: boolean;
  /** The confirm button is the destructive one (danger, not primary). */
  peligrosa?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
  children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierta && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>("[data-foco]")?.focus();
    } else if (!abierta && d.open) d.close();
  }, [abierta]);

  return (
    <dialog
      ref={dialogo}
      className={s.dialogo}
      aria-labelledby={idTitulo}
      onCancel={(evento) => {
        // Escape asks the owner of the state to close; a running request cannot be abandoned.
        evento.preventDefault();
        if (!ocupado) onCancelar();
      }}
    >
      {abierta && (
        <form
          className={s.contenido}
          onSubmit={(evento) => {
            evento.preventDefault();
            if (!bloqueada && !ocupado) onConfirmar();
          }}
        >
          <h2 id={idTitulo} className={s.titulo}>
            {titulo}
          </h2>
          <div className={s.cuerpo}>{children}</div>
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <div className={s.acciones}>
            <Button
              type="submit"
              variante={peligrosa ? "danger" : "primary"}
              disabled={bloqueada || ocupado}
            >
              {ocupado ? enCurso : confirmar}
            </Button>
            <Button disabled={ocupado} onClick={onCancelar} data-foco>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
