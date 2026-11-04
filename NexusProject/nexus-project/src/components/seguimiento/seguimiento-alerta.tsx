"use client";
import Link from "next/link";
import { useState } from "react";
import { seguimientoApi } from "@/client/seguimiento-api";
import { useConsulta } from "@/client/use-consulta";
import {
  MOTIVO_CIERRE,
  type CasoSeguimientoDTO,
  type SeguimientoAlertaDTO,
  type UsuarioReferencia,
} from "@/shared/contratos/seguimiento";
import { momentoConAnio } from "@/shared/formato";
import {
  ErrorBox,
  KeyFacts,
  Notice,
  Section,
  SkeletonRows,
} from "@/shared/ui";
import { useSesion } from "../shell/sesion";
import { AbrirSeguimiento } from "./abrir-seguimiento";
import { ActualizarSeguimiento } from "./actualizar-seguimiento";
import { CerrarSeguimiento } from "./cerrar-seguimiento";
import { EstadoSeguimientoTag } from "./estado-seguimiento";
import { Medidas } from "./medidas";
import { Notas } from "./notas";
import { fecha } from "./textos";
import s from "./seguimiento.module.css";

const nombreDe = (u: UsuarioReferencia, usuarioId: string | undefined) =>
  u.userId === usuarioId ? `${u.nombre} (usted)` : u.nombre;

function datosDelCaso(caso: CasoSeguimientoDTO, usuarioId: string | undefined) {
  const hechos = [
    { termino: "Responsable", valor: nombreDe(caso.asignadoA, usuarioId) },
    {
      termino: "Vencimiento",
      valor: caso.vence ? fecha(caso.vence) : "Sin fecha",
    },
    {
      termino: "Abierto",
      valor: `${nombreDe(caso.abiertoPor, usuarioId)}, ${momentoConAnio(caso.createdAt)}`,
    },
  ];
  if (caso.estado === "CERRADO" && caso.motivoCierre && caso.cerradoPor)
    hechos.push(
      { termino: "Motivo de cierre", valor: MOTIVO_CIERRE[caso.motivoCierre] },
      {
        termino: "Cerrado",
        valor: `${nombreDe(caso.cerradoPor, usuarioId)}, ${momentoConAnio(caso.cerradoAt ?? caso.createdAt)}`,
      },
    );
  return hechos;
}

/**
 * The follow-up of one alert: a single open case per person, with its state, owner, due date, measures,
 * internal notes and closure. What each person may do comes from the server, not from the role here.
 */
export function SeguimientoAlerta({
  alertId,
  superada,
  className,
}: {
  alertId: string;
  /** The alert was superseded by a later calculation: it no longer opens a case. */
  superada: boolean;
  /** Where the page places the Section in its grid. */
  className?: string;
}) {
  const { usuario } = useSesion();
  const usuarioId = usuario?.userId;
  const consulta = useConsulta(
    (signal) => seguimientoApi.obtener(alertId, signal),
    usuario ? alertId : null,
  );
  // Every write answers with the alert's whole follow-up, which replaces what was read.
  const [escrito, setEscrito] = useState<SeguimientoAlertaDTO | null>(null);
  const datos = escrito ?? (consulta.estado === "listo" ? consulta.datos : null);
  const caso = datos?.caso ?? null;
  const abierto = !!caso && caso.estado !== "CERRADO";

  return (
    <Section
      titulo="Seguimiento"
      className={className}
      aside={
        caso && (
          <EstadoSeguimientoTag estado={caso.estado} vencido={caso.vencido} />
        )
      }
    >
      {!datos ? (
        consulta.estado === "error" ? (
          <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
        ) : (
          <SkeletonRows filas={4} />
        )
      ) : !caso ? (
        <AbrirSeguimiento
          alertId={alertId}
          datos={datos}
          superada={superada}
          alCambiar={setEscrito}
        />
      ) : (
        <div className={s.contenido}>
          {datos.relacion === "ADJUNTA" && (
            <Notice>
              Esta alerta forma parte del seguimiento abierto de la persona.{" "}
              <Link href={`/alerts/${caso.alertaOrigenId}`}>
                Ver la alerta de origen
              </Link>
            </Notice>
          )}
          <KeyFacts items={datosDelCaso(caso, usuarioId)} />
          {abierto && datos.permisos.gestionar && (
            <div className={s.bloque}>
              <h3 className={s.titulo}>Actualizar seguimiento</h3>
              <ActualizarSeguimiento
                alertId={alertId}
                caso={caso}
                datos={datos}
                usuarioId={usuarioId}
                alCambiar={setEscrito}
              />
            </div>
          )}
          <Medidas
            alertId={alertId}
            caso={caso}
            datos={datos}
            alCambiar={setEscrito}
          />
          <Notas
            alertId={alertId}
            caso={caso}
            datos={datos}
            usuarioId={usuarioId}
            alCambiar={setEscrito}
          />
          {abierto && datos.permisos.gestionar && (
            <CerrarSeguimiento alertId={alertId} alCambiar={setEscrito} />
          )}
        </div>
      )}
    </Section>
  );
}
