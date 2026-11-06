import { useId, useRef, useState } from "react";
import type {
  CampoJornadas,
  ConciliacionJornadasSemana,
  ControlesJornadas,
  MuestraJornada,
  ResumenConciliacionJornadas,
  ResumenJornadas,
} from "@/shared/contratos/importaciones";
import { TIPO_DIA, diaConNombre, entero, horas, semana as textoSemana } from "@/shared/formato";
import { useRowsEnter } from "@/shared/motion";
import { Button, DataTable, Section, tabla } from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import s from "./importaciones.module.css";

/** Weeks listed before the user asks for all of them: the decision to confirm stays in reach. */
const SEMANAS_VISIBLES = 10;

const plural = (n: number, uno: string, varios: string) => `${entero(n)} ${n === 1 ? uno : varios}`;
const dias = (n: number) => plural(n, "día", "días");

/** Each reconciled value in words: what the days say, and what the summary says when it differs. */
const VALOR: Record<
  CampoJornadas,
  { derivado: (d: ControlesJornadas) => string; esperado: (e: ResumenJornadas) => string | null }
> = {
  horasExtra: { derivado: (d) => horas(d.horasExtra), esperado: (e) => horas(e.horasExtra) },
  horasTrabajadas: {
    derivado: (d) => horas(d.horasTrabajadas),
    esperado: (e) => (e.horasTrabajadas === null ? null : horas(e.horasTrabajadas)),
  },
  diasConsecutivosSinDescanso: {
    derivado: (d) => (d.diasSeguidos === 7 ? "7 o más" : entero(d.diasSeguidos)),
    esperado: (e) => entero(e.diasConsecutivosSinDescanso),
  },
  diasDesdeUltimasVacaciones: {
    derivado: (d) =>
      d.diasDesdeVacaciones === null ? "Antes de la semana" : `Hace ${dias(d.diasDesdeVacaciones)}`,
    esperado: (e) =>
      e.diasDesdeUltimasVacaciones === null ? null : `Hace ${dias(e.diasDesdeUltimasVacaciones)}`,
  },
};
const COLUMNAS: [CampoJornadas, string][] = [
  ["horasExtra", "Horas extra"],
  ["horasTrabajadas", "Horas trabajadas"],
  ["diasConsecutivosSinDescanso", "Días seguidos al domingo"],
  ["diasDesdeUltimasVacaciones", "Últimas vacaciones"],
];

function ausencias(d: ControlesJornadas) {
  const partes = [
    d.vacaciones > 0 && `${dias(d.vacaciones)} de vacaciones`,
    d.licencias > 0 && `${dias(d.licencias)} de licencia`,
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : "—";
}

function Resultado({ semana }: { semana: ConciliacionJornadasSemana }) {
  if (semana.estado === "DIFERENCIA") return <StatusTag tono="incidencia">No coincide</StatusTag>;
  if (semana.estado === "SIN_RESUMEN") return <StatusTag tono="aviso">Sin resumen</StatusTag>;
  return (
    <>
      <StatusTag tono="exito">Coincide</StatusTag>
      {semana.yaCargada && <span className={tabla.sub}>Ya cargada</span>}
    </>
  );
}

/**
 * Control totals of the day detail: for each employee-week, what its seven days add up to
 * against the weekly summary. Any difference rejects the file.
 */
export function ConciliacionJornadas({ resumen }: { resumen: ResumenConciliacionJornadas }) {
  const id = useId();
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  const [todas, setTodas] = useState(false);
  useRowsEnter(cuerpo, todas);
  const visibles = todas ? resumen.filas : resumen.filas.slice(0, SEMANAS_VISIBLES);
  const resto = resumen.filas.length - SEMANAS_VISIBLES;

  const partes = [
    `${entero(resumen.coinciden)} de ${plural(resumen.semanas, "semana coincide", "semanas coinciden")}`,
  ];
  if (resumen.diferencias > 0) partes.push(plural(resumen.diferencias, "no coincide", "no coinciden"));
  if (resumen.sinResumen > 0) partes.push(`${entero(resumen.sinResumen)} sin resumen`);

  return (
    <Section titulo="Conciliación con el resumen semanal" aside={<span>{partes.join("; ")}</span>}>
      <div className={s.bloque}>
        <p className={s.meta}>
          Cada cifra es lo que dicen los siete días del archivo. Si difiere del resumen semanal, se
          indica el valor del resumen. Los días de vacaciones, licencia y descanso cortan la racha de
          días seguidos.
        </p>
        <div id={id}>
          <DataTable etiqueta="Conciliación de días por semana">
            <thead>
              <tr>
                <th scope="col">Legajo</th>
                <th scope="col">Semana</th>
                {COLUMNAS.map(([campo, titulo]) => (
                  <th key={campo} scope="col" className={tabla.num}>
                    {titulo}
                  </th>
                ))}
                <th scope="col">Ausencias</th>
                <th scope="col" className={tabla.centro}>
                  Resultado
                </th>
              </tr>
            </thead>
            <tbody ref={cuerpo}>
              {visibles.map((f) => (
                <tr key={`${f.employeeId}-${f.periodStart}`}>
                  <th scope="row">{f.employeeId}</th>
                  <td className={s.semana}>{textoSemana(f.periodStart, f.periodEnd)}</td>
                  {COLUMNAS.map(([campo]) => {
                    const esperado = f.esperado ? VALOR[campo].esperado(f.esperado) : null;
                    return (
                      <td key={campo} className={tabla.num}>
                        {VALOR[campo].derivado(f.derivado)}
                        {esperado !== null && f.diferencias.includes(campo) && (
                          <span className={s.esperado}>Resumen: {esperado}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={s.semana}>{ausencias(f.derivado)}</td>
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
            Se muestran {entero(resumen.filas.length)} de {entero(resumen.semanas)} semanas, las que no
            coinciden primero.
          </p>
        )}
        {resto > 0 && (
          <div className={s.acciones}>
            <Button variante="quiet" aria-expanded={todas} aria-controls={id} onClick={() => setTodas(!todas)}>
              {todas ? "Ver menos semanas" : `Ver ${plural(resto, "semana más", "semanas más")}`}
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}

/** The first valid days of the file, as they will be stored. */
export function MuestraJornadas({ dias: filas }: { dias: MuestraJornada[] }) {
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  useRowsEnter(cuerpo, filas);
  return (
    <Section
      titulo="Primeros días válidos"
      aside={
        <span>
          {filas.length === 1 ? "1 día, tal como viene en el archivo" : `${filas.length} días, tal como vienen en el archivo`}
        </span>
      }
    >
      <DataTable etiqueta="Muestra de días válidos">
        <thead>
          <tr>
            <th scope="col">Legajo</th>
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
          {filas.map((d) => (
            <tr key={`${d.employeeId}-${d.fecha}`}>
              <th scope="row">{d.employeeId}</th>
              <td className={s.semana}>{diaConNombre(d.fecha)}</td>
              <td>{TIPO_DIA[d.tipo]}</td>
              <td className={tabla.num}>{d.tipo === "TRABAJO" ? horas(d.horasTrabajadas) : "—"}</td>
              <td className={tabla.num}>{d.tipo === "TRABAJO" ? horas(d.horasExtra) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Section>
  );
}
