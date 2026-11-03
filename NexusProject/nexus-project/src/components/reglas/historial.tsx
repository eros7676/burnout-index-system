import type {
  CambioParametroDTO,
  EventoBorradorDTO,
} from "@/shared/contratos/reglas";
import { ROL, momento } from "@/shared/formato";
import { DataTable, tabla } from "@/shared/ui";
import { etiquetaCampo, valorCampo } from "./parametros";
import s from "./historial.module.css";

/** Parameters the draft changes, next to the value of the version it starts from. */
export function TablaCambios({
  cambios,
  versionBase,
}: {
  cambios: readonly CambioParametroDTO[];
  versionBase: string;
}) {
  return (
    <DataTable etiqueta={`Parámetros que cambian respecto de ${versionBase}`}>
      <thead>
        <tr>
          <th scope="col">Parámetro</th>
          <th scope="col" className={tabla.num}>
            {versionBase}
          </th>
          <th scope="col" className={tabla.num}>
            Borrador
          </th>
        </tr>
      </thead>
      <tbody>
        {cambios.map((c) => (
          <tr key={c.campo}>
            <th scope="row">{etiquetaCampo(c.campo)}</th>
            <td className={tabla.num}>{valorCampo(c.campo, c.antes)}</td>
            <td className={tabla.num}>
              <strong>{valorCampo(c.campo, c.despues)}</strong>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Every step of the draft, newest first: who, when, why and what changed. */
export function Historial({
  eventos,
}: {
  eventos: readonly EventoBorradorDTO[];
}) {
  return (
    <ol className={s.lista}>
      {eventos.map((e) => (
        <li key={e.eventoId} className={s.evento}>
          <p className={s.cabecera}>
            <strong>{e.etiqueta}</strong>
            <span className={s.meta}>
              {e.actor.nombre}
              {e.actor.rol ? ` (${ROL[e.actor.rol]})` : ""}
              {" · "}
              <time dateTime={e.createdAt}>{momento(e.createdAt)}</time>
            </span>
          </p>
          {e.justificacion && (
            <p className={s.motivo}>
              {e.accion.endsWith("RECHAZADO") ? "Justificación" : "Motivo"}:{" "}
              {e.justificacion}
            </p>
          )}
          {e.cambios.length > 0 && (
            <ul className={s.cambios}>
              {e.cambios.map((c) => (
                <li key={c.campo}>
                  {etiquetaCampo(c.campo)}: {valorCampo(c.campo, c.antes)} →{" "}
                  <strong>{valorCampo(c.campo, c.despues)}</strong>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
