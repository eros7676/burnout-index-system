"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import type { FiltrosAlertas, PaginaAlertas } from "@/shared/contracts";
import {
  ESTADO_SEGUIMIENTO,
  FILTROS_SEGUIMIENTO,
  type FiltroSeguimiento,
} from "@/shared/contratos/seguimiento";
import { entero, semana as textoSemana } from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import {
  Button,
  DataTable,
  Empty,
  ErrorBox,
  PageHeader,
  Section,
  SelectField,
  SkeletonRows,
  Toolbar,
  WeekStrip,
  tabla,
} from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import { StatusTag } from "@/shared/ui/status-tag";
import { BotonExportar } from "../exportaciones/boton-exportar";
import { ResumenSeguimientoCelda } from "../seguimiento/estado-seguimiento";
import { useSesion } from "../shell/sesion";
import { causasEnPalabras, envio, sinDestinatario } from "./aviso";
import s from "./alertas.module.css";

const POR_PAGINA = 25;

/** The filters live in the address, so a detail page's «Alertas» link brings the list back as it was. */
function leerFiltros(params: URLSearchParams) {
  const seguimiento = params.get("seguimiento") as FiltroSeguimiento | null;
  return {
    equipo: params.get("equipo") ?? "",
    seguimiento:
      seguimiento && FILTROS_SEGUIMIENTO.includes(seguimiento)
        ? seguimiento
        : ("" as const),
    responsable: params.get("responsable") ?? "",
    vencidos: params.get("vencidos") === "1",
    dirigidas: params.get("dirigidas") === "1",
    pagina: Math.max(1, Math.trunc(Number(params.get("pagina"))) || 1),
  };
}

const ETIQUETA_FILTRO: Record<FiltroSeguimiento, string> = {
  SIN_SEGUIMIENTO: "Sin seguimiento",
  ...ESTADO_SEGUIMIENTO,
};

const plural = (n: number, uno: string, varios: string) =>
  `${entero(n)} ${n === 1 ? uno : varios}`;

/** One part of the list's summary: its count, linked to the list filtered to it when there is any. */
function ParteFiltro({ n, href, children }: { n: number; href: string; children: string }) {
  if (n === 0) return <>{`0 ${children}`}</>;
  return (
    <Link className={s.parte} href={href} scroll={false}>
      {entero(n)} {children}
    </Link>
  );
}

/** Answers which workload alerts wait for review, who has each one and how far its follow-up is. */
export function Alertas() {
  const { usuario, usuarios } = useSesion();
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const filtros = leerFiltros(params);
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);

  // The list as the server filters it; the previous answer stays on screen while the next one loads.
  const consultaFiltros: FiltrosAlertas = {
    teamId: filtros.equipo || undefined,
    seguimiento: filtros.seguimiento || undefined,
    asignadoA: filtros.responsable || undefined,
    vencido: filtros.vencidos ? "1" : undefined,
    dirigidas: filtros.dirigidas ? "1" : undefined,
  };
  const consulta = useConsulta(
    (signal) =>
      tableroApi.alertas(
        { ...consultaFiltros, page: filtros.pagina, pageSize: POR_PAGINA },
        signal,
      ),
    usuario
      ? `${usuario.userId}|${JSON.stringify([consultaFiltros, filtros.pagina])}`
      : null,
  );
  const [ultimo, setUltimo] = useState<PaginaAlertas | null>(null);
  if (consulta.estado === "listo" && consulta.datos !== ultimo)
    setUltimo(consulta.datos);
  const datos = useArrival(readyFor, caja, ultimo);
  const actualizando = consulta.estado === "cargando" && datos !== null;
  useRowsEnter(cuerpo, datos?.items);

  const filtrado =
    !!filtros.equipo ||
    !!filtros.seguimiento ||
    !!filtros.responsable ||
    filtros.vencidos ||
    filtros.dirigidas;
  const esTeamLead = usuario?.rol === "TEAM_LEAD";
  // RR. HH. may follow every alert; a Team Lead and Gerencia only those addressed to them.
  const tieneDirigidas = usuario?.rol === "TEAM_LEAD" || usuario?.rol === "GERENCIA";
  // With no follow-up filter on, the summary says how many wait and links to each part (one-row reads).
  const sinFiltroDeSeguimiento =
    !filtros.seguimiento && !filtros.responsable && !filtros.vencidos && !filtros.dirigidas;
  const equipoFiltro = filtros.equipo || undefined;
  const partes = useConsulta(
    async (signal) => {
      const contar = (f: FiltrosAlertas) =>
        tableroApi.alertas({ ...f, teamId: equipoFiltro, pageSize: 1 }, signal).then((p) => p.total);
      const [sinSeguimiento, vencidos, dirigidas] = await Promise.all([
        contar({ seguimiento: "SIN_SEGUIMIENTO" }),
        contar({ vencido: "1" }),
        tieneDirigidas ? contar({ dirigidas: "1", seguimiento: "SIN_SEGUIMIENTO" }) : null,
      ]);
      return { sinSeguimiento, vencidos, dirigidas };
    },
    usuario && datos && sinFiltroDeSeguimiento
      ? `alertas-partes|${usuario.userId}|${equipoFiltro ?? ""}`
      : null,
  );
  const hrefCon = (cambios: Record<string, string>) => {
    const nuevos = new URLSearchParams(params);
    nuevos.delete("pagina");
    for (const [clave, valor] of Object.entries(cambios)) nuevos.set(clave, valor);
    return `${ruta}?${nuevos}`;
  };
  const responsables = usuarios.filter((u) => u.rol !== "EMPLEADO");

  function cambiar(cambios: Partial<Record<string, string | null>>) {
    const nuevos = new URLSearchParams(params);
    // Any filter change returns to the first page; only the page control keeps its own.
    if (!("pagina" in cambios)) nuevos.delete("pagina");
    for (const [clave, valor] of Object.entries(cambios))
      if (valor) nuevos.set(clave, valor);
      else nuevos.delete(clave);
    const texto = nuevos.toString();
    router.replace(texto ? `${ruta}?${texto}` : ruta, { scroll: false });
  }
  const quitar = () => router.replace(ruta, { scroll: false });

  const total = datos?.total ?? 0;
  const paginas = datos ? Math.ceil(datos.total / datos.pageSize) : 1;

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Alertas"
        contexto="Condiciones de carga de trabajo que esperan revisión y su seguimiento"
        acciones={
          <BotonExportar
            tipo="alertas"
            filtros={{
              teamId: filtros.equipo || undefined,
              seguimiento: filtros.seguimiento || undefined,
              asignadoA: filtros.responsable || undefined,
              vencido: filtros.vencidos ? "1" : undefined,
              dirigidas: filtros.dirigidas ? "1" : undefined,
            }}
          />
        }
      />

      <Section titulo="Esperan revisión">
        <Toolbar>
          {!esTeamLead && (datos?.equipos.length ?? 0) > 0 && (
            <SelectField
              etiqueta="Equipo"
              value={filtros.equipo}
              onChange={(e) => cambiar({ equipo: e.target.value })}
            >
              <option value="">Todos los equipos</option>
              {datos?.equipos.map((e) => (
                <option key={e.teamId} value={e.teamId}>
                  {e.nombre}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField
            etiqueta="Seguimiento"
            value={filtros.seguimiento}
            onChange={(e) => cambiar({ seguimiento: e.target.value })}
          >
            <option value="">Todos</option>
            {FILTROS_SEGUIMIENTO.map((f) => (
              <option key={f} value={f}>
                {ETIQUETA_FILTRO[f]}
              </option>
            ))}
          </SelectField>
          <SelectField
            etiqueta="Responsable"
            value={filtros.responsable}
            onChange={(e) => cambiar({ responsable: e.target.value })}
          >
            <option value="">Todos</option>
            {responsables.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.userId === usuario?.userId ? `${u.nombre} (usted)` : u.nombre}
              </option>
            ))}
          </SelectField>
          <SelectField
            etiqueta="Vencimiento"
            value={filtros.vencidos ? "1" : ""}
            onChange={(e) => cambiar({ vencidos: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="1">Vencidos</option>
          </SelectField>
          {tieneDirigidas && (
            <SelectField
              etiqueta="Destinatario"
              value={filtros.dirigidas ? "1" : ""}
              onChange={(e) => cambiar({ dirigidas: e.target.value })}
            >
              <option value="">Todos</option>
              <option value="1">Dirigidas a usted</option>
            </SelectField>
          )}
          {filtrado && (
            <Button variante="quiet" onClick={quitar}>
              Quitar filtros
            </Button>
          )}
          {datos && (
            <p className={s.count} role="status">
              {plural(total, "alerta", "alertas")} de {plural(datos.personas, "persona", "personas")}
              {partes.estado === "listo" && (
                <>
                  ;{" "}
                  <ParteFiltro n={partes.datos.sinSeguimiento} href={hrefCon({ seguimiento: "SIN_SEGUIMIENTO" })}>
                    sin seguimiento
                  </ParteFiltro>
                  ,{" "}
                  <ParteFiltro n={partes.datos.vencidos} href={hrefCon({ vencidos: "1" })}>
                    con el seguimiento vencido
                  </ParteFiltro>
                  {partes.datos.dirigidas !== null && (
                    <>
                      ;{" "}
                      <ParteFiltro
                        n={partes.datos.dirigidas}
                        href={hrefCon({ dirigidas: "1", seguimiento: "SIN_SEGUIMIENTO" })}
                      >
                        {partes.datos.dirigidas === 1
                          ? "dirigida a usted, sin seguimiento"
                          : "dirigidas a usted, sin seguimiento"}
                      </ParteFiltro>
                    </>
                  )}
                </>
              )}
              .
            </p>
          )}
        </Toolbar>

        <div
          ref={caja}
          className={s.results}
          data-cargando={actualizando || undefined}
          aria-busy={actualizando}
        >
          {consulta.estado === "error" ? (
            <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
          ) : !datos ? (
            <SkeletonRows filas={6} />
          ) : datos.items.length === 0 ? (
            filtrado ? (
              <Empty
                titulo="Ninguna alerta coincide con los filtros aplicados"
                accion={<Button onClick={quitar}>Quitar filtros</Button>}
              />
            ) : datos.total > 0 ? (
              <Empty
                titulo="Esta página no tiene alertas"
                accion={
                  <Button onClick={() => cambiar({ pagina: null })}>
                    Ir a la primera página
                  </Button>
                }
              />
            ) : (
              <Empty titulo="No hay alertas esperando revisión">
                Las alertas aparecen cuando una persona sostiene una carga de
                trabajo alta durante semanas consecutivas.
              </Empty>
            )
          ) : (
            <>
              <DataTable etiqueta="Alertas activas">
                <thead>
                  <tr>
                    <th scope="col">Persona</th>
                    <th scope="col">Semana</th>
                    <th scope="col">Factores</th>
                    <th scope="col">Destinatario</th>
                    <th scope="col" className={s.followUp}>
                      Seguimiento
                    </th>
                  </tr>
                </thead>
                <tbody ref={cuerpo} className={s.rows}>
                  {datos.items.map((alerta) => {
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
                      <tr key={alerta.alertId}>
                        <th scope="row">
                          <Link
                            className={tabla.rowLink}
                            href={`/alerts/${alerta.alertId}`}
                          >
                            {alerta.persona?.nombre ?? "Persona sin datos cargados"}
                          </Link>
                          {alerta.persona && (
                            <span className={tabla.sub}>
                              {alerta.persona.equipo}
                            </span>
                          )}
                        </th>
                        <td>
                          {alerta.semana ? (
                            <span className={s.week}>
                              {textoSemana(
                                alerta.semana.periodStart,
                                alerta.semana.periodEnd,
                              )}
                              <WeekStrip semanas={alerta.serie} />
                              {!alerta.semana.actualizado && (
                                <span className={s.stale}>
                                  Resultado desactualizado
                                </span>
                              )}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={s.factors}>
                          {causasEnPalabras(alerta.causas)}
                        </td>
                        <td>
                          <span className={s.recipient}>
                            {sinDestinatario(alerta) ? (
                              <StatusTag tono="incidencia">
                                Sin destinatario
                              </StatusTag>
                            ) : (
                              <span>
                                {alerta.destinatario ?? "Responsable"}
                                {alerta.destinatarioId === usuario?.employeeId
                                  ? " (usted)"
                                  : ""}
                              </span>
                            )}
                            {lineaEnvio}
                          </span>
                        </td>
                        <td>
                          <ResumenSeguimientoCelda
                            resumen={alerta.seguimiento}
                            usuarioId={usuario?.userId}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
              {paginas > 1 && (
                <Pagination
                  pagina={datos.page}
                  paginas={paginas}
                  etiqueta="Paginación de alertas"
                  onCambio={(p) => cambiar({ pagina: p > 1 ? String(p) : null })}
                />
              )}
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
