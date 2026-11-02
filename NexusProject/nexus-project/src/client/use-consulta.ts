"use client";
import { useEffect, useRef, useState } from "react";

export type Consulta<T> =
  | { estado: "cargando" }
  | { estado: "error"; mensaje: string }
  | { estado: "listo"; datos: T };

/**
 * Runs a read keyed by `clave`. A new key aborts the previous request, and a
 * late answer for an old key is never shown (T14: late responses never replace
 * newer ones). `reintentar` repeats the current key; a null key waits.
 */
export function useConsulta<T>(
  pedir: (signal: AbortSignal) => Promise<T>,
  clave: string | null,
): Consulta<T> & { reintentar: () => void } {
  const [intento, setIntento] = useState(0);
  const id = `${clave}#${intento}`;
  const [resultado, setResultado] = useState<{ id: string } & Consulta<T>>();
  const pedido = useRef(pedir);
  useEffect(() => {
    pedido.current = pedir;
  });
  useEffect(() => {
    if (clave === null) return;
    const control = new AbortController();
    pedido.current(control.signal).then(
      (datos) => setResultado({ id, estado: "listo", datos }),
      (error: Error) => {
        if (!control.signal.aborted)
          setResultado({ id, estado: "error", mensaje: error.message });
      },
    );
    return () => control.abort();
  }, [id, clave]);
  const reintentar = () => setIntento((n) => n + 1);
  return resultado?.id === id
    ? { ...resultado, reintentar }
    : { estado: "cargando", reintentar };
}
