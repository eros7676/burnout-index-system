import type { Nivel } from "@/shared/contracts";
import type { SimulacionReglasDTO } from "@/shared/contratos/reglas";
import { entero } from "@/shared/formato";
import { GRUPO_MINIMO } from "@/shared/semanas";
import { DataTable, KeyFacts, LevelTag, Notice, tabla } from "@/shared/ui";
import { diferencia, fecha, plural } from "./parametros";
import s from "./simulacion.module.css";

const NIVELES: readonly Nivel[] = ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"];

/** The dry run of a draft: weeks recomputed with it against the version in force. Nothing here was saved. */
export function Simulacion({
  simulacion: sim,
  vigente,
}: {
  simulacion: SimulacionReglasDTO;
  /** False when the data changed after the run. */
  vigente: boolean;
}) {
  const { alcance } = sim;
  return (
    <div className={s.simulacion}>
      {!vigente && (
        <Notice tono="aviso">
          Los datos cambiaron desde esta simulación. Simule nuevamente antes de
          continuar.
        </Notice>
      )}
      {alcance.semanas === 0 ? (
        <p className={s.resumen}>
          Ninguna semana evaluada queda dentro del alcance del borrador. Al
          publicar, no se recalculará ninguna semana.
        </p>
      ) : (
        <>
          <p className={s.resumen}>
            Se recalcularon {plural(alcance.semanas, "semana", "semanas")} de{" "}
            {plural(alcance.personas, "persona", "personas")}, desde el{" "}
            {fecha(alcance.desde)}
            {alcance.hasta
              ? ` hasta antes del ${fecha(alcance.hasta)}.`
              : " en adelante."}
          </p>
          {alcance.omitidas > 0 && (
            <Notice tono="aviso">
              {plural(alcance.omitidas, "semana", "semanas")} no{" "}
              {alcance.omitidas === 1 ? "pudo" : "pudieron"} evaluarse y no se{" "}
              {alcance.omitidas === 1 ? "cuenta" : "cuentan"}.
            </Notice>
          )}
          <KeyFacts
            items={[
              {
                termino: "Semanas que cambian de nivel",
                valor: <span className="num">{entero(sim.semanasConCambio)}</span>,
              },
              {
                termino: "Personas con cambios",
                valor: <span className="num">{entero(sim.personasConCambio)}</span>,
              },
              {
                termino: "Alertas nuevas",
                valor: <span className="num">{entero(sim.alertas.nuevas)}</span>,
              },
              {
                termino: "Alertas superadas",
                valor: <span className="num">{entero(sim.alertas.superadas)}</span>,
              },
            ]}
          />

          <div className={s.bloque}>
            <h3 className={s.subtitulo}>Semanas por nivel</h3>
            <DataTable etiqueta="Semanas por nivel, antes y después del borrador">
              <thead>
                <tr>
                  <th scope="col" className={tabla.centro}>
                    Nivel
                  </th>
                  <th scope="col" className={tabla.num}>
                    Con {sim.contexto.versionEnVigor}
                  </th>
                  <th scope="col" className={tabla.num}>
                    Con el borrador
                  </th>
                  <th scope="col" className={tabla.num}>
                    Diferencia
                  </th>
                </tr>
              </thead>
              <tbody>
                {NIVELES.map((nivel) => (
                  <tr key={nivel}>
                    <th scope="row" className={tabla.centro}>
                      <LevelTag nivel={nivel} />
                    </th>
                    <td className={tabla.num}>{entero(sim.antes[nivel])}</td>
                    <td className={tabla.num}>{entero(sim.despues[nivel])}</td>
                    <td className={tabla.num}>
                      {diferencia(sim.antes[nivel], sim.despues[nivel])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>

          {sim.transiciones.length > 0 && (
            <div className={s.bloque}>
              <h3 className={s.subtitulo}>Cambios de nivel</h3>
              <DataTable etiqueta="Semanas que cambian de nivel">
                <thead>
                  <tr>
                    <th scope="col" className={tabla.centro}>
                      Nivel anterior
                    </th>
                    <th scope="col" className={tabla.centro}>
                      Nivel nuevo
                    </th>
                    <th scope="col" className={tabla.num}>
                      Semanas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sim.transiciones.map((t) => (
                    <tr key={`${t.de}-${t.a}`}>
                      <th scope="row" className={tabla.centro}>
                        <LevelTag nivel={t.de} />
                      </th>
                      <td className={tabla.centro}>
                        <LevelTag nivel={t.a} />
                      </td>
                      <td className={tabla.num}>{entero(t.semanas)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )}

          {sim.equipos.length > 0 && (
            <div className={s.bloque}>
              <h3 className={s.subtitulo}>Por equipo</h3>
              <DataTable etiqueta="Impacto del borrador por equipo">
                <thead>
                  <tr>
                    <th scope="col">Equipo</th>
                    <th scope="col" className={tabla.num}>
                      Personas
                    </th>
                    <th scope="col" className={tabla.num}>
                      Semanas que cambian
                    </th>
                    <th scope="col" className={tabla.num}>
                      En Alto, antes
                    </th>
                    <th scope="col" className={tabla.num}>
                      En Alto, después
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sim.equipos.map((e) =>
                    e.suprimido ? (
                      <tr key={e.teamId}>
                        <th scope="row">{e.nombre}</th>
                        <td colSpan={4} className={tabla.muted}>
                          Resultado reservado: protege a los grupos de menos de{" "}
                          {GRUPO_MINIMO} personas.
                        </td>
                      </tr>
                    ) : (
                      <tr key={e.teamId}>
                        <th scope="row">{e.nombre}</th>
                        <td className={tabla.num}>{entero(e.personas)}</td>
                        <td className={tabla.num}>{entero(e.semanasConCambio)}</td>
                        <td className={tabla.num}>{entero(e.antes.ALTO)}</td>
                        <td className={tabla.num}>{entero(e.despues.ALTO)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </DataTable>
            </div>
          )}
        </>
      )}
    </div>
  );
}
