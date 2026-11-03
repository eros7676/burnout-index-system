"use client";
import { MOTIVO_MAX, MOTIVO_MIN, type BorradorReglasDTO } from "@/shared/contratos/reglas";
import { entero } from "@/shared/formato";
import { TextAreaField } from "@/shared/ui";
import { Confirmacion } from "./confirmacion";
import { fecha, plural } from "./parametros";
import s from "./dialogos.module.css";

export type Dialogo = "publicar" | "aprobar" | "rechazar" | "descartar";

/** The question asked before each step that cannot be taken back. */
export function Dialogos({
  abierto,
  borrador,
  ocupado,
  error,
  justificacion,
  onJustificacion,
  onConfirmar,
  onCancelar,
}: {
  abierto: Dialogo | null;
  borrador: BorradorReglasDTO;
  ocupado: boolean;
  error: string | null;
  justificacion: string;
  onJustificacion: (texto: string) => void;
  onConfirmar: (dialogo: Dialogo) => void;
  onCancelar: () => void;
}) {
  const inicio = fecha(borrador.propuesta.effectiveFrom);
  const semanas = borrador.simulacion?.contexto.semanas ?? 0;
  const alertas = borrador.simulacion?.alertas;
  const comun = { ocupado, error, onCancelar };
  return (
    <>
      <Confirmacion
        {...comun}
        abierta={abierto === "publicar"}
        titulo={`¿Publicar la versión con inicio el ${inicio}?`}
        confirmar="Publicar versión"
        enCurso="Publicando…"
        onConfirmar={() => onConfirmar("publicar")}
      >
        <p>
          Se publicará una nueva versión basada en {borrador.baseVersion}, con
          inicio el {inicio}.{" "}
          {semanas > 0
            ? `Se recalcularán ${plural(semanas, "semana ya evaluada", "semanas ya evaluadas")}.`
            : "No se recalculará ninguna semana: la versión rige desde una semana futura."}
        </p>
        <p className={s.motivo}>Motivo: {borrador.motivo}</p>
        <p>La versión publicada no puede modificarse.</p>
      </Confirmacion>

      <Confirmacion
        {...comun}
        abierta={abierto === "aprobar"}
        titulo="¿Aprobar el borrador?"
        confirmar="Aprobar borrador"
        enCurso="Aprobando…"
        onConfirmar={() => onConfirmar("aprobar")}
      >
        <p>
          El cambio rige desde el {inicio} y recalcula{" "}
          {plural(semanas, "semana ya evaluada", "semanas ya evaluadas")}
          {alertas
            ? `: ${plural(alertas.nuevas, "alerta nueva", "alertas nuevas")} y ${plural(alertas.superadas, "alerta superada", "alertas superadas")}`
            : ""}
          .
        </p>
        <p className={s.motivo}>Motivo: {borrador.motivo}</p>
        <p>
          Después de la aprobación el contenido no puede modificarse. RR. HH.
          publica la versión.
        </p>
      </Confirmacion>

      <Confirmacion
        {...comun}
        abierta={abierto === "rechazar"}
        titulo="¿Rechazar el borrador?"
        confirmar="Rechazar borrador"
        enCurso="Rechazando…"
        bloqueada={justificacion.trim().length < MOTIVO_MIN}
        onConfirmar={() => onConfirmar("rechazar")}
      >
        <p>El borrador vuelve a RR. HH. para su corrección.</p>
        <TextAreaField
          etiqueta="Justificación del rechazo"
          ayuda={`${entero(justificacion.trim().length)} de ${MOTIVO_MAX} caracteres (mínimo ${MOTIVO_MIN}).`}
          maxLength={MOTIVO_MAX}
          value={justificacion}
          onChange={(e) => onJustificacion(e.target.value)}
          data-foco
        />
      </Confirmacion>

      <Confirmacion
        {...comun}
        abierta={abierto === "descartar"}
        titulo="¿Descartar el borrador?"
        confirmar="Descartar borrador"
        enCurso="Descartando…"
        onConfirmar={() => onConfirmar("descartar")}
      >
        <p>
          El borrador queda en el historial y ya no puede modificarse ni
          publicarse.
        </p>
      </Confirmacion>
    </>
  );
}
