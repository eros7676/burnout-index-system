import { useId, useRef, useState } from "react";
import type {
  ConciliacionSemana,
  EstadoTareaCierre,
  MuestraTarea,
  ResumenConciliacion,
} from "@/shared/contratos/importaciones";
import { diaCorto, entero, semana as textoSemana } from "@/shared/formato";
import { useRowsEnter } from "@/shared/motion";
import { Button, DataTable, Section, tabla } from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import s from "./importaciones.module.css";

/** Weeks listed before the user asks for all of them: the decision to confirm stays in reach. */
const SEMANAS_VISIBLES = 10;
const CONTEOS = ["activas", "pendientes", "vencidas"] as const;

const plural = (n: number, uno: string, varios: string) =>
  `${entero(n)} ${n === 1 ? uno : varios}`;

/** What the file's tasks add up to; when it differs from the weekly summary, the summary's value. */
function Conteo({
  derivado,
  esperado,
}: {
  derivado: number;
  esperado: number | null;
}) {
  return (
    <>
      {entero(derivado)}
      {esperado !== null && esperado !== derivado && (
        <span className={s.esperado}>Resumen: {entero(esperado)}</span>
      )}
    </>
  );
}

function Resultado({ semana }: { semana: ConciliacionSemana }) {
  if (semana.estado === "DIFERENCIA")
    return <StatusTag tono="incidencia">No coincide</StatusTag>;
  if (semana.estado === "SIN_RESUMEN")
    return <StatusTag tono="aviso">Sin resumen</StatusTag>;
  return (
    <>
      <StatusTag tono="exito">Coincide</StatusTag>
      {semana.yaCargada && <span className={tabla.sub}>Ya cargada</span>}
    </>
  );
}

/**
 * Control totals (task evidence, option A): for each employee-week, the task counts that the
 * file adds up to against the counts of the weekly summary. Any difference rejects the file.
 */
export function Conciliacion({ resumen }: { resumen: ResumenConciliacion }) {
  const id = useId();
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  const [todas, setTodas] = useState(false);
  useRowsEnter(cuerpo, todas);
  const visibles = todas
    ? resumen.filas
    : resumen.filas.slice(0, SEMANAS_VISIBLES);
  const resto = resumen.filas.length - SEMANAS_VISIBLES;

  // "N de M semanas coinciden", then what does not.
  const partes = [
    `${entero(resumen.coinciden)} de ${plural(resumen.semanas, "semana coincide", "semanas coinciden")}`,
  ];
  if (resumen.diferencias > 0)
    partes.push(plural(resumen.diferencias, "no coincide", "no coinciden"));
  if (resumen.sinResumen > 0)
    partes.push(`${entero(resumen.sinResumen)} sin resumen`);

  return (
    <Section
      titulo="Conciliación con el resumen semanal"
      aside={<span>{partes.join("; ")}</span>}
    >
      <div className={s.bloque}>
        <p className={s.meta}>
          Cada cifra es lo que suman las tareas del archivo. Si difiere del
          resumen semanal, se indica el valor del resumen.
        </p>
        <div id={id}>
          <DataTable etiqueta="Conciliación de tareas por semana">
            <thead>
              <tr>
                <th scope="col">Legajo</th>
                <th scope="col">Semana</th>
                <th scope="col" className={tabla.num}>
                  Tareas
                </th>
                <th scope="col" className={tabla.num}>
                  Activas
                </th>
                <th scope="col" className={tabla.num}>
                  Pendientes
                </th>
                <th scope="col" className={tabla.num}>
                  Vencidas
                </th>
                <th scope="col" className={tabla.centro}>
                  Resultado
                </th>
              </tr>
            </thead>
            <tbody ref={cuerpo}>
              {visibles.map((f) => (
                <tr key={`${f.employeeId}-${f.periodStart}`}>
                  <th scope="row">{f.employeeId}</th>
                  <td className={s.semana}>
                    {textoSemana(f.periodStart, f.periodEnd)}
                  </td>
                  <td className={tabla.num}>
                    {entero(f.tareas)}
                    {f.excluidas > 0 && (
                      <span className={tabla.sub}>
                        {plural(f.excluidas, "excluida", "excluidas")}
                      </span>
                    )}
                  </td>
                  {CONTEOS.map((campo) => (
                    <td key={campo} className={tabla.num}>
                      <Conteo
                        derivado={f.derivado[campo]}
                        esperado={f.esperado ? f.esperado[campo] : null}
                      />
                    </td>
                  ))}
                  <td className={tabla.centro}>
                    <Resultado semana={f} />
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
        {resumen.truncada && (
          <p className={s.meta}>
            Se muestran {entero(resumen.filas.length)} de{" "}
            {entero(resumen.semanas)} semanas, las que no coinciden primero.
          </p>
        )}
        {resto > 0 && (
          <div className={s.acciones}>
            <Button
              variante="quiet"
              aria-expanded={todas}
              aria-controls={id}
              onClick={() => setTodas(!todas)}
            >
              {todas
                ? "Ver menos semanas"
                : `Ver ${plural(resto, "semana más", "semanas más")}`}
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}

const ESTADO: Record<
  EstadoTareaCierre,
  { texto: string; tono: "neutro" | "aviso" | "exito" }
> = {
  COMPLETADA: { texto: "Completada", tono: "exito" },
  PENDIENTE: { texto: "Pendiente", tono: "neutro" },
  VENCIDA: { texto: "Vencida", tono: "aviso" },
};

/** "5 oct 2026"; an open task has no completion date. */
const fecha = (iso: string | null) =>
  iso ? `${diaCorto(iso)} ${iso.slice(0, 4)}` : "—";

function atraso(dias: number | null) {
  if (dias === null) return null;
  return dias === 0
    ? "Venció al cierre de la semana"
    : `${plural(dias, "día", "días")} de atraso`;
}

/** The first valid tasks of the file, with the state each one has at the week's close. */
export function MuestraTareas({ tareas }: { tareas: MuestraTarea[] }) {
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  useRowsEnter(cuerpo, tareas);
  return (
    <Section
      titulo="Primeras tareas válidas"
      aside={
        <span>
          {tareas.length === 1
            ? "1 tarea, tal como viene en el archivo"
            : `${tareas.length} tareas, tal como vienen en el archivo`}
        </span>
      }
    >
      <DataTable etiqueta="Muestra de tareas válidas">
        <thead>
          <tr>
            <th scope="col">Legajo</th>
            <th scope="col">Tarea</th>
            <th scope="col">Título</th>
            <th scope="col">Asignada</th>
            <th scope="col">Vence</th>
            <th scope="col">Finalizada</th>
            <th scope="col" className={tabla.centro}>
              Estado al cierre
            </th>
          </tr>
        </thead>
        <tbody ref={cuerpo}>
          {tareas.map((t) => (
            <tr key={`${t.employeeId}-${t.periodStart}-${t.taskId}`}>
              <th scope="row">
                {t.employeeId}
                <span className={tabla.sub}>
                  Semana del {diaCorto(t.periodStart)}
                </span>
              </th>
              <td className={s.semana}>
                {t.taskId}
                <span className={tabla.sub}>{t.origen}</span>
              </td>
              <td className={s.titulo}>{t.titulo}</td>
              <td className={s.semana}>{fecha(t.asignadaEl)}</td>
              <td className={s.semana}>{fecha(t.venceEl)}</td>
              <td className={s.semana}>{fecha(t.completadaEl)}</td>
              <td className={tabla.centro}>
                <StatusTag tono={ESTADO[t.estadoCierre].tono}>
                  {ESTADO[t.estadoCierre].texto}
                </StatusTag>
                {atraso(t.diasAtraso) && (
                  <span className={tabla.sub}>{atraso(t.diasAtraso)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Section>
  );
}
