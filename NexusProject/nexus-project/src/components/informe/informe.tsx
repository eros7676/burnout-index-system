"use client";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import type {
  Alerta,
  InformeDTO,
  PersonaDTO,
  Persistencia,
} from "@/shared/contracts";
import {
  FACTOR,
  decimal,
  semana as textoSemana,
  valorFactor,
} from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import { semanaDe, serieHasta } from "@/shared/semanas";
import {
  Button,
  Columns,
  DataTable,
  ErrorBox,
  FactorBullet,
  Figure,
  LevelTag,
  Notice,
  PageHeader,
  Section,
  Stack,
  SkeletonRows,
  WeekStrip,
  tabla,
  Tip,
} from "@/shared/ui";
import { DEFINICION } from "../definiciones";
import { StatusTag } from "@/shared/ui/status-tag";
import { TextoTareas } from "@/shared/ui/tareas";
import {
  causasEnPalabras,
  envio,
  nombreDestinatario,
  sinDestinatario,
  trasIntento,
} from "../alertas/aviso";
import { NotificacionAlerta, tituloCorreo } from "../notificacion-alerta";
import { useSesion } from "../shell/sesion";
import { hrefTareasSemana } from "../tareas/textos";
import { explicacionEnPalabras } from "./explicacion";
import { Sugerencias } from "./sugerencias";
import s from "./informe.module.css";

type Datos = { informe: InformeDTO; personas: PersonaDTO[] };

async function cargar(evaluationId: string, signal: AbortSignal) {
  const [informe, personas] = await Promise.all([
    tableroApi.informe(evaluationId, signal),
    tableroApi.personas({}, signal),
  ]);
  return { informe, personas: personas.items } satisfies Datos;
}

/** Whether the load held up two weeks in a row, in words (T10 persistence). */
const MOTIVO: Record<Persistencia["motivo"], string> = {
  SOSTENIDO:
    "La carga alta se sostiene dos semanas seguidas, con factores en común.",
  NO_SOSTENIDO:
    "No se sostiene una carga alta dos semanas seguidas con factores en común.",
  HISTORIAL_INSUFICIENTE:
    "No hay semana anterior para confirmar si la carga se sostiene.",
};

/** The alert's facts and, for RR. HH., the simulated mail beside them; without the mail the facts take the width. */
function ConCorreo({
  activo,
  children,
}: {
  activo: boolean;
  children: ReactNode;
}) {
  return activo ? (
    <Columns division="8-4">{children}</Columns>
  ) : (
    <>{children}</>
  );
}

/** Answers why one stored weekly result got its level. */
export function Informe({ evaluationId }: { evaluationId: string }) {
  const { usuario, correo } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(
    (signal) => cargar(evaluationId, signal),
    usuario ? `informe:${evaluationId}` : null,
  );
  const datos = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  const [cambio, setCambio] = useState<Partial<Alerta>>();
  useRowsEnter(filas, datos?.informe.factores);

  const informe = datos?.informe;
  const evaluacion = informe?.evaluacion;
  const persona = datos?.personas.find(
    (p) => p.employeeId === informe?.empleado.employeeId,
  );
  const semana =
    persona && evaluacion
      ? semanaDe(persona, evaluacion.periodStart)
      : undefined;
  // T14: a superseded or stale result keeps its level, identified as not current.
  const historico = evaluacion?.vigente === false;
  const desactualizado =
    !historico &&
    semana?.evaluationId === evaluacion?.evaluationId &&
    semana?.actualizado === false;
  const actual =
    historico && semana?.evaluationId !== evaluacion?.evaluationId
      ? semana?.evaluationId
      : null;
  const alerta = informe?.alerta ? { ...informe.alerta, ...cambio } : null;
  const persistencia = evaluacion?.persistencia;
  const tareas = evaluacion?.snapshot.actual.tareasActivas ?? 0;
  const fallo = consulta.estado === "error";

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo={informe?.empleado.nombre ?? "Informe semanal"}
        volver={
          informe
            ? {
                href: `/employees/${informe.empleado.employeeId}`,
                texto: "Ficha de la persona",
              }
            : { href: "/home", texto: "Resumen" }
        }
        contexto={
          evaluacion
            ? [
                `Semana ${textoSemana(evaluacion.periodStart, evaluacion.periodEnd)}`,
                persona?.equipo,
              ]
                .filter(Boolean)
                .join(", ")
            : "Motivo del nivel de la semana"
        }
        acciones={
          informe ? (
            <Button className={s.controles} onClick={() => window.print()}>
              Imprimir informe
            </Button>
          ) : undefined
        }
      />

      <Section titulo="Resultado de la semana">
        <div ref={caja} className={s.result}>
          {fallo ? (
            <ErrorBox
              mensaje={consulta.mensaje}
              onRetry={consulta.reintentar}
            />
          ) : !informe || !evaluacion ? (
            <SkeletonRows filas={3} />
          ) : (
            <>
              {historico && (
                <Notice tono="aviso">
                  Resultado histórico: un cálculo posterior reemplazó esta
                  evaluación, así que este nivel no es el actual.{" "}
                  {actual && (
                    <Link className={s.inlineLink} href={`/reports/${actual}`}>
                      Ver el resultado actual
                    </Link>
                  )}
                </Notice>
              )}
              {desactualizado && (
                <Notice tono="aviso">
                  Resultado desactualizado: cambiaron los datos o las reglas de
                  esta semana y falta recalcularla, así que este nivel no es el
                  actual.
                </Notice>
              )}
              <div className={s.figures}>
                <Figure
                  etiqueta={<Tip contenido={DEFINICION.indice}>Índice</Tip>}
                  valor={decimal(evaluacion.indice)}
                  detalle="de 100"
                />
                <div className={s.fact}>
                  <span className={s.label}>
                    {historico || desactualizado ? "Nivel calculado" : "Nivel"}
                  </span>
                  <LevelTag nivel={evaluacion.nivel} />
                </div>
                {persona && (
                  <div className={s.fact}>
                    <span className={s.label}>Hasta esta semana</span>
                    <WeekStrip
                      semanas={serieHasta(persona, evaluacion.periodStart)}
                    />
                  </div>
                )}
                <div className={s.fact}>
                  <span className={s.label}>Calculado con</span>
                  <Link className={s.inlineLink} href="/rules-config">
                    Reglas {evaluacion.rulesVersion}
                  </Link>
                </div>
              </div>
              <p className={s.explanation}>
                {explicacionEnPalabras(informe.explicacion)}
              </p>
            </>
          )}
        </div>
      </Section>

      {!fallo && (
        <>
          <Columns division="8-4">
            <Section
              className={s.factors}
              titulo="Factores del nivel"
              aside={informe ? <span>Por aporte al índice</span> : undefined}
            >
              {!informe || !evaluacion ? (
                <SkeletonRows filas={4} />
              ) : (
                <DataTable etiqueta="Factores, por aporte al índice">
                  <thead>
                    <tr>
                      <th scope="col">Factor</th>
                      <th scope="col" className={tabla.num}>
                        Valor
                      </th>
                      <th scope="col" className={tabla.num}>
                        <Tip contenido={DEFINICION.umbral}>Umbral</Tip>
                      </th>
                      <th scope="col"><Tip contenido={DEFINICION.frenteAlUmbral}>Frente al umbral</Tip></th>
                      <th scope="col" className={tabla.num}>
                        <Tip contenido={DEFINICION.puntaje}>Puntaje</Tip>
                      </th>
                      <th scope="col" className={tabla.num}>
                        <Tip contenido={DEFINICION.aporte}>Aporte</Tip>
                      </th>
                    </tr>
                  </thead>
                  <tbody ref={filas}>
                    {informe.factores.map((f) => (
                      <tr key={f.codigo}>
                        <th scope="row">
                          {FACTOR[f.codigo]}
                          {f.excedido && (
                            <span className={s.exceeded}>Supera el umbral</span>
                          )}
                          {f.codigo === "CT" && tareas > 0 && (
                            // The ratio's counts in words: what the value is made of.
                            <span className={s.cuentas}>
                              <TextoTareas
                                activas={tareas}
                                pendientes={evaluacion!.snapshot.actual.tareasPendientes}
                                vencidas={evaluacion!.snapshot.actual.tareasVencidas}
                              />
                            </span>
                          )}
                          {f.codigo === "CT" && tareas > 0 && (
                            <Link
                              className={`${s.inlineLink} ${s.controles}`}
                              href={hrefTareasSemana({
                                employeeId: evaluacion!.employeeId,
                                periodStart: evaluacion!.periodStart,
                                // The data version this result was computed from, not today's.
                                recordId: evaluacion!.snapshot.actual.recordId,
                              })}
                            >
                              {tareas === 1
                                ? "Ver la tarea de la semana"
                                : `Ver las ${tareas} tareas de la semana`}
                            </Link>
                          )}
                        </th>
                        <td className={tabla.num}>
                          {valorFactor(f.codigo, f.valor)}
                        </td>
                        <td className={`${tabla.num} ${tabla.muted}`}>
                          {valorFactor(f.codigo, f.umbral)}
                        </td>
                        <td className={s.bullet}>
                          <FactorBullet
                            factor={f.codigo}
                            valor={f.valor}
                            umbral={f.umbral}
                            excedido={f.excedido}
                            puntaje={f.score}
                          />
                        </td>
                        <td className={tabla.num}>{decimal(f.score)}</td>
                        <td className={tabla.num}>{decimal(f.contribucion)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className={s.total}>
                    <tr>
                      <th scope="row" colSpan={5}>
                        Índice de la semana
                      </th>
                      <td className={tabla.num}>
                        {decimal(evaluacion.indice)}
                      </td>
                    </tr>
                  </tfoot>
                </DataTable>
              )}
            </Section>

            <Stack>
              <Section titulo="Semana anterior">
                {!persistencia ? (
                  <SkeletonRows filas={3} />
                ) : (
                  <div className={s.stack}>
                    <p className={s.lead}>{MOTIVO[persistencia.motivo]}</p>
                    {persistencia.anterior && (
                      <dl className={s.facts}>
                        <div>
                          <dt>Semana</dt>
                          <dd>
                            {textoSemana(
                              persistencia.anterior.periodo.periodStart,
                              persistencia.anterior.periodo.periodEnd,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Índice</dt>
                          <dd className="num">
                            {decimal(persistencia.anterior.indice)}
                          </dd>
                        </div>
                        <div className={s.wide}>
                          <dt>Superan el umbral en ambas semanas</dt>
                          <dd>
                            {persistencia.comunesExcedidas.length
                              ? causasEnPalabras(persistencia.comunesExcedidas)
                              : "Ningún factor"}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                )}
              </Section>

              <Section titulo="Sugerencias de revisión">
                {!informe ? (
                  <SkeletonRows filas={3} />
                ) : (
                  <Sugerencias lineas={informe.recomendaciones} />
                )}
              </Section>
            </Stack>
          </Columns>

          {!informe ? (
            <Section titulo="Alerta">
              <SkeletonRows filas={2} />
            </Section>
          ) : !alerta ? (
            <Section titulo="Alerta">
              <p className={s.muted}>Esta semana no generó una alerta.</p>
            </Section>
          ) : (
            <ConCorreo activo={usuario?.rol === "RRHH"}>
              <Section titulo="Alerta">
                <dl className={s.facts}>
                  <div>
                    <dt>Destinatario</dt>
                    <dd>
                      {sinDestinatario(alerta) ? (
                        <StatusTag tono="incidencia">
                          Sin destinatario
                        </StatusTag>
                      ) : (
                        nombreDestinatario(
                          alerta.destinatarioId!,
                          datos!.personas,
                          usuario?.employeeId,
                        )
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Envío</dt>
                    <dd>
                      {alerta.estadoEnvio === "SIN_DESTINATARIO" ? (
                        "Sin envío"
                      ) : envio(alerta).tono === "neutro" ? (
                        envio(alerta).texto
                      ) : (
                        <StatusTag tono={envio(alerta).tono}>
                          {envio(alerta).texto}
                        </StatusTag>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <Tip contenido={DEFINICION.vigenciaAlerta}>Vigencia</Tip>
                    </dt>
                    <dd>
                      {alerta.vigencia === "SUPERADA" ? (
                        <StatusTag tono="aviso">Superada</StatusTag>
                      ) : (
                        "Activa"
                      )}
                    </dd>
                  </div>
                  <div className={s.wide}>
                    <dt>Factores</dt>
                    <dd>{causasEnPalabras(alerta.causas)}</dd>
                  </div>
                </dl>
              </Section>
              {usuario?.rol === "RRHH" && (
                <Section titulo={tituloCorreo(correo)} className={s.controles}>
                  <NotificacionAlerta
                    alerta={alerta}
                    destinatario={(id) =>
                      nombreDestinatario(id, datos!.personas)
                    }
                    alCambiar={(intento) => setCambio(trasIntento(intento))}
                  />
                </Section>
              )}
            </ConCorreo>
          )}
          <p className={s.soloImpresion}>
            Informe de demostración con datos ficticios. El índice señala
            posible sobrecarga de trabajo: no es un diagnóstico ni mide el
            desempeño de la persona. La revisión es humana y el sistema no
            decide.
          </p>
        </>
      )}
    </div>
  );
}
