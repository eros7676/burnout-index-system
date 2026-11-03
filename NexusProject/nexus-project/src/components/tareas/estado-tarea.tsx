import type { EstadoTarea } from "@/shared/contratos/tareas";
import { StatusTag } from "@/shared/ui/status-tag";
import { ETIQUETA_ESTADO } from "./textos";

const TONO = {
  COMPLETADA: "exito",
  PENDIENTE: "aviso",
  VENCIDA: "incidencia",
} as const satisfies Record<EstadoTarea, "exito" | "aviso" | "incidencia">;

/** A task's status at the week's close. A record state, never a level: it uses StatusTag. */
export function EstadoTareaTag({ estado }: { estado: EstadoTarea }) {
  return <StatusTag tono={TONO[estado]}>{ETIQUETA_ESTADO[estado]}</StatusTag>;
}
