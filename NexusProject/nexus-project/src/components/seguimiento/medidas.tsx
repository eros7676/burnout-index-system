"use client";
import { useState } from "react";
import { seguimientoApi } from "@/client/seguimiento-api";
import type { Factor } from "@/shared/contracts";
import {
  TIPOS_MEDIDA,
  TIPOS_MEDIDA_CLAVES,
  type CasoSeguimientoDTO,
  type SeguimientoAlertaDTO,
  type TipoMedida,
} from "@/shared/contratos/seguimiento";
import { FACTOR, entero } from "@/shared/formato";
import {
  Button,
  DataTable,
  Empty,
  Form,
  FormActions,
  FormGroup,
  SelectFormField,
  TextField,
  tabla,
} from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import { fecha } from "./textos";
import { mensajeGeneral, useAccion } from "./use-accion";
import s from "./seguimiento.module.css";

const FACTORES = Object.keys(FACTOR) as Factor[];
const CAMPOS = ["tipo", "factor", "responsableId", "vence"];

/**
 * Organizational measures of the case: what changes in the work (tasks, deadlines, hours, rest,
 * staffing), who is responsible and by when. Never an action on the person.
 */
export function Medidas({
  alertId,
  caso,
  datos,
  alCambiar,
}: {
  alertId: string;
  caso: CasoSeguimientoDTO;
  datos: SeguimientoAlertaDTO;
  alCambiar: (datos: SeguimientoAlertaDTO) => void;
}) {
  const gestiona = caso.estado !== "CERRADO" && datos.permisos.gestionar;
  const [tipo, setTipo] = useState<TipoMedida | "">("");
  const [factor, setFactor] = useState<Factor | "">("");
  const [responsable, setResponsable] = useState(caso.asignadoA.userId);
  const [vence, setVence] = useState("");
  const registro = useAccion((nuevo) => {
    alCambiar(nuevo);
    setTipo("");
    setFactor("");
    setVence("");
  });
  const marca = useAccion(alCambiar);
  const general = mensajeGeneral(registro.error, CAMPOS);
  const hechas = caso.medidas.filter((m) => m.hecha).length;

  return (
    <div className={s.bloque}>
      <h3 className={s.titulo}>Medidas organizativas</h3>
      {caso.medidas.length ? (
        <>
          <DataTable etiqueta="Medidas del seguimiento">
            <thead>
              <tr>
                <th scope="col">Medida</th>
                <th scope="col">Responsable</th>
                <th scope="col">Vencimiento</th>
                <th scope="col">Estado</th>
                {gestiona && (
                  <th scope="col">
                    <span className="sr-only">Acción</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {caso.medidas.map((m) => (
                <tr key={m.medidaId}>
                  <th scope="row">
                    {TIPOS_MEDIDA[m.tipo].etiqueta}
                    {m.factor && (
                      <span className={tabla.sub}>{FACTOR[m.factor]}</span>
                    )}
                  </th>
                  <td>{m.responsable.nombre}</td>
                  <td>{m.vence ? fecha(m.vence) : "—"}</td>
                  <td>
                    <StatusTag tono={m.hecha ? "exito" : "aviso"}>
                      {m.hecha ? "Hecha" : "Pendiente"}
                    </StatusTag>
                  </td>
                  {gestiona && (
                    <td>
                      <Button
                        variante="quiet"
                        className={s.accionFila}
                        disabled={marca.ocupado}
                        onClick={() =>
                          void marca.ejecutar(
                            () =>
                              seguimientoApi.marcarMedida(alertId, {
                                medidaId: m.medidaId,
                                hecha: !m.hecha,
                              }),
                            m.hecha
                              ? "Se marcó la medida como pendiente."
                              : "Se marcó la medida como hecha.",
                          )
                        }
                      >
                        {m.hecha ? "Marcar como pendiente" : "Marcar como hecha"}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </DataTable>
          <p className={s.ayuda}>
            {entero(hechas)} de {entero(caso.medidas.length)}{" "}
            {caso.medidas.length === 1 ? "medida hecha" : "medidas hechas"}.
          </p>
        </>
      ) : (
        <Empty titulo="Todavía no hay medidas registradas">
          {gestiona
            ? "Las medidas cambian la organización del trabajo: tareas, plazos, horas, descansos o dotación."
            : "Las medidas del seguimiento aparecerán en esta tabla."}
        </Empty>
      )}
      <p role="status" className={s.confirmacion}>
        {marca.confirmacion}
      </p>
      {marca.error && (
        <p role="alert" className={s.error}>
          {marca.error.message}
        </p>
      )}
      {gestiona && (
        <Form
          aria-label="Registrar medida"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tipo) return;
            void registro.ejecutar(
              () =>
                seguimientoApi.registrarMedida(alertId, {
                  tipo,
                  factor: factor || null,
                  responsableId: responsable,
                  vence: vence || null,
                }),
              "Se registró la medida.",
            );
          }}
        >
          <FormGroup fila>
            <SelectFormField
              etiqueta="Tipo de medida"
              value={tipo}
              error={registro.error?.campo("tipo")}
              onChange={(e) => {
                const nuevo = e.target.value as TipoMedida | "";
                setTipo(nuevo);
                // The factor a measure usually answers is the starting choice.
                setFactor(nuevo ? (TIPOS_MEDIDA[nuevo].factor ?? "") : "");
              }}
            >
              <option value="">Seleccione una medida</option>
              {TIPOS_MEDIDA_CLAVES.map((t) => (
                <option key={t} value={t}>
                  {TIPOS_MEDIDA[t].etiqueta}
                </option>
              ))}
            </SelectFormField>
            <SelectFormField
              etiqueta="Factor"
              opcional
              ancho="corto"
              value={factor}
              error={registro.error?.campo("factor")}
              onChange={(e) => setFactor(e.target.value as Factor | "")}
            >
              <option value="">Sin factor</option>
              {FACTORES.map((f) => (
                <option key={f} value={f}>
                  {FACTOR[f]}
                </option>
              ))}
            </SelectFormField>
            <SelectFormField
              etiqueta="Responsable de la medida"
              value={responsable}
              error={registro.error?.campo("responsableId")}
              onChange={(e) => setResponsable(e.target.value)}
            >
              {datos.asignables.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.nombre}
                </option>
              ))}
            </SelectFormField>
            <TextField
              etiqueta="Fecha de vencimiento"
              type="date"
              ancho="corto"
              opcional
              error={registro.error?.campo("vence")}
              value={vence}
              onChange={(e) => setVence(e.target.value)}
            />
          </FormGroup>
          <FormActions>
            <Button type="submit" disabled={registro.ocupado || !tipo}>
              Registrar medida
            </Button>
          </FormActions>
          <p role="status" className={s.confirmacion}>
            {registro.confirmacion}
          </p>
          {general && (
            <p role="alert" className={s.error}>
              {general}
            </p>
          )}
        </Form>
      )}
    </div>
  );
}
