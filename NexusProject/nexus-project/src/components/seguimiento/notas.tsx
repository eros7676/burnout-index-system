"use client";
import { useState } from "react";
import { seguimientoApi } from "@/client/seguimiento-api";
import {
  LIMITES_SEGUIMIENTO,
  type CasoSeguimientoDTO,
  type SeguimientoAlertaDTO,
} from "@/shared/contratos/seguimiento";
import { entero, momento } from "@/shared/formato";
import { Button, Form, FormActions, TextAreaField } from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import { contar } from "./textos";
import { mensajeGeneral, useAccion } from "./use-accion";
import s from "./seguimiento.module.css";

/**
 * Internal notes of the case, append-only: they are written, never edited or deleted. Only RR. HH. and
 * the case owner read them; everyone else sees how many there are.
 */
export function Notas({
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
  const [texto, setTexto] = useState("");
  const accion = useAccion((nuevo) => {
    alCambiar(nuevo);
    setTexto("");
  });
  const general = mensajeGeneral(accion.error, ["texto"]);
  const puedeAnotar = caso.estado !== "CERRADO" && datos.permisos.anotar;
  const { notas } = caso;

  return (
    <div className={s.bloque}>
      <h3 className={s.titulo}>Notas internas</h3>
      {notas === null ? (
        <p className={s.texto}>
          {caso.totalNotas > 0
            ? `El seguimiento tiene ${contar(caso.totalNotas, "nota interna", "notas internas")}. `
            : ""}
          Las notas son reservadas a RR. HH. y a quien tiene a cargo el
          seguimiento.
        </p>
      ) : (
        <>
          {puedeAnotar && (
            <Form
              aria-label="Agregar nota"
              onSubmit={(e) => {
                e.preventDefault();
                void accion.ejecutar(
                  () => seguimientoApi.anotar(alertId, { texto }),
                  "Se agregó la nota.",
                );
              }}
            >
              <TextAreaField
                etiqueta="Nota"
                ayuda={`Hasta ${entero(LIMITES_SEGUIMIENTO.nota.max)} caracteres. Una nota no se edita ni se elimina.`}
                maxLength={LIMITES_SEGUIMIENTO.nota.max}
                error={accion.error?.campo("texto")}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <FormActions>
                <Button
                  type="submit"
                  disabled={accion.ocupado || !texto.trim()}
                >
                  Agregar nota
                </Button>
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
          )}
          {notas.length ? (
            <ol className={s.notas} aria-label="Notas del seguimiento">
              {[...notas].reverse().map((n) => (
                <li key={n.notaId} className={s.nota}>
                  <span className={s.notaPie}>
                    <strong>
                      {n.autor.nombre}
                      {n.autor.userId === usuarioId ? " (usted)" : ""}
                    </strong>
                    <time dateTime={n.createdAt}>{momento(n.createdAt)}</time>
                    {n.esCierre && <StatusTag>Cierre</StatusTag>}
                  </span>
                  <p className={s.notaTexto}>{n.texto}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className={s.texto}>Todavía no hay notas.</p>
          )}
        </>
      )}
    </div>
  );
}
