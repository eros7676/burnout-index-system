"use client";
import { useRef, useState } from "react";
import { notificacionesApi as api } from "../client/notificaciones-api";
import type {
  Alerta,
  IntentoNotificacion,
  ResultadoSimulado,
  SolicitudNotificacion,
} from "../shared/contracts";

export function NotificacionAlerta({
  alerta,
  alCambiar,
}: {
  alerta: Alerta;
  alCambiar: (intento: IntentoNotificacion) => void;
}) {
  const [intentos, setIntentos] = useState<IntentoNotificacion[]>();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const bloqueo = useRef(false);
  const solicitud = useRef<SolicitudNotificacion | null>(null);
  async function ejecutar(accion: () => Promise<void>) {
    if (bloqueo.current) return;
    bloqueo.current = true;
    setOcupado(true);
    setError("");
    try {
      await accion();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo completar la simulación. Volvé a intentar.",
      );
    } finally {
      bloqueo.current = false;
      setOcupado(false);
    }
  }
  function guardar(intento: IntentoNotificacion) {
    setIntentos((prev) =>
      [
        intento,
        ...(prev ?? []).filter((i) => i.intentoId !== intento.intentoId),
      ].sort((a, b) => b.numero - a.numero),
    );
    alCambiar(intento);
  }
  const ultimo = intentos?.[0];
  const pendiente = ultimo?.estado === "PENDIENTE";
  const enviado =
    alerta.estadoEnvio === "ENVIADO" || ultimo?.estado === "ENVIADO";
  function preparar(resultado: ResultadoSimulado) {
    return ejecutar(async () => {
      if (!solicitud.current || solicitud.current.resultado !== resultado)
        solicitud.current = { requestId: crypto.randomUUID(), resultado };
      const intento = await api.preparar(alerta.alertId, solicitud.current);
      solicitud.current = null;
      guardar(intento);
      // Leer el historial completo también al recuperar una solicitud perdida.
      setIntentos(await api.listar(alerta.alertId));
    });
  }
  return (
    <div aria-label="Correo simulado" aria-busy={ocupado}>
      <p>Simulación de correo · Se conserva el historial de intentos.</p>
      <div className="tab-actions">
        <button
          disabled={ocupado}
          onClick={() =>
            ejecutar(async () => {
              setIntentos(await api.listar(alerta.alertId));
            })
          }
        >
          Ver / actualizar intentos
        </button>
        {alerta.vigencia === "ACTIVA" && !enviado && !pendiente && (
          <>
            <button disabled={ocupado} onClick={() => preparar("EXITO")}>
              {alerta.estadoEnvio === "NO_APLICA"
                ? "Preparar correo simulado"
                : "Reintentar correo simulado"}
            </button>
            <button disabled={ocupado} onClick={() => preparar("FALLO")}>
              Preparar fallo simulado
            </button>
          </>
        )}
        {pendiente && (
          <button
            disabled={ocupado}
            onClick={() =>
              ejecutar(async () => {
                guardar(await api.procesar(alerta.alertId, ultimo.intentoId));
              })
            }
          >
            Procesar envío pendiente
          </button>
        )}
      </div>
      {ocupado && <p role="status">Procesando simulación…</p>}
      {error && <p role="alert">{error}</p>}
      {intentos &&
        (intentos.length ? (
          <ol aria-label="Historial de envíos simulados">
            {intentos.map((i) => (
              <li key={i.intentoId}>
                Intento {i.numero} ·{" "}
                {i.estado === "ENVIADO" ? "Enviado (simulado)" : i.estado} ·
                Destinatario: {i.destinatarioId ?? "SIN_DESTINATARIO"} ·{" "}
                {new Date(i.createdAt).toLocaleString("es-AR")}
                {i.detalle && <p>{i.detalle}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p>Todavía no hay intentos de envío.</p>
        ))}
    </div>
  );
}
