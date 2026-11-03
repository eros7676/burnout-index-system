"use client";
import { useState } from "react";
import { useConsulta } from "@/client/use-consulta";
import { ESTADOS_TAREA, type MisTareasDTO } from "@/shared/contratos/tareas";
import { entero, semana as textoSemana } from "@/shared/formato";
import {
  Button,
  Empty,
  ErrorBox,
  Section,
  SelectField,
  SkeletonRows,
  Toolbar,
} from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import { useSesion } from "../shell/sesion";
import { ResumenTareas } from "./resumen-tareas";
import { TablaTareas } from "./tabla-tareas";
import { tareasApi } from "./tareas-api";
import { GRUPO_ESTADO } from "./textos";
import s from "./tareas-propias.module.css";

type Estado = (typeof ESTADOS_TAREA)[number];

const contar = (n: number, una: string, varias: string) =>
  `${entero(n)} ${n === 1 ? una : varias}`;

/**
 * The signed-in person's own tasks, week by week, as they stood at each close (ILO 11.2, Ley 25.326 art. 14).
 * It carries no index or level (RF10) and offers the route to ask for a correction (ILO 11.9, art. 16).
 */
export function TareasPropias() {
  const { usuario } = useSesion();
  const [periodStart, setPeriodStart] = useState<string>();
  const [estado, setEstado] = useState<Estado>();
  const [page, setPage] = useState(1);
  const consulta = useConsulta(
    (signal) => tareasApi.propias({ periodStart, estado, page }, signal),
    usuario
      ? `mis-tareas:${usuario.userId}:${periodStart ?? ""}:${estado ?? ""}:${page}`
      : null,
  );
  // A new week, filter or page keeps the last answer on screen until the next one arrives.
  const [ultimo, setUltimo] = useState<MisTareasDTO | null>(null);
  if (consulta.estado === "listo" && consulta.datos !== ultimo)
    setUltimo(consulta.datos);
  const datos = ultimo;
  const semana = datos?.semana ?? null;
  const actualizando = consulta.estado === "cargando" && datos !== null;

  const elegirSemana = (valor: string) => {
    setPeriodStart(valor);
    setEstado(undefined);
    setPage(1);
  };
  const total = semana?.tareas.total ?? 0;
  const paginas = semana ? Math.ceil(total / semana.tareas.pageSize) : 1;
  const hayFilas = !!semana && semana.resumen.total > 0;

  return (
    <Section titulo="Tareas por semana">
      {consulta.estado === "error" && !datos ? (
        <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
      ) : !datos ? (
        <SkeletonRows filas={5} />
      ) : !semana ? (
        <Empty titulo="Todavía no hay tareas cargadas con su legajo">
          Sus tareas aparecerán cuando RR. HH. importe una semana con su legajo.
        </Empty>
      ) : (
        <>
          <Toolbar>
            <SelectField
              etiqueta="Semana"
              value={semana.semana.periodStart}
              onChange={(e) => elegirSemana(e.target.value)}
            >
              {datos.semanas.map((w) => (
                <option key={w.periodStart} value={w.periodStart}>
                  {textoSemana(w.periodStart, w.periodEnd)}
                </option>
              ))}
            </SelectField>
            {hayFilas && semana.tareasVisibles && (
              <SelectField
                etiqueta="Estado"
                value={estado ?? ""}
                onChange={(e) => {
                  setEstado(ESTADOS_TAREA.find((x) => x === e.target.value));
                  setPage(1);
                }}
              >
                <option value="">Todas ({entero(semana.resumen.total)})</option>
                {ESTADOS_TAREA.map((e) => (
                  <option key={e} value={e}>
                    {GRUPO_ESTADO[e]} (
                    {entero(
                      e === "COMPLETADA"
                        ? semana.resumen.completadas
                        : e === "PENDIENTE"
                          ? semana.resumen.pendientes
                          : semana.resumen.vencidas,
                    )}
                    )
                  </option>
                ))}
              </SelectField>
            )}
            {hayFilas && (
              <p className={s.count} role="status">
                {total === semana.resumen.total
                  ? contar(total, "tarea", "tareas")
                  : `${entero(total)} de ${contar(semana.resumen.total, "tarea", "tareas")}`}
              </p>
            )}
          </Toolbar>

          <div className={s.body}>
            <ResumenTareas semana={semana} />

            <div
              aria-busy={actualizando}
              data-actualizando={actualizando || undefined}
              className={s.results}
            >
              {consulta.estado === "error" ? (
                <ErrorBox
                  mensaje={consulta.mensaje}
                  onRetry={consulta.reintentar}
                />
              ) : semana.detalle === "SIN_DETALLE" ? (
                <Empty titulo="Todavía no hay detalle de tareas para esta semana">
                  Los conteos de la semana se importaron como resumen. El
                  detalle aparecerá cuando RR. HH. importe el archivo de tareas.
                </Empty>
              ) : semana.resumen.total === 0 ? (
                <Empty titulo="Sin tareas esta semana">
                  La semana no registra tareas asignadas ni abiertas.
                </Empty>
              ) : total === 0 ? (
                <Empty
                  titulo="Ninguna tarea coincide con el estado seleccionado"
                  accion={
                    <Button
                      onClick={() => {
                        setEstado(undefined);
                        setPage(1);
                      }}
                    >
                      Quitar filtros
                    </Button>
                  }
                />
              ) : (
                <TablaTareas
                  etiqueta={`Sus tareas, semana ${textoSemana(semana.semana.periodStart, semana.semana.periodEnd)}`}
                  tareas={semana.tareas.items}
                  semanaInicio={semana.semana.periodStart}
                />
              )}
            </div>
            {hayFilas && paginas > 1 && (
              <Pagination
                pagina={page}
                paginas={paginas}
                onCambio={setPage}
                etiqueta="Paginación de sus tareas"
              />
            )}
            <p className={s.note}>
              Si algún dato no coincide con su registro, solicite la corrección
              a RR. HH.
            </p>
          </div>
        </>
      )}
    </Section>
  );
}
