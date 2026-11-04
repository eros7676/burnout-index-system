import type { ResultadoAuditoria } from "@/shared/contracts";
import { StatusTag } from "@/shared/ui/status-tag";
import { RESULTADO } from "./eventos";

const TONO = {
  EXITO: "exito",
  FALLO: "incidencia",
  DENEGADO: "aviso",
} as const;

/**
 * The outcome of an event as a word, a tone and a mark, never color alone. The mark is the one
 * StatusTag draws for each tone, so the tag carries a single icon like every other status.
 */
export function EtiquetaResultado({
  resultado,
}: {
  resultado: ResultadoAuditoria;
}) {
  return <StatusTag tono={TONO[resultado]}>{RESULTADO[resultado]}</StatusTag>;
}
