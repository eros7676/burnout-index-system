"use client";
import { useEffect, useRef } from "react";
import type { ErrorApi } from "./api";
import s from "./organizacion.module.css";

/**
 * The failures of a submit, at the top of the form and linked to the controls (GOV.UK error
 * summary). It takes focus when it appears, so a keyboard or screen-reader user lands on it.
 */
export function ResumenErrores({ error }: { error: ErrorApi | null }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) caja.current?.focus();
  }, [error]);
  if (!error) return null;
  const campos = error.detalles.filter((d) => d.campo);
  return (
    <div ref={caja} tabIndex={-1} role="alert" className={s.resumen}>
      <p className={s.resumenTitulo}>
        {campos.length ? "Revise los campos indicados" : error.message}
      </p>
      {campos.length > 0 && (
        <ul>
          {campos.map((d) => (
            <li key={`${d.campo}:${d.codigo}`}>
              <a
                href={`#${d.campo}`}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .querySelector<HTMLElement>(
                      `[name="${CSS.escape(d.campo!)}"]`,
                    )
                    ?.focus();
                }}
              >
                {d.detalle}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
