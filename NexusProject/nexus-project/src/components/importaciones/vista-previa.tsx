import { useRef } from "react";
import type { VistaPrevia as Vista } from "@/shared/contracts";
import { entero } from "@/shared/formato";
import { useRowsEnter } from "@/shared/motion";
import { Button, ErrorBox, Figure, Notice, Section } from "@/shared/ui";
import { WeekDataTable } from "@/shared/ui/week-data-table";
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
  onOtroArchivo,
}: {
  vista: Vista;
  archivo: string | null;
  vencida: boolean;
  msRestantes: number | null;
  ocupado: boolean;
  /** A confirmation whose answer was lost: only recovering it is allowed. */
  pendiente: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
  onOtroArchivo: () => void;
}) {
  const filas = useRef<HTMLTableSectionElement>(null);
  useRowsEnter(filas, vista.muestra);
  const rechazada = vista.status === "RECHAZADA";
  const errores = vista.errores.length;

  return (
    <>
      <Section
        titulo="Vista previa"
        aside={
          <>
            {archivo && <span className={s.archivo}>{archivo}</span>}
            <span className={s.estado} data-estado={vista.status}>
              {rechazada ? "Rechazada" : "Validada"}
            </span>
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
            detalle={rechazada ? "válidas, sin guardar" : "se van a guardar"}
          />
          <Figure
            etiqueta="Omitidas"
            valor={entero(vista.omitidas)}
            detalle="ya estaban cargadas"
          />
          {rechazada ? (
            <Figure
              etiqueta="Errores"
              valor={entero(errores)}
              detalle="hay que corregirlos"
            />
          ) : (
            <Figure
              etiqueta="Vence en"
              valor={vencida || msRestantes === null ? "—" : restante(msRestantes)}
              detalle="después, hay que validar otra vez"
            />
          )}
        </div>

        <div className={s.avisos}>
          {vencida && (
            <ErrorBox mensaje="La vista previa venció. Volvé a validar el archivo." />
          )}
          {rechazada && !vencida && (
            <ErrorBox
              mensaje={`El archivo tiene ${plural(errores, "error", "errores")}. No se guardó nada: corregilo y volvé a validarlo.`}
            />
          )}
          {!rechazada && !vencida && vista.nuevas === 0 && (
            <Notice>
              Todos los registros ya existen. Confirmar no duplica ningún dato.
            </Notice>
          )}
        </div>

        <div className={s.acciones}>
          <Button
            variante="primary"
            disabled={
              ocupado || vencida || rechazada || errores > 0 || pendiente
            }
            onClick={onConfirmar}
          >
            Confirmar importación
          </Button>
          {!pendiente && (
            <Button disabled={ocupado} onClick={onCancelar}>
              Cancelar
            </Button>
          )}
          {(vencida || rechazada) && !pendiente && (
            <Button variante="quiet" disabled={ocupado} onClick={onOtroArchivo}>
              Elegir otro archivo
            </Button>
          )}
        </div>
      </Section>

      {errores > 0 && (
        <Section
          titulo="Errores"
          aside={<span>{plural(errores, "error", "errores")}, por fila y campo</span>}
        >
          <TablaErrores etiqueta="Errores del archivo" items={vista.errores} />
        </Section>
      )}

      {vista.warnings.length > 0 && (
        <Section
          titulo="Advertencias"
          aside={<span>No impiden confirmar; conviene revisarlas</span>}
        >
          <TablaErrores
            etiqueta="Advertencias del archivo"
            items={vista.warnings}
          />
        </Section>
      )}

      {vista.muestra.length > 0 && (
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
    </>
  );
}
