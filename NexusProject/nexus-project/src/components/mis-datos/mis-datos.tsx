"use client";
import { useMemo, useRef } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import {
  Empty,
  ErrorBox,
  PageHeader,
  Section,
  SkeletonRows,
} from "@/shared/ui";
import { HoursColumns } from "@/shared/ui/hours-columns";
import { WeekDataTable } from "@/shared/ui/week-data-table";
import { useSesion } from "../shell/sesion";
import s from "./mis-datos.module.css";

const PARA_QUE =
  "Tus datos de trabajo semana a semana, para revisar la carga del equipo.";

/**
 * Answers "¿Qué datos míos se cargaron?": the person's own weekly work data,
 * exactly as loaded. By construction there is no index or level here (RF10).
 */
export function MisDatos() {
  const { usuario } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(
    (signal) => tableroApi.misDatos(signal),
    usuario ? `mis-datos:${usuario.userId}` : null,
  );
  const datos = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  useRowsEnter(filas, datos?.semanas);
  // The API sends the most recent week first; the chart reads left to right in time.
  const cronologico = useMemo(
    () =>
      [...(datos?.semanas ?? [])].reverse().map((w) => ({
        periodStart: w.periodStart,
        periodEnd: w.periodEnd,
        trabajadas: w.horasTrabajadas,
        extra: w.horasExtra,
      })),
    [datos],
  );
  const vacio = datos !== null && datos.semanas.length === 0;

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo={datos?.nombre ?? usuario?.nombre ?? "Mis datos"}
        contexto={datos?.equipo ? `${datos.equipo}. ${PARA_QUE}` : PARA_QUE}
      />

      <Section
        titulo="Horas por semana"
        aside={
          datos && !vacio ? (
            <span>
              {datos.semanas.length === 1
                ? "1 semana cargada"
                : `Últimas ${datos.semanas.length} semanas cargadas`}
            </span>
          ) : undefined
        }
      >
        <div ref={caja}>
          {consulta.estado === "error" ? (
            <ErrorBox
              mensaje={consulta.mensaje}
              onRetry={consulta.reintentar}
            />
          ) : !datos ? (
            <SkeletonRows filas={5} />
          ) : vacio ? (
            <Empty titulo="Todavía no se cargaron datos tuyos">
              Cuando RRHH importe una semana con tu legajo, vas a ver acá tus
              horas, tareas y vacaciones.
            </Empty>
          ) : (
            <HoursColumns semanas={cronologico} />
          )}
        </div>
      </Section>

      {!vacio && consulta.estado !== "error" && (
        <Section titulo="Semana a semana">
          {!datos ? (
            <SkeletonRows filas={6} />
          ) : (
            <WeekDataTable
              etiqueta="Tus datos por semana"
              filas={datos.semanas}
              cuerpoRef={filas}
            />
          )}
        </Section>
      )}
    </div>
  );
}
