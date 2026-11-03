"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { seguimientoApi } from "@/client/seguimiento-api";
import { useConsulta } from "@/client/use-consulta";
import type { Alerta } from "@/shared/contracts";
import {
  FACTOR,
  VIGENCIA,
  decimal,
  semana as textoSemana,
} from "@/shared/formato";
import { useArrival, usePageEnter } from "@/shared/motion";
import {
  ButtonLink,
  ErrorBox,
  KeyFacts,
  LevelTag,
  PageHeader,
  Section,
  SkeletonRows,
  WeekStrip,
  tabla,
} from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import { NotificacionAlerta } from "../notificacion-alerta";
import { SeguimientoAlerta } from "../seguimiento/seguimiento-alerta";
import { useSesion } from "../shell/sesion";
import { envio, sinDestinatario, sugerencia, trasIntento } from "./aviso";
import s from "./detalle-alerta.module.css";

/**
 * One alert: who and which week it is about, the factors behind it, its follow-up case and, for RR. HH.,
 * the simulated mail. Lists link here instead of opening panels inline.
 */
export function DetalleAlerta({ alertId }: { alertId: string }) {
  const { usuario } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(
    (signal) => seguimientoApi.alerta(alertId, signal),
    usuario ? `${usuario.userId}|${alertId}` : null,
  );
  const base = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  // A simulated send changes the alert's delivery state without reloading it.
  const [cambio, setCambio] = useState<Partial<Alerta>>({});
  const alerta = base ? { ...base, ...cambio } : null;
  const superada = alerta?.vigencia === "SUPERADA";
  const notifica = usuario?.rol === "RRHH";

  const semana = alerta?.semana ?? null;
  const estadoEnvio = alerta ? envio(alerta) : null;

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        volver={{ href: "/alerts", texto: "Alertas" }}
        titulo={
          alerta?.persona ? `Alerta de ${alerta.persona.nombre}` : "Alerta"
        }
        contexto="Factores de la alerta y estado de su seguimiento"
        acciones={
          alerta && (
            <ButtonLink href={`/reports/${alerta.evaluationId}`}>
              Ver informe
            </ButtonLink>
          )
        }
      />

      <div ref={caja} className={s.contenido}>
        {consulta.estado === "error" ? (
          <Section>
            <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
          </Section>
        ) : !alerta ? (
          <Section aria-label="Datos de la alerta">
            <SkeletonRows filas={3} />
          </Section>
        ) : (
          <>
            <Section aria-label="Datos de la alerta">
              <KeyFacts
                items={[
                  {
                    termino: "Persona",
                    valor: alerta.persona ? (
                      <Link
                        className={tabla.rowLink}
                        href={`/employees/${alerta.employeeId}`}
                      >
                        {alerta.persona.nombre}
                      </Link>
                    ) : (
                      "Persona sin datos cargados"
                    ),
                  },
                  { termino: "Equipo", valor: alerta.persona?.equipo ?? "—" },
                  {
                    termino: "Semana",
                    valor: semana ? (
                      <span className={s.semana}>
                        {textoSemana(semana.periodStart, semana.periodEnd)}
                        <WeekStrip semanas={alerta.serie} />
                      </span>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    termino: "Índice",
                    valor: decimal(semana?.actualizado ? semana.indice : null),
                  },
                  {
                    termino: "Nivel",
                    valor: (
                      <LevelTag
                        nivel={semana?.nivel ?? null}
                        actualizado={semana?.actualizado ?? true}
                      />
                    ),
                  },
                  {
                    termino: "Destinatario",
                    valor: (
                      <span className={s.destinatario}>
                        {sinDestinatario(alerta) ? (
                          <StatusTag tono="incidencia">Sin destinatario</StatusTag>
                        ) : (
                          <span>
                            {alerta.destinatario ?? "Responsable"}
                            {alerta.destinatarioId === usuario?.employeeId
                              ? " (usted)"
                              : ""}
                          </span>
                        )}
                        {estadoEnvio &&
                          alerta.estadoEnvio !== "SIN_DESTINATARIO" &&
                          (estadoEnvio.tono === "neutro" ? (
                            <span className={tabla.sub}>{estadoEnvio.texto}</span>
                          ) : (
                            <StatusTag tono={estadoEnvio.tono}>
                              {estadoEnvio.texto}
                            </StatusTag>
                          ))}
                      </span>
                    ),
                  },
                  {
                    termino: "Vigencia",
                    valor: superada ? (
                      <StatusTag tono="aviso">{VIGENCIA.SUPERADA}</StatusTag>
                    ) : (
                      VIGENCIA.ACTIVA
                    ),
                  },
                ]}
              />
            </Section>

            <div className={s.fila}>
              <Section titulo="Factores" className={s.principal}>
                {alerta.causas.length ? (
                  <ul className={s.lista}>
                    {alerta.causas.map((f) => (
                      <li key={f}>{FACTOR[f]}</li>
                    ))}
                  </ul>
                ) : (
                  <p className={s.nota}>Sin factores registrados.</p>
                )}
                <p className={s.nota}>
                  Condiciones de la semana que superan su umbral.
                </p>
              </Section>
              <Section titulo="Sugerencias de revisión" className={s.apoyo}>
                <ul className={s.lista}>
                  {alerta.sugerencias.map((texto) => (
                    <li key={texto}>{sugerencia(texto)}</li>
                  ))}
                </ul>
              </Section>
            </div>

            <div className={s.fila}>
              <SeguimientoAlerta
                alertId={alertId}
                superada={superada}
                className={notifica ? s.principal : s.completa}
              />
              {notifica && (
                <Section titulo="Correo simulado" className={s.apoyo}>
                  <NotificacionAlerta
                    sinMarco
                    alerta={alerta}
                    destinatario={(id) =>
                      id === alerta.destinatarioId
                        ? (alerta.destinatario ?? "Responsable")
                        : "Destinatario anterior"
                    }
                    alCambiar={(intento) => setCambio(trasIntento(intento))}
                  />
                </Section>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
