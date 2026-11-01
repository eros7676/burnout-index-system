"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { tableroApi as api } from "@/client/tablero-api";
import type {
  Alerta,
  Factor,
  FilaTablero,
  FiltrosComunes,
  InformeDTO,
  Nivel,
  Pagina,
  ResumenDTO,
} from "@/shared/contracts";
import "./tablero.css";

const niveles: Nivel[] = ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"];
const factores: Record<Factor, string> = {
  HE: "Horas extra",
  DS: "Días consecutivos sin descanso",
  CT: "Carga de tareas",
  VP: "Vacaciones pendientes",
};
const numero = (valor: number | null) =>
  valor === null
    ? "—"
    : valor.toLocaleString("es-AR", { maximumFractionDigits: 2 });
const mensaje = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la consulta.";

function NivelTexto({ nivel }: { nivel: Nivel }) {
  return (
    <span className={`tab-level tab-${nivel.toLowerCase()}`}>{nivel}</span>
  );
}
function Paginador({
  pagina,
  cambiar,
  nombre,
}: {
  pagina: Pagina<unknown>;
  cambiar: (page: number) => void;
  nombre: string;
}) {
  return (
    <nav className="tab-pages" aria-label={`Páginas de ${nombre}`}>
      <span>
        {pagina.total} resultados · Página {pagina.page}
      </span>
      <div>
        <button
          disabled={pagina.page <= 1}
          onClick={() => cambiar(pagina.page - 1)}
        >
          Anterior
        </button>
        <button
          disabled={pagina.page * pagina.pageSize >= pagina.total}
          onClick={() => cambiar(pagina.page + 1)}
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}
function AlertaContenido({ alerta }: { alerta: Alerta }) {
  return (
    <>
      <p>
        <strong>{alerta.vigencia}</strong> · Canal {alerta.canal} · Estado de
        envío:{" "}
        {alerta.estadoEnvio === "ENVIADO" && alerta.canal === "SIMULADO"
          ? "Enviado (simulado)"
          : alerta.estadoEnvio}
      </p>
      <p>
        {alerta.motivoDestinatario === "SIN_DESTINATARIO"
          ? "SIN_DESTINATARIO · Revisar la asignación de responsable."
          : `Destinatario: ${alerta.destinatarioId}`}
      </p>
      <p>
        Causas:{" "}
        {alerta.causas.map((f) => `${f} · ${factores[f]}`).join("; ") ||
          "Sin causas registradas"}
      </p>
      <ul>
        {alerta.sugerencias.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </>
  );
}

type Seleccion = { id: string; anterior: boolean };
function Detalle({
  seleccion,
  cerrar,
}: {
  seleccion: Seleccion;
  cerrar: () => void;
}) {
  const [estado, setEstado] = useState<{
    informe?: InformeDTO;
    error?: string;
  }>({});
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.informe(seleccion.id, controller.signal).then(
      (informe) => {
        if (!controller.signal.aborted) setEstado({ informe });
      },
      (error) => {
        if (!controller.signal.aborted) setEstado({ error: mensaje(error) });
      },
    );
    return () => controller.abort();
  }, [seleccion.id, intento]);
  const informe = estado.informe;
  return (
    <section
      className="tab-card tab-detail"
      aria-labelledby="informe-titulo"
      tabIndex={-1}
      ref={(node) => {
        node?.focus();
      }}
    >
      <div className="tab-section-head">
        <h2 id="informe-titulo">Informe individual</h2>
        <button onClick={cerrar}>Cerrar informe</button>
      </div>
      {!informe && !estado.error && <p role="status">Cargando informe…</p>}
      {estado.error && (
        <div role="alert">
          <p>{estado.error}</p>
          <button
            onClick={() => {
              setEstado({});
              setIntento((n) => n + 1);
            }}
          >
            Reintentar informe
          </button>
        </div>
      )}
      {informe && (
        <>
          {(seleccion.anterior || !informe.evaluacion.vigente) && (
            <p className="tab-warning" role="status">
              Resultado anterior / histórico. Este informe no representa el
              nivel actual.
            </p>
          )}
          <h3>
            {informe.empleado.nombre} · {informe.empleado.employeeId}
          </h3>
          <p>
            Equipo {informe.empleado.teamId} · {informe.empleado.tipo} ·{" "}
            {informe.evaluacion.periodStart} al {informe.evaluacion.periodEnd}
          </p>
          <p className="tab-score">
            {numero(informe.evaluacion.indice)} <small>/ 100</small>{" "}
            <NivelTexto nivel={informe.evaluacion.nivel} />
          </p>
          <p>
            Reglas {informe.evaluacion.rulesVersion} · Motor{" "}
            {informe.evaluacion.engineVersion} ·{" "}
            {informe.evaluacion.vigente
              ? "Versión vigente del período al consultar"
              : "Versión histórica"}
          </p>
          <p>El informe conserva los valores de la evaluación guardada.</p>
          <p>{informe.explicacion}</p>
          <h3>Ranking de contribuciones</h3>
          <div
            className="tab-scroll"
            role="region"
            aria-label="Factores del informe"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Factor</th>
                  <th>Valor</th>
                  <th>Umbral</th>
                  <th>Puntuación / 100</th>
                  <th>Contribución al índice</th>
                  <th>Excedido</th>
                </tr>
              </thead>
              <tbody>
                {informe.factores.map((f, i) => (
                  <tr key={f.codigo}>
                    <td>{i + 1}</td>
                    <th scope="row">
                      {f.codigo} · {factores[f.codigo]}
                    </th>
                    <td>{numero(f.valor)}</td>
                    <td>{numero(f.umbral)}</td>
                    <td>{numero(f.score)}</td>
                    <td>{numero(f.contribucion)} puntos</td>
                    <td>{f.excedido ? "Sí" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Persistencia semanal</h3>
          <p>
            {informe.evaluacion.persistencia.motivo === "HISTORIAL_INSUFICIENTE"
              ? "Historial insuficiente: falta la semana anterior. Se conserva el índice numérico."
              : informe.evaluacion.persistencia.cumple
                ? "SOSTENIDO · Cumple la condición de persistencia."
                : "NO_SOSTENIDO · No cumple la condición de persistencia para ALTO."}
          </p>
          {informe.evaluacion.persistencia.anterior && (
            <p>
              Semana anterior:{" "}
              {informe.evaluacion.persistencia.anterior.periodo.periodStart} ·
              Índice {numero(informe.evaluacion.persistencia.anterior.indice)}
            </p>
          )}
          <p>
            Factores comunes excedidos:{" "}
            {informe.evaluacion.persistencia.comunesExcedidas.join(", ") ||
              "Ninguno"}
          </p>
          <h3>Sugerencias para revisión humana</h3>
          <ul>
            {informe.recomendaciones.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <h3>Alerta de esta evaluación</h3>
          {informe.alerta ? (
            <AlertaContenido alerta={informe.alerta} />
          ) : (
            <p>Sin alerta asociada.</p>
          )}
        </>
      )}
    </section>
  );
}

type Datos = {
  filas: Pagina<FilaTablero>;
  resumen: ResumenDTO;
  alertas: Pagina<Alerta>;
};
type Consulta = {
  comunes: FiltrosComunes;
  nivel?: Nivel;
  page: number;
  pageSize: number;
  alertPage: number;
  revision: number;
};
const inicial: Consulta = {
  comunes: {},
  page: 1,
  pageSize: 20,
  alertPage: 1,
  revision: 0,
};

export default function DashboardHomeView() {
  const [consulta, setConsulta] = useState<Consulta>(inicial);
  const [respuesta, setRespuesta] = useState<{
    consulta: Consulta;
    datos?: Datos;
    error?: string;
  }>();
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const actual = respuesta?.consulta === consulta ? respuesta : undefined;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.evaluaciones(
        {
          ...consulta.comunes,
          nivel: consulta.nivel,
          page: consulta.page,
          pageSize: consulta.pageSize,
        },
        controller.signal,
      ),
      api.resumen(consulta.comunes, controller.signal),
      api.alertas(
        { ...consulta.comunes, page: consulta.alertPage, pageSize: 10 },
        controller.signal,
      ),
    ]).then(
      ([filas, resumen, alertas]) => {
        if (!controller.signal.aborted)
          setRespuesta({ consulta, datos: { filas, resumen, alertas } });
      },
      (error) => {
        if (!controller.signal.aborted)
          setRespuesta({ consulta, error: mensaje(error) });
      },
    );
    return () => controller.abort();
  }, [consulta]);
  function cambiar(nueva: Consulta) {
    setSeleccion(null);
    setConsulta(nueva);
  }
  function actualizar() {
    cambiar({ ...consulta, revision: consulta.revision + 1 });
  }
  const datos = actual?.datos;

  return (
    <div className="tab-app">
      <aside className="tab-sidebar">
        <Link className="tab-brand" href="/home">
          <span aria-hidden="true">N</span>
          <div>
            Nexo Laboral<small>Indicadores de sobrecarga</small>
          </div>
        </Link>
        <nav aria-label="Principal">
          <Link href="/home" aria-current="page">
            Resumen
          </Link>
          <a href="#evaluaciones">Evaluaciones</a>
          <a href="#alertas">Alertas internas</a>
          <Link href="/importaciones">Importación de datos</Link>
        </nav>
        <p>
          Prototipo P0
          <br />
          Datos ficticios · Uso local
        </p>
      </aside>
      <main className="tab-main">
        <header className="tab-header">
          <div>
            <p className="tab-eyebrow">SEGUIMIENTO SEMANAL</p>
            <h1>Resumen de indicadores</h1>
            <p>Evaluaciones almacenadas por empleado, equipo y período.</p>
          </div>
          <div className="tab-actions">
            <button onClick={actualizar}>Actualizar resultados</button>
            <Link className="tab-primary" href="/importaciones">
              Importar datos
            </Link>
          </div>
        </header>
        <form
          className="tab-card tab-filters"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const comunes: FiltrosComunes = {};
            for (const clave of [
              "employeeId",
              "teamId",
              "periodStart",
            ] as const) {
              const valor = String(form.get(clave) ?? "").trim();
              if (valor) comunes[clave] = valor;
            }
            cambiar({
              comunes,
              nivel: (form.get("nivel") || undefined) as Nivel | undefined,
              page: 1,
              pageSize: Number(form.get("pageSize")),
              alertPage: 1,
              revision: consulta.revision + 1,
            });
          }}
        >
          <label>
            Empleado (ID)
            <input
              name="employeeId"
              maxLength={64}
              pattern={"[A-Za-z0-9_\\-]+"}
              placeholder="Todos los empleados"
            />
          </label>
          <label>
            Equipo (ID)
            <input
              name="teamId"
              maxLength={64}
              pattern={"[A-Za-z0-9_\\-]+"}
              placeholder="Todos los equipos"
            />
          </label>
          <label>
            Semana desde (lunes)
            <input name="periodStart" type="date" />
          </label>
          <label>
            Nivel de evaluación
            <select name="nivel">
              <option value="">Todos los niveles</option>
              {niveles.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Filas por página
            <select name="pageSize" defaultValue="20">
              <option>20</option>
              <option>50</option>
              <option>100</option>
            </select>
          </label>
          <div className="tab-actions">
            <button className="tab-primary" type="submit">
              Aplicar filtros
            </button>
            <button
              type="reset"
              onClick={() =>
                cambiar({ ...inicial, revision: consulta.revision + 1 })
              }
            >
              Limpiar
            </button>
          </div>
        </form>
        {!actual && (
          <p role="status" className="tab-card">
            Cargando resultados…
          </p>
        )}
        {actual?.error && (
          <div role="alert" className="tab-card tab-warning">
            <p>{actual.error}</p>
            <button onClick={actualizar}>Reintentar consulta</button>
          </div>
        )}
        {datos && (
          <>
            <section aria-label="Resumen de evaluaciones">
              <p className="tab-context">
                Alcance: empleado {consulta.comunes.employeeId ?? "todos"} ·
                equipo {consulta.comunes.teamId ?? "todos"} · semana{" "}
                {consulta.comunes.periodStart ?? "todas"}.
              </p>
              <p className="tab-context">
                El resumen y las alertas usan empleado, equipo y semana. El
                filtro de nivel solo afecta la tabla. Se cuentan evaluaciones
                por semana; una persona puede figurar en varios períodos.
              </p>
              <div className="tab-metrics">
                <article className="tab-card">
                  <h2>Evaluaciones actualizadas</h2>
                  <strong>{datos.resumen.totalEvaluaciones}</strong>
                  <p>
                    Sin evaluación actualizada: {datos.resumen.noProcesados}
                  </p>
                </article>
                <article className="tab-card">
                  <h2>Índice promedio</h2>
                  <strong>{numero(datos.resumen.promedioIndice)}</strong>
                  <p>
                    Muestra: {datos.resumen.muestraPromedio} evaluaciones,
                    incluido INCOMPLETO
                  </p>
                </article>
                {niveles.map((n) => (
                  <article className="tab-card" key={n}>
                    <h2>
                      <NivelTexto nivel={n} />
                    </h2>
                    <strong>{datos.resumen.conteo[n]}</strong>
                    <p>
                      {numero(datos.resumen.porcentajes[n])}% de las
                      actualizadas
                    </p>
                  </article>
                ))}
              </div>
            </section>
            <section
              id="evaluaciones"
              className="tab-card"
              aria-labelledby="evaluaciones-titulo"
            >
              <div className="tab-section-head">
                <h2 id="evaluaciones-titulo">Evaluaciones por período</h2>
                <span>{consulta.nivel ?? "Todos los niveles"}</span>
              </div>
              {!datos.filas.items.length ? (
                <p>
                  No hay evaluaciones para estos filtros. Importá un CSV o
                  cambiá los filtros.
                </p>
              ) : (
                <div
                  className="tab-scroll"
                  role="region"
                  aria-label="Resultados de evaluaciones"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Empleado</th>
                        <th>Equipo</th>
                        <th>Período</th>
                        <th>Índice / 100</th>
                        <th>Nivel</th>
                        <th>Procesamiento</th>
                        <th>Alerta</th>
                        <th>Informe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.filas.items.map((fila) => (
                        <tr key={`${fila.employeeId}-${fila.periodStart}`}>
                          <th scope="row">
                            {fila.nombre}
                            <small>{fila.employeeId}</small>
                          </th>
                          <td>{fila.teamId}</td>
                          <td className="tab-period">
                            {fila.periodStart}
                            <small>al {fila.periodEnd}</small>
                          </td>
                          <td>
                            {fila.actualizado ? numero(fila.indice) : "—"}
                          </td>
                          <td>
                            {fila.actualizado && fila.nivel ? (
                              <NivelTexto nivel={fila.nivel} />
                            ) : (
                              <span>
                                {fila.evaluationId
                                  ? "Desactualizado"
                                  : "Sin evaluación"}
                              </span>
                            )}
                          </td>
                          <td>
                            {fila.processingState}
                            <small>
                              {fila.actualizado
                                ? "Resultado actualizado"
                                : "Sin resultado actualizado"}
                            </small>
                          </td>
                          <td>
                            {fila.actualizado && fila.alertId
                              ? "Alerta interna"
                              : "—"}
                          </td>
                          <td>
                            {fila.evaluationId ? (
                              <button
                                onClick={() =>
                                  setSeleccion({
                                    id: fila.evaluationId!,
                                    anterior: !fila.actualizado,
                                  })
                                }
                              >
                                {fila.actualizado
                                  ? "Ver informe"
                                  : "Ver resultado anterior"}
                              </button>
                            ) : (
                              "No disponible"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Paginador
                pagina={datos.filas}
                nombre="evaluaciones"
                cambiar={(page) => cambiar({ ...consulta, page })}
              />
              {datos.resumen.noProcesados > 0 && (
                <p>
                  Para consultar o recuperar un trabajo pendiente/fallido, abrí{" "}
                  <Link href="/importaciones">Importación de datos</Link> con su
                  identificador de procesamiento.
                </p>
              )}
            </section>
            {seleccion && (
              <Detalle
                key={`${seleccion.id}-${seleccion.anterior}`}
                seleccion={seleccion}
                cerrar={() => setSeleccion(null)}
              />
            )}
            <section
              id="alertas"
              className="tab-card"
              aria-labelledby="alertas-titulo"
            >
              <div className="tab-section-head">
                <h2 id="alertas-titulo">Alertas internas vigentes</h2>
                <span>{datos.alertas.total} activas</span>
              </div>
              {!datos.alertas.items.length && (
                <p>No hay alertas activas para estos filtros.</p>
              )}
              <div className="tab-alerts">
                {datos.alertas.items.map((alerta) => (
                  <article key={alerta.alertId}>
                    <h3>{alerta.employeeId}</h3>
                    <AlertaContenido alerta={alerta} />
                    <button
                      onClick={() =>
                        setSeleccion({
                          id: alerta.evaluationId,
                          anterior: false,
                        })
                      }
                    >
                      Ver informe de alerta
                    </button>
                  </article>
                ))}
              </div>
              <Paginador
                pagina={datos.alertas}
                nombre="alertas"
                cambiar={(alertPage) => cambiar({ ...consulta, alertPage })}
              />
            </section>
          </>
        )}
        <footer className="tab-footer">
          Parámetros demostrativos. Estos indicadores no diagnostican burnout.
          Las sugerencias requieren revisión humana.
        </footer>
      </main>
    </div>
  );
}
