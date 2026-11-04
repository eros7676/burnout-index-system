"use client";
import { useEffect, useRef, useState } from "react";
import { notificacionesApi as api } from "@/client/notificaciones-api";
import type {
  Alerta,
  IntentoNotificacion,
  ResultadoSimulado,
  SolicitudNotificacion,
} from "@/shared/contracts";
import { momentoConAnio } from "@/shared/formato";
import { Button } from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import { useSesion } from "./shell/sesion";
import s from "./notificacion-alerta.module.css";

/** The notice section's title: what the channel actually does. */
export const tituloCorreo = (correo: "REAL" | "SIMULADO") =>
  correo === "REAL" ? "Aviso por correo" : "Correo simulado";

type Estado = IntentoNotificacion["estado"];
type Canal = IntentoNotificacion["canal"];
const TONO: Record<Estado, "aviso" | "exito" | "incidencia"> = {
  PENDIENTE: "aviso",
  ENVIADO: "exito",
  FALLIDO: "aviso",
  SIN_DESTINATARIO: "incidencia",
};
/** An attempt's state in words; a simulated one says so, a real one says it went by mail. */
const INTENTO: Record<Canal, Record<Estado, string>> = {
  SIMULADO: {
    PENDIENTE: "Pendiente de procesar",
    ENVIADO: "Enviado (simulado)",
    FALLIDO: "Fallido (simulado)",
    SIN_DESTINATARIO: "Sin destinatario",
  },
  CORREO: {
    PENDIENTE: "Pendiente de enviar",
    ENVIADO: "Enviado por correo",
    FALLIDO: "No se pudo enviar",
    SIN_DESTINATARIO: "Sin destinatario",
  },
};
const RESULTADO: Record<Canal, Record<Estado, string>> = {
  SIMULADO: {
    PENDIENTE: "Envío simulado pendiente de procesar.",
    ENVIADO: "Envío registrado como enviado (simulado).",
    FALLIDO: "Envío registrado como fallido (simulado). Se puede volver a simularlo.",
    SIN_DESTINATARIO: "No hay destinatario: falta el responsable en el catálogo.",
  },
  CORREO: {
    PENDIENTE: "El correo quedó pendiente de enviar.",
    ENVIADO: "Aviso enviado por correo.",
    FALLIDO: "No se pudo enviar el correo. Se puede volver a intentar.",
    SIN_DESTINATARIO: "No hay destinatario: falta el responsable en el catálogo.",
  },
};
const mensajeDe = (e: unknown) =>
  e instanceof Error ? e.message : "No se pudo completar el envío. Inténtelo nuevamente.";

/**
 * The email notice of one alert. With SMTP configured on the server (`correo: "REAL"` in the
 * session) one action sends it by real mail to the demo inbox; otherwise the delivery is simulated
 * (T12) and no message leaves the app. It is plain content for a titled Section on both the alert
 * and the report (see `tituloCorreo`), so nothing is boxed twice.
 * Each action prepares an attempt and processes it; a pending attempt left behind (a reload, a lost
 * answer) can be processed later, and every attempt stays in the history.
 */
export function NotificacionAlerta({
  alerta,
  alCambiar,
  destinatario,
}: {
  alerta: Alerta;
  alCambiar: (intento: IntentoNotificacion) => void;
  /** The recipient's name for an attempt's employeeId snapshot. */
  destinatario: (destinatarioId: string) => string;
}) {
  const { correo } = useSesion();
  const canal: Canal = correo === "REAL" ? "CORREO" : "SIMULADO";
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
      setMensaje(RESULTADO[intento.canal][intento.estado]);
    });
  const simular = (resultado: ResultadoSimulado) =>
    ejecutar(canal === "CORREO" ? "Enviando el correo…" : "Simulando el envío…", async () => {
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
      setMensaje(RESULTADO[intento.canal][intento.estado]);
      // The full history, also when the server answered with an earlier request.
      setIntentos(await api.listar(alerta.alertId));
    });

  const ultimo = intentos?.[0];
  const pendiente = ultimo?.estado === "PENDIENTE" ? ultimo : undefined;
  const enviado =
    alerta.estadoEnvio === "ENVIADO" || ultimo?.estado === "ENVIADO";
  const activa = alerta.vigencia === "ACTIVA";

  return (
    <div className={s.panel} aria-busy={ocupado !== null}>
      <div className={s.head}>
        <Button
          variante="quiet"
          alinearTexto
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
      ) : activa && !enviado && canal === "CORREO" ? (
        <div className={s.actions}>
          <Button disabled={ocupado !== null} onClick={() => simular("EXITO")}>
            Enviar aviso por correo
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
        <ol
          className={s.history}
          aria-label={canal === "CORREO" ? "Historial de envíos" : "Historial de envíos simulados"}
        >
          {intentos.map((i) => {
            const estado = { texto: INTENTO[i.canal][i.estado], tono: TONO[i.estado] };
            const cuando = i.completedAt ?? i.createdAt;
            return (
              <li key={i.intentoId} className={s.attempt}>
                <span className={s.number}>Intento {i.numero}</span>
                <StatusTag tono={estado.tono}>{estado.texto}</StatusTag>
                <time className={s.when} dateTime={cuando}>
                  {momentoConAnio(cuando)}
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
    </div>
  );
}
