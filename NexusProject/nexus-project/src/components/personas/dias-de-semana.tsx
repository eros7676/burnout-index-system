"use client";
import { useRef } from "react";
import { useConsulta } from "@/client/use-consulta";
import type { DiaDTO } from "@/shared/contratos/jornadas";
import { TIPO_DIA, diaConNombre, horas, semana as textoSemana } from "@/shared/formato";
import { useRowsEnter } from "@/shared/motion";
import { DataTable, Empty, ErrorBox, Section, SkeletonRows, tabla } from "@/shared/ui";
import { useSesion } from "../shell/sesion";
import { tareasApi } from "../tareas/tareas-api";
import s from "./dias-de-semana.module.css";

/** Seven rows; a day off shows no hours, not zero hours. */
function TablaDias({ dias, etiqueta }: { dias: DiaDTO[]; etiqueta: string }) {
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  useRowsEnter(cuerpo, dias);
  return (
    <DataTable etiqueta={etiqueta}>
      <thead>
        <tr>
          <th scope="col">Día</th>
          <th scope="col">Tipo de día</th>
          <th scope="col" className={tabla.num}>
            Horas trabajadas
          </th>
          <th scope="col" className={tabla.num}>
            Horas extra
          </th>
        </tr>
      </thead>
      <tbody ref={cuerpo}>
        {dias.map((d) => (
          <tr key={d.fecha}>
            <th scope="row" className={s.dia}>
              {diaConNombre(d.fecha)}
            </th>
            <td>{TIPO_DIA[d.tipo]}</td>
            <td className={tabla.num}>{d.tipo === "TRABAJO" ? horas(d.horasTrabajadas) : "—"}</td>
            <td className={tabla.num}>{d.tipo === "TRABAJO" ? horas(d.horasExtra) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/**
 * Answers «¿cómo fue cada día de esta semana?» on the person page: the week the task section shows,
 * day by day, when RR. HH. imported the day detail. Leave and rest days carry no hours.
 */
export function DiasDeSemana({
  employeeId,
  nombre,
  periodStart,
  recordId,
}: {
  employeeId: string;
  nombre: string;
  periodStart: string;
  recordId?: string;
}) {
  const { usuario } = useSesion();
  const consulta = useConsulta(
    (signal) => tareasApi.dias({ employeeId, periodStart, recordId }, signal),
    usuario ? `dias:${employeeId}:${periodStart}:${recordId ?? ""}` : null,
  );
  const datos = consulta.estado === "listo" ? consulta.datos : null;
  const periodo = datos ? textoSemana(datos.semana.periodStart, datos.semana.periodEnd) : "";

  return (
    <Section titulo="Días de la semana" aside={periodo ? <span>{periodo}</span> : undefined}>
      {consulta.estado === "error" ? (
        <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
      ) : !datos ? (
        <SkeletonRows filas={7} />
      ) : !datos.visibles ? (
        <Empty titulo="El detalle de días no está disponible para su perfil">
          Como el de tareas, el detalle de días de técnicos lo consultan RR. HH. y el Team Lead del
          equipo.
        </Empty>
      ) : !datos.dias ? (
        <Empty titulo="Todavía no hay detalle de días para esta semana">
          Las horas y los descansos de la semana se importaron como resumen. El detalle aparecerá
          cuando RR. HH. importe el archivo de días.
        </Empty>
      ) : (
        <div className={s.cuerpo}>
          <TablaDias dias={datos.dias} etiqueta={`Días de ${nombre}, semana ${periodo}`} />
          <p className={s.nota}>
            Los días respaldan las horas y la racha sin descanso del resumen semanal. Las licencias y
            las vacaciones cortan la racha; el índice no las descuenta.
          </p>
        </div>
      )}
    </Section>
  );
}
