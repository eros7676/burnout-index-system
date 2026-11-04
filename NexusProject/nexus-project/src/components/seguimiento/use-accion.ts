"use client";
import { useRef, useState } from "react";
import { ErrorLlamada } from "@/client/seguimiento-api";
import type { SeguimientoAlertaDTO } from "@/shared/contratos/seguimiento";

/**
 * Runs one write of the follow-up: one at a time, with its progress, its confirmation and the server's
 * refusal (the message of each field included). Every write answers with the alert's whole follow-up.
 */
export function useAccion(alTerminar: (datos: SeguimientoAlertaDTO) => void) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const bloqueo = useRef(false);

  async function ejecutar(
    llamada: () => Promise<SeguimientoAlertaDTO>,
    hecho: string,
  ): Promise<boolean> {
    if (bloqueo.current) return false;
    bloqueo.current = true;
    setOcupado(true);
    setError(null);
    setConfirmacion("");
    try {
      alTerminar(await llamada());
      setConfirmacion(hecho);
      return true;
    } catch (e) {
      setError(
        e instanceof ErrorLlamada
          ? e
          : new ErrorLlamada("No se pudo completar la operación."),
      );
      return false;
    } finally {
      bloqueo.current = false;
      setOcupado(false);
    }
  }
  return { ocupado, error, confirmacion, ejecutar };
}

/**
 * What to say above the buttons: the server's message, unless every detail belongs to a field of the
 * form (those show under their field). A detail about a field the form does not have is shown here.
 */
export function mensajeGeneral(
  error: ErrorLlamada | null,
  camposDelFormulario: readonly string[],
): string {
  if (!error) return "";
  if (!error.detalles.length) return error.message;
  return error.detalles
    .filter((d) => !d.campo || !camposDelFormulario.includes(d.campo))
    .map((d) => d.detalle)
    .join(" ");
}
