"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useConsulta } from "@/client/use-consulta";
import { semana as textoSemana } from "@/shared/formato";
import {
  ButtonLink,
  DataTable,
  ErrorBox,
  Section,
  SkeletonRows,
  tabla,
} from "@/shared/ui";
import { FechaTarea } from "../fecha-tarea";
import { EstadoTareaTag } from "./estado-tarea";
import { tareasApi } from "./tareas-api";
import {
  diasAtrasoTexto,
  hrefTareasSemana,
  textoHistorial,
} from "./textos";
import s from "./historial-tarea.module.css";

/**
 * One task across the closes where it appeared: carried-over work is a load signal, so the section says
 * how many consecutive closes it stayed open and shows each close. It is a section of the week page
 * (addressable with `?tarea=`), not an inline panel; focus moves to it when it opens.
 */
export function HistorialTarea({
  employeeId,
  taskId,
  cerrar,
}: {
  employeeId: string;
  taskId: string;
  cerrar: string;
}) {
  const consulta = useConsulta(
    (signal) => tareasApi.historial(employeeId, taskId, signal),
    `historial:${employeeId}:${taskId}`,
  );
  const titulo = useRef<HTMLSpanElement>(null);
  const listo = consulta.estado === "listo";
  useEffect(() => {
    if (!listo) return;
    titulo.current?.focus({ preventScroll: true });
    titulo.current?.scrollIntoView({ block: "nearest" });
  }, [listo, taskId]);
  const datos = listo ? consulta.datos : null;

  return (
    <Section
      titulo={
        <span ref={titulo} tabIndex={-1} className={s.title}>
          Historial de la tarea {taskId}
        </span>
      }
      aside={
        <ButtonLink variante="quiet" href={cerrar} scroll={false}>
          Cerrar historial
        </ButtonLink>
      }
    >
      {consulta.estado === "error" ? (
        <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
      ) : !datos ? (
        <SkeletonRows filas={3} />
      ) : (
        <div className={s.body}>
          <p>
            <strong>{datos.titulo}</strong>, {datos.origen}
          </p>
          <p className={s.lead}>{textoHistorial(datos.cierres)}</p>
          <DataTable etiqueta={`Cierres de la tarea ${taskId}`}>
            <thead>
              <tr>
                <th scope="col">Semana</th>
                <th scope="col" className={tabla.centro}>
                  Estado
                </th>
                <th scope="col">Vence</th>
                <th scope="col">Completada</th>
                <th scope="col" className={tabla.num}>
                  Días de atraso
                </th>
              </tr>
            </thead>
            <tbody>
              {datos.cierres.map((c) => (
                <tr key={c.periodStart}>
                  <th scope="row">
                    <Link
                      className={s.link}
                      href={hrefTareasSemana({
                        employeeId,
                        periodStart: c.periodStart,
                      })}
                    >
                      {textoSemana(c.periodStart, c.periodEnd)}
                    </Link>
                  </th>
                  <td className={tabla.centro}>
                    <EstadoTareaTag estado={c.estado} />
                  </td>
                  <td><FechaTarea fecha={c.venceEl} referencia={c.periodStart} /></td>
                  <td><FechaTarea fecha={c.completadaEl} referencia={c.periodStart} /></td>
                  <td className={tabla.num}>{diasAtrasoTexto(c.diasAtraso)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {datos.truncado && (
            <p className={s.lead}>
              Se muestran los 52 cierres más recientes de la tarea.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
