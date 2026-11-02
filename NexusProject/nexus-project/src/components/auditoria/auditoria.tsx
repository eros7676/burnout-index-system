"use client";
import { useRef, useState } from "react";
import { tableroApi } from "@/client/tablero-api";
import { useConsulta } from "@/client/use-consulta";
import type { FiltrosAuditoria } from "@/shared/contracts";
import { entero, momento } from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import {
  Button,
  DataTable,
  Empty,
  ErrorBox,
  Notice,
  PageHeader,
  Section,
  SelectField,
  SkeletonRows,
  Toolbar,
  tabla,
} from "@/shared/ui";
import { DateField } from "@/shared/ui/date-field";
import { Pagination } from "@/shared/ui/pagination";
import { useSesion } from "../shell/sesion";
import { accion, actor, detalles, entidad, referencia } from "./eventos";
import s from "./auditoria.module.css";

const POR_PAGINA = 20;
type Tipo = "" | NonNullable<FiltrosAuditoria["entidad"]>;

// The API takes UTC instants; a picked day is a day in the product's zone,
// Buenos Aires, which has kept UTC−3 without daylight saving since 2009.
const inicioDelDia = (dia: string) =>
  new Date(`${dia}T00:00:00.000-03:00`).toISOString();
const finDelDia = (dia: string) =>
  new Date(`${dia}T23:59:59.999-03:00`).toISOString();

/** Answers "¿Quién cambió qué y cuándo?": every import and rules change, newest first. */
export function Auditoria() {
  const { usuario, usuarios } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const [tipo, setTipo] = useState<Tipo>("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [numero, setNumero] = useState(1);

  const invertido = !!desde && !!hasta && desde > hasta;
  const filtros: FiltrosAuditoria = {
    entidad: tipo || undefined,
    desde: desde ? inicioDelDia(desde) : undefined,
    hasta: hasta ? finDelDia(hasta) : undefined,
    page: numero,
    pageSize: POR_PAGINA,
  };
  const consulta = useConsulta(
    (signal) => tableroApi.auditoria(filtros, signal),
    usuario && !invertido ? `auditoria:${JSON.stringify(filtros)}` : null,
  );
  const datos = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  useRowsEnter(filas, datos?.items);

  const filtrado = !!(tipo || desde || hasta);
  const paginas = datos ? Math.ceil(datos.total / datos.pageSize) : 1;
  const filtrar = (cambio: () => void) => {
    cambio();
    setNumero(1);
  };

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Auditoría"
        contexto="Cada importación y cada cambio de reglas: quién lo hizo y cuándo."
      />

      <Section
        titulo="Eventos"
        aside={
          datos && !invertido ? (
            <span className="num">
              {datos.total === 1 ? "1 evento" : `${entero(datos.total)} eventos`}
            </span>
          ) : undefined
        }
      >
        <Toolbar>
          <SelectField
            etiqueta="Tipo"
            value={tipo}
            onChange={(e) => filtrar(() => setTipo(e.target.value as Tipo))}
          >
            <option value="">Todos</option>
            <option value="IMPORTACION">Importaciones</option>
            <option value="REGLAS">Reglas</option>
          </SelectField>
          <DateField
            etiqueta="Desde"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => filtrar(() => setDesde(e.target.value))}
          />
          <DateField
            etiqueta="Hasta"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => filtrar(() => setHasta(e.target.value))}
          />
          {filtrado && (
            <Button
              variante="quiet"
              onClick={() =>
                filtrar(() => {
                  setTipo("");
                  setDesde("");
                  setHasta("");
                })
              }
            >
              Quitar filtros
            </Button>
          )}
        </Toolbar>

        <div ref={caja}>
          {invertido ? (
            <Notice tono="aviso">
              La fecha desde es posterior a la fecha hasta.
            </Notice>
          ) : consulta.estado === "error" ? (
            <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
          ) : !datos ? (
            <SkeletonRows filas={6} />
          ) : datos.items.length === 0 ? (
            filtrado ? (
              <Empty titulo="No hay eventos con estos filtros">
                Probá con otro tipo o con un rango de fechas más amplio.
              </Empty>
            ) : (
              <Empty titulo="Todavía no hay eventos">
                Cada validación, importación o publicación de reglas va a
                quedar registrada acá.
              </Empty>
            )
          ) : (
            <>
              <DataTable etiqueta="Eventos de auditoría">
                <thead>
                  <tr>
                    <th scope="col">Cuándo</th>
                    <th scope="col">Quién</th>
                    <th scope="col">Acción</th>
                    <th scope="col">Sobre</th>
                    <th scope="col">Detalles</th>
                  </tr>
                </thead>
                <tbody ref={filas}>
                  {datos.items.map((evento) => {
                    const pares = detalles(evento);
                    return (
                      <tr key={evento.eventoId}>
                        <td className={s.cuando}>
                          <time dateTime={evento.createdAt}>
                            {momento(evento.createdAt)}
                          </time>
                        </td>
                        <td>{actor(evento.actorId, usuarios)}</td>
                        <th scope="row" className={s.accion}>
                          {accion(evento.accion)}
                        </th>
                        <td>
                          {entidad(evento.entidad)}
                          <span className={tabla.sub}>{referencia(evento)}</span>
                        </td>
                        <td className={s.detalles}>
                          {pares.length ? (
                            <details>
                              <summary>
                                <span className={s.ver}>
                                  {pares.length === 1
                                    ? "Ver 1 dato"
                                    : `Ver ${pares.length} datos`}
                                </span>
                                <span className={s.ocultar}>Ocultar</span>
                              </summary>
                              <dl>
                                {pares.map((p) => (
                                  <div key={p.clave}>
                                    <dt>{p.clave}</dt>
                                    <dd className="num">{p.valor}</dd>
                                  </div>
                                ))}
                              </dl>
                            </details>
                          ) : (
                            <span className={tabla.muted}>Sin detalles</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
              {paginas > 1 && (
                <div className={s.pie}>
                  <Pagination
                    pagina={datos.page}
                    paginas={paginas}
                    onCambio={setNumero}
                    etiqueta="Páginas de eventos"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
