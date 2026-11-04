"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import type { Alerta, Nivel, PersonaDTO } from "@/shared/contracts";
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
  TrendLine,
  WeekStrip,
  tabla,
  Tip,
} from "@/shared/ui";
import { DEFINICION } from "../definiciones";
import { BotonExportar } from "../exportaciones/boton-exportar";
import { useSesion } from "../shell/sesion";
import s from "./resumen.module.css";

/** People with a level in a week (Incompleto has none yet). */
const conNivel = (c: Record<Nivel, number>) => c.BAJO + c.MEDIO + c.ALTO;

/** The finding first: the chosen week's people in Alto against the week before. */
function hallazgoAlto(
  evolucion: { periodStart: string; periodEnd: string; conteo: Record<Nivel, number> }[],
  semana: string | undefined,
) {
  const i = evolucion.findIndex((e) => e.periodStart === semana);
  const actual = evolucion[i];
  if (!actual) return "";
  const n = actual.conteo.ALTO;
  const enAlto = `${entero(n)} ${n === 1 ? "persona" : "personas"} en Alto`;
  const previa = evolucion[i - 1];
  const fecha = textoSemana(actual.periodStart, actual.periodEnd);
  if (!previa || !conNivel(previa.conteo)) return `${fecha}: ${enAlto}.`;
  const d = n - previa.conteo.ALTO;
  const cambio =
    d === 0
      ? "igual que la semana anterior"
      : `${entero(Math.abs(d))} ${d > 0 ? "más" : "menos"} que la semana anterior`;
  return `${fecha}: ${enAlto}, ${cambio}.`;
}

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
/** «en 9 personas; 3 más que la semana anterior»: who carries them and the change. */
function detalleVencidas(v: { total: number; personas: number; anterior: number | null }) {
  const quienes = v.total ? `en ${entero(v.personas)} ${v.personas === 1 ? "persona" : "personas"}` : "al cierre de la semana";
  if (v.anterior === null) return quienes;
  const d = v.total - v.anterior;
  const cambio =
    d === 0 ? "igual que la semana anterior" : `${entero(Math.abs(d))} ${d > 0 ? "más" : "menos"} que la semana anterior`;
  return `${quienes}; ${cambio}`;
}

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
    // Counts only (no task rows): what is overdue at the week's close across the people in scope.
    const vencidasEn = (periodStart: string | undefined) => {
      let total = 0;
      let personas = 0;
      if (periodStart)
        for (const p of datos.personas) {
          const n = semanaDe(p, periodStart)?.tareasVencidas ?? 0;
          total += n;
          if (n) personas++;
        }
      return { total, personas };
    };
    const vencidas = { ...vencidasEn(semana), anterior: anterior ? vencidasEn(anterior).total : null };
    return { enAlto, nuevas, cerca, equipos, evolucion, vencidas };
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
                        <th scope="col" className={tabla.centro}>
                          Últimas 8 semanas
                        </th>
                        <th scope="col">Causas</th>
                        <th scope="col" className={tabla.num}>
                          <Tip contenido={DEFINICION.indice}>Índice</Tip>
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
                          <td className={tabla.centro}>
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
                        etiqueta={<Tip contenido={DEFINICION.nuevasEnAlto}>Nuevas en Alto</Tip>}
                        valor={entero(vista.nuevas)}
                        detalle="respecto de la semana anterior"
                      />
                      <Figure
                        etiqueta={<Tip contenido={DEFINICION.tareasVencidas}>Tareas vencidas</Tip>}
                        valor={entero(vista.vencidas.total)}
                        detalle={detalleVencidas(vista.vencidas)}
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
                        <li key={e.teamId} className={s.teamRow}>
                          <Link href={`/teams/${e.teamId}`} className={tabla.rowLink}>
                            {e.nombre}
                          </Link>
                          {e.miembros < GRUPO_MINIMO ? (
                            <span className={s.note}>
                              No se muestra: el equipo tiene menos de {GRUPO_MINIMO} personas.
                            </span>
                          ) : (
                            <span className="num" data-alto={e.conteo.ALTO > 0 || undefined}>
                              {e.conteo.ALTO
                                ? `${entero(e.conteo.ALTO)} en Alto de ${entero(e.miembros)}`
                                : `Ninguna en Alto de ${entero(e.miembros)}`}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}
            </Stack>
          </Columns>

          <Section titulo="En Alto por semana">
            {!vista ? (
              <SkeletonRows filas={4} />
            ) : (
              <div className={s.trend}>
                <p className={s.hallazgo}>{hallazgoAlto(vista.evolucion, semana)}</p>
                <TrendLine
                  nombre="Personas en Alto por semana"
                  etiqueta="personas en Alto"
                  tono="alto"
                  enteros
                  puntos={vista.evolucion.map((e) => ({
                    periodStart: e.periodStart,
                    periodEnd: e.periodEnd,
                    valor: conNivel(e.conteo) ? e.conteo.ALTO : null,
                  }))}
                  actual={semana}
                  formato={entero}
                  nota={(i) => {
                    const c = vista.evolucion[i].conteo;
                    return conNivel(c)
                      ? `De ${entero(conNivel(c))} con nivel; ${entero(c.MEDIO)} en Medio, ${entero(c.BAJO)} en Bajo.`
                      : "Ninguna persona tiene nivel esta semana: falta la semana anterior.";
                  }}
                />
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
