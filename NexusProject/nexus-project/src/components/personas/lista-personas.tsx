"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConsulta } from "@/client/use-consulta";
import type { Nivel } from "@/shared/contracts";
import type {
  DirectorioPersonasDTO,
  EstadoPersona,
  FiltroNivel,
  OrdenDirectorio,
} from "@/shared/contratos/organizacion";
import { NIVEL, decimal, entero, valorFactor, semana as textoSemana } from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import { tienePermiso } from "@/shared/permisos";
import {
  Button,
  ButtonLink,
  DataTable,
  Empty,
  ErrorBox,
  LevelTag,
  PageHeader,
  SearchField,
  Section,
  SelectField,
  SkeletonRows,
  Toolbar,
  WeekStrip,
  tabla,
} from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import { StatusTag } from "@/shared/ui/status-tag";
import { organizacionApi } from "../organizacion/api";
import { SelectorSemanas, finDeSemana } from "../organizacion/piezas";
import { contar } from "../organizacion/textos";
import { useSesion } from "../shell/sesion";
import s from "./lista-personas.module.css";

const NIVELES: Nivel[] = ["ALTO", "MEDIO", "BAJO", "INCOMPLETO"];
const TAMANO_PAGINA = 50;

/** Waits for the typing to pause before the search reaches the server. */
function useRetraso<T>(valor: T, ms = 300) {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return retrasado;
}

/** Answers "¿Cómo viene cada persona?": the people in scope for one week, one page at a time. */
export function ListaPersonas() {
  const { usuario } = useSesion();
  const equipoUrl = useSearchParams().get("equipo") ?? "";
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);

  const [elegida, setElegida] = useState<string>();
  const [busqueda, setBusqueda] = useState("");
  const [nivel, setNivel] = useState<"" | FiltroNivel>("");
  const [orden, setOrden] = useState<OrdenDirectorio>("indice");
  const [estado, setEstado] = useState<EstadoPersona>("ACTIVAS");
  const [equipo, setEquipo] = useState(equipoUrl);
  const [numero, setNumero] = useState(1);
  // A new ?equipo= (a link from Resumen or Equipos, or the sidebar) resets the filter.
  const [equipoLeido, setEquipoLeido] = useState(equipoUrl);
  if (equipoUrl !== equipoLeido) {
    setEquipoLeido(equipoUrl);
    setEquipo(equipoUrl);
    setNumero(1);
  }
  const q = useRetraso(busqueda.trim());

  const esTeamLead = usuario?.rol === "TEAM_LEAD";
  const puedeAdministrar = !!usuario && tienePermiso(usuario.rol, "ADMINISTRAR_PERSONAS");
  // The team names for the filter; a Team Lead has one team and no filter.
  const equipos = useConsulta(
    (signal) => organizacionApi.equipos({ estado: "ACTIVOS" }, signal),
    usuario && !esTeamLead ? "equipos-filtro" : null,
  );
  const opcionesEquipo = equipos.estado === "listo" ? equipos.datos.items : [];
  const equipoActivo = opcionesEquipo.some((e) => e.teamId === equipo) ? equipo : "";

  const consulta = useConsulta(
    (signal) =>
      organizacionApi.directorio(
        {
          periodStart: elegida,
          teamId: equipoActivo || undefined,
          estado,
          q: q || undefined,
          nivel: nivel || undefined,
          orden,
          page: numero,
          pageSize: TAMANO_PAGINA,
        },
        signal,
      ),
    usuario
      ? JSON.stringify(["directorio", elegida, equipoActivo, estado, q, nivel, orden, numero])
      : null,
  );
  // While the next page loads, the last one stays on screen instead of flashing a skeleton.
  const [ultimo, setUltimo] = useState<DirectorioPersonasDTO | null>(null);
  if (consulta.estado === "listo" && consulta.datos !== ultimo) setUltimo(consulta.datos);
  const datos = useArrival(readyFor, caja, ultimo);
  const cargando = consulta.estado === "cargando";
  useRowsEnter(filas, datos ? `${datos.periodStart}|${datos.page}|${datos.total}` : undefined);

  const semana = datos?.periodStart ?? undefined;
  const filtrado = !!(q || equipoActivo || nivel || estado !== "ACTIVAS");
  const cambiar = <T,>(poner: (v: T) => void) => (v: T) => {
    poner(v);
    setNumero(1);
  };
  const limpiar = () => {
    setBusqueda("");
    setEquipo("");
    setNivel("");
    setEstado("ACTIVAS");
    setNumero(1);
  };
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.pageSize)) : 1;
  const contexto = datos
    ? `${semana ? `Semana ${textoSemana(semana, finDeSemana(semana))}, ` : ""}${contar(datos.total, "persona", "personas")}${filtrado ? " con estos filtros" : ""}`
    : "Carga de trabajo de cada persona, semana a semana";

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Personas"
        contexto={contexto}
        acciones={
          puedeAdministrar ? (
            <>
              <ButtonLink href="/employees/import">Importar personas</ButtonLink>
              <ButtonLink variante="primary" href="/employees/new">
                Nueva persona
              </ButtonLink>
            </>
          ) : undefined
        }
      />

      <Section>
        <Toolbar>
          <SearchField
            etiqueta="Buscar persona"
            placeholder="Nombre o legajo"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setNumero(1);
            }}
          />
          {datos && semana && datos.semanas.length > 0 && (
            <SelectorSemanas
              semanas={datos.semanas}
              valor={semana}
              onCambio={cambiar(setElegida)}
            />
          )}
          {usuario && !esTeamLead && (
            <SelectField
              etiqueta="Equipo"
              value={equipoActivo}
              onChange={(e) => cambiar(setEquipo)(e.target.value)}
            >
              <option value="">Todos los equipos</option>
              {opcionesEquipo.map((e) => (
                <option key={e.teamId} value={e.teamId}>
                  {e.nombre}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField
            etiqueta="Estado"
            value={estado}
            onChange={(e) => cambiar(setEstado)(e.target.value as EstadoPersona)}
          >
            <option value="ACTIVAS">Activas</option>
            <option value="BAJAS">Dadas de baja</option>
          </SelectField>
          <SelectField
            etiqueta="Nivel"
            value={nivel}
            onChange={(e) => cambiar(setNivel)(e.target.value as "" | FiltroNivel)}
          >
            <option value="">Todos los niveles</option>
            {NIVELES.map((n) => (
              <option key={n} value={n}>
                {NIVEL[n]}
              </option>
            ))}
            <option value="DESACTUALIZADO">Desactualizado</option>
          </SelectField>
          <SelectField
            etiqueta="Ordenar"
            value={orden}
            onChange={(e) => cambiar(setOrden)(e.target.value as OrdenDirectorio)}
          >
            <option value="indice">Por índice</option>
            <option value="nombre">Por nombre</option>
          </SelectField>
        </Toolbar>

        <div ref={caja} className={s.results} aria-busy={cargando} data-cargando={cargando || undefined}>
          {consulta.estado === "error" ? (
            <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
          ) : !datos ? (
            <SkeletonRows filas={8} />
          ) : datos.items.length === 0 ? (
            <Empty
              titulo={
                filtrado ? "Nadie coincide con estos filtros" : "Todavía no hay personas registradas"
              }
              accion={
                filtrado ? (
                  <Button onClick={limpiar}>Limpiar filtros</Button>
                ) : puedeAdministrar ? (
                  <ButtonLink variante="primary" href="/employees/new">
                    Nueva persona
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : (
            <>
              <DataTable etiqueta="Personas">
                <thead>
                  <tr>
                    <th scope="col">Persona</th>
                    <th scope="col">Últimas 8 semanas</th>
                    <th scope="col">Nivel</th>
                    <th scope="col" className={tabla.num}>
                      Índice
                    </th>
                    <th scope="col" className={tabla.num}>
                      Horas extra
                    </th>
                    <th scope="col" className={`${tabla.num} ${s.wrap}`}>
                      Días seguidos sin descanso
                    </th>
                    <th scope="col">Tareas</th>
                    <th scope="col" className={`${tabla.num} ${s.wrap}`}>
                      Vacaciones pendientes
                    </th>
                  </tr>
                </thead>
                <tbody ref={filas}>
                  {datos.items.map((persona) => {
                    const w = persona.semanas.find((x) => x.periodStart === semana);
                    return (
                      <tr key={persona.employeeId}>
                        <th scope="row">
                          <Link
                            className={tabla.rowLink}
                            href={`/employees/${encodeURIComponent(persona.employeeId)}`}
                          >
                            {persona.nombre}
                          </Link>
                          {!persona.activo && <StatusTag>Baja</StatusTag>}
                          <span className={tabla.sub}>
                            {persona.employeeId}
                            {persona.equipo && persona.teamId && (
                              <>
                                {" · "}
                                <Link
                                  className={s.equipo}
                                  href={`/teams/${encodeURIComponent(persona.teamId)}`}
                                >
                                  {persona.equipo}
                                </Link>
                              </>
                            )}
                          </span>
                        </th>
                        <td>
                          <WeekStrip semanas={[...persona.semanas].reverse()} />
                        </td>
                        <td>
                          {w ? (
                            <LevelTag nivel={w.nivel} actualizado={w.actualizado} />
                          ) : (
                            <span className={tabla.muted}>Sin datos</span>
                          )}
                        </td>
                        <td className={`${tabla.num} ${s.index}`}>
                          {decimal(w?.actualizado ? w.indice : null)}
                        </td>
                        <td className={tabla.num}>
                          {w ? valorFactor("HE", w.horasExtra) : "—"}
                        </td>
                        <td className={tabla.num}>
                          {w ? valorFactor("DS", w.diasConsecutivosSinDescanso) : "—"}
                        </td>
                        <td className={s.tasks}>
                          {!w ? (
                            "—"
                          ) : w.tareasActivas === 0 ? (
                            <span className={tabla.muted}>Sin tareas</span>
                          ) : (
                            <>
                              {w.tareasVencidas
                                ? contar(w.tareasVencidas, "vencida", "vencidas")
                                : "Sin vencidas"}
                              <span className={tabla.sub}>
                                {contar(w.tareasPendientes, "pendiente", "pendientes")} de{" "}
                                {entero(w.tareasActivas)}
                              </span>
                            </>
                          )}
                        </td>
                        <td className={tabla.num}>
                          {w ? valorFactor("VP", w.vacacionesPendientesDias) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
              <div className={s.pie}>
                <p className={s.count} role="status">
                  {`Personas ${entero((datos.page - 1) * datos.pageSize + 1)} a ${entero(
                    (datos.page - 1) * datos.pageSize + datos.items.length,
                  )} de ${entero(datos.total)}`}
                </p>
                {paginas > 1 && (
                  <Pagination pagina={datos.page} paginas={paginas} onCambio={setNumero} />
                )}
              </div>
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
