"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useConsulta } from "@/client/use-consulta";
import type { Nivel } from "@/shared/contracts";
import type { DirectorioPersonasDTO, EquipoDTO } from "@/shared/contratos/organizacion";
import { NIVEL, decimal, entero, semana as textoSemana } from "@/shared/formato";
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
} from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import { StatusTag } from "@/shared/ui/status-tag";
import { organizacionApi } from "../organizacion/api";
import { SelectorSemanas, finDeSemana } from "../organizacion/piezas";
import { rutaHistorial, rutaMiEquipo } from "../organizacion/rutas";
import { PUESTO, contar } from "../organizacion/textos";
import { useSesion } from "../shell/sesion";
import { MOTIVO_SUPRESION, TendenciaAlto } from "./equipos";
import s from "./equipos.module.css";

const NIVELES: Nivel[] = ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"];
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
              termino: "Alertas activas",
              valor: equipo.alertasActivas === null ? "No disponible" : entero(equipo.alertasActivas),
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
                  <Figure etiqueta="Índice promedio" valor={decimal(equipo.promedioIndice)} />
                  <Figure
                    etiqueta="Personas en Alto"
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
                  <Figure
                    etiqueta="Con resultado vigente"
                    valor={`${entero(equipo.evaluadas ?? 0)} de ${entero(equipo.personasEvaluables)}`}
                    detalle={NIVELES.filter((n) => equipo.conteo![n])
                      .map((n) => `${entero(equipo.conteo![n])} ${NIVEL[n]}`)
                      .join(", ")}
                  />
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
                  <th scope="col">Nivel</th>
                  <th scope="col" className={tabla.num}>
                    Índice
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
                      <td>
                        {w ? (
                          <LevelTag nivel={w.nivel} actualizado={w.actualizado} />
                        ) : (
                          <span className={tabla.muted}>Sin datos</span>
                        )}
                      </td>
                      <td className={tabla.num}>{decimal(w?.actualizado ? w.indice : null)}</td>
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
    </div>
  );
}
