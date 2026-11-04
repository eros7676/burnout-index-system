"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConsulta } from "@/client/use-consulta";
import {
  ESTADOS_TAREA,
  type EstadoTarea,
  type TareasEquipoDTO,
} from "@/shared/contratos/tareas";
import { entero } from "@/shared/formato";
import { useRowsEnter } from "@/shared/motion";
import {
  Button,
  DataTable,
  Empty,
  ErrorBox,
  Notice,
  SelectField,
  SkeletonRows,
  Toolbar,
  tabla,
} from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import { FechaTarea } from "../fecha-tarea";
import { useSesion } from "../shell/sesion";
import { EstadoTareaTag } from "./estado-tarea";
import { NotaRevision } from "./resumen-tareas";
import { Identificador } from "./tabla-tareas";
import { tareasApi } from "./tareas-api";
import { cuantas, estadoDe } from "./tareas-de-semana";
import { GRUPO_ESTADO, diasAtrasoTexto, hrefTareasSemana } from "./textos";
import s from "./tareas-equipo.module.css";
import st from "./tabla-tareas.module.css";

/** A team's list is a scan for what to act on: a short page, overdue first. */
const POR_PAGINA = 25;

/** The URL key that opens the team's list: an estado, or «todas» for the whole list. */
export const PARAM_TAREAS_EQUIPO = "tareas";
export const ANCLA_TAREAS_EQUIPO = "tareas-del-equipo";

const plural = (n: number, una: string, varias: string) =>
  `${entero(n)} ${n === 1 ? una : varias}`;

/** The team's week in one line: how many tasks, of how many people, how many overdue. */
function resumenEnPalabras(d: TareasEquipoDTO) {
  const { total, vencidas } = d.resumen;
  const quienes = plural(d.personas, "persona", "personas");
  if (total === 0) return `Sin tareas registradas para ${quienes}.`;
  return `${plural(total, "tarea", "tareas")} de ${quienes}; ${plural(vencidas, "vencida", "vencidas")} al cierre.`;
}

/**
 * Answers «¿qué tareas tiene el equipo esta semana?» in one list, overdue first, each row naming whose
 * it is and linking to that person's week. The rows load on request (each read is recorded per person).
 * Whether the list is open and its estado live in the URL (`?tareas=VENCIDA`), so the team's overdue
 * figure and a shared link land on the same list; the page is the section's own state.
 * `vencidas` is the team's overdue count, when the list will show all of them (not to Gerencia).
 */
export function TareasEquipo({
  teamId,
  periodStart,
  vencidas,
}: {
  teamId: string;
  periodStart: string;
  vencidas?: number;
}) {
  const { usuario } = useSesion();
  const params = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();
  const valor = params.get(PARAM_TAREAS_EQUIPO);
  const abierta = valor !== null;
  const estado = estadoDe(valor);
  // A new estado, from the select or from a link, starts again at the first page.
  const [pagina, setPagina] = useState({ estado, page: 1 });
  const page = pagina.estado === estado ? pagina.page : 1;
  const setPage = (n: number) => setPagina({ estado, page: n });
  const ir = (siguiente: EstadoTarea | undefined) => {
    const q = new URLSearchParams(params);
    q.set(PARAM_TAREAS_EQUIPO, siguiente ?? "todas");
    router.replace(`${ruta}?${q}`, { scroll: false });
  };
  // Opening the list from elsewhere on the page (or arriving with it open) brings it into view.
  useEffect(() => {
    if (valor !== null)
      document.getElementById(ANCLA_TAREAS_EQUIPO)?.scrollIntoView({ block: "nearest" });
  }, [valor]);
  const filas = useRef<HTMLTableSectionElement>(null);
  const consulta = useConsulta(
    (signal) => tareasApi.equipo({ teamId, periodStart, estado, page, pageSize: POR_PAGINA }, signal),
    usuario && abierta ? `tareas-equipo:${teamId}:${periodStart}:${estado ?? ""}:${page}` : null,
  );
  const [ultimo, setUltimo] = useState<TareasEquipoDTO | null>(null);
  if (consulta.estado === "listo" && consulta.datos !== ultimo) setUltimo(consulta.datos);
  const datos = ultimo;
  const actualizando = consulta.estado === "cargando" && datos !== null;
  useRowsEnter(filas, datos?.tareas.items);

  if (!abierta)
    return (
      <Empty
        titulo="Las tareas de cada integrante, en una sola lista"
        accion={
          vencidas ? (
            <Button onClick={() => ir("VENCIDA")}>
              {vencidas === 1
                ? "Ver la tarea vencida del equipo"
                : `Ver las ${entero(vencidas)} tareas vencidas del equipo`}
            </Button>
          ) : (
            <Button onClick={() => ir(undefined)}>Ver las tareas del equipo</Button>
          )
        }
      >
        Primero las vencidas al cierre. Cada consulta queda registrada en la auditoría.
      </Empty>
    );

  const total = datos?.tareas.total ?? 0;
  const paginas = datos ? Math.ceil(total / datos.tareas.pageSize) : 1;
  const hayFilas = !!datos && datos.resumen.total > 0;

  return (
    <div className={s.cuerpo}>
      {datos && (
        <Toolbar>
          {hayFilas && (
            <SelectField
              etiqueta="Estado"
              value={estado ?? ""}
              onChange={(e) => ir(estadoDe(e.target.value))}
            >
              <option value="">Todas ({entero(datos.resumen.total)})</option>
              {ESTADOS_TAREA.map((e) => (
                <option key={e} value={e}>
                  {GRUPO_ESTADO[e]} ({entero(cuantas(e, datos.resumen))})
                </option>
              ))}
            </SelectField>
          )}
          <p className={s.count} role="status">
            {resumenEnPalabras(datos)}
          </p>
        </Toolbar>
      )}
      {datos?.alcance === "LIDERES" && (
        <Notice>
          Se muestran las tareas de los Team Leads del equipo. Las de los técnicos las consultan
          RR. HH. y el Team Lead.
        </Notice>
      )}
      {!!datos?.sinDetalle && (
        <p className={s.note}>
          {datos.sinDetalle === 1
            ? "Una persona tiene la semana importada como resumen, sin detalle de tareas: sus conteos no tienen filas en esta lista."
            : `${entero(datos.sinDetalle)} personas tienen la semana importada como resumen, sin detalle de tareas: sus conteos no tienen filas en esta lista.`}
        </p>
      )}
      <div aria-busy={actualizando} className={s.results} data-actualizando={actualizando || undefined}>
        {consulta.estado === "error" ? (
          <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
        ) : !datos ? (
          <SkeletonRows filas={6} />
        ) : datos.personas === 0 ? (
          <Empty titulo="Nadie del equipo tiene esta semana cargada" />
        ) : !hayFilas ? (
          <Empty titulo="Sin tareas esta semana" />
        ) : total === 0 ? (
          <Empty
            titulo="Ninguna tarea coincide con el estado seleccionado"
            accion={
              <Button onClick={() => ir(undefined)}>
                Quitar filtros
              </Button>
            }
          />
        ) : (
          <DataTable etiqueta={`Tareas del equipo ${datos.equipo.nombre}`}>
            <thead>
              <tr>
                <th scope="col">Persona</th>
                <th scope="col">Identificador</th>
                <th scope="col">Título</th>
                <th scope="col">Vence</th>
                <th scope="col" className={tabla.centro}>
                  Estado
                </th>
                <th scope="col" className={tabla.num}>
                  Días de atraso
                </th>
              </tr>
            </thead>
            <tbody ref={filas}>
              {datos.tareas.items.map((t) => (
                <tr key={`${t.employeeId}:${t.taskId}`}>
                  <th scope="row">
                    <Link
                      className={tabla.rowLink}
                      href={hrefTareasSemana({ employeeId: t.employeeId, periodStart })}
                    >
                      {t.nombre}
                    </Link>
                  </th>
                  <td>
                    <Identificador tarea={t} />
                  </td>
                  <td className={st.title}>{t.titulo}</td>
                  <td className={st.date}>
                    <FechaTarea fecha={t.venceEl} referencia={periodStart} />
                  </td>
                  <td className={tabla.centro}>
                    <EstadoTareaTag estado={t.estado} />
                  </td>
                  <td className={tabla.num}>{diasAtrasoTexto(t.diasAtraso)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
      {hayFilas && paginas > 1 && (
        <Pagination pagina={page} paginas={paginas} onCambio={setPage} etiqueta="Paginación de tareas del equipo" />
      )}
      {hayFilas && <NotaRevision />}
    </div>
  );
}
