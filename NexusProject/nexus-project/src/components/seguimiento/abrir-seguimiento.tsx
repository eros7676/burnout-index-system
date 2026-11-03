"use client";
import { useState } from "react";
import { seguimientoApi } from "@/client/seguimiento-api";
import type { SeguimientoAlertaDTO } from "@/shared/contratos/seguimiento";
import {
  Button,
  Form,
  FormActions,
  FormGroup,
  SelectFormField,
} from "@/shared/ui";
import { mensajeGeneral, useAccion } from "./use-accion";
import s from "./seguimiento.module.css";

/** The alert has no follow-up: who may start one can do it here; everyone else is told who can. */
export function AbrirSeguimiento({
  alertId,
  datos,
  superada,
  alCambiar,
}: {
  alertId: string;
  datos: SeguimientoAlertaDTO;
  superada: boolean;
  alCambiar: (datos: SeguimientoAlertaDTO) => void;
}) {
  const { permisos, asignables, asignadoPorDefecto } = datos;
  const [responsable, setResponsable] = useState(
    asignadoPorDefecto ?? asignables[0]?.userId ?? "",
  );
  const accion = useAccion(alCambiar);

  if (!permisos.abrir)
    return (
      <p className={s.texto}>
        {superada
          ? "La alerta fue superada por un cálculo posterior: ya no admite un seguimiento nuevo."
          : "Esta alerta no tiene seguimiento. Puede iniciarlo RR. HH. o el destinatario de la alerta."}
      </p>
    );

  const general = mensajeGeneral(accion.error, ["asignadoA"]);
  return (
    <Form
      aria-label="Abrir seguimiento"
      onSubmit={(e) => {
        e.preventDefault();
        void accion.ejecutar(
          () =>
            seguimientoApi.abrir(
              alertId,
              permisos.reasignar ? { asignadoA: responsable } : {},
            ),
          "Se abrió el seguimiento.",
        );
      }}
    >
      <FormGroup>
        <p className={s.texto}>
          Esta alerta no tiene seguimiento. Al abrirlo, las alertas posteriores
          de la persona se suman al mismo caso mientras siga abierto.
        </p>
        {permisos.reasignar ? (
          <SelectFormField
            etiqueta="Responsable"
            ancho="completo"
            value={responsable}
            error={accion.error?.campo("asignadoA")}
            onChange={(e) => setResponsable(e.target.value)}
          >
            {asignables.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.nombre}
              </option>
            ))}
          </SelectFormField>
        ) : (
          <p className={s.ayuda}>El seguimiento quedará a su cargo.</p>
        )}
      </FormGroup>
      <FormActions>
        <Button type="submit" variante="primary" disabled={accion.ocupado}>
          Abrir seguimiento
        </Button>
      </FormActions>
      {general && (
        <p role="alert" className={s.error}>
          {general}
        </p>
      )}
    </Form>
  );
}
