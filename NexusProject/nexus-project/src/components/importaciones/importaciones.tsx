"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ErrorImportacionHttp,
  importacionesApi as api,
  rutaPlantilla,
} from "@/client/importaciones-api";
import type { ErrorCampo, JobDTO } from "@/shared/contracts";
import {
  PLANTILLAS_IMPORTACION,
  type PlantillaImportacion,
} from "@/shared/contratos/importaciones";
import { settle, usePageEnter } from "@/shared/motion";
import {
  Button,
  ButtonLink,
  ErrorBox,
  Icon,
  PageHeader,
  Section,
} from "@/shared/ui";
import { Stepper } from "@/shared/ui/stepper";
import {
  CONJUNTOS,
  conjuntoDe,
  esResultadoTareas,
  type ResultadoConfirmacion,
  type VistaImportacion,
} from "./conjuntos";
import { PieAsistente } from "./pie-asistente";
import {
  ConfirmacionPendiente,
  Procesamiento,
  RecuperarProcesamiento,
  ResultadoConfirmado,
} from "./procesamiento";
import { TablaErrores } from "./tabla-errores";
import { VistaPrevia } from "./vista-previa";
import s from "./importaciones.module.css";

/** Only the last pending importId or jobId survives a reload; never the CSV or its data (T06). */
const recoveryKey = "nexo-importacion-pendiente";
type Recuperacion = { importId?: string; jobId?: string };

const tamano = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;

/**
 * Answers "¿Qué pasa si cargo este archivo?" (T06): validate, review the
 * preview, confirm, then follow the calculation. The browser never computes
 * or stores work data; the server does both.
 */
export function Importaciones() {
  const pagina = useRef<HTMLDivElement>(null);
  const pasosRef = useRef<HTMLDivElement>(null);
  usePageEnter(pagina);
  const [file, setFile] = useState<File | null>(null);
  const [conjunto, setConjunto] = useState<PlantillaImportacion>("indicadores");
  const [vista, setVista] = useState<VistaImportacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoConfirmacion | null>(
    null,
  );
  const [job, setJob] = useState<JobDTO | null>(null);
  const [error, setError] = useState("");
  const [detalles, setDetalles] = useState<ErrorCampo[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [busy, setBusy] = useState("");
  const lock = useRef(false);
  const [now, setNow] = useState(0);
  const [recuperacion, setRecuperacion] = useState<Recuperacion>({});
  const [jobId, setJobId] = useState("");
  const [recuperarAbierto, setRecuperarAbierto] = useState(false);
  const [caducada, setCaducada] = useState(false);
  /** The preview's confirmation is in flight (its answer has not been lost). */
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const restore = setTimeout(() => {
      setNow(Date.now());
      try {
        const saved = JSON.parse(localStorage.getItem(recoveryKey) ?? "{}");
        if (
          typeof saved.importId === "string" ||
          typeof saved.jobId === "string"
        ) {
          setRecuperacion(saved);
          setJobId(saved.jobId ?? "");
          if (saved.jobId) setRecuperarAbierto(true);
        }
      } catch {
        /* Manual recovery by id still works when storage is blocked. */
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
      /* The ids stay visible for manual recovery. */
    }
  }
  /** One request at a time: every button is locked while it runs. */
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
      if (e instanceof ErrorImportacionHttp && e.vistaPrevia) {
        // 422: a rejected file comes with its preview, which shows the errors.
        setVista(e.vistaPrevia);
      } else {
        setError(
          e instanceof Error ? e.message : "No se pudo completar la operación.",
        );
        if (e instanceof ErrorImportacionHttp) {
          setDetalles(e.detalle.error.detalles);
          if (e.status === 410) setCaducada(true);
        }
      }
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  const vencida = caducada || !!(vista && now >= Date.parse(vista.expiresAt));
  const msRestantes =
    vista && now ? Math.max(0, Date.parse(vista.expiresAt) - now) : null;

  async function confirmar(id: string) {
    recordar({ importId: id });
    let res: ResultadoConfirmacion;
    try {
      res = await api.confirmar(id);
    } catch (e) {
      // A definitive rejection lets the user fix and revalidate; a lost answer
      // (network, 5xx) must be recovered with the same id instead.
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
      // A repeated confirmation may return an old snapshot: always read the current job.
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
  function empezarDeNuevo() {
    nueva();
    recordar({});
    setJobId("");
    setRecuperarAbierto(false);
  }
  const consultarJob = (id: string) =>
    ejecutar("Consultando el procesamiento…", async () => {
      const value = await api.consultar(id.trim());
      setJob(value);
      recordar({ jobId: value.jobId });
    });

  // The stored importId survives a reload while a confirmation runs, but only
  // an unanswered one is "pending": one in flight keeps its locked preview.
  const pendiente = confirmando ? undefined : recuperacion.importId;
  const paso = resultado || pendiente || job ? 3 : vista ? 2 : 1;
  // A new file is allowed unless a confirmation is unresolved or this
  // import's calculation is still unfinished (T06).
  const puedeNueva =
    !vista && !pendiente && (!job || !resultado || job.estado === "COMPLETADO");
  const terminado =
    paso === 3 &&
    !pendiente &&
    (job ? job.estado === "COMPLETADO" : !!resultado);
  // The dataset the flow is on: the chosen one, or the one the preview or the result belongs to.
  const activo: PlantillaImportacion = vista
    ? conjuntoDe(vista)
    : resultado
      ? esResultadoTareas(resultado)
        ? "tareas"
        : "indicadores"
      : conjunto;
  const pasos = ["Seleccionar archivo", "Revisar", CONJUNTOS[activo].pasoFinal];

  function elegirConjunto(tipo: PlantillaImportacion) {
    setConjunto(tipo);
    setFile(null);
    setError("");
    setDetalles([]);
    setMensaje("");
  }

  // Each step settles in once when the flow moves to it.
  const pasoPrevio = useRef(paso);
  useLayoutEffect(() => {
    if (pasoPrevio.current === paso) return;
    pasoPrevio.current = paso;
    if (pasosRef.current) settle(pasosRef.current);
  }, [paso]);

  const cierre = (
    <>
      {terminado && (
        <ButtonLink variante="primary" href="/home">
          Ver resumen
        </ButtonLink>
      )}
      {puedeNueva && (
        <Button disabled={!!busy} onClick={empezarDeNuevo}>
          Nueva importación
        </Button>
      )}
    </>
  );

  return (
    <div ref={pagina} className={s.page} data-paso={paso}>
      <PageHeader
        titulo="Importar datos"
        contexto="Valide el archivo y revise los registros antes de confirmar la importación."
      />
      <Stepper pasos={pasos} actual={terminado ? pasos.length + 1 : paso} />

      <div className={s.estadoVivo} role="status" aria-live="polite">
        {busy ? (
          <p className={s.ocupado}>{busy}</p>
        ) : mensaje ? (
          <p className={s.hecho}>{mensaje}</p>
        ) : null}
      </div>
      {error && (
        <div className={s.error}>
          <ErrorBox mensaje={error} />
          {detalles.length > 0 && (
            <TablaErrores etiqueta="Detalles del error" items={detalles} />
          )}
        </div>
      )}

      <div ref={pasosRef} className={s.pasos}>
        {paso === 1 && (
          <Section className={s.elegir} titulo="Datos a importar">
            <form
              className={s.formArchivo}
              onSubmit={(e) => {
                e.preventDefault();
                if (file)
                  ejecutar("Validando el archivo…", async () => {
                    setVista(null);
                    setCaducada(false);
                    setVista(
                      await (conjunto === "tareas"
                        ? api.validarTareas(file)
                        : api.validar(file)),
                    );
                  });
              }}
            >
              <fieldset className={s.conjuntos} disabled={!!busy}>
                <legend className={s.leyenda}>Conjunto de datos</legend>
                {PLANTILLAS_IMPORTACION.map((tipo) => (
                  <div key={tipo} className={s.opcion}>
                    <label className={s.opcionEtiqueta}>
                      <input
                        type="radio"
                        name="conjunto"
                        value={tipo}
                        checked={conjunto === tipo}
                        onChange={() => elegirConjunto(tipo)}
                        aria-labelledby={`conjunto-${tipo}-titulo`}
                        aria-describedby={`conjunto-${tipo}-detalle`}
                      />
                      <span className={s.opcionTexto}>
                        <span
                          id={`conjunto-${tipo}-titulo`}
                          className={s.opcionTitulo}
                        >
                          {CONJUNTOS[tipo].etiqueta}
                        </span>
                        <span
                          id={`conjunto-${tipo}-detalle`}
                          className={s.opcionDetalle}
                        >
                          {CONJUNTOS[tipo].descripcion}
                        </span>
                      </span>
                    </label>
                    <a
                      className={s.plantilla}
                      href={rutaPlantilla(tipo)}
                      download
                      aria-label={`Descargar plantilla de ${CONJUNTOS[tipo].etiqueta.toLowerCase()}`}
                    >
                      Descargar plantilla
                    </a>
                  </div>
                ))}
              </fieldset>

              <div
                key={conjunto}
                className={s.zona}
                data-elegido={file ? "" : undefined}
              >
                <input
                  id="csv"
                  className={s.input}
                  type="file"
                  accept=".csv,text/csv"
                  aria-labelledby="csv-etiqueta"
                  aria-describedby="csv-ayuda"
                  disabled={!!busy}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setError("");
                    setDetalles([]);
                    setMensaje("");
                  }}
                />
                <span className={s.zonaIcono} aria-hidden="true">
                  <Icon nombre="importar" size={20} />
                </span>
                <span className={s.zonaTexto}>
                  <span id="csv-etiqueta" className={s.zonaTitulo}>
                    Archivo CSV
                  </span>
                  <span className={s.zonaNombre}>
                    {file
                      ? `${file.name}, ${tamano(file.size)}`
                      : "Arrastre el archivo aquí o selecciónelo"}
                  </span>
                </span>
                <span className={s.zonaAccion} aria-hidden="true">
                  {file ? "Cambiar archivo" : "Seleccionar archivo"}
                </span>
              </div>
              <p id="csv-ayuda" className={s.ayuda}>
                {CONJUNTOS[conjunto].limites}
              </p>
              <PieAsistente
                izquierda={<ButtonLink href="/home">Cancelar</ButtonLink>}
                derecha={
                  <Button
                    type="submit"
                    variante="primary"
                    disabled={!!busy || !file}
                  >
                    Validar archivo
                  </Button>
                }
              />
            </form>
          </Section>
        )}

        {paso === 2 && vista && (
          <VistaPrevia
            vista={vista}
            archivo={file?.name ?? null}
            vencida={vencida}
            msRestantes={msRestantes}
            ocupado={!!busy}
            pendiente={!!pendiente}
            onConfirmar={() =>
              ejecutar(
                activo === "tareas"
                  ? "Confirmando la importación…"
                  : "Confirmando y procesando…",
                async () => {
                  setConfirmando(true);
                  try {
                    await confirmar(vista.importId);
                  } finally {
                    setConfirmando(false);
                  }
                },
              )
            }
            onCancelar={() =>
              ejecutar("Cancelando la vista previa…", async () => {
                // A rejected preview cannot be cancelled server-side (409); it just expires.
                if (vista.status === "VALIDADA")
                  await api.cancelar(vista.importId);
                nueva();
                setMensaje(CONJUNTOS[conjuntoDe(vista)].cancelada);
              })
            }
            onVolver={nueva}
          />
        )}

        {paso === 3 && (
          <div className={s.resultado}>
            {pendiente && !resultado && (
              <ConfirmacionPendiente
                importId={pendiente}
                ocupado={!!busy}
                onRecuperar={() =>
                  ejecutar("Recuperando la confirmación…", () =>
                    confirmar(pendiente),
                  )
                }
              />
            )}
            {resultado && (
              <ResultadoConfirmado
                resultado={resultado}
                acciones={job ? undefined : cierre}
              />
            )}
            {job && (
              <Procesamiento
                job={job}
                ocupado={!!busy}
                onConsultar={() => consultarJob(job.jobId)}
                onReintentar={() =>
                  ejecutar("Reintentando el procesamiento…", async () => {
                    setJob(await api.reintentar(job.jobId));
                  })
                }
                acciones={cierre}
              />
            )}
          </div>
        )}
      </div>

      {!job && !vista && (
        <RecuperarProcesamiento
          abierto={recuperarAbierto}
          onAbrir={setRecuperarAbierto}
          jobId={jobId}
          onJobId={setJobId}
          ocupado={!!busy}
          onConsultar={() => consultarJob(jobId)}
        />
      )}
    </div>
  );
}
