import type {
  ConciliacionTareasDTO,
  TareasSemanaDTO,
} from "@/shared/contratos/tareas";
import { entero, momento } from "@/shared/formato";
import { Figure, Notice } from "@/shared/ui";
import { TaskBar, TaskLegend } from "@/shared/ui/task-bar";
import { GRUPO_ESTADO, diasAtrasoTexto } from "./textos";
import s from "./resumen-tareas.module.css";

const CAMPO: Record<ConciliacionTareasDTO["campos"][number]["campo"], string> =
  {
    tareasActivas: "Tareas activas",
    tareasPendientes: "Tareas pendientes",
    tareasVencidas: "Tareas vencidas",
  };

/** Where the counts come from: the rows that reproduce them, or the lack of rows. */
function Linaje({ semana }: { semana: TareasSemanaDTO }) {
  const { detalle, conciliacion, resumen, importacion } = semana;
  if (detalle === "SIN_DETALLE")
    return (
      <p className={s.note}>
        Resumen importado sin detalle de tareas. Los conteos no se pueden
        corroborar en el sistema.
      </p>
    );
  if (conciliacion && !conciliacion.coincide)
    return (
      <Notice tono="aviso">
        Los conteos del resumen no coinciden con el detalle importado:{" "}
        {conciliacion.campos
          .filter((c) => c.resumen !== c.detalle)
          .map(
            (c) =>
              `${CAMPO[c.campo].toLowerCase()}, ${entero(c.resumen)} en el resumen y ${entero(c.detalle)} en el detalle`,
          )
          .join("; ")}
        .
      </Notice>
    );
  return (
    <p className={s.note}>
      {resumen.total === 0
        ? "La semana no registra tareas."
        : `Los conteos de la semana coinciden con el detalle importado${importacion?.confirmadaEl ? ` el ${momento(importacion.confirmadaEl)}` : ""}.`}
    </p>
  );
}

/**
 * Aggregate and detail side by side: the three groups of the week as counts, the bar the person page
 * draws from the summary, and the line that says whether the rows reproduce those counts.
 */
export function ResumenTareas({ semana }: { semana: TareasSemanaDTO }) {
  const { indicadores, resumen, detalle } = semana;
  const conFilas = detalle === "CON_DETALLE";
  return (
    <div className={s.summary}>
      <div className={s.figures}>
        <Figure
          etiqueta="Tareas de la semana"
          valor={entero(indicadores.tareasActivas)}
          detalle="Según el resumen importado"
        />
        <Figure
          etiqueta={GRUPO_ESTADO.COMPLETADA}
          valor={conFilas ? entero(resumen.completadas) : "—"}
          detalle={conFilas ? "Según el detalle" : "Sin detalle importado"}
        />
        <Figure
          etiqueta={GRUPO_ESTADO.PENDIENTE}
          valor={conFilas ? entero(resumen.pendientes) : "—"}
          detalle={conFilas ? "Según el detalle" : "Sin detalle importado"}
        />
        <Figure
          etiqueta={GRUPO_ESTADO.VENCIDA}
          valor={conFilas ? entero(resumen.vencidas) : "—"}
          detalle={
            conFilas && resumen.vencidas > 0
              ? `Atraso máximo, ${diasAtrasoTexto(resumen.diasAtrasoMax)}`
              : conFilas
                ? "Según el detalle"
                : "Sin detalle importado"
          }
        />
      </div>
      {indicadores.tareasActivas > 0 && (
        <div className={s.bar}>
          <TaskBar
            activas={indicadores.tareasActivas}
            pendientes={indicadores.tareasPendientes}
            vencidas={indicadores.tareasVencidas}
          />
          <TaskLegend />
        </div>
      )}
      <Linaje semana={semana} />
      <p className={s.note}>
        Estas tareas son la carga registrada que se usó en el cálculo. No miden
        desempeño: una tarea vencida puede deberse a la asignación o al volumen,
        no a la persona. La revisión es humana; el sistema no decide.
      </p>
    </div>
  );
}
