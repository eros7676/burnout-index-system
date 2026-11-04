"use client";
// The forms that write on a person: hire, edit data, change team or position, deactivate.
// Field errors come from the server (the rules live there) and show under each control.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  FichaPersonaDTO,
  MotivoCambio,
  OpcionesPersonaDTO,
  TipoPuesto,
} from "@/shared/contratos/organizacion";
import {
  Button,
  ButtonLink,
  CheckboxField,
  Form,
  FormActions,
  FormGroup,
  Notice,
  SelectFormField,
  TextAreaField,
  TextField,
} from "@/shared/ui";
import { organizacionApi } from "./api";
import { movimientoBloqueado } from "./bloqueos";
import s from "./organizacion.module.css";
import { hoyLocal } from "./piezas";
import { ResumenErrores } from "./resumen-errores";
import { MOTIVO, PUESTO, fechaCorta, responsableSegun } from "./textos";
import { useEnvio } from "./use-envio";

const PUESTOS = Object.keys(PUESTO) as TipoPuesto[];
const enLaPersona = (id: string) => `/employees/${encodeURIComponent(id)}`;

/** Position, team and coverage with the manager that follows from them. */
function CamposPuesto({
  opciones,
  valor,
  onCambio,
  errorDe,
}: {
  opciones: OpcionesPersonaDTO;
  valor: { tipo: TipoPuesto; teamId: string; enCobertura: boolean };
  onCambio: (parcial: Partial<{ tipo: TipoPuesto; teamId: string; enCobertura: boolean }>) => void;
  errorDe: (campo: string) => string | undefined;
}) {
  const gerencia = valor.tipo === "GERENCIA";
  return (
    <>
      <SelectFormField
        etiqueta="Puesto"
        name="tipo"
        value={valor.tipo}
        error={errorDe("tipo")}
        onChange={(e) => {
          const tipo = e.target.value as TipoPuesto;
          onCambio(
            tipo === "GERENCIA"
              ? { tipo, teamId: "", enCobertura: false }
              : { tipo, enCobertura: valor.tipo === "GERENCIA" ? true : valor.enCobertura },
          );
        }}
      >
        {PUESTOS.map((t) => (
          <option key={t} value={t}>
            {PUESTO[t]}
          </option>
        ))}
      </SelectFormField>
      <SelectFormField
        etiqueta="Equipo"
        name="teamId"
        value={valor.teamId}
        disabled={gerencia}
        error={errorDe("teamId")}
        ayuda={gerencia ? "Gerencia no pertenece a un equipo." : undefined}
        onChange={(e) => onCambio({ teamId: e.target.value })}
      >
        <option value="">Seleccione un equipo</option>
        {opciones.equipos.map((e) => (
          <option key={e.teamId} value={e.teamId}>
            {e.nombre}
          </option>
        ))}
      </SelectFormField>
      <TextField
        etiqueta="Responsable"
        readOnly
        value={responsableSegun(opciones.equipos, valor.tipo, valor.teamId)}
        ayuda="Se determina por el equipo y el puesto; no se edita."
      />
      <CheckboxField
        etiqueta="Incluir en la cobertura de la evaluación"
        name="enCobertura"
        checked={valor.enCobertura}
        disabled={gerencia}
        onChange={(e) => onCambio({ enCobertura: e.target.checked })}
        ayuda={
          errorDe("enCobertura") ??
          (gerencia
            ? "Gerencia no se incluye en la evaluación."
            : "Las personas en cobertura se evalúan en el índice.")
        }
      />
    </>
  );
}

export function FormularioNuevaPersona({ opciones }: { opciones: OpcionesPersonaDTO }) {
  const router = useRouter();
  const { enviando, error, enviar, errorDe } = useEnvio();
  const [v, setV] = useState({
    employeeId: opciones.legajoSugerido,
    nombre: "",
    tipo: "TECNICO" as TipoPuesto,
    teamId: "",
    desde: opciones.lunesActual,
    enCobertura: true,
  });
  const gerencia = v.tipo === "GERENCIA";
  const homonimo = error?.codigo === "NOMBRE_REPETIDO";

  const crear = (confirmarNombreRepetido: boolean) =>
    enviar(
      async () => {
        const { employeeId } = await organizacionApi.crearPersona({
          ...v,
          teamId: gerencia ? null : v.teamId || null,
          ...(confirmarNombreRepetido ? { confirmarNombreRepetido: true } : {}),
        });
        router.push(enLaPersona(employeeId));
      },
      { navega: true },
    );
  const guardar = (e: FormEvent) => {
    e.preventDefault();
    void crear(false);
  };

  return (
    <Form onSubmit={guardar} aria-label="Nueva persona">
      <ResumenErrores error={homonimo ? null : error} />
      {homonimo && (
        <div className={s.confirmacion} role="alert">
          <p>
            Ya hay una persona con este nombre. Verifique que no sea un duplicado
            antes de continuar.
          </p>
          <FormActions>
            <Button variante="primary" disabled={enviando} onClick={() => void crear(true)}>
              Crear de todos modos
            </Button>
            <Button
              variante="quiet"
              onClick={() => document.querySelector<HTMLElement>('[name="nombre"]')?.focus()}
            >
              Revisar el nombre
            </Button>
          </FormActions>
        </div>
      )}
      <FormGroup titulo="Identificación">
        <TextField
          etiqueta="Legajo"
          name="employeeId"
          ancho="corto"
          maxLength={64}
          value={v.employeeId}
          error={errorDe("employeeId")}
          ayuda="Se sugiere el siguiente de la serie; puede modificarlo."
          onChange={(e) => setV({ ...v, employeeId: e.target.value })}
        />
        <TextField
          etiqueta="Nombre y apellido"
          name="nombre"
          maxLength={160}
          autoComplete="off"
          value={v.nombre}
          error={homonimo ? undefined : errorDe("nombre")}
          onChange={(e) => setV({ ...v, nombre: e.target.value })}
        />
      </FormGroup>
      <FormGroup titulo="Puesto y equipo">
        <CamposPuesto
          opciones={opciones}
          valor={v}
          onCambio={(parcial) => setV({ ...v, ...parcial })}
          errorDe={errorDe}
        />
        <TextField
          etiqueta="Vigente desde"
          name="desde"
          type="date"
          ancho="corto"
          max={opciones.lunesActual}
          value={v.desde}
          error={errorDe("desde")}
          ayuda={`Lunes en que comienza; hasta el lunes de la semana actual (${fechaCorta(opciones.lunesActual)}).`}
          onChange={(e) => setV({ ...v, desde: e.target.value })}
        />
      </FormGroup>
      <FormActions>
        <Button variante="primary" type="submit" disabled={enviando}>
          Crear persona
        </Button>
        <ButtonLink variante="quiet" href="/employees">
          Cancelar
        </ButtonLink>
      </FormActions>
    </Form>
  );
}

export function FormularioEdicionPersona({ ficha }: { ficha: FichaPersonaDTO }) {
  const router = useRouter();
  const { persona } = ficha;
  const { enviando, error, enviar, errorDe } = useEnvio();
  const [nombre, setNombre] = useState(persona.nombre);
  const [ingreso, setIngreso] = useState(persona.fechaIngreso ?? "");

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(
      async () => {
        await organizacionApi.editarPersona(persona.employeeId, {
          ...(nombre !== persona.nombre ? { nombre } : {}),
          ...(ingreso !== (persona.fechaIngreso ?? "") ? { fechaIngreso: ingreso || null } : {}),
        });
        router.push(enLaPersona(persona.employeeId));
      },
      { navega: true },
    );
  };
  return (
    <Form onSubmit={guardar} aria-label="Datos de la persona">
      <ResumenErrores error={error} />
      <FormGroup titulo="Datos de la persona">
        <TextField
          etiqueta="Nombre y apellido"
          name="nombre"
          maxLength={160}
          value={nombre}
          error={errorDe("nombre")}
          onChange={(e) => setNombre(e.target.value)}
        />
        <TextField
          etiqueta="Fecha de ingreso"
          name="fechaIngreso"
          type="date"
          ancho="corto"
          opcional
          value={ingreso}
          error={errorDe("fechaIngreso")}
          ayuda="No puede ser posterior al inicio de la primera asignación."
          onChange={(e) => setIngreso(e.target.value)}
        />
      </FormGroup>
      <FormActions>
        <Button variante="primary" type="submit" disabled={enviando}>
          Guardar cambios
        </Button>
        <ButtonLink variante="quiet" href={enLaPersona(persona.employeeId)}>
          Cancelar
        </ButtonLink>
      </FormActions>
    </Form>
  );
}

const MOTIVOS: MotivoCambio[] = ["CAMBIO_EQUIPO", "CAMBIO_PUESTO", "CORRECCION"];

export function FormularioMovimiento({
  ficha,
  opciones,
}: {
  ficha: FichaPersonaDTO;
  opciones: OpcionesPersonaDTO;
}) {
  const router = useRouter();
  const { persona } = ficha;
  const { enviando, error, enviar, errorDe } = useEnvio();
  const [motivo, setMotivo] = useState<MotivoCambio>("CAMBIO_EQUIPO");
  const [v, setV] = useState({
    tipo: persona.tipo,
    teamId: persona.teamId ?? "",
    enCobertura: persona.enCobertura,
  });
  const [desde, setDesde] = useState(opciones.lunesActual);
  const [comentario, setComentario] = useState("");
  const correccion = motivo === "CORRECCION";
  const bloqueado = movimientoBloqueado(persona, v);

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(
      async () => {
        await organizacionApi.cambiarAsignacion(persona.employeeId, {
          motivo,
          ...(correccion ? {} : { desde }),
          tipo: v.tipo,
          teamId: v.tipo === "GERENCIA" ? null : v.teamId || null,
          enCobertura: v.enCobertura,
          ...(comentario.trim() ? { comentario } : {}),
        });
        router.push(enLaPersona(persona.employeeId));
      },
      { navega: true },
    );
  };
  return (
    <Form onSubmit={guardar} aria-label="Cambio de equipo o puesto">
      <ResumenErrores error={error} />
      {persona.lidera && (
        <Notice tono="aviso">
          Esta persona lidera {persona.lidera.nombre}. Para cambiar su equipo o puesto,
          asigne primero otro líder al equipo.
        </Notice>
      )}
      <FormGroup titulo="Motivo">
        <SelectFormField
          etiqueta="Motivo del cambio"
          name="motivo"
          value={motivo}
          error={errorDe("motivo")}
          ayuda={
            correccion
              ? "Corrige la asignación vigente sin abrir una nueva; queda registrada en la auditoría."
              : "Abre una nueva asignación desde la fecha indicada y conserva la anterior en el historial."
          }
          onChange={(e) => setMotivo(e.target.value as MotivoCambio)}
        >
          {MOTIVOS.map((m) => (
            <option key={m} value={m}>
              {MOTIVO[m]}
            </option>
          ))}
        </SelectFormField>
        {!correccion && (
          <TextField
            etiqueta="Vigente desde"
            name="desde"
            type="date"
            ancho="corto"
            min={persona.vigenteDesde ?? undefined}
            max={opciones.lunesActual}
            value={desde}
            error={errorDe("desde")}
            ayuda="Lunes en que rige el cambio, posterior al inicio de la asignación actual."
            onChange={(e) => setDesde(e.target.value)}
          />
        )}
      </FormGroup>
      <FormGroup titulo="Nueva asignación">
        <CamposPuesto
          opciones={opciones}
          valor={v}
          onCambio={(parcial) => setV({ ...v, ...parcial })}
          errorDe={errorDe}
        />
        <TextAreaField
          etiqueta={correccion ? "Motivo de la corrección" : "Comentario"}
          name="comentario"
          opcional={!correccion}
          maxLength={280}
          value={comentario}
          error={errorDe("comentario")}
          ayuda="Hasta 280 caracteres."
          onChange={(e) => setComentario(e.target.value)}
        />
      </FormGroup>
      <FormActions>
        <Button variante="primary" type="submit" disabled={enviando || bloqueado}>
          Guardar cambios
        </Button>
        <ButtonLink variante="quiet" href={enLaPersona(persona.employeeId)}>
          Cancelar
        </ButtonLink>
      </FormActions>
    </Form>
  );
}

export function FormularioBaja({ ficha }: { ficha: FichaPersonaDTO }) {
  const router = useRouter();
  const { persona } = ficha;
  const { enviando, error, enviar, errorDe } = useEnvio();
  const [fechaBaja, setFechaBaja] = useState(hoyLocal());
  const [justificacion, setJustificacion] = useState("");

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(
      async () => {
        await organizacionApi.darDeBaja(persona.employeeId, { fechaBaja, justificacion });
        router.push(enLaPersona(persona.employeeId));
      },
      { navega: true },
    );
  };
  return (
    <Form onSubmit={guardar} aria-label="Baja de la persona">
      <ResumenErrores error={error} />
      {persona.lidera && (
        <Notice tono="aviso">
          Esta persona lidera {persona.lidera.nombre}. Para darla de baja, asigne primero
          otro líder al equipo.
        </Notice>
      )}
      <Notice>
        La persona deja de figurar como activa, pero su historial, sus semanas y su
        trazabilidad se conservan. No se elimina ningún dato.
      </Notice>
      <FormGroup titulo="Baja">
        <TextField
          etiqueta="Fecha de baja"
          name="fechaBaja"
          type="date"
          ancho="corto"
          max={hoyLocal()}
          min={persona.vigenteDesde ?? undefined}
          value={fechaBaja}
          error={errorDe("fechaBaja")}
          ayuda="Último día trabajado. No puede ser posterior a hoy."
          onChange={(e) => setFechaBaja(e.target.value)}
        />
        <TextAreaField
          etiqueta="Justificación"
          name="justificacion"
          maxLength={280}
          value={justificacion}
          error={errorDe("justificacion")}
          ayuda="Queda registrada en la auditoría. Hasta 280 caracteres."
          onChange={(e) => setJustificacion(e.target.value)}
        />
      </FormGroup>
      <FormActions>
        <Button
          variante="danger"
          type="submit"
          disabled={enviando || !!persona.lidera}
        >
          Dar de baja a la persona
        </Button>
        <ButtonLink variante="quiet" href={enLaPersona(persona.employeeId)}>
          Cancelar
        </ButtonLink>
      </FormActions>
    </Form>
  );
}
