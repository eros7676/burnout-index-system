"use client";
import Link from "next/link";
import { useRef } from "react";
import { useConsulta } from "@/client/use-consulta";
import { AUDITORIA_LIMITES } from "@/shared/contratos/auditoria";
import { useArrival, usePageEnter } from "@/shared/motion";
import {
  ErrorBox,
  Notice,
  PageHeader,
  Section,
  SkeletonRows,
  tabla,
} from "@/shared/ui";
import { useSesion } from "../shell/sesion";
import { auditoriaApi } from "./cliente";
import {
  cantidadEventos,
  elemento,
  etiquetaAccion,
  etiquetaMotivo,
  etiquetaOrigen,
  fechaHora,
  nombreActor,
  rolActor,
} from "./eventos";
import { EtiquetaResultado } from "./resultado";
import s from "./operacion.module.css";

/** Answers "¿Qué pasó, paso a paso, en esta operación?": every event that shares it, oldest first. */
export function OperacionCompleta({ correlacionId }: { correlacionId: string }) {
  const { usuario, usuarios } = useSesion();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(
    (signal) => auditoriaApi.operacion(correlacionId, signal),
    usuario ? `operacion:${correlacionId}` : null,
  );
  const datos = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Operación completa"
        contexto="Los eventos de una misma operación, en el orden en que ocurrieron."
        volver={{ href: "/audit", texto: "Auditoría" }}
      />

      <Section
        titulo="Secuencia"
        aside={
          datos ? (
            <span className="num">{cantidadEventos(datos.total, false)}</span>
          ) : undefined
        }
      >
        <div ref={caja}>
          {consulta.estado === "error" ? (
            <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
          ) : !datos ? (
            <SkeletonRows filas={4} />
          ) : (
            <>
              {datos.truncada && (
                <div className={s.aviso}>
                  <Notice tono="aviso">
                    La operación tiene más eventos de los que se muestran: se
                    listan los primeros {AUDITORIA_LIMITES.operacionMaxEventos}.
                  </Notice>
                </div>
              )}
              <ol className={s.linea} aria-label="Eventos de la operación">
                {datos.eventos.map((evento) => {
                  const recurso = elemento(evento);
                  const rol = rolActor(evento, usuarios);
                  return (
                    <li key={evento.eventoId} className={s.paso}>
                      <time className={s.cuando} dateTime={evento.createdAt}>
                        {fechaHora(evento.createdAt)}
                      </time>
                      <span className={s.riel} aria-hidden="true">
                        <span className={s.punto} />
                      </span>
                      <div className={s.contenido}>
                        <Link
                          className={tabla.rowLink}
                          href={`/audit/${encodeURIComponent(evento.eventoId)}`}
                        >
                          {etiquetaAccion(evento)}
                        </Link>
                        <span className={tabla.sub}>
                          {nombreActor(evento, usuarios)},{" "}
                          {rol ?? etiquetaOrigen(evento.origen)}
                        </span>
                        <span className={tabla.sub}>
                          {recurso.tipo}
                          {recurso.nombre ? `: ${recurso.nombre}` : ""}
                        </span>
                        <span className={s.estado}>
                          <EtiquetaResultado resultado={evento.resultado} />
                          {evento.motivo && evento.resultado !== "EXITO" && (
                            <span className={tabla.sub}>
                              {etiquetaMotivo(evento.motivo)}
                            </span>
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
