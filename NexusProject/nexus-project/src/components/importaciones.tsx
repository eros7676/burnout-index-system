"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ErrorImportacionHttp,
  importacionesApi as api,
} from "@/client/importaciones-api";
import type {
  ErrorCampo,
  JobDTO,
  ResultadoImportacion,
  VistaPrevia,
} from "@/shared/contracts";
import "./importaciones.css";

const recoveryKey = "nexo-importacion-pendiente";
type Recuperacion = { importId?: string; jobId?: string };
function Errores({ titulo, items }: { titulo: string; items: ErrorCampo[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h3>{titulo}</h3>
      <div className={"import-scroll"}>
        <table>
          <thead>
            <tr>
              <th>Fila</th>
              <th>Campo</th>
              <th>Código</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e, i) => (
              <tr key={i}>
                <td>{e.fila ?? "Archivo"}</td>
                <td>{e.campo ?? "—"}</td>
                <td>{e.codigo}</td>
                <td>{e.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Importaciones() {
  const [file, setFile] = useState<File | null>(null);
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [job, setJob] = useState<JobDTO | null>(null);
  const [error, setError] = useState("");
  const [detalles, setDetalles] = useState<ErrorCampo[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [busy, setBusy] = useState("");
  const lock = useRef(false);
  const [now, setNow] = useState(0);
  const [recuperacion, setRecuperacion] = useState<Recuperacion>({});
  const [jobId, setJobId] = useState("");
  const [caducada, setCaducada] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const restore = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(recoveryKey) ?? "{}");
        if (
          typeof saved.importId === "string" ||
          typeof saved.jobId === "string"
        ) {
          setRecuperacion(saved);
          setJobId(saved.jobId ?? "");
        }
      } catch {
        /* El formulario manual permite recuperar aunque el almacenamiento esté bloqueado. */
      }
    }, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(restore);
    };
  }, []);

  function recordar(value: Recuperacion) {
    setRecuperacion(value);
    try {
      localStorage.setItem(recoveryKey, JSON.stringify(value));
    } catch {
      /* IDs visibles y recuperación manual. */
    }
  }
  async function ejecutar(etiqueta: string, accion: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(etiqueta);
    setError("");
    setDetalles([]);
    setMensaje("");
    try {
      await accion();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo completar la operación.",
      );
      if (e instanceof ErrorImportacionHttp) {
        setDetalles(e.detalle.error.detalles);
        if (e.vistaPrevia) setVista(e.vistaPrevia);
        if (e.status === 410) setCaducada(true);
      }
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  const vencida = caducada || !!(vista && now >= Date.parse(vista.expiresAt));
  async function confirmar(id: string) {
    recordar({ importId: id });
    let res: ResultadoImportacion;
    try {
      res = await api.confirmar(id);
    } catch (e) {
      // Un rechazo definitivo permite corregir/revalidar; red o 5xx requieren recuperar el mismo ID.
      if (
        e instanceof ErrorImportacionHttp &&
        e.status >= 400 &&
        e.status < 500
      ) {
        recordar({});
        setVista(null);
        setFile(null);
      }
      throw e;
    }
    setResultado(res);
    setVista(null);
    setJob(res.procesamiento);
    if (res.procesamiento) {
      setJobId(res.procesamiento.jobId);
      recordar({ jobId: res.procesamiento.jobId });
      // La confirmación repetida puede devolver una instantánea antigua: leer siempre el job actual.
      setJob(await api.consultar(res.procesamiento.jobId));
    } else {
      recordar({});
    }
  }
  function nueva() {
    setFile(null);
    setVista(null);
    setResultado(null);
    setJob(null);
    setCaducada(false);
    setError("");
    setDetalles([]);
    setMensaje("");
  }
  const puedeNueva =
    !vista && !recuperacion.importId && (!job || job.estado === "COMPLETADO");
  return (
    <main className={"import-page"}>
      <nav>
        <Link href="/home">← Volver al resumen (maqueta)</Link>
      </nav>
      <header>
        <p className={"import-eyebrow"}>Nexo Laboral · Demo local</p>
        <h1>Importación de datos</h1>
        <p>
          Cargá indicadores semanales en CSV. Los datos se guardan únicamente al
          confirmar; el servidor calcula las evaluaciones.
        </p>
      </header>
      <ol className={"import-steps"} aria-label="Pasos">
        <li>1 · Seleccionar CSV</li>
        <li>2 · Revisar vista previa</li>
        <li>3 · Confirmar y consultar procesamiento</li>
      </ol>
      <p>
        Datos ficticios. El índice identifica posible sobrecarga laboral y no
        constituye un diagnóstico de burnout.
      </p>
      <div role="status" aria-live="polite">
        {busy || mensaje}
      </div>
      {error && (
        <div className={"import-error"} role="alert">
          {error}
          <Errores titulo="Detalles del error" items={detalles} />
        </div>
      )}
      {recuperacion.importId && !resultado && (
        <section className={"import-panel"}>
          <h2>Confirmación pendiente de verificar</h2>
          <p>
            No inicies otra carga hasta recuperar la respuesta. Importación:{" "}
            <code>{recuperacion.importId}</code>
          </p>
          <button
            disabled={!!busy}
            onClick={() =>
              ejecutar("Recuperando confirmación…", () =>
                confirmar(recuperacion.importId!),
              )
            }
          >
            Recuperar confirmación
          </button>
        </section>
      )}
      {!vista && !resultado && !recuperacion.importId && (
        <section className={"import-panel"}>
          <h2>Seleccionar archivo</h2>
          <p>
            CSV de hasta 5 MiB y 1.000 filas. Usá los identificadores del
            catálogo y semanas cerradas.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (file)
                ejecutar("Validando CSV…", async () => {
                  setVista(null);
                  setCaducada(false);
                  setVista(await api.validar(file));
                });
            }}
          >
            <label htmlFor="csv">Archivo CSV</label>
            <input
              id="csv"
              type="file"
              accept=".csv,text/csv"
              disabled={!!busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError("");
              }}
            />
            <button disabled={!!busy || !file}>Validar CSV</button>
          </form>
          {!file && <p>No hay ningún archivo seleccionado.</p>}
        </section>
      )}
      {vista && (
        <section className={"import-panel"}>
          <h2>
            Vista previa ·{" "}
            {vista.status === "VALIDADA" ? "Validada" : "Rechazada"}
          </h2>
          <p>
            Importación: <code>{vista.importId}</code>
          </p>
          <p>
            Total: {vista.totalFilas} · Nuevas: {vista.nuevas} · Omitidas:{" "}
            {vista.omitidas}
          </p>
          <p>
            Vence:{" "}
            <time dateTime={vista.expiresAt}>
              {new Date(vista.expiresAt).toLocaleString("es-AR")}
            </time>{" "}
            (hora local).
          </p>
          {vencida && (
            <p role="alert">
              La vista previa venció. Volvé a validar el archivo.
            </p>
          )}
          {vista.status === "RECHAZADA" && (
            <p>
              El lote tiene errores. No se guardó ningún registro; corregí el
              CSV y volvé a validarlo.
            </p>
          )}
          {vista.nuevas === 0 && vista.status === "VALIDADA" && (
            <p>
              Todos los registros ya existen. Confirmar omitirá las filas sin
              duplicar información.
            </p>
          )}
          <Errores titulo="Errores por fila y campo" items={vista.errores} />
          <Errores titulo="Advertencias" items={vista.warnings} />
          {!!vista.muestra.length && (
            <>
              <h3>Muestra de hasta 10 filas válidas</h3>
              <div className={"import-scroll"}>
                <table>
                  <thead>
                    <tr>
                      {[
                        "Empleado",
                        "Desde",
                        "Hasta",
                        "Horas extra",
                        "Días sin descanso",
                        "Activas",
                        "Pendientes",
                        "Vencidas",
                        "Vacaciones pendientes",
                        "Horas trabajadas",
                        "Días desde vacaciones",
                      ].map((t) => (
                        <th key={t}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vista.muestra.map((r, i) => (
                      <tr key={i}>
                        {[
                          r.employeeId,
                          r.periodStart,
                          r.periodEnd,
                          r.horasExtra,
                          r.diasConsecutivosSinDescanso,
                          r.tareasActivas,
                          r.tareasPendientes,
                          r.tareasVencidas,
                          r.vacacionesPendientesDias,
                          r.horasTrabajadas,
                          r.diasDesdeUltimasVacaciones,
                        ].map((v, j) => (
                          <td key={j}>{v ?? "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className={"import-actions"}>
            <button
              disabled={
                !!busy ||
                vencida ||
                vista.status !== "VALIDADA" ||
                !!vista.errores.length ||
                !!recuperacion.importId
              }
              onClick={() =>
                ejecutar("Confirmando y procesando…", () =>
                  confirmar(vista.importId),
                )
              }
            >
              Confirmar importación
            </button>
            {!recuperacion.importId && (
              <button
                disabled={!!busy}
                onClick={() =>
                  ejecutar("Cancelando…", async () => {
                    await api.cancelar(vista.importId);
                    nueva();
                    setMensaje(
                      "Vista previa cancelada. No se guardaron registros laborales.",
                    );
                  })
                }
              >
                Cancelar vista previa
              </button>
            )}
            {(vencida || vista.status === "RECHAZADA") &&
              !recuperacion.importId && (
                <button disabled={!!busy} onClick={nueva}>
                  Seleccionar CSV corregido / volver a validar
                </button>
              )}
          </div>
        </section>
      )}
      {resultado && (
        <section className={"import-panel"}>
          <h2>Datos confirmados</h2>
          <p>
            Importación: <code>{resultado.importId}</code>
          </p>
          <p>
            Insertados: {resultado.insertados} · Omitidos: {resultado.omitidos}
          </p>
          {!resultado.procesamiento && (
            <p>
              No hay pares nuevos para procesar. No se duplicaron registros.
            </p>
          )}
        </section>
      )}
      <section className={"import-panel"}>
        <h2>Consultar o recuperar procesamiento</h2>
        <p>
          Usá el identificador del job para consultar su estado después de una
          recarga o reinicio.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ejecutar("Consultando procesamiento…", async () => {
              const value = await api.consultar(jobId.trim());
              setJob(value);
              recordar({ jobId: value.jobId });
            });
          }}
        >
          <label htmlFor="job">ID del procesamiento</label>
          <input
            id="job"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            disabled={!!busy}
            required
          />
          <button disabled={!!busy || !jobId.trim()}>Consultar estado</button>
        </form>
        {job && (
          <>
            <p>
              Job: <code>{job.jobId}</code>
            </p>
            <h3>Procesamiento: {job.estado}</h3>
            <p>
              Pares completados: {job.completados} / {job.totalPares}
            </p>
            <p>
              Última actualización:{" "}
              {new Date(job.updatedAt).toLocaleString("es-AR")}
            </p>
            {job.estado === "COMPLETADO" ? (
              <p>El cálculo de todos los pares terminó correctamente.</p>
            ) : (
              <p>
                El cálculo todavía no está completo. Los datos confirmados se
                conservan. Consultá el estado o reintentá si está pendiente o
                fallido.
              </p>
            )}
            {!!job.errores.length && (
              <ul>
                {job.errores.map((e, i) => (
                  <li key={i}>
                    {e.par.employeeId} · {e.par.periodStart} a {e.par.periodEnd}
                    : {e.codigo} — {e.detalle}
                  </li>
                ))}
              </ul>
            )}
            <button
              disabled={
                !!busy || !["PENDIENTE", "FALLIDO"].includes(job.estado)
              }
              onClick={() =>
                ejecutar("Reintentando procesamiento…", async () => {
                  setJob(await api.reintentar(job.jobId));
                })
              }
            >
              Reintentar procesamiento
            </button>
          </>
        )}
      </section>
      {(resultado || job) && puedeNueva && (
        <button
          disabled={!!busy}
          onClick={() => {
            nueva();
            recordar({});
            setJobId("");
          }}
        >
          Nueva importación
        </button>
      )}
    </main>
  );
}
