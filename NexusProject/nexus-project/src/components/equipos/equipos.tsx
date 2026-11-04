"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useConsulta } from "@/client/use-consulta";
import type { Nivel } from "@/shared/contracts";
import type {
  EquipoFilaDTO,
  EquiposDTO,
  EstadoEquipo,
} from "@/shared/contratos/organizacion";
import {
  NIVEL,
  decimal,
  diaCorto,
  entero,
  semana as textoSemana,
} from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import { tienePermiso } from "@/shared/permisos";
import {
  ButtonLink,
  DataTable,
  DistributionBar,
  Empty,
  ErrorBox,
  LevelMark,
  PageHeader,
  Section,
  SelectField,
  SkeletonRows,
  Toolbar,
  tabla,
} from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import { organizacionApi } from "../organizacion/api";
import { SelectorSemanas, finDeSemana } from "../organizacion/piezas";
import { contar } from "../organizacion/textos";
import { useSesion } from "../shell/sesion";
import s from "./equipos.module.css";

const NIVELES: Nivel[] = ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"];

/** People in Alto per week, oldest → newest; the chosen week stands out. */
export function TendenciaAlto({
  puntos,
  maximo,
  actual,
}: {
  puntos: { periodStart: string; alto: number }[];
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
          title={`${textoSemana(p.periodStart, finDeSemana(p.periodStart))}: ${p.alto} en Alto`}
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

/** Why a team shows no aggregates: it is too small, or hiding it protects a smaller one. */
export const MOTIVO_SUPRESION: Record<NonNullable<EquipoFilaDTO["suprimido"]>, string> = {
  GRUPO_PEQUENO: "Grupo demasiado pequeño para mostrar.",
  COMPLEMENTARIA: "Oculto para proteger a un grupo más pequeño.",
};

/** Answers "¿Qué equipo concentra la carga?": teams by people in Alto. */
export function Equipos() {
  const { usuario } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const [elegida, setElegida] = useState<string>();
  const [estado, setEstado] = useState<EstadoEquipo>("ACTIVOS");
  const consulta = useConsulta(
    (signal) => organizacionApi.equipos({ periodStart: elegida, estado }, signal),
    usuario ? JSON.stringify(["equipos", elegida, estado]) : null,
  );
  const [ultimo, setUltimo] = useState<EquiposDTO | null>(null);
  if (consulta.estado === "listo" && consulta.datos !== ultimo) setUltimo(consulta.datos);
  const datos = useArrival(readyFor, caja, ultimo);
  useRowsEnter(filas, datos ? `${datos.periodStart}|${estado}` : undefined);

  const puedeAdministrar = !!usuario && tienePermiso(usuario.rol, "ADMINISTRAR_PERSONAS");
  const semana = datos?.periodStart ?? undefined;
  const maximo = Math.max(
    1,
    ...(datos?.items.flatMap((e) => e.tendenciaAlto?.map((t) => t.alto) ?? []) ?? []),
  );
  const activos = estado === "ACTIVOS";

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Equipos"
        contexto={
          datos
            ? `${semana ? `Semana ${textoSemana(semana, finDeSemana(semana))}, ` : ""}${contar(datos.items.length, activos ? "equipo" : "equipo de baja", activos ? "equipos" : "equipos de baja")}`
            : "Dónde se concentra la carga de trabajo"
        }
        acciones={
          puedeAdministrar ? (
            <ButtonLink variante="primary" href="/teams/new">
              Nuevo equipo
            </ButtonLink>
          ) : undefined
        }
      />

      <Section
        titulo={activos ? "Equipos por personas en Alto" : "Equipos de baja"}
        aside={
          activos && datos && datos.items.length > 0 ? (
            <ul className={s.legend} aria-label="Referencia de niveles">
              {NIVELES.map((n) => (
                <li key={n} className={s.key}>
                  <LevelMark nivel={n} />
                  {NIVEL[n]}
                </li>
              ))}
            </ul>
          ) : undefined
        }
      >
        <Toolbar>
          {datos && semana && datos.semanas.length > 0 && activos && (
            <SelectorSemanas semanas={datos.semanas} valor={semana} onCambio={setElegida} />
          )}
          <SelectField
            etiqueta="Estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoEquipo)}
          >
            <option value="ACTIVOS">Activos</option>
            <option value="INACTIVOS">De baja</option>
          </SelectField>
        </Toolbar>
        <div ref={caja}>
          {consulta.estado === "error" ? (
            <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
          ) : !datos ? (
            <SkeletonRows filas={4} />
          ) : datos.items.length === 0 ? (
            <Empty
              titulo={activos ? "Todavía no hay equipos" : "No hay equipos de baja"}
              accion={
                activos && puedeAdministrar ? (
                  <ButtonLink variante="primary" href="/teams/new">
                    Nuevo equipo
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : (
            <div className={s.teams}>
              <DataTable etiqueta={activos ? "Equipos por personas en Alto" : "Equipos de baja"}>
                <thead>
                  <tr>
                    <th scope="col">Equipo</th>
                    <th scope="col" className={tabla.num}>
                      Personas
                    </th>
                    {activos ? (
                      <>
                        <th scope="col">Niveles</th>
                        <th scope="col">En Alto</th>
                        <th scope="col" className={`${tabla.num} ${s.wrap}`}>
                          Índice promedio
                        </th>
                      </>
                    ) : (
                      <th scope="col" className={tabla.centro}>
                        Estado
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody ref={filas}>
                  {datos.items.map((e) => (
                    <tr key={e.teamId}>
                      <th scope="row">
                        <Link className={tabla.rowLink} href={`/teams/${encodeURIComponent(e.teamId)}`}>
                          {e.nombre}
                        </Link>
                        <span className={tabla.sub}>
                          {e.lider ? `Líder: ${e.lider.nombre}` : "Sin líder asignado"}
                        </span>
                      </th>
                      <td className={tabla.num}>
                        {entero(e.personasActivas)}
                        <Link className={s.link} href={`/employees?equipo=${encodeURIComponent(e.teamId)}`}>
                          Ver personas
                          <span className="sr-only"> de {e.nombre}</span>
                        </Link>
                      </td>
                      {!activos ? (
                        <td className={tabla.centro}>
                          <StatusTag>De baja</StatusTag>
                        </td>
                      ) : e.suprimido || !e.conteo ? (
                        <td colSpan={3} className={tabla.muted}>
                          {e.suprimido ? MOTIVO_SUPRESION[e.suprimido] : "Sin semanas cargadas."}
                        </td>
                      ) : (
                        <>
                          <td className={s.mix}>
                            <DistributionBar conteo={e.conteo} leyenda={false} />
                            <span className={s.mixText} aria-hidden="true">
                              {NIVELES.filter((n) => e.conteo![n])
                                .map((n) => `${entero(e.conteo![n])} ${NIVEL[n]}`)
                                .join(", ") || "Sin evaluaciones vigentes"}
                            </span>
                          </td>
                          <td>
                            <span className={s.alto}>
                              <strong className="num" data-cero={e.conteo.ALTO === 0 || undefined}>
                                {entero(e.conteo.ALTO)}
                              </strong>
                              {e.tendenciaAlto && semana && (
                                <TendenciaAlto puntos={e.tendenciaAlto} maximo={maximo} actual={semana} />
                              )}
                            </span>
                          </td>
                          <td className={tabla.num}>
                            {decimal(e.promedioIndice)}
                            {e.evaluadas !== null && e.evaluadas < e.personasEvaluables && (
                              <span className={tabla.sub}>
                                {`en ${entero(e.evaluadas)} de ${entero(e.personasEvaluables)}`}
                              </span>
                            )}
                          </td>
                        </>
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
