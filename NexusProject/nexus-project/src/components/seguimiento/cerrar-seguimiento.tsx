"use client";
import { useState } from "react";
import { seguimientoApi } from "@/client/seguimiento-api";
import {
  LIMITES_SEGUIMIENTO,
  MOTIVO_CIERRE,
  MOTIVOS_CIERRE,
  type MotivoCierre,
  type SeguimientoAlertaDTO,
} from "@/shared/contratos/seguimiento";
import { entero } from "@/shared/formato";
import {
  Button,
  Form,
  FormActions,
  FormGroup,
  Notice,
  SelectFormField,
  TextAreaField,
} from "@/shared/ui";
import { mensajeGeneral, useAccion } from "./use-accion";
import s from "./seguimiento.module.css";

const CAMPOS = ["motivoCierre", "justificacion"];

/** Closing is final, so the button asks once more before it acts. */
export function CerrarSeguimiento({
  alertId,
  alCambiar,
}: {
  alertId: string;
  alCambiar: (datos: SeguimientoAlertaDTO) => void;
}) {
  const [motivo, setMotivo] = useState<MotivoCierre | "">("");
  const [justificacion, setJustificacion] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const accion = useAccion(alCambiar);
  const general = mensajeGeneral(accion.error, CAMPOS);
  const { min, max } = LIMITES_SEGUIMIENTO.justificacion;

  async function enviar() {
    if (!motivo) return;
    const cerrado = await accion.ejecutar(
      () => seguimientoApi.cerrar(alertId, { motivoCierre: motivo, justificacion }),
      "Se cerró el seguimiento.",
    );
    // A refusal sends the user back to the fields to correct them.
    if (!cerrado) setConfirmando(false);
  }

  return (
    <div className={s.bloque}>
      <h3 className={s.titulo}>Cierre del seguimiento</h3>
      <Form
        aria-label="Cerrar seguimiento"
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmando) void enviar();
          else setConfirmando(true);
        }}
      >
        <FormGroup>
          <SelectFormField
            etiqueta="Motivo de cierre"
            value={motivo}
            error={accion.error?.campo("motivoCierre")}
            onChange={(e) => {
              setMotivo(e.target.value as MotivoCierre | "");
              setConfirmando(false);
            }}
          >
            <option value="">Seleccione un motivo</option>
            {MOTIVOS_CIERRE.map((m) => (
              <option key={m} value={m}>
                {MOTIVO_CIERRE[m]}
              </option>
            ))}
          </SelectFormField>
          <TextAreaField
            etiqueta="Justificación"
            ayuda={`Entre ${entero(min)} y ${entero(max)} caracteres. Queda en el registro de auditoría.`}
            maxLength={max}
            error={accion.error?.campo("justificacion")}
            value={justificacion}
            onChange={(e) => {
              setJustificacion(e.target.value);
              setConfirmando(false);
            }}
          />
        </FormGroup>
        {confirmando && (
          <Notice tono="aviso">
            ¿Cerrar el seguimiento? El cierre es definitivo: un seguimiento
            cerrado no se reabre, y una alerta posterior abre uno nuevo.
          </Notice>
        )}
        <FormActions>
          <Button
            type="submit"
            disabled={accion.ocupado || !motivo || !justificacion.trim()}
          >
            Cerrar seguimiento
          </Button>
          {confirmando && (
            <Button
              disabled={accion.ocupado}
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </Button>
          )}
        </FormActions>
        {general && (
          <p role="alert" className={s.error}>
            {general}
          </p>
        )}
      </Form>
    </div>
  );
}
