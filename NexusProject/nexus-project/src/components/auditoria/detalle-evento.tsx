"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef } from "react";
import { useConsulta } from "@/client/use-consulta";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import {
  ButtonLink,
  Columns,
  DataTable,
  Empty,
  ErrorBox,
  KeyFacts,
  PageHeader,
  Section,
  Stack,
  SkeletonRows,
  tabla,
} from "@/shared/ui";
import { useSesion } from "../shell/sesion";
import { filasDeCambios } from "./cambios";
import { auditoriaApi } from "./cliente";
import {
  detalles,
  elemento,
  enlacePersona,
  enlaceRecurso,
  etiquetaMotivo,
  etiquetaOrigen,
  fechaHora,
  nombreActor,
  nombrePersona,
  resumen,
  rolActor,
} from "./eventos";
import { enlaceOperacion, rutaDeRetorno } from "./filtros-url";
import { EtiquetaResultado } from "./resultado";
import s from "./detalle-evento.module.css";

/** Answers "¿Qué ocurrió exactamente en este evento?": who, when, on what, with which changes. */
export function DetalleEvento({ eventoId }: { eventoId: string }) {
  const { usuario, usuarios } = useSesion();
  const volver = rutaDeRetorno(useSearchParams().get("lista"));
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filasRef = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(
    (signal) => auditoriaApi.detalle(eventoId, signal),
    usuario ? `evento:${eventoId}` : null,
  );
  const datos = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  const evento = datos?.evento;
  const cambios = filasDeCambios(evento?.cambios ?? null);
  useRowsEnter(filasRef, cambios);

  const recurso = evento && elemento(evento);
  const enlace = evento && enlaceRecurso(evento);
  const persona = evento && enlacePersona(evento);
  const pares = evento ? detalles(evento) : [];
  const operacion = datos?.operacion;

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Detalle del evento"
        contexto={evento ? resumen(evento, usuarios) : "Qué ocurrió, quién lo hizo y sobre qué"}
        volver={{ href: volver, texto: "Auditoría" }}
        acciones={
          operacion && (
            <ButtonLink href={enlaceOperacion(operacion.id)}>
              Ver operación completa
            </ButtonLink>
          )
        }
      />

      <Section titulo="Datos del evento">
        <div ref={caja}>
          {consulta.estado === "error" ? (
            <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
          ) : !evento ? (
            <SkeletonRows filas={3} />
          ) : (
            <KeyFacts
              items={[
                {
                  termino: "Fecha y hora",
                  valor: (
                    <time dateTime={evento.createdAt}>
                      {fechaHora(evento.createdAt)}
                    </time>
                  ),
                },
                { termino: "Actor", valor: nombreActor(evento, usuarios) },
                {
                  termino: "Rol",
                  valor: rolActor(evento, usuarios) ?? "No registrado",
                },
                { termino: "Origen", valor: etiquetaOrigen(evento.origen) },
                {
                  termino: "Resultado",
                  valor: <EtiquetaResultado resultado={evento.resultado} />,
                },
                {
                  termino: "Motivo",
                  valor: etiquetaMotivo(evento.motivo) ?? "No aplica",
                },
                {
                  termino: "Solicitud",
                  valor: evento.solicitudId ? (
                    <span className="num">{evento.solicitudId}</span>
                  ) : (
                    "No registrada"
                  ),
                },
              ]}
            />
          )}
        </div>
      </Section>

      {evento && recurso && (
        <Columns division="8-4">
          <Stack>
            <Section titulo="Cambios">
              {cambios.length > 0 ? (
                <>
                  <DataTable etiqueta="Cambios del evento">
                    <thead>
                      <tr>
                        <th scope="col">Campo</th>
                        <th scope="col">Antes</th>
                        <th scope="col">Después</th>
                      </tr>
                    </thead>
                    <tbody ref={filasRef}>
                      {cambios.map((cambio) => (
                        <tr key={cambio.campo}>
                          <th scope="row">{cambio.campo}</th>
                          <td className={s.antes}>{cambio.antes}</td>
                          <td className={s.despues}>{cambio.despues}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                  {datos?.cambiosCalculados && (
                    <p className={s.nota}>
                      Los cambios se calcularon al consultar el evento,
                      comparando con la versión anterior.
                    </p>
                  )}
                </>
              ) : (
                <Empty titulo="Sin cambios registrados">
                  Este evento no modificó datos.
                </Empty>
              )}
            </Section>

            {evento.justificacion && (
              <Section titulo="Justificación">
                <p className={s.texto}>{evento.justificacion}</p>
              </Section>
            )}
          </Stack>

          <Stack>
            <Section titulo="Sobre qué">
              <KeyFacts
                items={[
                  { termino: "Tipo", valor: recurso.tipo },
                  {
                    termino: "Recurso",
                    valor: enlace ? (
                      <Link className={tabla.rowLink} href={enlace}>
                        {recurso.nombre ?? "Abrir recurso"}
                      </Link>
                    ) : (
                      (recurso.nombre ?? (
                        <span className="num">{recurso.codigo}</span>
                      ))
                    ),
                  },
                  {
                    termino: "Persona",
                    valor: persona ? (
                      <Link className={tabla.rowLink} href={persona}>
                        {nombrePersona(evento)}
                      </Link>
                    ) : (
                      "Ninguna"
                    ),
                  },
                ]}
              />
            </Section>

            {pares.length > 0 && (
              <Section titulo="Datos adicionales">
                <dl className={s.pares}>
                  {pares.map((par) => (
                    <div key={par.clave}>
                      <dt>{par.clave}</dt>
                      <dd className="num">{par.valor}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            )}

            <Section titulo="Datos técnicos">
              <KeyFacts
                items={[
                  {
                    termino: "Instante (UTC)",
                    valor: <span className="num">{evento.createdAt}</span>,
                  },
                  {
                    termino: "Evento",
                    valor: <span className="num">{evento.eventoId}</span>,
                  },
                  ...(operacion
                    ? [
                        {
                          termino: "Operación",
                          valor: (
                            <Link
                              className={tabla.rowLink}
                              href={enlaceOperacion(operacion.id)}
                            >
                              {operacion.eventos} eventos
                            </Link>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </Section>
          </Stack>
        </Columns>
      )}
    </div>
  );
}
