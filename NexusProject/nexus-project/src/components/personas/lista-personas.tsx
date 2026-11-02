"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import type { Nivel, PersonaDTO, SemanaPersona } from "@/shared/contracts";
import {
  NIVEL,
  decimal,
  entero,
  semana as textoSemana,
  valorFactor,
  variacion,
} from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import { nivelVigente, semanaDe, serieHasta } from "@/shared/semanas";
import {
  Button,
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
import { useSesion } from "../shell/sesion";
import { SelectorSemana, periodos } from "./selector-semana";
import s from "./lista-personas.module.css";

type Datos = { personas: PersonaDTO[]; semanas: string[] };
type FiltroNivel = "" | Nivel | "DESACTUALIZADO";
type Orden = "indice" | "variacion" | "nombre";

async function cargar(signal: AbortSignal): Promise<Datos> {
  const respuesta = await tableroApi.personas({}, signal);
  return { personas: respuesta.items, semanas: respuesta.semanas };
}

const NIVELES: Nivel[] = ["ALTO", "MEDIO", "BAJO", "INCOMPLETO"];

/** Lowercase and without accents, so "garcia" finds "García". */
const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");

/** An index only counts when its stored result is current (T14). */
const indiceVigente = (w: SemanaPersona | undefined) =>
  w?.actualizado ? w.indice : null;

const porNombre = (a: PersonaDTO, b: PersonaDTO) =>
  a.nombre.localeCompare(b.nombre, "es", { numeric: true });

/** Descending, with the people who have no value at the end. */
const desc = (a: number | null, b: number | null) =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : b - a;

const contar = (n: number, una: string, varias: string) =>
  `${entero(n)} ${n === 1 ? una : varias}`;

/** Answers "¿Cómo viene cada persona?": every person in scope for one week. */
export function ListaPersonas() {
  const { usuario } = useSesion();
  const equipoUrl = useSearchParams().get("equipo") ?? "";
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(cargar, usuario ? "personas" : null);
  const datos = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );

  const [elegida, setElegida] = useState<string>();
  const [busqueda, setBusqueda] = useState("");
  const [nivel, setNivel] = useState<FiltroNivel>("");
  const [orden, setOrden] = useState<Orden>("indice");
  const [equipo, setEquipo] = useState(equipoUrl);
  // A new ?equipo= (a link from Resumen or Equipos, or the sidebar) resets the filter.
  const [equipoLeido, setEquipoLeido] = useState(equipoUrl);
  if (equipoUrl !== equipoLeido) {
    setEquipoLeido(equipoUrl);
    setEquipo(equipoUrl);
  }

  const esTeamLead = usuario?.rol === "TEAM_LEAD";
  const semana = elegida ?? datos?.semanas[0];
  const opciones = useMemo(
    () => (datos ? periodos(datos.personas, datos.semanas) : []),
    [datos],
  );
  const equipos = useMemo(() => {
    const nombres = new Map<string, string>();
    for (const p of datos?.personas ?? []) nombres.set(p.teamId, p.equipo);
    return [...nombres]
      .map(([teamId, nombre]) => ({ teamId, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
  }, [datos]);
  // A team outside the viewer's scope, or a stale link, filters nobody out.
  const equipoActivo =
    !esTeamLead && equipos.some((e) => e.teamId === equipo) ? equipo : "";

  const vista = useMemo(() => {
    if (!datos || !semana) return null;
    const anterior = datos.semanas[datos.semanas.indexOf(semana) + 1];
    const texto = normalizar(busqueda.trim());
    const filas = datos.personas
      .filter(
        (p) =>
          (!texto || normalizar(p.nombre).includes(texto)) &&
          (!equipoActivo || p.teamId === equipoActivo),
      )
      .map((persona) => {
        const w = semanaDe(persona, semana);
        const indice = indiceVigente(w);
        const previo = anterior
          ? indiceVigente(semanaDe(persona, anterior))
          : null;
        return {
          persona,
          w,
          indice,
          cambio: indice === null ? null : variacion(indice, previo),
          delta: indice === null || previo === null ? null : indice - previo,
        };
      })
      .filter(({ w }) =>
        !nivel
          ? true
          : nivel === "DESACTUALIZADO"
            ? !!w && !w.actualizado
            : nivelVigente(w) === nivel,
      )
      .sort((a, b) =>
        orden === "nombre"
          ? porNombre(a.persona, b.persona)
          : (orden === "variacion"
              ? desc(a.delta, b.delta) || desc(a.indice, b.indice)
              : desc(a.indice, b.indice)) || porNombre(a.persona, b.persona),
      );
    return { filas, periodo: opciones.find((o) => o.periodStart === semana) };
  }, [datos, semana, busqueda, equipoActivo, nivel, orden, opciones]);
  useRowsEnter(
    filas,
    vista ? `${semana}|${equipoActivo}|${nivel}|${orden}` : undefined,
  );

  const limpiar = () => {
    setBusqueda("");
    setEquipo("");
    setNivel("");
  };
  const total = datos?.personas.length ?? 0;
  const contexto = vista?.periodo
    ? `Semana ${textoSemana(vista.periodo.periodStart, vista.periodo.periodEnd)}, ${
        esTeamLead && equipos.length === 1
          ? `${contar(total, "persona", "personas")} de ${equipos[0].nombre}`
          : `${contar(total, "persona", "personas")} en ${contar(equipos.length, "equipo", "equipos")}`
      }`
    : "Carga de trabajo de cada persona, semana a semana";

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Personas"
        contexto={contexto}
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

      <Section>
        <Toolbar>
          <SearchField
            etiqueta="Buscar persona"
            placeholder="Nombre"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {usuario && !esTeamLead && (
            <SelectField
              etiqueta="Equipo"
              value={equipoActivo}
              onChange={(e) => setEquipo(e.target.value)}
            >
              <option value="">Todos los equipos</option>
              {equipos.map((e) => (
                <option key={e.teamId} value={e.teamId}>
                  {e.nombre}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField
            etiqueta="Nivel"
            value={nivel}
            onChange={(e) => setNivel(e.target.value as FiltroNivel)}
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
            onChange={(e) => setOrden(e.target.value as Orden)}
          >
            <option value="indice">Por índice</option>
            <option value="variacion">Por variación</option>
            <option value="nombre">Por nombre</option>
          </SelectField>
          {vista && (
            <p className={s.count} role="status">
              {vista.filas.length === total
                ? contar(total, "persona", "personas")
                : `${entero(vista.filas.length)} de ${contar(total, "persona", "personas")}`}
            </p>
          )}
        </Toolbar>

        <div ref={caja} className={s.results}>
          {consulta.estado === "error" ? (
            <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
          ) : !datos ? (
            <SkeletonRows filas={8} />
          ) : datos.semanas.length === 0 ? (
            <Empty titulo="Todavía no hay semanas cargadas">
              Cuando RRHH importe la primera semana, acá vas a ver cómo viene
              cada persona.
            </Empty>
          ) : !vista || vista.filas.length === 0 ? (
            <Empty
              titulo="Nadie coincide con estos filtros"
              accion={<Button onClick={limpiar}>Limpiar filtros</Button>}
            />
          ) : (
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
                    Variación
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
                {vista.filas.map(({ persona, w, indice, cambio }) => (
                  <tr key={persona.employeeId}>
                    <th scope="row">
                      <Link
                        className={tabla.rowLink}
                        href={`/employees/${persona.employeeId}`}
                      >
                        {persona.nombre}
                      </Link>
                      {equipos.length > 1 && (
                        <span className={tabla.sub}>{persona.equipo}</span>
                      )}
                    </th>
                    <td>
                      <WeekStrip semanas={serieHasta(persona, semana!)} />
                    </td>
                    <td>
                      {w ? (
                        <LevelTag nivel={w.nivel} actualizado={w.actualizado} />
                      ) : (
                        <span className={tabla.muted}>Sin datos</span>
                      )}
                    </td>
                    <td className={`${tabla.num} ${s.index}`}>
                      {decimal(indice)}
                    </td>
                    <td className={`${tabla.num} ${s.change}`}>
                      {cambio ?? "—"}
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
                            {contar(w.tareasPendientes, "pendiente", "pendientes")}{" "}
                            de {entero(w.tareasActivas)}
                          </span>
                        </>
                      )}
                    </td>
                    <td className={tabla.num}>
                      {w ? valorFactor("VP", w.vacacionesPendientesDias) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </div>
      </Section>
    </div>
  );
}
