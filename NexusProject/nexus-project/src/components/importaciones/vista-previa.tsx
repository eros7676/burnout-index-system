import { useRef } from "react";
import { entero } from "@/shared/formato";
import { useRowsEnter } from "@/shared/motion";
import { Button, ErrorBox, Figure, Notice, Section } from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import { WeekDataTable } from "@/shared/ui/week-data-table";
import { Conciliacion, MuestraTareas } from "./conciliacion";
import { ConciliacionJornadas, MuestraJornadas } from "./conciliacion-jornadas";
import {
  CONJUNTOS,
  conjuntoDe,
  esVistaJornadas,
  esVistaTareas,
  type VistaImportacion,
} from "./conjuntos";
import { PieAsistente } from "./pie-asistente";
import { TablaErrores } from "./tabla-errores";
import s from "./importaciones.module.css";

const plural = (n: number, uno: string, varios: string) =>
  `${entero(n)} ${n === 1 ? uno : varios}`;

/** Minutes left before the preview expires, in words. */
function restante(ms: number) {
  const minutos = Math.ceil(ms / 60_000);
  return minutos <= 1 ? "1 min" : `${minutos} min`;
}

/** Step 2: what would happen with this file, and the decision to confirm it. */
export function VistaPrevia({
  vista,
  archivo,
  vencida,
  msRestantes,
  ocupado,
  pendiente,
  onConfirmar,
  onCancelar,
  onVolver,
}: {
  vista: VistaImportacion;
  archivo: string | null;
  vencida: boolean;
  msRestantes: number | null;
  ocupado: boolean;
  /** A confirmation whose answer was lost: only recovering it is allowed. */
  pendiente: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
  onVolver: () => void;
}) {
  const filas = useRef<HTMLTableSectionElement>(null);
  useRowsEnter(filas, vista.muestra);
  const tareas = esVistaTareas(vista) ? vista : null;
  const jornadas = esVistaJornadas(vista) ? vista : null;
  const conjunto = CONJUNTOS[conjuntoDe(vista)];
  const rechazada = vista.status === "RECHAZADA";
  const errores = vista.errores.length;
  const sinConciliar = (tareas ?? jornadas)?.conciliacion.diferencias ?? 0;
  /** What the file holds, in the words of the messages below. */
  const ninguno = tareas ? "ninguna tarea" : jornadas ? "ningún día" : "ningún registro";

  return (
    <>
      <Section
        titulo="Vista previa"
        aside={
          <>
            <span className={s.archivo}>
              {conjunto.etiqueta}
              {archivo && ` · ${archivo}`}
            </span>
            <StatusTag tono={rechazada ? "incidencia" : "exito"}>
              {rechazada ? "Rechazada" : "Validada"}
            </StatusTag>
          </>
        }
      >
        <div className={s.figuras}>
          <Figure
            etiqueta="Filas"
            valor={entero(vista.totalFilas)}
            detalle="en el archivo"
          />
          <Figure
            etiqueta="Nuevas"
            valor={entero(vista.nuevas)}
            detalle={rechazada ? "válidas, sin guardar" : "se guardarán"}
          />
          <Figure
            etiqueta="Omitidas"
            valor={entero(vista.omitidas)}
            detalle="ya estaban cargadas"
          />
          {tareas && (
            <Figure
              etiqueta="Excluidas"
              valor={entero(tareas.excluidas)}
              detalle="canceladas o reasignadas"
            />
          )}
          {rechazada ? (
            <Figure
              etiqueta="Errores"
              valor={entero(errores)}
              detalle="deben corregirse"
            />
          ) : (
            <Figure
              etiqueta="Vence en"
              valor={
                vencida || msRestantes === null ? "—" : restante(msRestantes)
              }
              detalle="luego deberá validarse nuevamente"
            />
          )}
        </div>

        <div className={s.avisos}>
          {vencida && (
            <ErrorBox mensaje="La vista previa venció. Valide el archivo nuevamente." />
          )}
          {rechazada && !vencida && (
            <ErrorBox
              mensaje={`El archivo tiene ${plural(errores, "error", "errores")} y no se guardó ${ninguno}. Corrija el archivo y valídelo nuevamente.`}
            />
          )}
          {sinConciliar > 0 && !vencida && (
            <Notice tono="aviso">
              {sinConciliar === 1
                ? "El detalle de una semana no suma lo que informa su resumen semanal."
                : `El detalle de ${entero(sinConciliar)} semanas no suma lo que informa su resumen semanal.`}{" "}
              Para no guardar {jornadas ? "días" : "tareas"} que contradigan los indicadores, se rechaza
              el archivo completo. Corrija el detalle o los indicadores
              semanales y valide nuevamente.
            </Notice>
          )}
          {!rechazada && !vencida && vista.nuevas === 0 && (
            <Notice>
              {tareas
                ? "Todas las tareas ya están cargadas. Confirmar no duplica ningún dato."
                : jornadas
                  ? "Todos los días ya están cargados. Confirmar no duplica ningún dato."
                  : "Todos los registros ya existen. Confirmar no duplica ningún dato."}
            </Notice>
          )}
        </div>
      </Section>

      {errores > 0 && (
        <Section
          titulo="Errores"
          aside={
            <span>{plural(errores, "error", "errores")}, por fila y campo</span>
          }
        >
          <TablaErrores etiqueta="Errores del archivo" items={vista.errores} />
        </Section>
      )}

      {vista.warnings.length > 0 && (
        <Section
          titulo="Advertencias"
          aside={<span>No impiden confirmar; se recomienda revisarlas</span>}
        >
          <TablaErrores
            etiqueta="Advertencias del archivo"
            items={vista.warnings}
          />
        </Section>
      )}

      {tareas && tareas.conciliacion.filas.length > 0 && (
        <Conciliacion resumen={tareas.conciliacion} />
      )}

      {jornadas && jornadas.conciliacion.filas.length > 0 && (
        <ConciliacionJornadas resumen={jornadas.conciliacion} />
      )}

      {tareas
        ? tareas.muestraTareas.length > 0 && (
            <MuestraTareas tareas={tareas.muestraTareas} />
          )
        : jornadas
          ? jornadas.muestraJornadas.length > 0 && <MuestraJornadas dias={jornadas.muestraJornadas} />
          : vista.muestra.length > 0 && (
            <Section
              titulo="Primeras filas válidas"
              aside={
                <span>
                  {vista.muestra.length === 1
                    ? "1 fila, tal como viene en el archivo"
                    : `${vista.muestra.length} filas, tal como vienen en el archivo`}
                </span>
              }
            >
              <WeekDataTable
                etiqueta="Muestra de filas válidas"
                filas={vista.muestra}
                legajo
                opcionales
                cuerpoRef={filas}
              />
            </Section>
          )}

      <PieAsistente
        izquierda={
          !pendiente && (
            <Button disabled={ocupado} onClick={onCancelar}>
              Cancelar
            </Button>
          )
        }
        derecha={
          <>
            {!pendiente && (
              <Button disabled={ocupado} onClick={onVolver}>
                Volver
              </Button>
            )}
            <Button
              variante="primary"
              disabled={
                ocupado || vencida || rechazada || errores > 0 || pendiente
              }
              onClick={onConfirmar}
            >
              Confirmar importación
            </Button>
          </>
        }
      />
    </>
  );
}
