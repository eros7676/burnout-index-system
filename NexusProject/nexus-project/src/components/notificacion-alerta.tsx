"use client";
import { useEffect, useId, useRef, useState } from "react";
import { notificacionesApi as api } from "@/client/notificaciones-api";
import type {
  Alerta,
  IntentoNotificacion,
  ResultadoSimulado,
  SolicitudNotificacion,
} from "@/shared/contracts";
import { momento } from "@/shared/formato";
import { Button, Icon } from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import s from "./notificacion-alerta.module.css";

type Estado = IntentoNotificacion["estado"];
const INTENTO: Record<
  Estado,
  { texto: string; tono: "aviso" | "exito" | "incidencia" }
> = {
  PENDIENTE: { texto: "Pendiente de procesar", tono: "aviso" },
  ENVIADO: { texto: "Enviado (simulado)", tono: "exito" },
  FALLIDO: { texto: "Fallido (simulado)", tono: "aviso" },
  SIN_DESTINATARIO: { texto: "Sin destinatario", tono: "incidencia" },
};
const RESULTADO: Record<Estado, string> = {
  PENDIENTE: "Envío simulado pendiente de procesar.",
  ENVIADO: "Envío registrado como enviado (simulado).",
  FALLIDO:
    "Envío registrado como fallido (simulado). Se puede volver a simularlo.",
  SIN_DESTINATARIO:
    "No hay destinatario: falta el responsable en el catálogo.",
};
const mensajeDe = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "No se pudo completar la simulación. Inténtelo nuevamente.";

/**
 * The simulated email of one alert (T12): no message ever leaves the app.
 * Each simulation prepares an attempt and processes it; a pending attempt left
 * behind (a reload, a lost answer) can be processed later, and every attempt
 * stays in the history.
 */
export function NotificacionAlerta({
  alerta,
  alCambiar,
  destinatario,
  sinMarco = false,
}: {
  alerta: Alerta;
  alCambiar: (intento: IntentoNotificacion) => void;
  /** The recipient's name for an attempt's employeeId snapshot. */
  destinatario: (destinatarioId: string) => string;
  /** Inside a titled Section: no box and no title of its own, so nothing is boxed twice. */
  sinMarco?: boolean;
}) {
  const titulo = useId();
  const [intentos, setIntentos] = useState<IntentoNotificacion[]>();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const bloqueo = useRef(false);
  const solicitud = useRef<SolicitudNotificacion | null>(null);

  // The history is read once on open; an action's own answer never gets replaced by it.
  useEffect(() => {
    let vivo = true;
    api.listar(alerta.alertId).then(
      (lista) => vivo && setIntentos((previos) => previos ?? lista),
      (e) => vivo && setError(mensajeDe(e)),
    );
    return () => {
      vivo = false;
    };
  }, [alerta.alertId]);

  async function ejecutar(progreso: string, accion: () => Promise<void>) {
    if (bloqueo.current) return;
    bloqueo.current = true;
    setOcupado(progreso);
    setMensaje("");
    setError("");
    try {
      await accion();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      bloqueo.current = false;
      setOcupado(null);
    }
  }
  function guardar(intento: IntentoNotificacion) {
    setIntentos((previos) =>
      [
        intento,
        ...(previos ?? []).filter((i) => i.intentoId !== intento.intentoId),
      ].sort((a, b) => b.numero - a.numero),
    );
    alCambiar(intento);
  }
  const listar = () =>
    ejecutar("Actualizando el historial…", async () => {
      setIntentos(await api.listar(alerta.alertId));
    });
  const procesar = (intentoId: string) =>
    ejecutar("Procesando el envío pendiente…", async () => {
      const intento = await api.procesar(alerta.alertId, intentoId);
      guardar(intento);
      setMensaje(RESULTADO[intento.estado]);
    });
  const simular = (resultado: ResultadoSimulado) =>
    ejecutar("Simulando el envío…", async () => {
      // The same request id survives a lost answer, so a retry never duplicates the attempt.
      if (!solicitud.current || solicitud.current.resultado !== resultado)
        solicitud.current = { requestId: crypto.randomUUID(), resultado };
      let intento = await api.preparar(alerta.alertId, solicitud.current);
      solicitud.current = null;
      guardar(intento);
      if (intento.estado === "PENDIENTE") {
        intento = await api.procesar(alerta.alertId, intento.intentoId);
        guardar(intento);
      }
      setMensaje(RESULTADO[intento.estado]);
      // The full history, also when the server answered with an earlier request.
      setIntentos(await api.listar(alerta.alertId));
    });

  const ultimo = intentos?.[0];
  const pendiente = ultimo?.estado === "PENDIENTE" ? ultimo : undefined;
  const enviado =
    alerta.estadoEnvio === "ENVIADO" || ultimo?.estado === "ENVIADO";
  const activa = alerta.vigencia === "ACTIVA";
  // Framed, the panel is its own region; inside a titled Section that Section is the region.
  const Raiz = sinMarco ? "div" : "section";

  return (
    <Raiz
      className={s.panel}
      data-sin-marco={sinMarco || undefined}
      aria-labelledby={sinMarco ? undefined : titulo}
      aria-busy={ocupado !== null}
    >
      <div className={s.head}>
        {!sinMarco && (
          <h3 id={titulo} className={s.title}>
            <Icon nombre="correo" size={16} />
            Correo simulado
          </h3>
        )}
        <Button
          variante="quiet"
          disabled={ocupado !== null}
          onClick={listar}
        >
          Actualizar historial
        </Button>
      </div>

      {pendiente ? (
        <div className={s.actions}>
          <Button
            disabled={ocupado !== null}
            onClick={() => procesar(pendiente.intentoId)}
          >
            Procesar envío pendiente
          </Button>
        </div>
      ) : activa && !enviado ? (
        <div className={s.actions}>
          <Button disabled={ocupado !== null} onClick={() => simular("EXITO")}>
            Simular envío exitoso
          </Button>
          <Button disabled={ocupado !== null} onClick={() => simular("FALLO")}>
            Simular envío fallido
          </Button>
        </div>
      ) : !activa ? (
        <p className={s.note}>
          Alerta superada: solo se conserva el historial.
        </p>
      ) : null}

      <p role="status" className={s.status}>
        {ocupado ?? mensaje}
      </p>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}

      {intentos === undefined ? (
        !error && <p className={s.note}>Cargando intentos…</p>
      ) : intentos.length ? (
        <ol className={s.history} aria-label="Historial de envíos simulados">
          {intentos.map((i) => {
            const estado = INTENTO[i.estado];
            const cuando = i.completedAt ?? i.createdAt;
            return (
              <li key={i.intentoId} className={s.attempt}>
                <span className={s.number}>Intento {i.numero}</span>
                <StatusTag tono={estado.tono}>{estado.texto}</StatusTag>
                <time className={s.when} dateTime={cuando}>
                  {momento(cuando)}
                </time>
                {i.destinatarioId && (
                  <span className={s.to}>
                    Para {destinatario(i.destinatarioId)}
                  </span>
                )}
                {i.detalle &&
                  (i.estado === "FALLIDO" ||
                    i.estado === "SIN_DESTINATARIO") && (
                    <span className={s.detail}>{i.detalle}</span>
                  )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={s.note}>Sin intentos registrados.</p>
      )}
    </Raiz>
  );
}
