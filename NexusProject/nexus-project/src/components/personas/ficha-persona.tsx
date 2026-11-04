"use client";
import Link from "next/link";
import { useMemo, useRef } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import type { SemanaPersona } from "@/shared/contracts";
import { tienePermiso } from "@/shared/permisos";
import {
  ESTADO_PROCESO,
  decimal,
  diaCorto,
  entero,
  semana as textoSemana,
  valorFactor,
  variacion,
} from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import { nivelVigente } from "@/shared/semanas";
import {
  ButtonLink,
  Columns,
  DataTable,
  Empty,
  ErrorBox,
  Figure,
  IndexChart,
  KeyFacts,
  LevelTag,
  Notice,
  PageHeader,
  Section,
  Skeleton,
  SkeletonRows,
  tabla,
} from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import { TaskBar, TaskLegend } from "@/shared/ui/task-bar";
import { SeccionTareas } from "@/components/tareas";
import { organizacionApi } from "../organizacion/api";
import { rutaHistorial } from "../organizacion/rutas";
import { MOTIVO, PUESTO, fechaCorta } from "../organizacion/textos";
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

/** The person page reads a bounded window of weeks (D10), not the whole history. */
const SEMANAS_DE_FICHA = 12;

/** Weeks in a row at Alto, newest first, stopping at the first week that is not. */
function rachaEnAlto(recientes: SemanaPersona[]) {
  let n = 0;
  for (const w of recientes) {
    if (nivelVigente(w) !== "ALTO") break;
    n++;
  }
  return n;
}

/** Answers "¿Qué le pasa a esta persona semana a semana?". */
export function FichaPersona({ employeeId }: { employeeId: string }) {
  const { usuario } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(
    (signal) => organizacionApi.ficha(employeeId, signal, SEMANAS_DE_FICHA),
    usuario ? `ficha:${employeeId}:${SEMANAS_DE_FICHA}` : null,
  );
  const reglas = useConsulta(tableroApi.reglas, usuario ? "reglas" : null);
  const respuesta = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  const persona = respuesta?.persona;
  const puedeAdministrar = !!usuario && tienePermiso(usuario.rol, "ADMINISTRAR_PERSONAS");
  const historial = usuario ? rutaHistorial(usuario.rol, { sujetoId: employeeId }) : null;

  const vista = useMemo(() => {
    if (!respuesta) return null;
    // Oldest → newest, as the strip and the chart read.
    const serie = [...respuesta.semanas].sort((a, b) =>
      a.periodStart < b.periodStart ? -1 : 1,
    );
    const actual = serie.at(-1);
    if (!actual) return { serie, recientes: [], actual };
    const indice = indiceVigente(actual);
    const enAlto = rachaEnAlto([...serie].reverse());
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
  }, [respuesta]);
  useRowsEnter(filas, vista?.recientes);

  const volver = { href: "/employees", texto: "Personas" };
  const base = `/employees/${encodeURIComponent(employeeId)}`;

  if (consulta.estado === "error" && !respuesta)
    return (
      <div ref={pagina} className={s.page}>
        <PageHeader titulo="No se pudo abrir la ficha" volver={volver} />
        <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
      </div>
    );

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        volver={volver}
        titulo={persona ? persona.nombre : <Skeleton ancho="16ch" />}
        contexto={
          persona ? (
            `${PUESTO[persona.tipo]}${persona.equipo ? ` en ${persona.equipo}` : ""}`
          ) : (
            <Skeleton ancho="32ch" />
          )
        }
        acciones={
          persona && (puedeAdministrar || historial) ? (
            <div className={s.acciones}>
              {historial && <ButtonLink href={historial}>Ver historial</ButtonLink>}
              {puedeAdministrar && (
                <>
                  <ButtonLink href={`${base}/edit`}>Editar datos</ButtonLink>
                  {persona.activo && (
                    <>
                      <ButtonLink href={`${base}/move`}>Cambiar equipo o puesto</ButtonLink>
                      <ButtonLink variante="dangerSecondary" href={`${base}/deactivate`}>
                        Dar de baja
                      </ButtonLink>
                    </>
                  )}
                </>
              )}
            </div>
          ) : undefined
        }
      />

      {persona && (
        <KeyFacts
          items={[
            { termino: "Legajo", valor: persona.employeeId },
            {
              termino: "Equipo",
              valor:
                persona.equipo && persona.teamId ? (
                  <Link className={s.link} href={`/teams/${encodeURIComponent(persona.teamId)}`}>
                    {persona.equipo}
                  </Link>
                ) : (
                  "Sin equipo"
                ),
            },
            {
              termino: "Responsable",
              valor:
                persona.responsable && persona.responsableId && usuario?.rol !== "TEAM_LEAD" ? (
                  <Link
                    className={s.link}
                    href={`/employees/${encodeURIComponent(persona.responsableId)}`}
                  >
                    {persona.responsable}
                  </Link>
                ) : (
                  (persona.responsable ?? "Sin asignar")
                ),
            },
            {
              termino: "Puesto",
              valor: persona.lidera
                ? `${PUESTO[persona.tipo]}, líder de ${persona.lidera.nombre}`
                : PUESTO[persona.tipo],
            },
            {
              termino: "Vigente desde",
              valor: persona.vigenteDesde ? fechaCorta(persona.vigenteDesde) : "—",
            },
            {
              termino: "Estado",
              valor: persona.activo ? (
                <StatusTag tono="exito">Activa</StatusTag>
              ) : (
                <StatusTag>
                  {persona.fechaBaja ? `Baja el ${fechaCorta(persona.fechaBaja)}` : "Baja"}
                </StatusTag>
              ),
            },
          ]}
        />
      )}

      <Columns division="4-8">
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
                Cuando RR. HH. importe una semana con sus datos, aquí se verá su
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
                  <Notice>Esta semana generó una alerta.</Notice>
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
                Alto. Superar el límite de Alto una sola semana queda en Medio;
                pasa a Alto si se repite en dos semanas seguidas.
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
      </Columns>

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
                    Días consecutivos sin descanso
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
                            className={tabla.cellLink}
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

      <Section titulo="Historial de asignaciones">
        {!respuesta ? (
          <SkeletonRows filas={3} />
        ) : respuesta.asignaciones.length === 0 ? (
          <Empty titulo="Sin asignaciones registradas" />
        ) : (
          <DataTable etiqueta={`Asignaciones de ${persona!.nombre}`}>
            <thead>
              <tr>
                <th scope="col">Desde</th>
                <th scope="col">Hasta</th>
                <th scope="col">Motivo</th>
                <th scope="col">Equipo</th>
                <th scope="col">Puesto</th>
                <th scope="col">Responsable</th>
                <th scope="col">Registrado por</th>
                <th scope="col">Comentario</th>
              </tr>
            </thead>
            <tbody>
              {respuesta.asignaciones.map((a) => (
                <tr key={a.asignacionId}>
                  <th scope="row">{fechaCorta(a.desde)}</th>
                  <td>{a.hasta ? fechaCorta(a.hasta) : <StatusTag tono="exito">Vigente</StatusTag>}</td>
                  <td>{MOTIVO[a.motivo]}</td>
                  <td>{a.equipo ?? "—"}</td>
                  <td>
                    {PUESTO[a.tipo]}
                    {!a.enCobertura && <span className={tabla.sub}>Fuera de cobertura</span>}
                  </td>
                  <td>{a.responsable ?? "—"}</td>
                  <td>{a.registradoPor}</td>
                  <td>{a.comentario ?? <span className={tabla.muted}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>

      <SeccionTareas employeeId={employeeId} />
    </div>
  );
}
