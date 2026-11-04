"use client";
// The forms that write on a team: create, edit, change the lead, deactivate.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { EquipoDTO, OpcionesEquipoDTO } from "@/shared/contratos/organizacion";
import {
  Button,
  ButtonLink,
  Form,
  FormActions,
  FormGroup,
  Notice,
  SelectFormField,
  TextAreaField,
  TextField,
} from "@/shared/ui";
import { organizacionApi } from "./api";
import { desactivacionEquipoBloqueada } from "./bloqueos";
import { ResumenErrores } from "./resumen-errores";
import { contar } from "./textos";
import { useEnvio } from "./use-envio";

const enElEquipo = (id: string) => `/teams/${encodeURIComponent(id)}`;

/** Team Leads who can take a team: the ones who already lead another team are listed but disabled. */
function OpcionesDeLider({
  opciones,
  excluir,
}: {
  opciones: OpcionesEquipoDTO;
  excluir?: string | null;
}) {
  return (
    <>
      {opciones.lideres
        .filter((l) => l.employeeId !== excluir)
        .map((l) => (
          <option key={l.employeeId} value={l.employeeId} disabled={!!l.lideraTeamId}>
            {l.nombre}
            {l.lideraTeamId ? ` (ya lidera ${l.lideraTeamId})` : l.equipo ? ` (${l.equipo})` : ""}
          </option>
        ))}
    </>
  );
}

const Gerentes = ({ opciones }: { opciones: OpcionesEquipoDTO }) => (
  <>
    {opciones.gerentes.map((g) => (
      <option key={g.employeeId} value={g.employeeId}>
        {g.nombre}
      </option>
    ))}
  </>
);

export function FormularioNuevoEquipo({ opciones }: { opciones: OpcionesEquipoDTO }) {
  const router = useRouter();
  const { enviando, error, enviar, errorDe } = useEnvio();
  const [v, setV] = useState({
    teamId: opciones.codigoSugerido,
    nombre: "",
    liderId: "",
    gerenteId: "",
  });
  const guardar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(
      async () => {
        const { teamId } = await organizacionApi.crearEquipo({
          ...v,
          liderId: v.liderId || null,
          gerenteId: v.gerenteId || null,
        });
        router.push(enElEquipo(teamId));
      },
      { navega: true },
    );
  };
  return (
    <Form onSubmit={guardar} aria-label="Nuevo equipo">
      <ResumenErrores error={error} />
      <FormGroup
        titulo="Equipo"
        descripcion="El código vincula al equipo con los archivos que se importan."
      >
        <TextField
          etiqueta="Código"
          name="teamId"
          ancho="corto"
          maxLength={64}
          value={v.teamId}
          error={errorDe("teamId")}
          ayuda="Comienza con EQ- y sigue con dos o más dígitos. Se sugiere el siguiente disponible."
          onChange={(e) => setV({ ...v, teamId: e.target.value })}
        />
        <TextField
          etiqueta="Nombre del equipo"
          name="nombre"
          maxLength={160}
          value={v.nombre}
          error={errorDe("nombre")}
          onChange={(e) => setV({ ...v, nombre: e.target.value })}
        />
      </FormGroup>
      <FormGroup titulo="Responsables">
        <SelectFormField
          etiqueta="Líder"
          name="liderId"
          opcional
          value={v.liderId}
          error={errorDe("liderId")}
          ayuda="Quien lidera pasa a este equipo y las personas técnicas responden a esa persona."
          onChange={(e) => setV({ ...v, liderId: e.target.value })}
        >
          <option value="">Sin líder por ahora</option>
          <OpcionesDeLider opciones={opciones} />
        </SelectFormField>
        <SelectFormField
          etiqueta="Gerencia responsable"
          name="gerenteId"
          opcional
          value={v.gerenteId}
          error={errorDe("gerenteId")}
          ayuda="El líder del equipo responde a esta persona."
          onChange={(e) => setV({ ...v, gerenteId: e.target.value })}
        >
          <option value="">Sin asignar</option>
          <Gerentes opciones={opciones} />
        </SelectFormField>
      </FormGroup>
      <FormActions>
        <Button variante="primary" type="submit" disabled={enviando}>
          Crear equipo
        </Button>
        <ButtonLink variante="quiet" href="/teams">
          Cancelar
        </ButtonLink>
      </FormActions>
    </Form>
  );
}

export function FormularioEdicionEquipo({
  equipo,
  opciones,
}: {
  equipo: EquipoDTO;
  opciones: OpcionesEquipoDTO;
}) {
  const router = useRouter();
  const { enviando, error, enviar, errorDe } = useEnvio();
  const [nombre, setNombre] = useState(equipo.nombre);
  const [gerenteId, setGerenteId] = useState(equipo.gerente?.employeeId ?? "");
  const guardar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(
      async () => {
        await organizacionApi.editarEquipo(equipo.teamId, {
          ...(nombre !== equipo.nombre ? { nombre } : {}),
          ...(gerenteId !== (equipo.gerente?.employeeId ?? "")
            ? { gerenteId: gerenteId || null }
            : {}),
        });
        router.push(enElEquipo(equipo.teamId));
      },
      { navega: true },
    );
  };
  return (
    <Form onSubmit={guardar} aria-label="Datos del equipo">
      <ResumenErrores error={error} />
      <FormGroup titulo="Datos del equipo">
        <TextField
          etiqueta="Nombre del equipo"
          name="nombre"
          maxLength={160}
          value={nombre}
          error={errorDe("nombre")}
          onChange={(e) => setNombre(e.target.value)}
        />
        <SelectFormField
          etiqueta="Gerencia responsable"
          name="gerenteId"
          opcional
          value={gerenteId}
          error={errorDe("gerenteId")}
          ayuda="El líder del equipo responde a esta persona."
          onChange={(e) => setGerenteId(e.target.value)}
        >
          <option value="">Sin asignar</option>
          <Gerentes opciones={opciones} />
        </SelectFormField>
      </FormGroup>
      <FormActions>
        <Button variante="primary" type="submit" disabled={enviando}>
          Guardar cambios
        </Button>
        <ButtonLink variante="quiet" href={enElEquipo(equipo.teamId)}>
          Cancelar
        </ButtonLink>
      </FormActions>
    </Form>
  );
}

export function FormularioLider({
  equipo,
  opciones,
}: {
  equipo: EquipoDTO;
  opciones: OpcionesEquipoDTO;
}) {
  const router = useRouter();
  const { enviando, error, enviar, errorDe } = useEnvio();
  const [liderId, setLiderId] = useState("");
  const elegido = opciones.lideres.find((l) => l.employeeId === liderId);
  const guardar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(
      async () => {
        await organizacionApi.cambiarLider(equipo.teamId, { liderId });
        router.push(enElEquipo(equipo.teamId));
      },
      { navega: true },
    );
  };
  return (
    <Form onSubmit={guardar} aria-label="Cambio de líder">
      <ResumenErrores error={error} />
      <Notice>
        {contar(equipo.tecnicosActivos, "persona técnica activa", "personas técnicas activas")}{" "}
        {equipo.tecnicosActivos === 1 ? "pasará" : "pasarán"} a responder al nuevo líder desde la
        semana actual. El historial de cada persona conserva a su responsable anterior.
      </Notice>
      <FormGroup titulo="Nuevo líder">
        <SelectFormField
          etiqueta="Líder"
          name="liderId"
          value={liderId}
          error={errorDe("liderId")}
          ayuda={
            elegido && elegido.teamId !== equipo.teamId
              ? `${elegido.nombre} se incorporará a este equipo${elegido.equipo ? ` desde ${elegido.equipo}` : ""}.`
              : "El líder actual conserva su puesto y su equipo."
          }
          onChange={(e) => setLiderId(e.target.value)}
        >
          <option value="">Seleccione una persona</option>
          <OpcionesDeLider opciones={opciones} excluir={equipo.lider?.employeeId} />
        </SelectFormField>
      </FormGroup>
      <FormActions>
        <Button variante="primary" type="submit" disabled={enviando}>
          Cambiar líder
        </Button>
        <ButtonLink variante="quiet" href={enElEquipo(equipo.teamId)}>
          Cancelar
        </ButtonLink>
      </FormActions>
    </Form>
  );
}

export function FormularioDesactivarEquipo({ equipo }: { equipo: EquipoDTO }) {
  const router = useRouter();
  const { enviando, error, enviar, errorDe } = useEnvio();
  const [justificacion, setJustificacion] = useState("");
  const otras = equipo.personasActivas - (equipo.lider ? 1 : 0);
  const bloqueada = desactivacionEquipoBloqueada(equipo);
  const guardar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(
      async () => {
        await organizacionApi.desactivarEquipo(equipo.teamId, { justificacion });
        router.push(enElEquipo(equipo.teamId));
      },
      { navega: true },
    );
  };
  return (
    <Form onSubmit={guardar} aria-label="Baja del equipo">
      <ResumenErrores error={error} />
      {otras > 0 ? (
        <Notice tono="aviso">
          El equipo tiene {contar(otras, "persona activa", "personas activas")}. Para
          darlo de baja, cambie primero de equipo a esas personas.
        </Notice>
      ) : (
        <Notice>
          El equipo deja de estar disponible para nuevas asignaciones. Su historial y su
          trazabilidad se conservan; no se elimina ningún dato.
        </Notice>
      )}
      <FormGroup titulo="Baja">
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
        <Button variante="danger" type="submit" disabled={enviando || bloqueada}>
          Dar de baja el equipo
        </Button>
        <ButtonLink variante="quiet" href={enElEquipo(equipo.teamId)}>
          Cancelar
        </ButtonLink>
      </FormActions>
    </Form>
  );
}
