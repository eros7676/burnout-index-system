// The datasets the import screen offers, in words, and the guards that tell their answers apart.
import type { ResultadoImportacion, VistaPrevia } from "@/shared/contracts";
import {
  ESQUEMA_TAREAS,
  MAX_FILAS_TAREAS,
  type PlantillaImportacion,
  type ResultadoImportacionTareas,
  type VistaPreviaTareas,
} from "@/shared/contratos/importaciones";
import { entero } from "@/shared/formato";

export type VistaImportacion = VistaPrevia | VistaPreviaTareas;
export type ResultadoConfirmacion =
  ResultadoImportacion | ResultadoImportacionTareas;

export const esVistaTareas = (v: VistaImportacion): v is VistaPreviaTareas =>
  "esquema" in v && v.esquema === ESQUEMA_TAREAS;
export const esResultadoTareas = (
  r: ResultadoConfirmacion,
): r is ResultadoImportacionTareas =>
  "esquema" in r && r.esquema === ESQUEMA_TAREAS;

export const conjuntoDe = (v: VistaImportacion): PlantillaImportacion =>
  esVistaTareas(v) ? "tareas" : "indicadores";

export const CONJUNTOS: Record<
  PlantillaImportacion,
  {
    etiqueta: string;
    descripcion: string;
    /** What the file may hold, under the file picker. */
    limites: string;
    /** The last step: only the weekly indicators start a calculation. */
    pasoFinal: string;
    cancelada: string;
  }
> = {
  indicadores: {
    etiqueta: "Indicadores semanales",
    descripcion:
      "Horas, descansos, vacaciones y cantidad de tareas de cada persona, por semana.",
    limites:
      "Hasta 5 MB y 1.000 filas. Use las columnas de la plantilla y semanas ya terminadas.",
    pasoFinal: "Confirmar y procesar",
    cancelada: "Vista previa cancelada. No se guardaron registros laborales.",
  },
  tareas: {
    etiqueta: "Tareas",
    descripcion:
      "Detalle de las tareas de cada semana. Sus totales deben coincidir con los indicadores semanales, que se importan primero.",
    limites: `Hasta 5 MB y ${entero(MAX_FILAS_TAREAS)} filas. Cada fila es una tarea de una semana ya terminada.`,
    pasoFinal: "Confirmar",
    cancelada: "Vista previa cancelada. No se guardó ninguna tarea.",
  },
};
