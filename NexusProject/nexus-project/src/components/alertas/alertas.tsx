"use client";
import Link from "next/link";
import { Fragment, useMemo, useRef, useState } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import type { Alerta, PersonaDTO, SemanaPersona } from "@/shared/contracts";
import { entero, semana as textoSemana } from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import { serieHasta } from "@/shared/semanas";
import {
  Button,
  ButtonLink,
  DataTable,
  Empty,
  ErrorBox,
  Icon,
  Notice,
  PageHeader,
  Section,
  SkeletonRows,
  WeekStrip,
  tabla,
} from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import { NotificacionAlerta } from "../notificacion-alerta";
import { useSesion } from "../shell/sesion";
import {
  causasEnPalabras,
  envio,
  nombreDestinatario,
  sinDestinatario,
  sugerencia,
  trasIntento,
} from "./aviso";
import s from "./alertas.module.css";

type Datos = { alertas: Alerta[]; total: number; personas: PersonaDTO[] };

async function cargar(signal: AbortSignal): Promise<Datos> {
  const [alertas, personas] = await Promise.all([
    tableroApi.alertas({ pageSize: 100 }, signal),
    tableroApi.personas({}, signal),
  ]);
  return {
    alertas: alertas.items,
    total: alertas.total,
    personas: personas.items,
  };
}

type Fila = { alerta: Alerta; persona?: PersonaDTO; semana?: SemanaPersona };

const plural = (n: number, uno: string, varios: string) =>
  `${entero(n)} ${n === 1 ? uno : varios}`;

/** Answers which workload alerts wait for review and whom they reached. */
export function Alertas() {
  const { usuario } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(cargar, usuario ? "alertas" : null);
  const datos = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  const [cambios, setCambios] = useState<Record<string, Partial<Alerta>>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const notifica = usuario?.rol === "RRHH";

  const filas = useMemo<Fila[] | null>(() => {
    if (!datos) return null;
    const personas = new Map(datos.personas.map((p) => [p.employeeId, p]));
    return datos.alertas
      .map((alerta) => {
        const persona = personas.get(alerta.employeeId);
        const semana = persona?.semanas.find(
          (w) =>
            w.alertId === alerta.alertId ||
            w.evaluationId === alerta.evaluationId,
        );
        return { alerta, persona, semana };
      })
      .sort(
        (a, b) =>
          (b.semana?.periodStart ?? "").localeCompare(
            a.semana?.periodStart ?? "",
          ) || b.alerta.createdAt.localeCompare(a.alerta.createdAt),
      );
  }, [datos]);
  useRowsEnter(cuerpo, datos?.alertas);

  const personasConAlerta = filas
    ? new Set(filas.map((f) => f.alerta.employeeId)).size
    : 0;
  const incidencias = filas
    ? filas.filter((f) => sinDestinatario({ ...f.alerta, ...cambios[f.alerta.alertId] })).length
    : 0;

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Alertas"
        contexto={
          filas
            ? filas.length
              ? `${plural(filas.length, "alerta activa", "alertas activas")} de ${plural(personasConAlerta, "persona", "personas")}`
              : "Sin alertas activas"
            : "Condiciones de carga que esperan revisión"
        }
      />

      <Section
        titulo="Esperan revisión"
        aside={
          filas?.length ? <span>La semana más reciente primero</span> : undefined
        }
      >
        <div ref={caja} className={s.box}>
          {consulta.estado === "error" ? (
            <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
          ) : !filas || !datos ? (
            <SkeletonRows filas={6} />
          ) : filas.length === 0 ? (
            <Empty titulo="No hay alertas esperando revisión">
              Cuando alguien sostenga una carga alta dos semanas seguidas, su
              alerta va a aparecer acá.
            </Empty>
          ) : (
            <>
              {incidencias > 0 && (
                <Notice tono="aviso">
                  {incidencias === 1
                    ? "1 alerta no tiene"
                    : `${entero(incidencias)} alertas no tienen`}{" "}
                  a quién avisar: falta el responsable en el catálogo.
                </Notice>
              )}
              {datos.total > datos.alertas.length && (
                <p className={s.note}>
                  Se muestran las {entero(datos.alertas.length)} más recientes
                  de {entero(datos.total)}.
                </p>
              )}
              <DataTable etiqueta="Alertas activas">
                <thead>
                  <tr>
                    <th scope="col">Persona</th>
                    <th scope="col">Semana</th>
                    <th scope="col">Causas</th>
                    <th scope="col">Destinatario</th>
                  </tr>
                </thead>
                <tbody ref={cuerpo} className={s.rows}>
                  {filas.map(({ alerta: base, persona, semana }) => {
                    const alerta = { ...base, ...cambios[base.alertId] };
                    const abiertaEsta = abierta === base.alertId;
                    const detalleId = `alerta-${base.alertId}`;
                    const estado = envio(alerta);
                    // An internal-only notice is the common case: plain text, no tag.
                    const lineaEnvio =
                      alerta.estadoEnvio === "SIN_DESTINATARIO" ? null : estado.tono ===
                        "neutro" ? (
                        <span className={tabla.sub}>{estado.texto}</span>
                      ) : (
                        <StatusTag tono={estado.tono}>{estado.texto}</StatusTag>
                      );
                    return (
                      <Fragment key={base.alertId}>
                        <tr data-abierta={abiertaEsta || undefined}>
                          <th scope="row">
                            {persona ? (
                              <>
                                <Link
                                  className={tabla.rowLink}
                                  href={`/employees/${persona.employeeId}`}
                                >
                                  {persona.nombre}
                                </Link>
                                <span className={tabla.sub}>
                                  {persona.equipo}
                                </span>
                              </>
                            ) : (
                              "Persona sin datos cargados"
                            )}
                          </th>
                          <td>
                            {persona && semana ? (
                              <span className={s.week}>
                                {textoSemana(
                                  semana.periodStart,
                                  semana.periodEnd,
                                )}
                                <WeekStrip
                                  semanas={serieHasta(
                                    persona,
                                    semana.periodStart,
                                  )}
                                />
                                {!semana.actualizado && (
                                  <span className={s.stale}>
                                    Resultado desactualizado
                                  </span>
                                )}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className={s.causes}>
                            {causasEnPalabras(alerta.causas)}
                            {/* The way into the why: the week's report, or what to review. */}
                            <span className={s.actions}>
                              <ButtonLink
                                variante="quiet"
                                href={`/reports/${alerta.evaluationId}`}
                              >
                                Ver informe
                              </ButtonLink>
                              <Button
                                variante="quiet"
                                className={s.toggle}
                                aria-expanded={abiertaEsta}
                                aria-controls={abiertaEsta ? detalleId : undefined}
                                onClick={() =>
                                  setAbierta(abiertaEsta ? null : base.alertId)
                                }
                              >
                                {notifica ? "Sugerencias y correo" : "Sugerencias"}
                                <Icon nombre="abrir" size={14} />
                              </Button>
                            </span>
                          </td>
                          <td>
                            <span className={s.recipient}>
                              {sinDestinatario(alerta) ? (
                                <StatusTag tono="incidencia">
                                  Sin destinatario
                                </StatusTag>
                              ) : (
                                <span>
                                  {nombreDestinatario(
                                    alerta.destinatarioId!,
                                    datos.personas,
                                    usuario?.employeeId,
                                  )}
                                </span>
                              )}
                              {lineaEnvio}
                            </span>
                          </td>
                        </tr>
                        {abiertaEsta && (
                          <tr id={detalleId} className={s.detailRow}>
                            <td colSpan={4}>
                              <div
                                className={s.detail}
                                data-con-correo={notifica || undefined}
                              >
                                <div>
                                  <h3 className={s.detailTitle}>
                                    Para revisar con la persona
                                  </h3>
                                  <ul className={s.suggestions}>
                                    {alerta.sugerencias.map((texto) => (
                                      <li key={texto}>{sugerencia(texto)}</li>
                                    ))}
                                  </ul>
                                </div>
                                {notifica && (
                                  <NotificacionAlerta
                                    alerta={alerta}
                                    destinatario={(id) =>
                                      nombreDestinatario(id, datos.personas)
                                    }
                                    alCambiar={(intento) =>
                                      setCambios((previos) => ({
                                        ...previos,
                                        [intento.alertId]: trasIntento(intento),
                                      }))
                                    }
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </DataTable>
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
