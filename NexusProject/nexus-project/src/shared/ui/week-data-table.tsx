import type { Ref } from "react";
import type { DatosSemana } from "../contracts";
import { semana as textoSemana } from "../formato";
import { DataTable, tabla } from "./table";
import s from "./week-data-table.module.css";

type Fila = DatosSemana & { employeeId?: string };

/** A long header that breaks only between its two halves: two lines at most. */
const Partido = ({ a, b }: { a: string; b: string }) => (
  <>
    <span className={s.linea}>{a}</span> <span className={s.linea}>{b}</span>
  </>
);

// Loaded values are shown as loaded: a 7,5 h week is not rounded.
const NUMERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const horas = (valor: number | null) =>
  valor === null ? "—" : `${NUMERO.format(valor)} h`;
const dias = (valor: number | null) =>
  valor === null
    ? "—"
    : `${NUMERO.format(valor)} ${valor === 1 ? "día" : "días"}`;

/**
 * Loaded work data, one row per week, with no index or level. `legajo` adds
 * the file's employee column (an import preview); `opcionales` adds the
 * optional fields of the CSV.
 */
export function WeekDataTable({
  etiqueta,
  filas,
  legajo = false,
  opcionales = false,
  cuerpoRef,
}: {
  etiqueta: string;
  filas: Fila[];
  legajo?: boolean;
  opcionales?: boolean;
  cuerpoRef?: Ref<HTMLTableSectionElement>;
}) {
  const num = `${tabla.num} ${s.ajustar}`;
  return (
    <DataTable etiqueta={etiqueta}>
      <thead>
        <tr>
          {legajo && (
            <th scope="col" rowSpan={2} className={s.abajo}>
              Legajo
            </th>
          )}
          <th scope="col" rowSpan={2} className={s.abajo}>
            Semana
          </th>
          <th scope="colgroup" colSpan={2} className={s.grupo}>
            Horas
          </th>
          <th scope="col" rowSpan={2} className={`${num} ${s.abajo}`}>
            <Partido a="Días seguidos" b="sin descanso" />
          </th>
          <th scope="colgroup" colSpan={3} className={s.grupo}>
            Tareas
          </th>
          {opcionales ? (
            <th scope="colgroup" colSpan={2} className={s.grupo}>
              Vacaciones
            </th>
          ) : (
            <th scope="col" rowSpan={2} className={`${num} ${s.abajo}`}>
              Vacaciones pendientes
            </th>
          )}
        </tr>
        <tr>
          <th scope="col" className={num}>
            Trabajadas
          </th>
          <th scope="col" className={num}>
            Extra
          </th>
          <th scope="col" className={num}>
            Activas
          </th>
          <th scope="col" className={num}>
            Pendientes
          </th>
          <th scope="col" className={num}>
            Vencidas
          </th>
          {opcionales && (
            <>
              <th scope="col" className={num}>
                Pendientes
              </th>
              <th scope="col" className={`${num}`}>
                <Partido a="Días desde" b="las últimas" />
              </th>
            </>
          )}
        </tr>
      </thead>
      <tbody ref={cuerpoRef}>
        {filas.map((w) => {
          const semana = textoSemana(w.periodStart, w.periodEnd);
          return (
            <tr key={`${w.employeeId ?? ""}-${w.periodStart}`}>
              {legajo ? (
                <>
                  <th scope="row">{w.employeeId}</th>
                  <td className={s.semana}>{semana}</td>
                </>
              ) : (
                <th scope="row">{semana}</th>
              )}
              <td className={tabla.num}>{horas(w.horasTrabajadas)}</td>
              <td className={tabla.num}>{horas(w.horasExtra)}</td>
              <td className={tabla.num}>
                {dias(w.diasConsecutivosSinDescanso)}
              </td>
              <td className={tabla.num}>{NUMERO.format(w.tareasActivas)}</td>
              <td className={tabla.num}>{NUMERO.format(w.tareasPendientes)}</td>
              <td className={tabla.num}>{NUMERO.format(w.tareasVencidas)}</td>
              <td className={tabla.num}>{dias(w.vacacionesPendientesDias)}</td>
              {opcionales && (
                <td className={tabla.num}>
                  {dias(w.diasDesdeUltimasVacaciones)}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
