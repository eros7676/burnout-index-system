"use client";
import { useEffect, useRef } from "react";
import { momentoConAnio } from "@/shared/formato";
import { usePageEnter } from "@/shared/motion";
import { tienePermiso } from "@/shared/permisos";
import {
  Button,
  ButtonLink,
  Empty,
  ErrorBox,
  KeyFacts,
  Notice,
  PageHeader,
  Section,
  SkeletonRows,
} from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import type { UsuarioDemoDTO } from "@/shared/contracts";
import { useSesion } from "../shell/sesion";
import { RAZON, accionesDe, razonesBloqueo, type Accion } from "./acciones";
import { Dialogos } from "./dialogos";
import { Historial, TablaCambios } from "./historial";
import { ESTADO_BORRADOR, TONO_BORRADOR, fecha } from "./parametros";
import { ParametrosEditables, ParametrosSoloLectura } from "./parametros-reglas";
import { Recalculo } from "./recalculo";
import { Simulacion } from "./simulacion";
import { DESACTUALIZADO, useBorrador, type EstadoBorrador } from "./usar-borrador";
import s from "./borrador.module.css";

/** Reads the draft for whoever is signed in and hands it to the screen. */
export function BorradorReglas({ borradorId }: { borradorId: string }) {
  const { usuario } = useSesion();
  const gestiona = !!usuario && puedeGestionar(usuario.rol);
  const b = useBorrador(borradorId, gestiona);
  return <VistaBorrador usuario={usuario} b={b} />;
}

const puedeGestionar = (rol: UsuarioDemoDTO["rol"]) =>
  tienePermiso(rol, "EDITAR_REGLAS") || tienePermiso(rol, "APROBAR_REGLAS");

/**
 * One draft of the rules: edit, simulate, submit, approve, publish or discard.
 * Each role sees only the steps it may take (`accionesDe`); the server decides again.
 */
export function VistaBorrador({
  usuario,
  b,
}: {
  usuario: UsuarioDemoDTO | null;
  b: EstadoBorrador;
}) {
  const rol = usuario?.rol;
  const gestiona = !!rol && puedeGestionar(rol);
  const pagina = useRef<HTMLDivElement>(null);
  const formulario = useRef<HTMLDivElement>(null);
  usePageEnter(pagina);
  const { datos, valores, intentos } = b;
  // After a refused save, focus goes to the first field to fix.
  useEffect(() => {
    if (intentos > 0)
      formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [intentos]);

  const acciones =
    datos && usuario
      ? accionesDe({
          rol: usuario.rol,
          usuarioId: usuario.userId,
          sinGuardar: b.pendiente,
          borrador: datos,
        })
      : null;
  const modificable = !!acciones?.guardar.visible;
  const cerrado = datos?.estado === "PUBLICADO" || datos?.estado === "DESCARTADO";
  // What keeps the next step from running: the reasons, and the stored content's own problems.
  const pendientes =
    acciones && !cerrado
      ? [
          ...razonesBloqueo(acciones).filter((r) => r !== RAZON.corregir),
          ...(modificable && datos ? datos.problemas.map((p) => p.detalle) : []),
        ]
      : [];
  const primaria = acciones
    ? (["aprobar", "publicar", "enviar", "simular"] as const).find((a) => {
        const d = acciones[a];
        return d.visible && d.habilitada;
      })
    : undefined;

  const boton = (
    accion: Accion,
    texto: string,
    enCurso: string,
    alPulsar: () => void,
    variante: "secondary" | "dangerSecondary" = "secondary",
  ) => {
    const d = acciones?.[accion];
    if (!d?.visible) return null;
    return (
      <Button
        key={accion}
        variante={primaria === accion ? "primary" : variante}
        disabled={!d.habilitada || b.ocupado !== null}
        onClick={alPulsar}
        aria-describedby={d.habilitada ? undefined : "pendientes"}
      >
        {b.ocupado === accion ? enCurso : texto}
      </Button>
    );
  };

  if (usuario && !gestiona)
    return (
      <div ref={pagina} className={s.page}>
        <PageHeader
          titulo="Borrador de reglas"
          volver={{ href: "/rules-config", texto: "Reglas del índice" }}
        />
        <Section>
          <Empty
            titulo="No tiene permiso para ver borradores de reglas."
            accion={<ButtonLink href="/rules-config">Ver las reglas vigentes</ButtonLink>}
          >
            Los borradores están disponibles para RR. HH. y Gerencia.
          </Empty>
        </Section>
      </div>
    );

  const contexto = !datos
    ? "Cambio propuesto a las reglas del índice."
    : datos.estado === "PUBLICADO"
      ? `Publicado como la versión ${datos.versionPublicada}.`
      : datos.estado === "DESCARTADO"
        ? "Descartado: ya no puede modificarse ni publicarse."
        : `Basado en la versión ${datos.baseVersion}, con inicio el ${fecha(datos.propuesta.effectiveFrom)}.`;

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Borrador de reglas"
        contexto={contexto}
        volver={{ href: "/rules-config", texto: "Reglas del índice" }}
        acciones={
          acciones && !cerrado ? (
            <>
              {boton("simular", "Simular impacto", "Simulando…", b.simular)}
              {boton("enviar", "Enviar a revisión", "Enviando…", b.enviar)}
              {boton("publicar", "Publicar versión", "Publicando…", () => b.setDialogo("publicar"))}
              {boton("aprobar", "Aprobar borrador", "Aprobando…", () => b.setDialogo("aprobar"))}
              {boton("rechazar", "Rechazar borrador", "Rechazando…", () => b.setDialogo("rechazar"))}
              {boton(
                "descartar",
                "Descartar borrador",
                "Descartando…",
                () => b.setDialogo("descartar"),
                "dangerSecondary",
              )}
            </>
          ) : undefined
        }
      />

      {b.exito && <Notice tono="exito">{b.exito}</Notice>}
      {b.fallo && (
        <ErrorBox
          mensaje={
            b.fallo.codigo === "CONFIGURACION_INVALIDA"
              ? "Hay datos para corregir. Revise los campos señalados."
              : b.fallo.message
          }
          onRetry={DESACTUALIZADO.has(b.fallo.codigo) ? b.recargar : undefined}
        />
      )}
      {b.generales.length > 0 && <Notice tono="aviso">{b.generales.join(" ")}</Notice>}
      {b.consulta.estado === "error" && !datos && (
        <ErrorBox mensaje={b.consulta.mensaje} onRetry={b.consulta.reintentar} />
      )}
      {pendientes.length > 0 && (
        <div id="pendientes" className={s.pendientes} role="status">
          <p>Para continuar:</p>
          <ul>
            {pendientes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <Section>
        {!datos ? (
          b.consulta.estado !== "error" && <SkeletonRows filas={2} />
        ) : (
          <KeyFacts
            items={[
              {
                termino: "Estado",
                valor: (
                  <StatusTag tono={TONO_BORRADOR[datos.estado]}>
                    {ESTADO_BORRADOR[datos.estado]}
                  </StatusTag>
                ),
              },
              { termino: "Versión base", valor: datos.baseVersion },
              { termino: "Inicio de vigencia", valor: fecha(datos.propuesta.effectiveFrom) },
              {
                termino: "Alcance",
                valor: datos.requiereAprobacion
                  ? "Modifica semanas ya evaluadas"
                  : "Solo semanas futuras",
              },
              {
                termino: "Aprobación",
                valor: datos.aprobadoPor
                  ? `${datos.aprobadoPor.nombre}, ${momentoConAnio(datos.aprobadoAt ?? datos.updatedAt)}`
                  : datos.requiereAprobacion
                    ? "Requerida de Gerencia"
                    : "No requerida",
              },
              {
                termino: "Creado por",
                valor: `${datos.creadoPor.nombre}, ${momentoConAnio(datos.createdAt)}`,
              },
            ]}
          />
        )}
      </Section>

      {datos?.estado === "PUBLICADO" && (
        <Section titulo={`Versión ${datos.versionPublicada}`}>
          <div className={s.publicada}>
            <p>La versión rige desde el {fecha(datos.propuesta.effectiveFrom)}.</p>
            {rol && tienePermiso(rol, "EDITAR_REGLAS") && datos.publicacion && (
              <Recalculo jobId={datos.publicacion.jobId} />
            )}
            <ButtonLink href="/rules-config">Ver reglas del índice</ButtonLink>
          </div>
        </Section>
      )}

      <Section titulo="Parámetros">
        <div ref={formulario}>
          {!datos || !valores ? (
            <SkeletonRows filas={6} />
          ) : modificable ? (
            <ParametrosEditables
              valores={valores}
              errores={b.errores}
              sinGuardar={b.pendiente}
              guardando={b.ocupado === "guardar"}
              onCambio={b.cambiar}
              onGuardar={b.guardar}
            />
          ) : (
            <ParametrosSoloLectura propuesta={datos.propuesta} motivo={datos.motivo} />
          )}
        </div>
      </Section>

      <Section titulo={`Cambios respecto de ${datos?.baseVersion ?? "la versión base"}`}>
        {!datos ? (
          <SkeletonRows filas={2} />
        ) : datos.cambios.length === 0 ? (
          <p className={s.vacio}>
            El borrador todavía no modifica ningún parámetro de {datos.baseVersion}.
          </p>
        ) : (
          <TablaCambios cambios={datos.cambios} versionBase={datos.baseVersion} />
        )}
      </Section>

      <Section
        titulo="Impacto estimado"
        aside={
          datos?.simulacion && <span>Calculado el {momentoConAnio(datos.simulacion.calculadaAt)}</span>
        }
      >
        {!datos ? (
          <SkeletonRows filas={3} />
        ) : datos.simulacion ? (
          <Simulacion simulacion={datos.simulacion} vigente={datos.simulacionVigente} />
        ) : (
          <p className={s.vacio}>
            {acciones?.simular.visible
              ? "Todavía no se simuló el impacto. La simulación recalcula las semanas que el borrador modificaría, sin guardar nada."
              : "Todavía no se simuló el impacto de este borrador. La simulación la realiza RR. HH."}
          </p>
        )}
      </Section>

      <Section titulo="Historial del borrador">
        {!datos ? <SkeletonRows filas={3} /> : <Historial eventos={datos.historial} />}
      </Section>

      {datos && (
        <Dialogos
          abierto={b.dialogo}
          borrador={datos}
          ocupado={b.ocupado !== null}
          error={b.errorDialogo}
          justificacion={b.justificacion}
          onJustificacion={b.setJustificacion}
          onConfirmar={b.confirmar}
          onCancelar={b.cancelarDialogo}
        />
      )}
    </div>
  );
}
