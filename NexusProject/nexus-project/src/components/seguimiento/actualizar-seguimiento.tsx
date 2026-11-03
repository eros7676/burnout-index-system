"use client";
import { useState } from "react";
import { seguimientoApi } from "@/client/seguimiento-api";
import {
  ESTADO_SEGUIMIENTO,
  type ActualizarSeguimiento,
  type CasoSeguimientoDTO,
  type EstadoSeguimiento,
  type SeguimientoAlertaDTO,
} from "@/shared/contratos/seguimiento";
import {
  Button,
  Form,
  FormActions,
  FormGroup,
  SelectFormField,
  TextField,
} from "@/shared/ui";
import { mensajeGeneral, useAccion } from "./use-accion";
import s from "./seguimiento.module.css";

/** The states a case may move to from each state; CERRADO has its own form. */
const SIGUIENTES: Record<EstadoSeguimiento, readonly EstadoSeguimiento[]> = {
  NUEVO: ["EN_CURSO"],
  EN_CURSO: ["EN_ESPERA"],
  EN_ESPERA: ["EN_CURSO"],
  CERRADO: [],
};

const CAMPOS = ["estado", "asignadoA", "vence"];

/** State, owner and due date of an open case. Only what changed is sent. */
export function ActualizarSeguimiento({
  alertId,
  caso,
  datos,
  usuarioId,
  alCambiar,
}: {
  alertId: string;
  caso: CasoSeguimientoDTO;
  datos: SeguimientoAlertaDTO;
  usuarioId: string | undefined;
  alCambiar: (datos: SeguimientoAlertaDTO) => void;
}) {
  const [estado, setEstado] = useState<EstadoSeguimiento>(caso.estado);
  const [responsable, setResponsable] = useState(caso.asignadoA.userId);
  const [vence, setVence] = useState(caso.vence ?? "");
  // What the server saved becomes the form's starting point again.
  const accion = useAccion((nuevo) => {
    alCambiar(nuevo);
    if (!nuevo.caso) return;
    setEstado(nuevo.caso.estado);
    setResponsable(nuevo.caso.asignadoA.userId);
    setVence(nuevo.caso.vence ?? "");
  });

  const cambios: ActualizarSeguimiento = {
    ...(estado !== caso.estado
      ? { estado: estado as "EN_CURSO" | "EN_ESPERA" }
      : {}),
    ...(responsable !== caso.asignadoA.userId ? { asignadoA: responsable } : {}),
    ...(vence !== (caso.vence ?? "") ? { vence: vence || null } : {}),
  };
  const hayCambios = Object.keys(cambios).length > 0;
  const puedeTomarlo =
    !datos.permisos.reasignar && !!usuarioId && caso.asignadoA.userId !== usuarioId;
  const general = mensajeGeneral(accion.error, CAMPOS);

  const enviar = (cuerpo: ActualizarSeguimiento, hecho: string) =>
    accion.ejecutar(() => seguimientoApi.actualizar(alertId, cuerpo), hecho);

  return (
    <Form
      aria-label="Actualizar seguimiento"
      onSubmit={(e) => {
        e.preventDefault();
        if (hayCambios) void enviar(cambios, "Se actualizó el seguimiento.");
      }}
    >
      <FormGroup fila>
        <SelectFormField
          etiqueta="Estado"
          ancho="corto"
          value={estado}
          error={accion.error?.campo("estado")}
          onChange={(e) => setEstado(e.target.value as EstadoSeguimiento)}
        >
          <option value={caso.estado}>{ESTADO_SEGUIMIENTO[caso.estado]}</option>
          {SIGUIENTES[caso.estado].map((e) => (
            <option key={e} value={e}>
              {ESTADO_SEGUIMIENTO[e]}
            </option>
          ))}
        </SelectFormField>
        {datos.permisos.reasignar && (
          <SelectFormField
            etiqueta="Responsable"
            value={responsable}
            error={accion.error?.campo("asignadoA")}
            onChange={(e) => setResponsable(e.target.value)}
          >
            {datos.asignables.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.nombre}
              </option>
            ))}
          </SelectFormField>
        )}
        <TextField
          etiqueta="Fecha de vencimiento"
          type="date"
          ancho="corto"
          opcional={estado !== "EN_CURSO"}
          ayuda={estado === "EN_CURSO" ? "Obligatoria para un seguimiento en curso." : undefined}
          error={accion.error?.campo("vence")}
          value={vence}
          onChange={(e) => setVence(e.target.value)}
        />
      </FormGroup>
      <FormActions>
        <Button type="submit" variante="primary" disabled={accion.ocupado || !hayCambios}>
          Guardar cambios
        </Button>
        {puedeTomarlo && (
          <Button
            disabled={accion.ocupado}
            onClick={() =>
              void enviar({ asignadoA: usuarioId }, "El seguimiento quedó a su cargo.")
            }
          >
            Asignarme el seguimiento
          </Button>
        )}
      </FormActions>
      <p role="status" className={s.confirmacion}>
        {accion.confirmacion}
      </p>
      {general && (
        <p role="alert" className={s.error}>
          {general}
        </p>
      )}
    </Form>
  );
}
