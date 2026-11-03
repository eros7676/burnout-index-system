import { useRef, type ReactNode } from "react";
import type { EstadoJob, JobDTO } from "@/shared/contracts";
import { entero, momento, semana as textoSemana } from "@/shared/formato";
import { useRowsEnter } from "@/shared/motion";
import { Button, DataTable, Figure, Notice, Section } from "@/shared/ui";
import { esResultadoTareas, type ResultadoConfirmacion } from "./conjuntos";
import { problema } from "./textos";
import s from "./importaciones.module.css";

/** The job as a whole; per-person states use formato.ESTADO_PROCESO instead. */
const ESTADO_JOB: Record<EstadoJob, string> = {
  PENDIENTE: "Pendiente",
  PROCESANDO: "En proceso",
  COMPLETADO: "Completado",
  FALLIDO: "Con error",
};

/** A confirmation whose answer never arrived: repeat it with the same id (idempotent). */
export function ConfirmacionPendiente({
  importId,
  ocupado,
  onRecuperar,
}: {
  importId: string;
  ocupado: boolean;
  onRecuperar: () => void;
}) {
  return (
    <Section titulo="Confirmación sin respuesta">
      <div className={s.bloque}>
        <p>
          No se pudo comprobar si la confirmación llegó al servidor. Recupérela
          antes de importar otro archivo; repetirla no duplica datos.
        </p>
        <p className={s.meta}>
          Código de la importación <code className={s.id}>{importId}</code>
        </p>
        <div className={s.acciones}>
          <Button variante="primary" disabled={ocupado} onClick={onRecuperar}>
            Recuperar confirmación
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** What was saved: separate from the calculation, which may still fail. */
export function ResultadoConfirmado({
  resultado,
  acciones,
}: {
  resultado: ResultadoConfirmacion;
  acciones?: ReactNode;
}) {
  const tareas = esResultadoTareas(resultado) ? resultado : null;
  return (
    <Section titulo="Importación confirmada">
      <div className={s.bloque}>
        <div className={s.figurasDos}>
          <Figure
            etiqueta="Guardadas"
            valor={entero(resultado.insertados)}
            detalle={
              tareas
                ? resultado.insertados === 1
                  ? "tarea nueva"
                  : "tareas nuevas"
                : resultado.insertados === 1
                  ? "fila nueva"
                  : "filas nuevas"
            }
          />
          <Figure
            etiqueta="Omitidas"
            valor={entero(resultado.omitidos)}
            detalle="ya estaban cargadas"
          />
          {tareas && (
            <>
              <Figure
                etiqueta="Semanas"
                valor={entero(tareas.semanas)}
                detalle="con el detalle de tareas"
              />
              <Figure
                etiqueta="Excluidas"
                valor={entero(tareas.excluidas)}
                detalle="canceladas o reasignadas"
              />
            </>
          )}
        </div>
        {tareas ? (
          <Notice>
            {resultado.insertados === 0 ? "No se duplicó ningún dato. " : ""}
            Los índices y las alertas no cambian: el detalle de tareas no
            requiere un nuevo cálculo.
          </Notice>
        ) : (
          !resultado.procesamiento && (
            <Notice>
              No hay semanas nuevas para calcular. No se duplicó ningún dato.
            </Notice>
          )
        )}
        {acciones && <div className={s.acciones}>{acciones}</div>}
      </div>
    </Section>
  );
}

/** The calculation started by an import: progress, failed weeks and what to do next. */
export function Procesamiento({
  job,
  ocupado,
  onConsultar,
  onReintentar,
  acciones,
}: {
  job: JobDTO;
  ocupado: boolean;
  onConsultar: () => void;
  onReintentar: () => void;
  acciones?: ReactNode;
}) {
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  useRowsEnter(cuerpo, job.errores);
  const completo = job.estado === "COMPLETADO";
  const parte = job.totalPares
    ? Math.round((job.completados / job.totalPares) * 100)
    : 100;
  return (
    <Section
      titulo="Procesamiento"
      aside={<span>Cálculo del índice de cada semana nueva</span>}
    >
      <div className={s.bloque}>
        <div className={s.progreso} role="status">
          <p className={s.progresoTexto}>
            <strong data-estado={job.estado}>{ESTADO_JOB[job.estado]}</strong>
            <span className="num">
              {entero(job.completados)} de {entero(job.totalPares)}{" "}
              {job.totalPares === 1 ? "semana calculada" : "semanas calculadas"}
            </span>
          </p>
          <span className={s.barra} aria-hidden="true">
            <span data-estado={job.estado} style={{ width: `${parte}%` }} />
          </span>
          <p className={s.meta}>
            {completo
              ? "El cálculo terminó para todas las semanas."
              : "Los datos confirmados quedan guardados aunque el cálculo no termine."}{" "}
            Actualizado el {momento(job.updatedAt)}.
          </p>
        </div>

        {job.errores.length > 0 && (
          <DataTable etiqueta="Semanas que no se pudieron calcular">
            <thead>
              <tr>
                <th scope="col">Legajo</th>
                <th scope="col">Semana</th>
                <th scope="col">Problema</th>
              </tr>
            </thead>
            <tbody ref={cuerpo}>
              {job.errores.map((e) => (
                <tr key={`${e.par.employeeId}-${e.par.periodStart}`}>
                  <th scope="row">{e.par.employeeId}</th>
                  <td className={s.semana}>
                    {textoSemana(e.par.periodStart, e.par.periodEnd)}
                  </td>
                  <td className={s.detalle}>
                    {e.detalle}
                    <span className={s.codigo}>{problema(e.codigo)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        <div className={s.acciones}>
          {!completo && (
            <>
              <Button
                variante={job.estado === "FALLIDO" ? "primary" : "secondary"}
                disabled={
                  ocupado || !["PENDIENTE", "FALLIDO"].includes(job.estado)
                }
                onClick={onReintentar}
              >
                Reintentar procesamiento
              </Button>
              <Button disabled={ocupado} onClick={onConsultar}>
                Consultar estado
              </Button>
            </>
          )}
          {acciones}
        </div>
        <p className={s.meta}>
          Código del procesamiento <code className={s.id}>{job.jobId}</code>
        </p>
      </div>
    </Section>
  );
}

/** Reads a job by id after a reload or a lost answer (T06). Collapsed unless one is pending. */
export function RecuperarProcesamiento({
  abierto,
  onAbrir,
  jobId,
  onJobId,
  ocupado,
  onConsultar,
}: {
  abierto: boolean;
  onAbrir: (abierto: boolean) => void;
  jobId: string;
  onJobId: (valor: string) => void;
  ocupado: boolean;
  onConsultar: () => void;
}) {
  return (
    <details
      className={s.recuperar}
      data-enter
      open={abierto}
      onToggle={(e) => onAbrir(e.currentTarget.open)}
    >
      <summary>¿Se interrumpió un procesamiento?</summary>
      <form
        className={s.recuperarForm}
        onSubmit={(e) => {
          e.preventDefault();
          onConsultar();
        }}
      >
        <label className={s.campoTexto}>
          <span>Código del procesamiento</span>
          <input
            value={jobId}
            onChange={(e) => onJobId(e.target.value)}
            disabled={ocupado}
            required
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <Button type="submit" disabled={ocupado || !jobId.trim()}>
          Consultar estado
        </Button>
      </form>
    </details>
  );
}
