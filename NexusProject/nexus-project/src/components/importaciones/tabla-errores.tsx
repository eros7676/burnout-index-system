import { useRef } from "react";
import type { ErrorCampo } from "@/shared/contracts";
import { useRowsEnter } from "@/shared/motion";
import { DataTable, tabla } from "@/shared/ui";
import { columna, problema } from "./textos";
import s from "./importaciones.module.css";

/** Row/field problems of a file, in words; the code stays, small, for support. */
export function TablaErrores({
  etiqueta,
  items,
}: {
  etiqueta: string;
  items: ErrorCampo[];
}) {
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  useRowsEnter(cuerpo, items);
  return (
    <DataTable etiqueta={etiqueta}>
      <thead>
        <tr>
          <th scope="col" className={tabla.num}>
            Fila
          </th>
          <th scope="col">Campo</th>
          <th scope="col">Problema</th>
          <th scope="col">Detalle</th>
        </tr>
      </thead>
      <tbody ref={cuerpo}>
        {items.map((e, i) => (
          <tr key={`${e.fila}-${e.campo}-${e.codigo}-${i}`}>
            <th scope="row" className={tabla.num}>
              {e.fila ?? "Archivo"}
            </th>
            <td className={s.campo}>{e.campo ? columna(e.campo) : "—"}</td>
            <td className={s.problema}>
              {problema(e.codigo)}
              <span className={s.codigo}>{e.codigo}</span>
            </td>
            <td className={s.detalle}>{e.detalle}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
