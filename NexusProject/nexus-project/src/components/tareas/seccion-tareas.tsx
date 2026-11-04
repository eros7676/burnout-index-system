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
import {
  detalleCoincideEnTodas,
  hrefTareasSemana,
  verificacionDetalle,
} from "./textos";
import s from "./seccion-tareas.module.css";

/** The detail's verdict for a week that is not the expected one; a matching week is said once above the table. */
function Verificacion({ semana }: { semana: SemanaTareasDTO }) {
  switch (verificacionDetalle(semana)) {
    case "SIN_DETALLE":
      return <StatusTag>Sin detalle</StatusTag>;
    case "SIN_TAREAS":
      return <StatusTag>Sin tareas</StatusTag>;
    case "NO_COINCIDE":
      return (
        <StatusTag tono="incidencia">No coincide con el detalle</StatusTag>
      );
    default:
      return <span className={s.quiet}>Coincide</span>;
  }
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
  const coinciden = datos ? detalleCoincideEnTodas(datos.semanas) : false;

  return (
    <Section
      titulo="Tareas por semana"
      aside={
        datos?.semanas.length ? (
          <span>
            {coinciden
              ? "Conteos del resumen; el detalle importado coincide en todas las semanas"
              : "Conteos del resumen y estado del detalle importado"}
          </span>
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
              {!coinciden && <th scope="col">Detalle</th>}
              <th scope="col" className={tabla.centro}>
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
                  {!coinciden && (
                    <td>
                      <Verificacion semana={w} />
                    </td>
                  )}
                  <td className={tabla.centro}>
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
