"use client";
import { useRef, useState } from "react";
import { useConsulta } from "@/client/use-consulta";
import {
  ESTADOS_TAREA,
  type EstadoTarea,
  type ResumenTareasDTO,
  type TareasSemanaDTO,
} from "@/shared/contratos/tareas";
import { entero, semana as textoSemana } from "@/shared/formato";
import { useRowsEnter } from "@/shared/motion";
import {
  Button,
  Empty,
  Figure,
  ErrorBox,
  Notice,
  Section,
  SelectField,
  SkeletonRows,
  Toolbar,
} from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import { SelectorSemana, type Periodo } from "../personas/selector-semana";
import { useSesion } from "../shell/sesion";
import { HistorialTarea } from "./historial-tarea";
import { Linaje, NotaRevision } from "./resumen-tareas";
import { TablaTareas } from "./tabla-tareas";
import { tareasApi } from "./tareas-api";
import { GRUPO_ESTADO, diasAtrasoTexto, hrefTareasSemana, type VistaTareas } from "./textos";
import s from "./tareas-de-semana.module.css";

export const estadoDe = (texto: string | null) => ESTADOS_TAREA.find((e) => e === texto);
export const paginaDe = (texto: string | null) => {
  const n = Number(texto);
  return Number.isSafeInteger(n) && n > 1 ? n : 1;
};

const contar = (n: number, una: string, varias: string) =>
  `${entero(n)} ${n === 1 ? una : varias}`;

/** How many tasks each status filter option leads to. */
export const cuantas = (estado: EstadoTarea, r: ResumenTareasDTO) =>
  estado === "COMPLETADA" ? r.completadas : estado === "PENDIENTE" ? r.pendientes : r.vencidas;

/** The week at a glance: how many tasks, how many overdue and by how long, the rest by status. */
function Cifras({ resumen }: { resumen: ResumenTareasDTO }) {
  return (
    <div className={s.cifras}>
      <Figure etiqueta="Tareas de la semana" valor={entero(resumen.total)} />
      <Figure
        etiqueta={GRUPO_ESTADO.VENCIDA}
        valor={entero(resumen.vencidas)}
        detalle={resumen.vencidas ? `Atraso máximo, ${diasAtrasoTexto(resumen.diasAtrasoMax)}` : undefined}
      />
      <Figure etiqueta={GRUPO_ESTADO.PENDIENTE} valor={entero(resumen.pendientes)} />
      <Figure etiqueta={GRUPO_ESTADO.COMPLETADA} valor={entero(resumen.completadas)} />
    </div>
  );
}

/** The section's anchor: links to a week's tasks scroll here. */
export const ANCLA_TAREAS = "tareas";

/**
 * The person page's task section. With no week chosen it offers the newest one, so opening the page
 * reads no task rows (RRHH reads them on demand, and each read is recorded).
 */
export function TareasDeSemana({
  vista,
  ir,
  semanas,
}: {
  vista: VistaTareas | null;
  ir: (cambio: Partial<VistaTareas>) => void;
  /** The weeks the person page shows, newest first, for the week selector. */
  semanas: Periodo[];
}) {
  const [reciente] = semanas;
  return (
    <>
      <Section id={ANCLA_TAREAS} titulo="Tareas de la semana" tabIndex={-1} className={s.section}>
        {vista ? (
          <Semana key={`${vista.periodStart}:${vista.recordId ?? ""}`} vista={vista} ir={ir} semanas={semanas} />
        ) : !reciente ? (
          <Empty titulo="Todavía no tiene semanas cargadas" />
        ) : (
          <Empty
            titulo="Elija una semana para ver sus tareas"
            accion={
              <Button onClick={() => ir({ periodStart: reciente.periodStart, page: 1 })}>
                Ver las tareas de {textoSemana(reciente.periodStart, reciente.periodEnd)}
              </Button>
            }
          >
            También puede abrirlas desde «Ver tareas» en cada semana de la tabla.
          </Empty>
        )}
      </Section>
      {vista?.tarea && (
        <HistorialTarea
          key={vista.tarea}
          employeeId={vista.employeeId}
          taskId={vista.tarea}
          cerrar={hrefTareasSemana({ ...vista, tarea: undefined })}
        />
      )}
    </>
  );
}

/**
 * Answers «¿qué tareas respaldan la carga de esta semana?» inside the person page: the week, a status
 * filter that names how many each group holds, the rows as they stood at the close and one task's
 * history below. Everything lives in the URL (`vista`), so the view can be shared; `ir` replaces it.
 */
function Semana({
  vista,
  ir,
  semanas,
}: {
  vista: VistaTareas;
  ir: (cambio: Partial<VistaTareas>) => void;
  semanas: Periodo[];
}) {
  const { usuario } = useSesion();
  const { employeeId, periodStart, recordId, estado, page = 1 } = vista;
  const filas = useRef<HTMLTableSectionElement>(null);
  const consulta = useConsulta(
    (signal) => tareasApi.semana({ employeeId, periodStart, recordId, estado, page }, signal),
    usuario ? `tareas:${employeeId}:${periodStart}:${recordId ?? ""}:${estado ?? ""}:${page}` : null,
  );
  // A new filter or page keeps the last answer on screen until the next one arrives.
  const [ultimo, setUltimo] = useState<TareasSemanaDTO | null>(null);
  if (consulta.estado === "listo" && consulta.datos !== ultimo) setUltimo(consulta.datos);
  const datos = ultimo;
  const actualizando = consulta.estado === "cargando" && datos !== null;
  useRowsEnter(filas, datos?.tareas.items);

  const opciones = semanas.some((w) => w.periodStart === periodStart)
    ? semanas
    : [{ periodStart, periodEnd: datos?.semana.periodEnd ?? periodStart }, ...semanas];
  const total = datos?.tareas.total ?? 0;
  const paginas = datos ? Math.ceil(total / datos.tareas.pageSize) : 1;
  const hayFilas = !!datos && datos.tareasVisibles && datos.resumen.total > 0;
  const periodo = datos ? textoSemana(datos.semana.periodStart, datos.semana.periodEnd) : "";

  return (
    <div className={s.cuerpo}>
      {hayFilas && <Cifras resumen={datos.resumen} />}
      <Toolbar>
        <SelectorSemana
          opciones={opciones}
          valor={periodStart}
          onCambio={(p) =>
            ir({ periodStart: p, recordId: undefined, estado: undefined, page: 1, tarea: undefined })
          }
        />
        {hayFilas && (
          <SelectField
            etiqueta="Estado"
            value={estado ?? ""}
            onChange={(e) => ir({ estado: estadoDe(e.target.value), page: 1, tarea: undefined })}
          >
            <option value="">Todas</option>
            {ESTADOS_TAREA.map((e) => (
              <option key={e} value={e}>
                {GRUPO_ESTADO[e]}
              </option>
            ))}
          </SelectField>
        )}
        {hayFilas && (
          // The figures above say the total; the line speaks only when a filter narrows it.
          <p className={s.count} role="status">
            {estado ? `${entero(total)} de ${contar(datos.resumen.total, "tarea", "tareas")}` : ""}
          </p>
        )}
      </Toolbar>
      {datos && !datos.semana.vigente && (
        <Notice>
          Son las tareas de una versión anterior de los datos de la semana: la que usó el informe.
        </Notice>
      )}
      {datos?.tareasVisibles && <Linaje semana={datos} />}
      <div
        aria-busy={actualizando}
        className={s.results}
        data-actualizando={actualizando || undefined}
      >
        {consulta.estado === "error" ? (
          <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
        ) : !datos ? (
          <SkeletonRows filas={6} />
        ) : !datos.tareasVisibles ? (
          <Empty titulo="El detalle de tareas no está disponible para su perfil">
            El detalle de las tareas de técnicos lo consultan RR. HH. y el Team Lead del equipo.
            Gerencia consulta el de los Team Leads.
          </Empty>
        ) : datos.detalle === "SIN_DETALLE" ? (
          <Empty titulo="Todavía no hay detalle de tareas para esta semana">
            Los conteos de la semana se importaron como resumen. El detalle aparecerá cuando RR. HH.
            importe el archivo de tareas.
          </Empty>
        ) : datos.resumen.total === 0 ? (
          <Empty titulo="Sin tareas esta semana">
            La semana no registra tareas asignadas ni abiertas.
          </Empty>
        ) : total === 0 ? (
          <Empty
            titulo="Ninguna tarea coincide con el estado seleccionado"
            accion={<Button onClick={() => ir({ estado: undefined, page: 1 })}>Quitar filtros</Button>}
          />
        ) : (
          <TablaTareas
            etiqueta={`Tareas de ${datos.persona.nombre}, semana ${periodo}`}
            tareas={datos.tareas.items}
            semanaInicio={datos.semana.periodStart}
            historial={(taskId) => hrefTareasSemana({ ...vista, tarea: taskId })}
            cuerpoRef={filas}
          />
        )}
      </div>
      {hayFilas && paginas > 1 && (
        <div className={s.pager}>
          <Pagination
            pagina={page}
            paginas={paginas}
            onCambio={(p) => ir({ page: p })}
            etiqueta="Paginación de tareas"
          />
        </div>
      )}
      {hayFilas && <NotaRevision />}
    </div>
  );
}
