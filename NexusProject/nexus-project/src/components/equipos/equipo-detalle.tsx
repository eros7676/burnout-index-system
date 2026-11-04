"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useConsulta } from "@/client/use-consulta";
import type { DirectorioPersonasDTO, EquipoDTO } from "@/shared/contratos/organizacion";
import { decimal, entero, semana as textoSemana } from "@/shared/formato";
import { useArrival, usePageEnter } from "@/shared/motion";
import { tienePermiso } from "@/shared/permisos";
import {
  ButtonLink,
  DataTable,
  DistributionBar,
  Empty,
  ErrorBox,
  Figure,
  KeyFacts,
  LevelTag,
  Notice,
  PageHeader,
  Section,
  SkeletonRows,
  Toolbar,
  tabla,
  Tip,
} from "@/shared/ui";
import { DEFINICION, DEFINICION_FACTOR } from "../definiciones";
import { Pagination } from "@/shared/ui/pagination";
import { StatusTag } from "@/shared/ui/status-tag";
import { TextoTareas } from "@/shared/ui/tareas";
import { ANCLA_TAREAS_EQUIPO, PARAM_TAREAS_EQUIPO, TareasEquipo } from "../tareas";
import { hrefTareasSemana } from "../tareas/textos";
import { organizacionApi } from "../organizacion/api";
import { SelectorSemanas, finDeSemana } from "../organizacion/piezas";
import { rutaHistorial, rutaMiEquipo } from "../organizacion/rutas";
import { PUESTO, contar } from "../organizacion/textos";
import { useSesion } from "../shell/sesion";
import { MOTIVO_SUPRESION, TendenciaAlto } from "./equipos";
import s from "./equipos.module.css";

const TAMANO_PAGINA = 50;

/** The team's own page: who leads it, how the week looks, and its members, one page at a time. */
export function EquipoDetalle({ teamId }: { teamId: string }) {
  const { usuario } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const [elegida, setElegida] = useState<string>();
  const [numero, setNumero] = useState(1);

  const consulta = useConsulta(
    (signal) => organizacionApi.equipo(teamId, signal, elegida),
    usuario ? `equipo:${teamId}:${elegida}` : null,
  );
  const integrantes = useConsulta(
    (signal) =>
      organizacionApi.directorio(
        { teamId, periodStart: elegida, orden: "indice", page: numero, pageSize: TAMANO_PAGINA },
        signal,
      ),
    usuario ? JSON.stringify(["integrantes", teamId, elegida, numero]) : null,
  );
  const [ultimos, setUltimos] = useState<DirectorioPersonasDTO | null>(null);
  if (integrantes.estado === "listo" && integrantes.datos !== ultimos)
    setUltimos(integrantes.datos);
  const equipo: EquipoDTO | null = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );

  const puedeAdministrar = !!usuario && tienePermiso(usuario.rol, "ADMINISTRAR_PERSONAS");
  const historial = usuario ? rutaHistorial(usuario.rol, { equipoId: teamId }) : null;
  const base = `/teams/${encodeURIComponent(teamId)}`;
  // For a Team Lead this page is «Mi equipo», a top-level screen of the sidebar: no way back, like
  // every other top-level screen. Everyone else came from the list.
  const miEquipo = usuario ? rutaMiEquipo(usuario.rol, usuario.teamId) : null;
  const volver = miEquipo ? undefined : { href: "/teams", texto: "Equipos" };
  const semana = equipo?.periodStart ?? undefined;
  // Gerencia reads a technician's counts, not their task rows (the server decides; this hides the way in).
  const verTareasDe = (tipo: string) => !(usuario?.rol === "GERENCIA" && tipo === "TECNICO");
  // Gerencia's team list holds only the Team Leads' rows, so the team's overdue count is not its length.
  const vencidasCompletas = usuario?.rol !== "GERENCIA";

  if (consulta.estado === "error" && !equipo)
    return (
      <div ref={pagina} className={s.page}>
        <PageHeader titulo="No se pudo abrir el equipo" volver={volver} />
        <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
      </div>
    );

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        volver={volver}
        titulo={equipo ? equipo.nombre : "Equipo"}
        contexto={
          equipo
            ? equipo.activo
              ? `${contar(equipo.personasActivas, "persona activa", "personas activas")}${semana ? `, semana ${textoSemana(semana, finDeSemana(semana))}` : ""}`
              : "Equipo de baja"
            : undefined
        }
        acciones={
          equipo && (puedeAdministrar || historial) ? (
            <div className={s.acciones}>
              {historial && <ButtonLink href={historial}>Ver historial</ButtonLink>}
              {puedeAdministrar && equipo.activo && (
                <>
                  <ButtonLink href={`${base}/edit`}>Editar equipo</ButtonLink>
                  <ButtonLink href={`${base}/lead`}>Cambiar líder</ButtonLink>
                  <ButtonLink variante="dangerSecondary" href={`${base}/deactivate`}>
                    Dar de baja
                  </ButtonLink>
                </>
              )}
            </div>
          ) : undefined
        }
      />

      {equipo && (
        <KeyFacts
          items={[
            {
              termino: "Líder",
              valor: equipo.lider ? (
                <Link className={s.link} href={`/employees/${encodeURIComponent(equipo.lider.employeeId)}`}>
                  {equipo.lider.nombre}
                </Link>
              ) : (
                "Sin líder asignado"
              ),
            },
            { termino: "Gerencia responsable", valor: equipo.gerente?.nombre ?? "Sin asignar" },
            { termino: "Personas activas", valor: entero(equipo.personasActivas) },
            {
              termino: "Personas con alerta activa",
              valor:
                equipo.alertasActivas === null ? (
                  "No disponible"
                ) : equipo.alertasActivas > 0 ? (
                  <Link className={s.link} href={`/alerts?equipo=${encodeURIComponent(teamId)}`}>
                    {entero(equipo.alertasActivas)}
                    <span className="sr-only"> (ver las alertas del equipo)</span>
                  </Link>
                ) : (
                  entero(0)
                ),
            },
            {
              termino: "Estado",
              valor: equipo.activo ? (
                <StatusTag tono="exito">Activo</StatusTag>
              ) : (
                <StatusTag>De baja</StatusTag>
              ),
            },
          ]}
        />
      )}

      {equipo?.activo !== false && (
        <Section titulo="Estado de la semana">
          {equipo && equipo.semanas.length > 0 && semana && (
            <Toolbar>
              <SelectorSemanas
                semanas={equipo.semanas}
                valor={semana}
                onCambio={(v) => {
                  setElegida(v);
                  setNumero(1);
                }}
              />
            </Toolbar>
          )}
          <div ref={caja}>
            {!equipo ? (
              <SkeletonRows filas={3} />
            ) : equipo.suprimido ? (
              <Notice>
                {MOTIVO_SUPRESION[equipo.suprimido]} Los datos de cada persona están en la lista
                de integrantes.
              </Notice>
            ) : !equipo.conteo || !semana ? (
              <Empty titulo="Todavía no hay semanas cargadas" />
            ) : (
              <div className={s.resumen}>
                <div className={s.mezcla}>
                  <DistributionBar conteo={equipo.conteo} leyenda />
                </div>
                <div className={s.cifras}>
                  <Figure
                    etiqueta={<Tip contenido={DEFINICION.promedio}>Índice promedio</Tip>}
                    valor={decimal(equipo.promedioIndice)}
                    detalle={`con resultado vigente en ${entero(equipo.evaluadas ?? 0)} de ${entero(equipo.personasEvaluables)} personas`}
                  />
                  <Figure
                    etiqueta={<Tip contenido={DEFINICION.enAltoEquipo}>Personas en Alto</Tip>}
                    valor={entero(equipo.conteo.ALTO)}
                    tono={equipo.conteo.ALTO > 0 ? "alto" : "neutro"}
                    detalle={
                      equipo.tendenciaAlto && (
                        <TendenciaAlto
                          puntos={equipo.tendenciaAlto}
                          maximo={Math.max(1, ...equipo.tendenciaAlto.map((t) => t.alto))}
                          actual={semana}
                        />
                      )
                    }
                  />
                  {equipo.tareas && (
                    <Figure
                      etiqueta={<Tip contenido={DEFINICION.tareasVencidas}>Tareas vencidas</Tip>}
                      valor={entero(equipo.tareas.vencidas)}
                      detalle={
                        equipo.tareas.vencidas ? (
                          <>
                            de {entero(equipo.tareas.activas)} tareas, en{" "}
                            {contar(equipo.tareas.personasConVencidas, "persona", "personas")}.{" "}
                            {vencidasCompletas && (
                              <Link
                                className={tabla.cellLink}
                                href={`${base}?${PARAM_TAREAS_EQUIPO}=VENCIDA`}
                                scroll={false}
                              >
                                Ver cuáles
                              </Link>
                            )}
                          </>
                        ) : (
                          `de ${entero(equipo.tareas.activas)} tareas`
                        )
                      }
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section titulo="Integrantes">
        {integrantes.estado === "error" ? (
          <ErrorBox mensaje={integrantes.mensaje} onRetry={integrantes.reintentar} />
        ) : !ultimos ? (
          <SkeletonRows filas={5} />
        ) : ultimos.items.length === 0 ? (
          <Empty titulo="El equipo no tiene personas activas" />
        ) : (
          <>
            <DataTable etiqueta={`Integrantes de ${equipo?.nombre ?? "este equipo"}`}>
              <thead>
                <tr>
                  <th scope="col">Persona</th>
                  <th scope="col">Puesto</th>
                  <th scope="col">Responsable</th>
                  <th scope="col" className={tabla.centro}>
                    <Tip contenido={DEFINICION.nivel}>Nivel</Tip>
                  </th>
                  <th scope="col" className={tabla.num}>
                    <Tip contenido={DEFINICION.indice}>Índice</Tip>
                  </th>
                  <th scope="col">
                    <Tip contenido={DEFINICION_FACTOR.CT}>Tareas</Tip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ultimos.items.map((p) => {
                  const w = p.semanas.find((x) => x.periodStart === ultimos.periodStart);
                  return (
                    <tr key={p.employeeId}>
                      <th scope="row">
                        <Link className={tabla.rowLink} href={`/employees/${encodeURIComponent(p.employeeId)}`}>
                          {p.nombre}
                        </Link>
                        <span className={tabla.sub}>{p.employeeId}</span>
                      </th>
                      <td>{PUESTO[p.tipo]}</td>
                      <td>{p.responsable ?? "—"}</td>
                      <td className={tabla.centro}>
                        {w ? (
                          <LevelTag nivel={w.nivel} actualizado={w.actualizado} />
                        ) : (
                          <span className={tabla.muted}>Sin datos</span>
                        )}
                      </td>
                      <td className={tabla.num}>{decimal(w?.actualizado ? w.indice : null)}</td>
                      <td>
                        {!w ? (
                          <span className={tabla.muted}>Sin datos</span>
                        ) : w.tareasActivas > 0 && verTareasDe(p.tipo) ? (
                          <Link
                            className={tabla.cellLink}
                            href={hrefTareasSemana({ employeeId: p.employeeId, periodStart: w.periodStart })}
                          >
                            <TextoTareas activas={w.tareasActivas} pendientes={w.tareasPendientes} vencidas={w.tareasVencidas} />
                            <span className="sr-only"> (ver las tareas de {p.nombre})</span>
                          </Link>
                        ) : (
                          <TextoTareas activas={w.tareasActivas} pendientes={w.tareasPendientes} vencidas={w.tareasVencidas} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
            {ultimos.total > ultimos.pageSize && (
              <Pagination
                pagina={ultimos.page}
                paginas={Math.ceil(ultimos.total / ultimos.pageSize)}
                onCambio={setNumero}
              />
            )}
          </>
        )}
      </Section>

      {equipo?.activo && semana && (
        <Section id={ANCLA_TAREAS_EQUIPO} titulo="Tareas del equipo" tabIndex={-1}>
          <TareasEquipo
            key={semana}
            teamId={teamId}
            periodStart={semana}
            vencidas={vencidasCompletas ? (equipo.tareas?.vencidas ?? undefined) : undefined}
          />
        </Section>
      )}
    </div>
  );
}
