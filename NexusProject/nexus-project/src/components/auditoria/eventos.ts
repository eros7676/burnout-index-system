// Audit events in words (DESIGN.md › Words, not codes). Action and entity labels come from the
// catalog (src/shared/auditoria-catalogo.ts), never from a list per action; reasons from its
// closed reason codes. Relative imports on purpose: tests/auditoria-ui.test.ts runs this outside Next.js.
import {
  CATALOGO_AUDITORIA,
  ENTIDADES_AUDITORIA,
  MOTIVOS_AUDITORIA,
  type EntidadAuditoria,
} from "../../shared/auditoria-catalogo";
import type {
  EventoAuditoria,
  OrigenAuditoria,
  ResultadoAuditoria,
  UsuarioDemoDTO,
} from "../../shared/contracts";
import { ROL, entero } from "../../shared/formato";
import { humanizar } from "../importaciones/textos";
import { etiquetaCampo, posicionCampo, textoDato } from "./cambios";
import type { FiltrosUi } from "./filtros-url";

export const RESULTADO: Record<ResultadoAuditoria, string> = {
  EXITO: "Exitoso",
  FALLO: "Fallido",
  DENEGADO: "Denegado",
};

const ORIGEN: Record<OrigenAuditoria, string> = {
  WEB: "Aplicación web",
  CLI: "Línea de comandos",
  SISTEMA: "Sistema",
};
export const etiquetaOrigen = (origen: OrigenAuditoria | null) =>
  origen ? ORIGEN[origen] : "No registrado";

export const etiquetaMotivo = (motivo: string | null) =>
  motivo === null
    ? null
    : Object.hasOwn(MOTIVOS_AUDITORIA, motivo)
      ? MOTIVOS_AUDITORIA[motivo as keyof typeof MOTIVOS_AUDITORIA]
      : humanizar(motivo);

const ZONA = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Argentina/Buenos_Aires",
});

/** "2 nov 2026, 14:05:09": the instant in the product's zone, with year and seconds. */
export function fechaHora(iso: string) {
  const p = Object.fromEntries(
    ZONA.formatToParts(new Date(iso)).map((parte) => [parte.type, parte.value]),
  );
  return `${p.day} ${p.month.replace(".", "")} ${p.year}, ${p.hour}:${p.minute}:${p.second}`;
}

type Directorio = readonly Pick<UsuarioDemoDTO, "userId" | "nombre" | "rol">[];
const enDirectorio = (evento: EventoAuditoria, usuarios: Directorio) =>
  usuarios.find((u) => u.userId === evento.actorId);

/** The name the event stored; older events fall back to the session directory, then to "Sistema". */
export const nombreActor = (evento: EventoAuditoria, usuarios: Directorio) =>
  evento.actorNombre ?? enDirectorio(evento, usuarios)?.nombre ?? "Sistema";

const rol = (codigo: string | null | undefined) =>
  codigo && Object.hasOwn(ROL, codigo)
    ? ROL[codigo as UsuarioDemoDTO["rol"]]
    : null;
export const rolActor = (evento: EventoAuditoria, usuarios: Directorio) =>
  rol(evento.actorRol) ?? rol(enDirectorio(evento, usuarios)?.rol);

/** What the event acted on: the type, its name when known and its code, always. */
export function elemento(evento: EventoAuditoria) {
  return {
    tipo:
      (ENTIDADES_AUDITORIA as Record<string, string>)[evento.entidad] ??
      humanizar(evento.entidad),
    nombre:
      evento.recursoNombre ??
      (evento.entidad === "REGLAS" ? `Versión ${evento.recursoId}` : null),
    codigo: evento.recursoId,
  };
}

const ruta = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;

/** Screens that exist for a resource; the rest stay as text. */
export function enlaceRecurso(evento: EventoAuditoria) {
  switch (evento.entidad) {
    case "EMPLEADO":
      return ruta("/employees", evento.recursoId);
    case "INFORME":
      return ruta("/reports", evento.recursoId);
    case "EQUIPO":
      return ruta("/teams", evento.recursoId);
    default:
      return null;
  }
}

export const enlacePersona = (evento: EventoAuditoria) =>
  evento.sujetoId ? ruta("/employees", evento.sujetoId) : null;

/** A hash keeps its head: enough to match two files, not to read. */
const abreviar = (texto: string) =>
  texto.length > 14 ? `${texto.slice(0, 10)}…` : texto;

/** The event's details as label/value pairs, known keys first and in words. */
export function detalles(evento: EventoAuditoria) {
  return Object.entries(evento.detalles)
    .sort(([a], [b]) => posicionCampo(a) - posicionCampo(b))
    .map(([clave, dato]) => ({
      clave: etiquetaCampo(clave),
      valor:
        clave === "versionAnterior" && (dato === null || dato === undefined)
          ? "Ninguna"
          : clave === "sourceHash" && typeof dato === "string"
            ? abreviar(dato)
            : textoDato(clave, dato),
    }));
}

/** The person the event is about, by name; "no disponible" when the record no longer resolves. */
export const nombrePersona = (evento: EventoAuditoria) =>
  evento.sujetoNombre ?? "Persona no disponible";

/** The action in words: the catalog's label, or the humanized code for an action it does not know. */
export const etiquetaAccion = (evento: EventoAuditoria) =>
  evento.etiqueta ?? humanizar(evento.accion);

/** One sentence for the page header: "RRHH confirmó una importación". */
export const resumen = (evento: EventoAuditoria, usuarios: Directorio) => {
  const etiqueta = etiquetaAccion(evento);
  return `${nombreActor(evento, usuarios)} ${etiqueta.charAt(0).toLowerCase()}${etiqueta.slice(1)}`;
};

/**
 * The actions of the catalog grouped by what they act on, for a grouped select; one group when an
 * entity is chosen. The labels are the catalog's own: a new action shows up here without edits.
 */
export function gruposDeAcciones(entidad: "" | EntidadAuditoria = "") {
  const grupos = new Map<EntidadAuditoria, { accion: string; etiqueta: string }[]>();
  for (const [accion, definicion] of Object.entries(CATALOGO_AUDITORIA)) {
    if (entidad && definicion.entidad !== entidad) continue;
    const lista = grupos.get(definicion.entidad) ?? [];
    lista.push({ accion, etiqueta: definicion.etiqueta });
    grupos.set(definicion.entidad, lista);
  }
  return [...grupos].map(([clave, acciones]) => ({
    entidad: clave,
    etiqueta: ENTIDADES_AUDITORIA[clave],
    acciones,
  }));
}

/** "1 evento", "1.234 eventos", "Más de 10.000 eventos" when the count stopped at its cap. */
export const cantidadEventos = (total: number, acotado: boolean) =>
  acotado
    ? `Más de ${entero(total)} eventos`
    : total === 1
      ? "1 evento"
      : `${entero(total)} eventos`;

export type CodigoFiltro = "sujetoId" | "recursoId" | "correlacionId" | "solicitudId";

/**
 * Filters that arrive by link carry a code, which has no control in the bar. They are shown as
 * removable chips, by name when the loaded events know it and never as a raw code.
 */
export function chipsDeCodigos(
  filtros: Pick<FiltrosUi, CodigoFiltro>,
  eventos: readonly EventoAuditoria[],
) {
  const chips: { clave: CodigoFiltro; texto: string }[] = [];
  const persona = eventos.find((e) => e.sujetoId === filtros.sujetoId)?.sujetoNombre;
  const recurso = eventos.find((e) => e.recursoId === filtros.recursoId)?.recursoNombre;
  if (filtros.sujetoId)
    chips.push({
      clave: "sujetoId",
      texto: persona ? `Persona: ${persona}` : "Persona seleccionada",
    });
  if (filtros.recursoId)
    chips.push({
      clave: "recursoId",
      texto: recurso ? `Recurso: ${recurso}` : "Recurso seleccionado",
    });
  if (filtros.correlacionId)
    chips.push({ clave: "correlacionId", texto: "Operación seleccionada" });
  if (filtros.solicitudId)
    chips.push({ clave: "solicitudId", texto: "Solicitud seleccionada" });
  return chips;
}
