"use client";
import Link from "next/link";
import { useConsulta } from "@/client/use-consulta";
import type { SemanaTareasDTO } from "@/shared/contratos/tareas";
import { entero, semana as textoSemana } from "@/shared/formato";
import {
  DataTable,
  Empty,
  ErrorBox,
  Section,
  SkeletonRows,
  tabla,
} from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import { useSesion } from "../shell/sesion";
import { tareasApi } from "./tareas-api";
import { hrefTareasSemana } from "./textos";
import s from "./seccion-tareas.module.css";

/** Whether the task rows corroborate the week's counts, in one word. */
function Verificacion({ semana }: { semana: SemanaTareasDTO }) {
  if (semana.detalle === "SIN_DETALLE")
    return <StatusTag>Sin detalle</StatusTag>;
  if (semana.indicadores.tareasActivas === 0)
    return <StatusTag>Sin tareas</StatusTag>;
  return semana.coincide ? (
    <StatusTag tono="exito">Coincide con el detalle</StatusTag>
  ) : (
    <StatusTag tono="incidencia">No coincide con el detalle</StatusTag>
  );
}

/**
 * The person's recent weeks with the task counts of the summary and whether the imported task rows
 * corroborate them, each linking to the week's tasks. It reads counts only, so opening the person page
 * leaves no task-consultation event; the rows load on the week page.
 */
export function SeccionTareas({ employeeId }: { employeeId: string }) {
  const { usuario } = useSesion();
  const consulta = useConsulta(
    (signal) => tareasApi.semanas(employeeId, signal),
    usuario ? `tareas-semanas:${employeeId}` : null,
  );
  const datos = consulta.estado === "listo" ? consulta.datos : null;

  return (
    <Section
      titulo="Tareas por semana"
      aside={
        datos?.semanas.length ? (
          <span>Conteos del resumen y estado del detalle importado</span>
        ) : undefined
      }
    >
      {consulta.estado === "error" ? (
        <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
      ) : !datos ? (
        <SkeletonRows filas={4} />
      ) : datos.semanas.length === 0 ? (
        <Empty titulo="Todavía no hay semanas cargadas">
          Las tareas aparecerán cuando RR. HH. importe una semana de esta
          persona.
        </Empty>
      ) : (
        <DataTable etiqueta={`Tareas por semana de ${datos.persona.nombre}`}>
          <thead>
            <tr>
              <th scope="col">Semana</th>
              <th scope="col" className={tabla.num}>
                Activas
              </th>
              <th scope="col" className={tabla.num}>
                Pendientes
              </th>
              <th scope="col" className={tabla.num}>
                Vencidas
              </th>
              <th scope="col">Detalle</th>
              <th scope="col">
                <span className="sr-only">Tareas de la semana</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {datos.semanas.map((w) => {
              const periodo = textoSemana(w.periodStart, w.periodEnd);
              return (
                <tr key={w.periodStart}>
                  <th scope="row">{periodo}</th>
                  <td className={tabla.num}>
                    {entero(w.indicadores.tareasActivas)}
                  </td>
                  <td className={tabla.num}>
                    {entero(w.indicadores.tareasPendientes)}
                  </td>
                  <td className={tabla.num}>
                    {entero(w.indicadores.tareasVencidas)}
                  </td>
                  <td>
                    <Verificacion semana={w} />
                  </td>
                  <td>
                    <Link
                      className={s.link}
                      href={hrefTareasSemana({
                        employeeId,
                        periodStart: w.periodStart,
                      })}
                    >
                      Ver tareas
                      <span className="sr-only"> de {periodo}</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </Section>
  );
}
