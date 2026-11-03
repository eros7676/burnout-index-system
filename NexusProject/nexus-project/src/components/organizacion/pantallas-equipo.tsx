"use client";
// The dedicated pages that write on a team.
import type { ReactNode } from "react";
import { useConsulta } from "@/client/use-consulta";
import { ErrorBox, PageHeader, Section, SkeletonRows } from "@/shared/ui";
import { useSesion } from "../shell/sesion";
import { organizacionApi } from "./api";
import {
  FormularioDesactivarEquipo,
  FormularioEdicionEquipo,
  FormularioLider,
  FormularioNuevoEquipo,
} from "./formularios-equipo";
import { PaginaOrg } from "./piezas";
import s from "./organizacion.module.css";

type Equipo = Awaited<ReturnType<typeof organizacionApi.equipo>>;
type Opciones = Awaited<ReturnType<typeof organizacionApi.opcionesEquipo>>;

export function NuevoEquipo() {
  const { usuario } = useSesion();
  const opciones = useConsulta(
    organizacionApi.opcionesEquipo,
    usuario ? "opciones-equipo" : null,
  );
  return (
    <PaginaOrg>
      <PageHeader
        titulo="Nuevo equipo"
        contexto="Alta de un equipo con su líder y su gerencia responsable"
        volver={{ href: "/teams", texto: "Equipos" }}
      />
      <Section>
        <div className={s.formulario}>
          {opciones.estado === "error" ? (
            <ErrorBox mensaje={opciones.mensaje} onRetry={opciones.reintentar} />
          ) : opciones.estado !== "listo" ? (
            <SkeletonRows filas={5} />
          ) : (
            <FormularioNuevoEquipo opciones={opciones.datos} />
          )}
        </div>
      </Section>
    </PaginaOrg>
  );
}

/** A team's page for editing: the team loaded first, and the options when the form needs them. */
function PantallaDeEquipo({
  teamId,
  titulo,
  contexto,
  conOpciones,
  children,
}: {
  teamId: string;
  titulo: string;
  contexto: string;
  conOpciones?: boolean;
  children: (equipo: Equipo, opciones: Opciones | null) => ReactNode;
}) {
  const { usuario } = useSesion();
  const equipo = useConsulta(
    (signal) => organizacionApi.equipo(teamId, signal),
    usuario ? `equipo:${teamId}` : null,
  );
  const opciones = useConsulta(
    organizacionApi.opcionesEquipo,
    usuario && conOpciones ? "opciones-equipo" : null,
  );
  const datos = equipo.estado === "listo" ? equipo.datos : null;
  const error = equipo.estado === "error" ? equipo : opciones.estado === "error" ? opciones : null;
  const listo = datos && (!conOpciones || opciones.estado === "listo");
  return (
    <PaginaOrg>
      <PageHeader
        titulo={titulo}
        contexto={datos ? `${datos.nombre}, ${contexto}` : contexto}
        volver={{
          href: `/teams/${encodeURIComponent(teamId)}`,
          texto: datos?.nombre ?? "Equipo",
        }}
      />
      <Section>
        <div className={s.formulario}>
          {error ? (
            <ErrorBox mensaje={error.mensaje} onRetry={error.reintentar} />
          ) : !listo ? (
            <SkeletonRows filas={5} />
          ) : datos.activo ? (
            children(datos, opciones.estado === "listo" ? opciones.datos : null)
          ) : (
            <p>El equipo está desactivado: no se puede modificar.</p>
          )}
        </div>
      </Section>
    </PaginaOrg>
  );
}

export function EditarEquipo({ teamId }: { teamId: string }) {
  return (
    <PantallaDeEquipo
      teamId={teamId}
      titulo="Editar equipo"
      contexto="nombre y gerencia responsable"
      conOpciones
    >
      {(equipo, opciones) => <FormularioEdicionEquipo equipo={equipo} opciones={opciones!} />}
    </PantallaDeEquipo>
  );
}

export function CambiarLiderEquipo({ teamId }: { teamId: string }) {
  return (
    <PantallaDeEquipo
      teamId={teamId}
      titulo="Cambiar líder"
      contexto="nuevo líder del equipo"
      conOpciones
    >
      {(equipo, opciones) => <FormularioLider equipo={equipo} opciones={opciones!} />}
    </PantallaDeEquipo>
  );
}

export function DesactivarEquipoPantalla({ teamId }: { teamId: string }) {
  return (
    <PantallaDeEquipo
      teamId={teamId}
      titulo="Desactivar equipo"
      contexto="desactivación con justificación"
    >
      {(equipo) => <FormularioDesactivarEquipo equipo={equipo} />}
    </PantallaDeEquipo>
  );
}
