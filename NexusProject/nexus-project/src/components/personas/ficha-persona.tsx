"use client";
import Link from "next/link";
import { useMemo, useRef } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import type { SemanaPersona } from "@/shared/contracts";
import {
  ESTADO_PROCESO,
  TIPO,
  decimal,
  diaCorto,
  entero,
  semana as textoSemana,
  valorFactor,
  variacion,
} from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import { racha } from "@/shared/semanas";
import {
  ButtonLink,
  DataTable,
  Empty,
  ErrorBox,
  Figure,
  IndexChart,
  LevelTag,
  Notice,
  PageHeader,
  Section,
  Skeleton,
  SkeletonRows,
  tabla,
} from "@/shared/ui";
import { TaskBar, TaskLegend } from "@/shared/ui/task-bar";
import { useSesion } from "../shell/sesion";
import s from "./ficha-persona.module.css";

/** An index only counts when its stored result is current (T14). */
const indiceVigente = (w: SemanaPersona | undefined) =>
  w?.actualizado ? w.indice : null;

/** Why a week shows no current level: waiting for the recalculation, or it failed. */
const pendiente = (w: SemanaPersona) =>
  w.processingState === "FALLIDO"
    ? ESTADO_PROCESO.FALLIDO
    : "Espera recálculo";

/** Answers "¿Qué le pasa a esta persona semana a semana?". */
export function FichaPersona({ employeeId }: { employeeId: string }) {
  const { usuario } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(
    (signal) => tableroApi.personas({ employeeId }, signal),
    usuario ? `persona:${employeeId}` : null,
  );
  const reglas = useConsulta(tableroApi.reglas, usuario ? "reglas" : null);
  const respuesta = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  const persona = respuesta?.items[0];

  const vista = useMemo(() => {
    if (!persona) return null;
    // Oldest → newest, as the strip and the chart read.
    const serie = [...persona.semanas].sort((a, b) =>
      a.periodStart < b.periodStart ? -1 : 1,
    );
    const actual = serie.at(-1);
    if (!actual) return { serie, recientes: [], actual };
    const indice = indiceVigente(actual);
    const enAlto = racha(persona, actual.periodStart);
    return {
      serie,
      recientes: [...serie].reverse(),
      actual,
      indice,
      cambio:
        indice === null ? null : variacion(indice, indiceVigente(serie.at(-2))),
      enAlto,
      desde: enAlto ? serie[serie.length - enAlto].periodStart : null,
      escala: Math.max(...serie.map((w) => w.tareasActivas)),
    };
  }, [persona]);
  useRowsEnter(filas, vista?.recientes);

  const noEncontrada = respuesta !== null && !persona;
  const volver = { href: "/employees", texto: "Personas" };

  if (consulta.estado === "error" && !respuesta)
    return (
      <div ref={pagina} className={s.page}>
        <PageHeader titulo="No se pudo abrir la ficha" volver={volver} />
        <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
      </div>
    );

  if (noEncontrada)
    return (
      <div ref={pagina} className={s.page}>
        <PageHeader titulo="Persona no encontrada" volver={volver} />
        <Section>
          <Empty
            titulo="No hay nadie con este enlace en tu alcance"
            accion={
              <ButtonLink variante="primary" href="/employees">
                Ver personas
              </ButtonLink>
            }
          >
            Elegí a la persona desde la lista.
          </Empty>
        </Section>
      </div>
    );

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        volver={volver}
        titulo={persona ? persona.nombre : <Skeleton ancho="16ch" />}
        contexto={
          persona
            ? `${TIPO[persona.tipo]} en ${persona.equipo}${
                persona.responsable ? `, responde a ${persona.responsable}` : ""
              }`
            : <Skeleton ancho="32ch" />
        }
      />

      <div className={s.top}>
        <Section
          titulo="Última semana"
          aside={
            vista?.actual ? (
              <span>
                {textoSemana(vista.actual.periodStart, vista.actual.periodEnd)}
              </span>
            ) : undefined
          }
        >
          <div ref={caja}>
            {!vista ? (
              <SkeletonRows filas={4} />
            ) : !vista.actual ? (
              <Empty titulo="Todavía no tiene semanas cargadas">
                Cuando RRHH importe una semana con sus datos, acá vas a ver su
                nivel.
              </Empty>
            ) : (
              <div className={s.week}>
                <div className={s.level}>
                  <LevelTag
                    nivel={vista.actual.nivel}
                    actualizado={vista.actual.actualizado}
                  />
                  {!vista.actual.actualizado && (
                    <span className={s.levelNote}>
                      {vista.actual.processingState === "FALLIDO"
                        ? "El cálculo falló; el nivel anterior no está vigente."
                        : "El resultado espera recálculo."}
                    </span>
                  )}
                </div>
                <div className={s.figures}>
                  <Figure
                    etiqueta="Índice"
                    valor={decimal(vista.indice ?? null)}
                    detalle={
                      vista.cambio
                        ? `${vista.cambio} respecto de la semana anterior`
                        : vista.indice === null
                          ? "Sin resultado vigente"
                          : "Sin semana anterior para comparar"
                    }
                  />
                  <Figure
                    etiqueta="Semanas seguidas en Alto"
                    valor={
                      vista.actual.actualizado ? entero(vista.enAlto ?? 0) : "—"
                    }
                    tono={vista.enAlto ? "alto" : "neutro"}
                    detalle={
                      !vista.actual.actualizado
                        ? "Sin resultado vigente"
                        : vista.desde
                          ? `Desde la semana del ${diaCorto(vista.desde)}`
                          : "No está en Alto"
                    }
                  />
                </div>
                {vista.actual.alertId && vista.actual.actualizado && (
                  <Notice tono="aviso">Esta semana generó una alerta.</Notice>
                )}
                {vista.actual.evaluationId && (
                  <ButtonLink
                    className={s.report}
                    href={`/reports/${vista.actual.evaluationId}`}
                  >
                    Ver informe de la semana
                  </ButtonLink>
                )}
              </div>
            )}
          </div>
        </Section>

        <Section
          titulo="Índice por semana"
          aside={
            reglas.estado === "listo" ? (
              <span>
                Líneas en {entero(reglas.datos.vigente.mediumLimit)} y{" "}
                {entero(reglas.datos.vigente.highLimit)}: límites de Medio y
                Alto
              </span>
            ) : undefined
          }
        >
          {reglas.estado === "error" ? (
            <ErrorBox mensaje={reglas.mensaje} onRetry={reglas.reintentar} />
          ) : !vista || reglas.estado !== "listo" ? (
            <SkeletonRows filas={5} />
          ) : vista.serie.length === 0 ? (
            <Empty titulo="Sin índices todavía" />
          ) : (
            <IndexChart
              puntos={vista.serie}
              medio={reglas.datos.vigente.mediumLimit}
              alto={reglas.datos.vigente.highLimit}
            />
          )}
        </Section>
      </div>

      <Section
        titulo="Semana a semana"
        aside={vista?.recientes.length ? <TaskLegend /> : undefined}
      >
        {!vista ? (
          <SkeletonRows filas={6} />
        ) : vista.recientes.length === 0 ? (
          <Empty titulo="Todavía no tiene semanas cargadas" />
        ) : (
          <div className={s.weeks}>
            <DataTable etiqueta={`Semanas de ${persona!.nombre}`}>
              <thead>
                <tr>
                  <th scope="col">Semana</th>
                  <th scope="col">Nivel</th>
                  <th scope="col" className={tabla.num}>
                    Índice
                  </th>
                  <th scope="col" className={tabla.num}>
                    Horas extra
                  </th>
                  <th scope="col" className={`${tabla.num} ${s.wrap}`}>
                    Días seguidos sin descanso
                  </th>
                  <th scope="col">Tareas</th>
                  <th scope="col" className={`${tabla.num} ${s.wrap}`}>
                    Vacaciones pendientes
                  </th>
                  <th scope="col">
                    <span className="sr-only">Informe</span>
                  </th>
                </tr>
              </thead>
              <tbody ref={filas}>
                {vista.recientes.map((w) => {
                  const periodo = textoSemana(w.periodStart, w.periodEnd);
                  return (
                    <tr key={w.periodStart}>
                      <th scope="row">{periodo}</th>
                      <td>
                        <LevelTag nivel={w.nivel} actualizado={w.actualizado} />
                        {!w.actualizado && (
                          <span className={tabla.sub}>{pendiente(w)}</span>
                        )}
                      </td>
                      <td className={`${tabla.num} ${s.index}`}>
                        {decimal(indiceVigente(w) ?? null)}
                      </td>
                      <td className={tabla.num}>
                        {valorFactor("HE", w.horasExtra)}
                      </td>
                      <td className={tabla.num}>
                        {valorFactor("DS", w.diasConsecutivosSinDescanso)}
                      </td>
                      <td>
                        <TaskBar
                          activas={w.tareasActivas}
                          pendientes={w.tareasPendientes}
                          vencidas={w.tareasVencidas}
                          escala={vista.escala}
                        />
                      </td>
                      <td className={tabla.num}>
                        {valorFactor("VP", w.vacacionesPendientesDias)}
                      </td>
                      <td className={tabla.num}>
                        {w.evaluationId ? (
                          <Link
                            className={s.link}
                            href={`/reports/${w.evaluationId}`}
                          >
                            Ver informe
                            <span className="sr-only"> de {periodo}</span>
                          </Link>
                        ) : (
                          <span className={tabla.muted}>Sin informe</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>
        )}
      </Section>
    </div>
  );
}
