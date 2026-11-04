"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import type { Alerta, PersonaDTO } from "@/shared/contracts";
import {
  FACTOR,
  decimal,
  entero,
  semana as textoSemana,
} from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import {
  GRUPO_MINIMO,
  conteoSemana,
  nivelVigente,
  racha,
  semanaDe,
  serieHasta,
} from "@/shared/semanas";
import {
  ButtonLink,
  Columns,
  DataTable,
  DistributionBar,
  Empty,
  ErrorBox,
  FilterBar,
  Figure,
  Notice,
  PageHeader,
  Section,
  SelectField,
  SkeletonRows,
  Stack,
  WeekColumns,
  WeekStrip,
  tabla,
} from "@/shared/ui";
import { BotonExportar } from "../exportaciones/boton-exportar";
import { useSesion } from "../shell/sesion";
import s from "./resumen.module.css";

type Datos = {
  personas: PersonaDTO[];
  semanas: string[];
  causas: Map<string, Alerta["causas"]>;
};

async function cargar(signal: AbortSignal): Promise<Datos> {
  const [personas, alertas] = await Promise.all([
    tableroApi.personas({}, signal),
    tableroApi.alertas({ pageSize: 100 }, signal),
  ]);
  return {
    personas: personas.items,
    semanas: personas.semanas,
    causas: new Map(alertas.items.map((a) => [a.employeeId, a.causas])),
  };
}

/** The first two causes in words; the rest as a count that wraps as one unit. */
function causas(lista: Alerta["causas"] | undefined) {
  if (!lista?.length) return "—";
  const nombres = lista.map((f) => FACTOR[f]);
  return nombres.length > 2
    ? `${nombres.slice(0, 2).join(", ")} y\u00a0${nombres.length - 2}\u00a0más`
    : nombres.join(" y ");
}

/** Answers one question per week: who carries sustained overload, and why. */
export function Resumen() {
  const { usuario } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const atencion = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(cargar, usuario ? "resumen" : null);
  const datos = useArrival(
    readyFor,
    atencion,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  const [elegida, setElegida] = useState<string>();
  const semana = elegida ?? datos?.semanas[0];
  const resumen = useConsulta(
    (signal) => tableroApi.resumen({ periodStart: semana }, signal),
    usuario && semana ? `resumen:${semana}` : null,
  );

  const vista = useMemo(() => {
    if (!datos || !semana) return null;
    const anterior = datos.semanas[datos.semanas.indexOf(semana) + 1];
    const enAlto = datos.personas
      .filter((p) => nivelVigente(semanaDe(p, semana)) === "ALTO")
      .map((p) => ({
        persona: p,
        racha: racha(p, semana),
        semana: semanaDe(p, semana)!,
      }))
      .sort(
        (a, b) =>
          b.racha - a.racha || (b.semana.indice ?? 0) - (a.semana.indice ?? 0),
      );
    const nuevas = enAlto.filter(
      (x) =>
        !anterior || nivelVigente(semanaDe(x.persona, anterior)) !== "ALTO",
    ).length;
    const cerca = enAlto.length
      ? []
      : datos.personas
          .filter((p) => nivelVigente(semanaDe(p, semana)) === "MEDIO")
          .sort(
            (a, b) =>
              (semanaDe(b, semana)!.indice ?? 0) -
              (semanaDe(a, semana)!.indice ?? 0),
          )
          .slice(0, 5);
    const grupos = new Map<string, PersonaDTO[]>();
    for (const p of datos.personas)
      grupos.set(p.teamId, [...(grupos.get(p.teamId) ?? []), p]);
    const equipos = [...grupos]
      .map(([teamId, miembros]) => ({
        teamId,
        nombre: miembros[0].equipo,
        miembros: miembros.length,
        conteo: conteoSemana(miembros, semana),
      }))
      .sort(
        (a, b) =>
          b.conteo.ALTO - a.conteo.ALTO || b.conteo.MEDIO - a.conteo.MEDIO,
      );
    const evolucion = [...datos.semanas].reverse().map((periodStart) => {
      const muestra = datos.personas
        .map((p) => semanaDe(p, periodStart))
        .find(Boolean)!;
      return {
        periodStart,
        periodEnd: muestra.periodEnd,
        conteo: conteoSemana(datos.personas, periodStart),
      };
    });
    return { enAlto, nuevas, cerca, equipos, evolucion };
  }, [datos, semana]);
  useRowsEnter(filas, vista?.enAlto);

  const periodo = vista?.evolucion.find((e) => e.periodStart === semana);
  const verEquipos = usuario?.rol === "RRHH" || usuario?.rol === "GERENCIA";

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Resumen"
        contexto={
          periodo
            ? `Semana ${textoSemana(periodo.periodStart, periodo.periodEnd)}, ${datos!.personas.length} personas`
            : "Seguimiento semanal de la carga de trabajo"
        }
        acciones={
          <>
            <BotonExportar tipo="equipos" filtros={{ periodStart: semana }} />
            {usuario?.rol === "RRHH" && (
              <ButtonLink variante="primary" href="/importaciones">
                Importar datos
              </ButtonLink>
            )}
          </>
        }
      />

      {/* Present while loading, so the blocks below do not move when the weeks arrive. */}
      {consulta.estado !== "error" && datos?.semanas.length !== 0 && (
        <FilterBar etiqueta="Filtros del resumen">
          <SelectField
            etiqueta="Semana"
            value={semana ?? ""}
            disabled={!datos}
            onChange={(e) => setElegida(e.target.value)}
          >
            {(datos?.semanas ?? []).map((w) => {
              const fin =
                vista?.evolucion.find((e) => e.periodStart === w)?.periodEnd ??
                w;
              return (
                <option key={w} value={w}>
                  {textoSemana(w, fin)}
                </option>
              );
            })}
          </SelectField>
        </FilterBar>
      )}

      {/* A failed read shows only its error; no block keeps announcing a load. */}
      {consulta.estado === "error" ? (
        <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
      ) : datos?.semanas.length === 0 ? (
        // No week loaded yet: there is no week to answer for, only the next step.
        <Section titulo="Necesitan atención">
          <Empty
            titulo="Todavía no hay semanas cargadas"
            accion={
              usuario?.rol === "RRHH" ? (
                <ButtonLink variante="primary" href="/importaciones">
                  Importar datos
                </ButtonLink>
              ) : undefined
            }
          >
            Las personas con carga alta sostenida aparecerán cuando RR. HH.
            importe la primera semana.
          </Empty>
        </Section>
      ) : (
        <>
          <Columns division="8-4">
            <Section
              titulo="Necesitan atención"
              aside={
                vista && vista.enAlto.length > 0 ? (
                  <span>
                    Alto: índice de 70 o más durante dos semanas consecutivas
                  </span>
                ) : undefined
              }
            >
              <div ref={atencion}>
                {!vista ? (
                  <SkeletonRows filas={5} />
                ) : vista.enAlto.length === 0 ? (
                  <Empty titulo="Ninguna persona en nivel Alto esta semana">
                    {vista.cerca.length
                      ? `Las personas más cerca del límite: ${vista.cerca.map((p) => p.nombre).join(", ")}.`
                      : undefined}
                  </Empty>
                ) : (
                  <DataTable etiqueta="Personas en nivel Alto">
                    <thead>
                      <tr>
                        <th scope="col">Persona</th>
                        <th scope="col">Últimas 8 semanas</th>
                        <th scope="col">Causas</th>
                        <th scope="col" className={tabla.num}>
                          Índice
                        </th>
                      </tr>
                    </thead>
                    <tbody ref={filas}>
                      {vista.enAlto.map(({ persona, racha: n, semana: w }) => (
                        <tr key={persona.employeeId}>
                          <th scope="row">
                            <Link
                              className={tabla.rowLink}
                              href={`/employees/${persona.employeeId}`}
                            >
                              {persona.nombre}
                            </Link>
                            <span className={tabla.sub}>{persona.equipo}</span>
                          </th>
                          <td>
                            <span className={s.strip}>
                              <WeekStrip
                                semanas={serieHasta(persona, semana!)}
                              />
                              <span className={s.streak}>
                                {n === 1 ? "1 semana" : `${n} semanas seguidas`}
                              </span>
                            </span>
                          </td>
                          <td className={s.causes}>
                            {causas(datos!.causas.get(persona.employeeId))}
                          </td>
                          <td className={tabla.num}>
                            {w.evaluationId ? (
                              <Link
                                className={tabla.cellLink}
                                href={`/reports/${w.evaluationId}`}
                              >
                                {decimal(w.indice)}
                              </Link>
                            ) : (
                              decimal(w.indice)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                )}
              </div>
            </Section>

            <Stack>
              <Section titulo="Indicadores de la semana">
                {!vista || !periodo ? (
                  <SkeletonRows filas={3} />
                ) : (
                  <div className={s.figures}>
                    <div className={s.figureRow}>
                      <Figure
                        etiqueta="En Alto"
                        valor={entero(vista.enAlto.length)}
                        tono={vista.enAlto.length ? "alto" : "neutro"}
                        detalle={`de ${entero(datos!.personas.length)} personas`}
                      />
                      <Figure
                        etiqueta="Nuevas en Alto"
                        valor={entero(vista.nuevas)}
                        detalle="respecto de la semana anterior"
                      />
                    </div>
                    <DistributionBar conteo={periodo.conteo} />
                    {resumen.estado === "listo" && (
                      <p className={s.note}>
                        Índice promedio {decimal(resumen.datos.promedioIndice)}{" "}
                        sobre {entero(resumen.datos.muestraPromedio)}{" "}
                        {resumen.datos.muestraPromedio === 1
                          ? "evaluación"
                          : "evaluaciones"}{" "}
                        (incluye nivel Incompleto).
                      </p>
                    )}
                    {resumen.estado === "listo" &&
                      resumen.datos.noProcesados > 0 && (
                        <Notice tono="aviso">
                          {entero(resumen.datos.noProcesados)} evaluaciones de
                          esta semana esperan cálculo y no se cuentan.
                        </Notice>
                      )}
                    {resumen.estado === "error" && (
                      <ErrorBox
                        mensaje={resumen.mensaje}
                        onRetry={resumen.reintentar}
                      />
                    )}
                  </div>
                )}
              </Section>

              {verEquipos && (
                <Section titulo="Por equipo">
                  {!vista ? (
                    <SkeletonRows filas={4} />
                  ) : (
                    <ul className={s.teamList}>
                      {vista.equipos.map((e) => (
                        <li key={e.teamId}>
                          <div className={s.teamHead}>
                            <Link
                              href={`/teams/${e.teamId}`}
                              className={tabla.rowLink}
                            >
                              {e.nombre}
                            </Link>
                            <span className="num">
                              {e.conteo.ALTO
                                ? `${e.conteo.ALTO} en Alto`
                                : "Ninguna en Alto"}
                            </span>
                          </div>
                          {e.miembros < GRUPO_MINIMO ? (
                            <p className={s.note}>
                              No se muestra: el equipo tiene menos de{" "}
                              {GRUPO_MINIMO} personas.
                            </p>
                          ) : (
                            <DistributionBar
                              conteo={e.conteo}
                              leyenda={false}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}
            </Stack>
          </Columns>

          <Section
            titulo="Evolución"
            aside={
              vista ? (
                <span>Personas por nivel, semana a semana</span>
              ) : undefined
            }
          >
            {!vista ? (
              <SkeletonRows filas={4} />
            ) : (
              <WeekColumns semanas={vista.evolucion} actual={semana} />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
