"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import type { Nivel, PersonaDTO } from "@/shared/contracts";
import {
  NIVEL,
  decimal,
  diaCorto,
  entero,
  semana as textoSemana,
} from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import { GRUPO_MINIMO, conteoSemana, semanaDe } from "@/shared/semanas";
import {
  DataTable,
  DistributionBar,
  Empty,
  ErrorBox,
  PageHeader,
  Section,
  SkeletonRows,
  tabla,
} from "@/shared/ui";
import {
  SelectorSemana,
  periodos,
  type Periodo,
} from "../personas/selector-semana";
import { useSesion } from "../shell/sesion";
import s from "./equipos.module.css";

type Datos = { personas: PersonaDTO[]; semanas: string[] };

async function cargar(signal: AbortSignal): Promise<Datos> {
  const respuesta = await tableroApi.personas({}, signal);
  return { personas: respuesta.items, semanas: respuesta.semanas };
}

const NIVELES: Nivel[] = ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"];

/** The team's lead; failing that, whom most of its members report to. */
function responsableDe(miembros: PersonaDTO[]) {
  const lider = miembros.find((m) => m.tipo === "TEAM_LEAD");
  if (lider) return lider.nombre;
  const votos = new Map<string, number>();
  for (const m of miembros)
    if (m.responsable) votos.set(m.responsable, (votos.get(m.responsable) ?? 0) + 1);
  return [...votos].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

type PuntoAlto = Periodo & { alto: number };

/** People in Alto per week, oldest → newest; the chosen week stands out. */
function TendenciaAlto({
  puntos,
  maximo,
  actual,
}: {
  puntos: PuntoAlto[];
  maximo: number;
  actual: string;
}) {
  return (
    <span
      className={s.trend}
      role="img"
      aria-label={`En Alto por semana: ${puntos
        .map((p) => `${diaCorto(p.periodStart)}, ${p.alto}`)
        .join("; ")}.`}
    >
      {puntos.map((p) => (
        <span
          key={p.periodStart}
          className={s.trendWeek}
          data-actual={p.periodStart === actual || undefined}
          title={`${textoSemana(p.periodStart, p.periodEnd)}: ${p.alto} en Alto`}
        >
          {p.alto > 0 && (
            <span
              className={s.trendBar}
              style={{ height: `${(p.alto / maximo) * 100}%` }}
            />
          )}
        </span>
      ))}
    </span>
  );
}

/** Answers "¿Qué célula concentra la carga?": teams by people in Alto. */
export function Equipos() {
  const { usuario } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(cargar, usuario ? "equipos" : null);
  const datos = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  const [elegida, setElegida] = useState<string>();
  const semana = elegida ?? datos?.semanas[0];
  const opciones = useMemo(
    () => (datos ? periodos(datos.personas, datos.semanas) : []),
    [datos],
  );

  const vista = useMemo(() => {
    if (!datos || !semana) return null;
    const cronologia = [...opciones].reverse();
    const grupos = new Map<string, PersonaDTO[]>();
    for (const p of datos.personas)
      grupos.set(p.teamId, [...(grupos.get(p.teamId) ?? []), p]);
    const equipos = [...grupos]
      .map(([teamId, miembros]) => {
        // Descriptive only: the mean of this week's current indices.
        const indices = miembros
          .map((m) => semanaDe(m, semana))
          .flatMap((w) => (w?.actualizado && w.indice !== null ? [w.indice] : []));
        return {
          teamId,
          nombre: miembros[0].equipo,
          responsable: responsableDe(miembros),
          miembros: miembros.length,
          visible: miembros.length >= GRUPO_MINIMO,
          conteo: conteoSemana(miembros, semana),
          promedio: indices.length
            ? indices.reduce((suma, i) => suma + i, 0) / indices.length
            : null,
          evaluadas: indices.length,
          tendencia: cronologia.map((p) => ({
            ...p,
            alto: conteoSemana(miembros, p.periodStart).ALTO,
          })),
        };
      })
      // Small groups go last and in name order, so their mix cannot be inferred.
      .sort(
        (a, b) =>
          Number(b.visible) - Number(a.visible) ||
          (a.visible
            ? b.conteo.ALTO - a.conteo.ALTO || b.conteo.MEDIO - a.conteo.MEDIO
            : 0) ||
          a.nombre.localeCompare(b.nombre, "es", { numeric: true }),
      );
    const maximo = Math.max(
      1,
      ...equipos
        .filter((e) => e.visible)
        .flatMap((e) => e.tendencia.map((t) => t.alto)),
    );
    return {
      equipos,
      maximo,
      periodo: opciones.find((o) => o.periodStart === semana),
    };
  }, [datos, semana, opciones]);
  useRowsEnter(filas, vista?.equipos);

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Equipos"
        contexto={
          vista?.periodo
            ? `Semana ${textoSemana(vista.periodo.periodStart, vista.periodo.periodEnd)}, ${entero(vista.equipos.length)} equipos, ${entero(datos!.personas.length)} personas`
            : "Dónde se concentra la carga de trabajo"
        }
        acciones={
          datos && semana && opciones.length > 0 ? (
            <SelectorSemana
              opciones={opciones}
              valor={semana}
              onCambio={setElegida}
            />
          ) : undefined
        }
      />

      <Section
        titulo="Equipos por personas en Alto"
        aside={
          vista && vista.equipos.length > 0 ? (
            <ul className={s.legend} aria-label="Referencia de niveles">
              {NIVELES.map((n) => (
                <li key={n} className={s.key} data-nivel={n}>
                  {NIVEL[n]}
                </li>
              ))}
            </ul>
          ) : undefined
        }
      >
        <div ref={caja}>
          {consulta.estado === "error" ? (
            <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
          ) : !datos ? (
            <SkeletonRows filas={4} />
          ) : !vista || vista.equipos.length === 0 ? (
            // No week loaded yet (no week to show) or nobody in scope.
            <Empty titulo="Todavía no hay semanas cargadas">
              Cuando RRHH importe la primera semana, acá vas a ver cada equipo.
            </Empty>
          ) : (
            <div className={s.teams}>
              <DataTable etiqueta="Equipos por personas en Alto">
                <thead>
                  <tr>
                    <th scope="col">Equipo</th>
                    <th scope="col" className={tabla.num}>
                      Personas
                    </th>
                    <th scope="col">Niveles</th>
                    <th scope="col">En Alto</th>
                    <th scope="col" className={`${tabla.num} ${s.wrap}`}>
                      Índice promedio
                    </th>
                  </tr>
                </thead>
                <tbody ref={filas}>
                  {vista.equipos.map((e) => (
                    <tr key={e.teamId}>
                      <th scope="row">
                        {e.nombre}
                        <span className={tabla.sub}>
                          {e.responsable
                            ? `Responsable: ${e.responsable}`
                            : "Sin responsable asignado"}
                        </span>
                      </th>
                      <td className={tabla.num}>
                        {entero(e.miembros)}
                        <Link
                          className={s.link}
                          href={`/employees?equipo=${e.teamId}`}
                        >
                          Ver personas
                          <span className="sr-only"> de {e.nombre}</span>
                        </Link>
                      </td>
                      {e.visible ? (
                        <>
                          <td className={s.mix}>
                            <DistributionBar conteo={e.conteo} leyenda={false} />
                            <span className={s.mixText} aria-hidden="true">
                              {NIVELES.filter((n) => e.conteo[n])
                                .map((n) => `${entero(e.conteo[n])} ${NIVEL[n]}`)
                                .join(", ") || "Sin evaluaciones vigentes"}
                            </span>
                          </td>
                          <td>
                            <span className={s.alto}>
                              <strong
                                className="num"
                                data-cero={e.conteo.ALTO === 0 || undefined}
                              >
                                {entero(e.conteo.ALTO)}
                              </strong>
                              <TendenciaAlto
                                puntos={e.tendencia}
                                maximo={vista.maximo}
                                actual={semana!}
                              />
                            </span>
                          </td>
                          <td className={tabla.num}>
                            {decimal(e.promedio)}
                            {e.evaluadas < e.miembros && (
                              <span className={tabla.sub}>
                                {`en ${entero(e.evaluadas)} de ${entero(e.miembros)}`}
                              </span>
                            )}
                          </td>
                        </>
                      ) : (
                        <td colSpan={3} className={tabla.muted}>
                          Grupo demasiado chico para mostrar.
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
