"use client";
// The dedicated pages that write on a person (D3: create and edit are pages, not dialogs).
import type { ReactNode } from "react";
import { useConsulta } from "@/client/use-consulta";
import { KeyFacts, PageHeader, Section, SkeletonRows, ErrorBox } from "@/shared/ui";
import { useSesion } from "../shell/sesion";
import { organizacionApi } from "./api";
import {
  FormularioBaja,
  FormularioEdicionPersona,
  FormularioMovimiento,
  FormularioNuevaPersona,
} from "./formularios-persona";
import { PaginaOrg } from "./piezas";
import { PUESTO, fechaCorta } from "./textos";
import s from "./organizacion.module.css";

const VOLVER_PERSONAS = { href: "/employees", texto: "Personas" };

function Cargando<T>({
  consulta,
  children,
}: {
  consulta:
    | { estado: "cargando" }
    | { estado: "error"; mensaje: string; reintentar: () => void }
    | { estado: "listo"; datos: T };
  children: (datos: T) => ReactNode;
}) {
  if (consulta.estado === "error")
    return <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />;
  if (consulta.estado !== "listo") return <SkeletonRows filas={6} />;
  return <>{children(consulta.datos)}</>;
}

export function NuevaPersona() {
  const { usuario } = useSesion();
  const opciones = useConsulta(organizacionApi.opcionesPersona, usuario ? "opciones-persona" : null);
  return (
    <PaginaOrg>
      <PageHeader
        titulo="Nueva persona"
        contexto="Alta de una persona con su equipo y puesto"
        volver={VOLVER_PERSONAS}
      />
      <Section>
        <div className={s.formulario}>
          <Cargando consulta={opciones}>
            {(datos) => <FormularioNuevaPersona opciones={datos} />}
          </Cargando>
        </div>
      </Section>
    </PaginaOrg>
  );
}

/** A person's page for editing: the record loaded first, so the form starts from its values. */
function PantallaDePersona({
  employeeId,
  titulo,
  contexto,
  conOpciones,
  children,
}: {
  employeeId: string;
  titulo: string;
  contexto: string;
  conOpciones?: boolean;
  children: (
    ficha: Awaited<ReturnType<typeof organizacionApi.ficha>>,
    opciones: Awaited<ReturnType<typeof organizacionApi.opcionesPersona>> | null,
  ) => ReactNode;
}) {
  const { usuario } = useSesion();
  const ficha = useConsulta(
    (signal) => organizacionApi.ficha(employeeId, signal, 1),
    usuario ? `ficha:${employeeId}:1` : null,
  );
  const opciones = useConsulta(
    organizacionApi.opcionesPersona,
    usuario && conOpciones ? "opciones-persona" : null,
  );
  const datos = ficha.estado === "listo" ? ficha.datos : null;
  return (
    <PaginaOrg>
      <PageHeader
        titulo={titulo}
        contexto={datos ? `${datos.persona.nombre}, ${contexto}` : contexto}
        volver={{
          href: `/employees/${encodeURIComponent(employeeId)}`,
          texto: datos?.persona.nombre ?? "Persona",
        }}
      />
      <Section>
        <div className={s.formulario}>
          <Cargando consulta={ficha}>
            {(f) =>
              conOpciones ? (
                <Cargando consulta={opciones}>{(o) => children(f, o)}</Cargando>
              ) : (
                children(f, null)
              )
            }
          </Cargando>
        </div>
      </Section>
    </PaginaOrg>
  );
}

export function EditarPersona({ employeeId }: { employeeId: string }) {
  return (
    <PantallaDePersona
      employeeId={employeeId}
      titulo="Editar datos"
      contexto="nombre y fecha de ingreso"
    >
      {(ficha) => <FormularioEdicionPersona ficha={ficha} />}
    </PantallaDePersona>
  );
}

export function MoverPersona({ employeeId }: { employeeId: string }) {
  return (
    <PantallaDePersona
      employeeId={employeeId}
      titulo="Cambiar equipo o puesto"
      contexto="nueva asignación"
      conOpciones
    >
      {(ficha, opciones) =>
        ficha.persona.activo ? (
          <>
            <KeyFacts
              items={[
                { termino: "Equipo actual", valor: ficha.persona.equipo ?? "Sin equipo" },
                { termino: "Puesto actual", valor: PUESTO[ficha.persona.tipo] },
                {
                  termino: "Vigente desde",
                  valor: ficha.persona.vigenteDesde
                    ? fechaCorta(ficha.persona.vigenteDesde)
                    : "—",
                },
              ]}
            />
            <FormularioMovimiento ficha={ficha} opciones={opciones!} />
          </>
        ) : (
          <p>La persona está dada de baja: no se puede modificar su asignación.</p>
        )
      }
    </PantallaDePersona>
  );
}

export function BajaPersona({ employeeId }: { employeeId: string }) {
  return (
    <PantallaDePersona
      employeeId={employeeId}
      titulo="Dar de baja"
      contexto="baja con justificación"
    >
      {(ficha) =>
        ficha.persona.activo ? (
          <FormularioBaja ficha={ficha} />
        ) : (
          <p>La persona ya está dada de baja.</p>
        )
      }
    </PantallaDePersona>
  );
}
