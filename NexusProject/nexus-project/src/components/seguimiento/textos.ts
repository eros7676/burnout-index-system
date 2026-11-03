// Words for the follow-up case: dates with their year and the tone of each status.
import { entero } from "@/shared/formato";
import {
  ESTADO_SEGUIMIENTO,
  type EstadoSeguimiento,
  type ResumenSeguimiento,
} from "@/shared/contratos/seguimiento";

const FECHA = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "20 nov 2026" from a YYYY-MM-DD date, never through the browser's time zone. */
export const fecha = (iso: string) =>
  FECHA.format(new Date(`${iso}T00:00:00.000Z`)).replace(/\./g, "");

export type Tono = "neutro" | "aviso" | "exito" | "incidencia";

/** NUEVO waits for somebody; CERRADO is done; the rest are in someone's hands. */
export const TONO_ESTADO: Record<EstadoSeguimiento, Tono> = {
  NUEVO: "aviso",
  EN_CURSO: "neutro",
  EN_ESPERA: "neutro",
  CERRADO: "exito",
};

/** "Nuevo", "En curso, vencido" for screen readers and plain-text places. */
export const textoEstado = (
  caso: Pick<ResumenSeguimiento, "estado" | "vencido">,
) =>
  caso.vencido
    ? `${ESTADO_SEGUIMIENTO[caso.estado]}, vencido`
    : ESTADO_SEGUIMIENTO[caso.estado];

/** Plural-aware count: "1 nota", "3 notas". */
export const contar = (n: number, uno: string, varios: string) =>
  `${entero(n)} ${n === 1 ? uno : varios}`;
