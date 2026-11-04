"use client";
import { useMemo, useRef } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import type { DatosSemana } from "@/shared/contracts";
import { entero, semana as textoSemana } from "@/shared/formato";
import {
  Empty,
  ErrorBox,
  PageHeader,
  Section,
  SkeletonRows,
  TrendLine,
} from "@/shared/ui";
import { WeekDataTable } from "@/shared/ui/week-data-table";
import { useSesion } from "../shell/sesion";
import { TareasPropias } from "../tareas/tareas-propias";
import s from "./mis-datos.module.css";

// Hours are not rounded: a loaded 7,5 h stays 7,5 h.
const HORAS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const horas = (valor: number) => `${HORAS.format(valor)} h`;

/** The finding first: the latest week's extra hours and how many loaded weeks had any. */
function hallazgoHoras(
  semanas: { periodStart: string; periodEnd: string; valor: number | null; trabajadas: number | null }[],
) {
  const conDato = semanas.filter((w) => w.valor !== null);
  const ultima = conDato.at(-1);
  if (!ultima) return "Los archivos cargados no traen sus horas.";
  const conExtra = conDato.filter((w) => w.valor! > 0).length;
  return `${textoSemana(ultima.periodStart, ultima.periodEnd)}: ${horas(ultima.valor!)} extra sobre ${horas(
    ultima.trabajadas!,
  )} trabajadas. Hubo horas extra en ${conExtra} de ${conDato.length} ${
    conDato.length === 1 ? "semana cargada" : "semanas cargadas"
  }.`;
}

const contar = (n: number, una: string, varias: string) => `${entero(n)} ${n === 1 ? una : varias}`;

/**
 * The newest week in one sentence, before its table: rest, overdue tasks and leave, as loaded.
 * Facts only: no threshold word, no index, no level (RF10).
 */
function hallazgoSemana(w: DatosSemana) {
  return `${textoSemana(w.periodStart, w.periodEnd)}: ${contar(
    w.diasConsecutivosSinDescanso,
    "día consecutivo sin descanso",
    "días consecutivos sin descanso",
  )}, ${contar(w.tareasVencidas, "tarea vencida", "tareas vencidas")} al cierre y ${contar(
    w.vacacionesPendientesDias,
    "día de vacaciones pendiente",
    "días de vacaciones pendientes",
  )}.`;
}

const PARA_QUE =
  "Sus datos de trabajo, semana a semana, que se usan para revisar la carga del equipo.";

/**
 * Answers "¿Qué datos propios se cargaron?": the person's own weekly work data and the tasks
 * behind its counts, exactly as loaded. By construction there is no index or level here (RF10).
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
        // A week whose file left the hours empty has no extra hours to show either.
        valor: w.horasTrabajadas === null ? null : w.horasExtra,
        trabajadas: w.horasTrabajadas,
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
        titulo="Horas extra por semana"
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
            <Empty titulo="Todavía no hay datos cargados con su legajo">
              Sus horas, tareas y vacaciones aparecerán cuando RR. HH. importe
              una semana con su legajo.
            </Empty>
          ) : (
            <div className={s.horas}>
              <p className={s.hallazgo}>{hallazgoHoras(cronologico)}</p>
              <TrendLine
                nombre="Horas extra por semana"
                etiqueta="horas extra"
                puntos={cronologico}
                formato={horas}
                nota={(i) => {
                  const trabajadas = cronologico[i].trabajadas;
                  return trabajadas === null
                    ? "El archivo no trae las horas de esta semana."
                    : `${horas(trabajadas)} trabajadas en total.`;
                }}
              />
            </div>
          )}
        </div>
      </Section>

      {/* Tasks before the table: the most actionable fact of the week reads second, not last. */}
      {!vacio && consulta.estado !== "error" && datos && <TareasPropias />}

      {!vacio && consulta.estado !== "error" && (
        <Section titulo="Semana a semana">
          {!datos ? (
            <SkeletonRows filas={6} />
          ) : (
            <div className={s.horas}>
              <p className={s.hallazgo}>{hallazgoSemana(datos.semanas[0])}</p>
              <WeekDataTable
                etiqueta="Sus datos por semana"
                filas={datos.semanas}
                cuerpoRef={filas}
              />
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
