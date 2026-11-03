"use client";
// Submitting a form: one request at a time (double-submit protection), the failure kept for the
// page to show, and its field errors at hand for each control (GOV.UK error summary pattern).
import { useCallback, useRef, useState } from "react";
import { ErrorApi } from "./api";

export function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);
  const bloqueo = useRef(false);

  /**
   * Runs the request. With `navega` the form stays locked after a success, because the page is
   * about to be left; otherwise it is released for the next attempt.
   */
  const enviar = useCallback(
    async <T,>(accion: () => Promise<T>, { navega = false } = {}) => {
      if (bloqueo.current) return undefined;
      bloqueo.current = true;
      setEnviando(true);
      setError(null);
      try {
        const resultado = await accion();
        if (!navega) {
          bloqueo.current = false;
          setEnviando(false);
        }
        return resultado;
      } catch (e) {
        bloqueo.current = false;
        setEnviando(false);
        setError(
          e instanceof ErrorApi
            ? e
            : new ErrorApi(
                "No se pudo completar la operación. Intente nuevamente.",
              ),
        );
        return undefined;
      }
    },
    [],
  );
  const errorDe = (campo: string) =>
    error?.detalles.find((d) => d.campo === campo)?.detalle;
  return { enviando, error, enviar, errorDe };
}
