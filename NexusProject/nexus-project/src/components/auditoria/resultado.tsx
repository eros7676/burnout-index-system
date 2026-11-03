import type { ResultadoAuditoria } from "@/shared/contracts";
import { StatusTag } from "@/shared/ui/status-tag";
import { RESULTADO } from "./eventos";

const TONO = {
  EXITO: "exito",
  FALLO: "incidencia",
  DENEGADO: "aviso",
} as const;

// 16 px next to 13 px text, the kit's stroke on a 24-unit grid (R22, R23). A failed event needs
// no icon here: the "incidencia" tone already draws its own mark.
const ICONO = {
  EXITO: "M5 12.5l4.5 4.5L19 7.5",
  DENEGADO: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8",
} as const;

/** The outcome of an event as a word, a tone and a mark, never color alone. */
export function EtiquetaResultado({
  resultado,
}: {
  resultado: ResultadoAuditoria;
}) {
  const trazo = resultado === "FALLO" ? null : ICONO[resultado];
  return (
    <StatusTag tono={TONO[resultado]}>
      {trazo && (
        <svg
          aria-hidden="true"
          focusable="false"
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={trazo} />
        </svg>
      )}
      {RESULTADO[resultado]}
    </StatusTag>
  );
}
