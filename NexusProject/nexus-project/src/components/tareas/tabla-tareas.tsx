import Link from "next/link";
import type { Ref } from "react";
import type { TareaDTO } from "@/shared/contratos/tareas";
import { DataTable, tabla } from "@/shared/ui";
import { EstadoTareaTag } from "./estado-tarea";
import { diasAtrasoTexto, fechaTarea, tareasEnlazables } from "./textos";
import s from "./tabla-tareas.module.css";

/** Only a reference the server already checked as https is ever linked, and only when every row has one. */
function Identificador({
  tarea,
  enlazar,
}: {
  tarea: TareaDTO;
  enlazar: boolean;
}) {
  if (!enlazar || !tarea.origenRef) return <>{tarea.taskId}</>;
  return (
    <a
      className={s.link}
      href={tarea.origenRef}
      target="_blank"
      rel="noopener noreferrer"
    >
      {tarea.taskId}
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}

/**
 * The tasks of one week as they stood at its close. `semanaInicio` decides which dates carry a year;
 * `historial` builds the link to a task's closes (absent where the viewer has no such page).
 */
export function TablaTareas({
  etiqueta,
  tareas,
  semanaInicio,
  historial,
  cuerpoRef,
}: {
  etiqueta: string;
  tareas: TareaDTO[];
  semanaInicio: string;
  historial?: (taskId: string) => string;
  cuerpoRef?: Ref<HTMLTableSectionElement>;
}) {
  const enlazar = tareasEnlazables(tareas);
  return (
    <DataTable etiqueta={etiqueta}>
      <thead>
        <tr>
          <th scope="col">Identificador</th>
          <th scope="col">Título</th>
          <th scope="col">Origen</th>
          <th scope="col">Asignada</th>
          <th scope="col">Vence</th>
          <th scope="col">Completada</th>
          <th scope="col">Estado</th>
          <th scope="col" className={tabla.num}>
            Días de atraso
          </th>
          {historial && (
            <th scope="col">
              <span className="sr-only">Historial</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody ref={cuerpoRef}>
        {tareas.map((t) => (
          <tr key={t.taskId}>
            <th scope="row">
              <Identificador tarea={t} enlazar={enlazar} />
            </th>
            <td className={s.title}>{t.titulo}</td>
            <td>{t.origen}</td>
            <td className={s.date}>{fechaTarea(t.asignadaEl, semanaInicio)}</td>
            <td className={s.date}>{fechaTarea(t.venceEl, semanaInicio)}</td>
            <td className={s.date}>
              {fechaTarea(t.completadaEl, semanaInicio)}
            </td>
            <td>
              <EstadoTareaTag estado={t.estado} />
            </td>
            <td className={tabla.num}>{diasAtrasoTexto(t.diasAtraso)}</td>
            {historial && (
              <td>
                <Link
                  className={s.link}
                  href={historial(t.taskId)}
                  scroll={false}
                >
                  Ver historial
                  <span className="sr-only"> de {t.taskId}</span>
                </Link>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
