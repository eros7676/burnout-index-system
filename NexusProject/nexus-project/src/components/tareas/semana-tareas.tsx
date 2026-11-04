"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useConsulta } from "@/client/use-consulta";
import {
  ESTADOS_TAREA,
  type EstadoTarea,
  type ResumenTareasDTO,
  type TareasSemanaDTO,
} from "@/shared/contratos/tareas";
import {
  FACTOR,
  TIPO,
  decimal,
  entero,
  semana as textoSemana,
  valorFactor,
} from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import {
  Button,
  ButtonLink,
  Empty,
  ErrorBox,
  KeyFacts,
  LevelTag,
  PageHeader,
  Section,
  SelectField,
  Skeleton,
  SkeletonRows,
  Toolbar,
} from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import { textoTareas } from "@/shared/ui/tareas";
import { DEFINICION, DEFINICION_FACTOR } from "../definiciones";
import { useSesion } from "../shell/sesion";
import { HistorialTarea } from "./historial-tarea";
import { ResumenTareas } from "./resumen-tareas";
import { TablaTareas } from "./tabla-tareas";
import { tareasApi } from "./tareas-api";
import { GRUPO_ESTADO, hrefTareasSemana } from "./textos";
import s from "./semana-tareas.module.css";

const estadoDe = (texto: string | null) =>
  ESTADOS_TAREA.find((e) => e === texto);
const paginaDe = (texto: string | null) => {
  const n = Number(texto);
  return Number.isSafeInteger(n) && n > 1 ? n : 1;
};

const contar = (n: number, una: string, varias: string) =>
  `${entero(n)} ${n === 1 ? una : varias}`;

/** How many tasks each status filter option leads to. */
const cuantas = (estado: EstadoTarea, r: ResumenTareasDTO) =>
  estado === "COMPLETADA"
    ? r.completadas
    : estado === "PENDIENTE"
      ? r.pendientes
      : r.vencidas;

/**
 * Answers «¿qué tareas respaldan la carga de esta semana?»: the week's facts, the tasks as they stood at
 * its close with the counts they reproduce, and one task's history on request. The status filter, page,
 * record and task live in the URL, so the view can be shared and survives a reload.
 */
export function SemanaTareas({
  employeeId,
  periodStart,
}: {
  employeeId: string;
  periodStart: string;
}) {
  const { usuario } = useSesion();
  const router = useRouter();
  const buscar = useSearchParams();
  const estado = estadoDe(buscar.get("estado"));
  const page = paginaDe(buscar.get("page"));
  const tarea = buscar.get("tarea") ?? undefined;
  const recordId = buscar.get("recordId") ?? undefined;

  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(
    (signal) =>
      tareasApi.semana(
        { employeeId, periodStart, recordId, estado, page },
        signal,
      ),
    usuario
      ? `tareas:${employeeId}:${periodStart}:${recordId ?? ""}:${estado ?? ""}:${page}`
      : null,
  );
  // A new filter or page keeps the last answer on screen until the next one arrives.
  const [ultimo, setUltimo] = useState<TareasSemanaDTO | null>(null);
  if (consulta.estado === "listo" && consulta.datos !== ultimo)
    setUltimo(consulta.datos);
  const datos = useArrival(readyFor, caja, ultimo);
  const actualizando = consulta.estado === "cargando" && datos !== null;
  useRowsEnter(filas, datos?.tareas.items);

  const vista = { employeeId, periodStart, recordId, estado, page, tarea };
  const ir = (cambio: Partial<typeof vista>) =>
    router.replace(hrefTareasSemana({ ...vista, ...cambio }), {
      scroll: false,
    });
  const volver = {
    href: `/employees/${employeeId}`,
    texto: "Ficha de la persona",
  };

  if (consulta.estado === "error" && !datos)
    return (
      <div ref={pagina} className={s.page}>
        <PageHeader titulo="No se pudieron abrir las tareas" volver={volver} />
        <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
      </div>
    );

  const resultado = datos?.resultado ?? null;
  const total = datos?.tareas.total ?? 0;
  const paginas = datos ? Math.ceil(total / datos.tareas.pageSize) : 1;
  const hayFilas = !!datos && datos.tareasVisibles && datos.resumen.total > 0;

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        volver={volver}
        titulo={
          datos ? (
            `${datos.persona.nombre}, semana ${textoSemana(datos.semana.periodStart, datos.semana.periodEnd)}`
          ) : (
            <Skeleton ancho="24ch" />
          )
        }
        contexto={
          datos ? (
            `${TIPO[datos.persona.tipo]} en ${datos.persona.equipo}`
          ) : (
            <Skeleton ancho="24ch" />
          )
        }
        acciones={
          resultado ? (
            <ButtonLink href={`/reports/${resultado.evaluationId}`}>
              Ver informe de la semana
            </ButtonLink>
          ) : undefined
        }
      />

      <Section
        titulo="Datos de la semana"
        aside={
          datos && !datos.semana.vigente ? (
            <span>Versión anterior de los datos de la semana</span>
          ) : undefined
        }
      >
        <div ref={caja}>
          {!datos ? (
            <SkeletonRows filas={2} />
          ) : (
            <KeyFacts
              items={[
                ...(resultado
                  ? [
                      {
                        // A result that is not current keeps its figure, named as calculated (as the report does).
                        termino: resultado.actualizado
                          ? "Índice"
                          : "Índice calculado",
                        ayuda: DEFINICION.indice,
                        valor: decimal(resultado.indice),
                      },
                    ]
                  : []),
                {
                  termino: "Nivel",
                  ayuda: DEFINICION.nivel,
                  valor: (
                    <LevelTag
                      nivel={resultado?.nivel ?? null}
                      actualizado={resultado?.actualizado ?? true}
                    />
                  ),
                },
                {
                  termino: FACTOR.HE,
                  ayuda: DEFINICION_FACTOR.HE,
                  valor: valorFactor("HE", datos.indicadores.horasExtra),
                },
                {
                  termino: FACTOR.DS,
                  ayuda: DEFINICION_FACTOR.DS,
                  valor: valorFactor(
                    "DS",
                    datos.indicadores.diasConsecutivosSinDescanso,
                  ),
                },
                {
                  termino: FACTOR.CT,
                  ayuda: DEFINICION_FACTOR.CT,
                  valor: textoTareas({
                    activas: datos.indicadores.tareasActivas,
                    pendientes: datos.indicadores.tareasPendientes,
                    vencidas: datos.indicadores.tareasVencidas,
                  }),
                },
                {
                  termino: FACTOR.VP,
                  ayuda: DEFINICION_FACTOR.VP,
                  valor: valorFactor(
                    "VP",
                    datos.indicadores.vacacionesPendientesDias,
                  ),
                },
              ]}
            />
          )}
        </div>
      </Section>

      <Section titulo="Estado de las tareas">
        {!datos ? <SkeletonRows filas={3} /> : <ResumenTareas semana={datos} />}
      </Section>

      <Section titulo="Tareas de la semana">
        {hayFilas && (
          <Toolbar>
            <SelectField
              etiqueta="Estado"
              value={estado ?? ""}
              onChange={(e) =>
                ir({
                  estado: estadoDe(e.target.value),
                  page: 1,
                  tarea: undefined,
                })
              }
            >
              <option value="">Todas ({entero(datos.resumen.total)})</option>
              {ESTADOS_TAREA.map((e) => (
                <option key={e} value={e}>
                  {GRUPO_ESTADO[e]} ({entero(cuantas(e, datos.resumen))})
                </option>
              ))}
            </SelectField>
            <p className={s.count} role="status">
              {total === datos.resumen.total
                ? contar(total, "tarea", "tareas")
                : `${entero(total)} de ${contar(datos.resumen.total, "tarea", "tareas")}`}
            </p>
          </Toolbar>
        )}
        <div
          aria-busy={actualizando}
          className={s.results}
          data-actualizando={actualizando || undefined}
        >
          {consulta.estado === "error" ? (
            <ErrorBox
              mensaje={consulta.mensaje}
              onRetry={consulta.reintentar}
            />
          ) : !datos ? (
            <SkeletonRows filas={6} />
          ) : !datos.tareasVisibles ? (
            <Empty titulo="El detalle de tareas no está disponible para su perfil">
              El detalle de las tareas de técnicos lo consultan RR. HH. y el
              Team Lead del equipo. Gerencia consulta el de los Team Leads.
            </Empty>
          ) : datos.detalle === "SIN_DETALLE" ? (
            <Empty titulo="Todavía no hay detalle de tareas para esta semana">
              Los conteos de la semana se importaron como resumen. El detalle
              aparecerá cuando RR. HH. importe el archivo de tareas.
            </Empty>
          ) : datos.resumen.total === 0 ? (
            <Empty titulo="Sin tareas esta semana">
              La semana no registra tareas asignadas ni abiertas.
            </Empty>
          ) : total === 0 ? (
            <Empty
              titulo="Ninguna tarea coincide con el estado seleccionado"
              accion={
                <Button onClick={() => ir({ estado: undefined, page: 1 })}>
                  Quitar filtros
                </Button>
              }
            />
          ) : (
            <TablaTareas
              etiqueta={`Tareas de ${datos.persona.nombre}, semana ${textoSemana(datos.semana.periodStart, datos.semana.periodEnd)}`}
              tareas={datos.tareas.items}
              semanaInicio={datos.semana.periodStart}
              historial={(taskId) =>
                hrefTareasSemana({ ...vista, tarea: taskId })
              }
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
      </Section>

      {tarea && datos?.tareasVisibles && (
        <HistorialTarea
          key={tarea}
          employeeId={employeeId}
          taskId={tarea}
          cerrar={hrefTareasSemana({ ...vista, tarea: undefined })}
        />
      )}
    </div>
  );
}
