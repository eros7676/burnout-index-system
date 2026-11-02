"use client";
import { useRef } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import type { ConfiguracionIndice, Factor } from "@/shared/contracts";
import { FACTOR, diaCorto, valorFactor } from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import {
  DataTable,
  ErrorBox,
  LevelTag,
  PageHeader,
  Section,
  SkeletonRows,
  tabla,
} from "@/shared/ui";
import { useSesion } from "../shell/sesion";
import s from "./reglas.module.css";

const FACTORES: Factor[] = ["HE", "DS", "CT", "VP"];
/** What each factor measures in one week, as the engine computes it (calculo.ts). */
const MIDE: Record<Factor, string> = {
  HE: "Horas trabajadas por encima de la jornada",
  DS: "Días trabajados sin un día libre",
  CT: "Tareas vencidas y pendientes sobre las activas",
  VP: "Días de vacaciones sin tomar",
};

/** "5 ene 2026", from the date string (no browser time zone). */
const fecha = (iso: string) => `${diaCorto(iso)} ${iso.slice(0, 4)}`;
const porcentaje = (peso: number) => `${Math.round(peso * 100)} %`;

/**
 * Answers "¿Cómo se calcula el índice?" from the rules in force. Read-only: a
 * new version is published from the command line (T09), not from here. It is
 * also the one place that explains what the index is not.
 */
export function Reglas() {
  const { usuario } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(
    (signal) => tableroApi.reglas(signal),
    usuario ? "reglas" : null,
  );
  const datos = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  useRowsEnter(filas, datos?.vigente);
  const v = datos?.vigente;
  const fallo = consulta.estado === "error";

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Reglas del índice"
        contexto={
          v
            ? `Versión ${v.version}, vigente desde el ${fecha(v.effectiveFrom)}.`
            : "Cómo se calcula el índice de carga de trabajo."
        }
      />

      <div className={s.grid}>
        <div className={s.main}>
          <Section
            titulo="Cuatro factores, un índice de 0 a 100"
            aside={v ? <span>Una semana, de lunes a domingo</span> : undefined}
          >
            <div ref={caja}>
              {consulta.estado === "error" ? (
                <ErrorBox
                  mensaje={consulta.mensaje}
                  onRetry={consulta.reintentar}
                />
              ) : !v ? (
                <SkeletonRows filas={4} />
              ) : (
                <>
                  <DataTable etiqueta="Factores del índice">
                    <thead>
                      <tr>
                        <th scope="col">Factor</th>
                        <th scope="col" className={tabla.num}>
                          Umbral
                        </th>
                        <th scope="col">Peso en el índice</th>
                      </tr>
                    </thead>
                    <tbody ref={filas}>
                      {FACTORES.map((f) => (
                        <tr key={f}>
                          <th scope="row">
                            {FACTOR[f]}
                            <span className={tabla.sub}>{MIDE[f]}</span>
                          </th>
                          <td className={tabla.num}>
                            <strong className={s.umbral}>
                              {valorFactor(f, v.thresholds[f])}
                            </strong>
                          </td>
                          <td>
                            <span className={s.peso}>
                              <span className={s.pesoBarra} aria-hidden="true">
                                <span
                                  style={{ width: `${v.weights[f] * 100}%` }}
                                />
                              </span>
                              <span className="num">
                                {porcentaje(v.weights[f])}
                              </span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                  <p className={s.formula}>
                    Cada factor suma 50 puntos al llegar a su umbral y 100 al
                    doble; pasado el umbral, cuenta como superado. El índice es
                    la suma de los cuatro según su peso.
                  </p>
                </>
              )}
            </div>
          </Section>

          {!fallo && (
            <Section titulo="Niveles">
              {!v ? <SkeletonRows filas={4} /> : <Niveles reglas={v} />}
            </Section>
          )}
        </div>

        <div className={s.side}>
          <Section titulo="Qué no es">
            <ul className={s.noEs}>
              <li>Un diagnóstico de burnout ni de salud.</li>
              <li>
                Una nota sobre las personas: describe condiciones de trabajo.
              </li>
              <li>
                Una decisión: ordena qué revisar primero y decide una persona.
              </li>
              <li>
                Algo que vea la persona evaluada: en Mis datos ve lo que se
                cargó, nunca su índice.
              </li>
            </ul>
          </Section>

          {!fallo && (
            <Section titulo="Historial de versiones">
              {!datos ? (
                <SkeletonRows filas={2} />
              ) : (
                <DataTable etiqueta="Versiones de las reglas">
                  <thead>
                    <tr>
                      <th scope="col">Versión</th>
                      <th scope="col">Vigente desde</th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.versiones.map((version) => (
                      <tr key={version.version}>
                        <th scope="row">{version.version}</th>
                        <td>{fecha(version.effectiveFrom)}</td>
                        <td>
                          {version.version === datos.vigente.version ? (
                            <span className={s.vigente}>Vigente</span>
                          ) : (
                            <span className={tabla.muted}>
                              {version.effectiveFrom >
                              datos.vigente.effectiveFrom
                                ? "Programada"
                                : "Reemplazada"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

/** One sentence per level, from the limits in force; then how a week is compared. */
function Niveles({ reglas }: { reglas: ConfiguracionIndice }) {
  const {
    mediumLimit: medio,
    highLimit: alto,
    minExceededFactors: comunes,
  } = reglas;
  return (
    <div className={s.niveles}>
      <dl className={s.lista}>
        <div>
          <dt>
            <LevelTag nivel="BAJO" />
          </dt>
          <dd>Índice menor a {medio}.</dd>
        </div>
        <div>
          <dt>
            <LevelTag nivel="MEDIO" />
          </dt>
          <dd>Índice de {medio} o más, sin llegar a Alto.</dd>
        </div>
        <div>
          <dt>
            <LevelTag nivel="ALTO" />
          </dt>
          <dd>
            Índice de {alto} o más dos semanas seguidas, con al menos {comunes}{" "}
            factores superados en las dos.
          </dd>
        </div>
        <div>
          <dt>
            <LevelTag nivel="INCOMPLETO" />
          </dt>
          <dd>
            Falta la semana anterior, así que no se puede confirmar si la carga
            se sostiene.
          </dd>
        </div>
      </dl>
      <p className={s.persistencia}>
        <strong>Persistencia.</strong> Cada semana se compara con la
        inmediatamente anterior. Si esa semana no está cargada, la racha se
        corta y el resultado queda Incompleto: nunca se supone la carga.
      </p>
    </div>
  );
}
