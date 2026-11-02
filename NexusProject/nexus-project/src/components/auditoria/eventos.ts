// Audit events in words. Codes come from src/server/repositories/auditoria.ts
// (ACCIONES_AUDITORIA); detail keys from the services that write each event
// (importaciones.ts, reglas.ts).
import type { EventoAuditoria, Factor } from "@/shared/contracts";
import { FACTOR, diaCorto, valorFactor } from "@/shared/formato";
import { humanizar, problema } from "../importaciones/textos";

const ACCION: Record<string, string> = {
  IMPORTACION_VALIDADA: "Validó un archivo",
  IMPORTACION_RECHAZADA: "Validó un archivo con errores",
  IMPORTACION_CONFIRMADA: "Confirmó una importación",
  IMPORTACION_CANCELADA: "Canceló una vista previa",
  REGLAS_PUBLICADAS: "Publicó una versión de las reglas",
};
const ENTIDAD: Record<string, string> = {
  IMPORTACION: "Importación",
  REGLAS: "Reglas del índice",
};
const ESTADO_IMPORTACION: Record<string, string> = {
  VALIDADA: "Validada",
  RECHAZADA: "Rechazada",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
};
const ETAPA: Record<string, string> = { FORMATO: "Formato del archivo" };
/** Detail keys, in reading order; anything else is humanized after them. */
const CLAVE: Record<string, string> = {
  totalFilas: "Filas",
  nuevas: "Nuevas",
  omitidas: "Omitidas",
  insertados: "Guardadas",
  omitidos: "Omitidas",
  codigosError: "Errores",
  estadoAnterior: "Estado anterior",
  etapa: "Etapa",
  codigo: "Motivo",
  version: "Versión",
  versionAnterior: "Versión anterior",
  effectiveFrom: "Vigente desde",
  weights: "Pesos",
  thresholds: "Umbrales",
  mediumLimit: "Límite de Medio",
  highLimit: "Límite de Alto",
  minExceededFactors: "Factores en común para Alto",
  semanas: "Semanas a recalcular",
  jobId: "Procesamiento",
  sourceHash: "Huella del archivo",
  schemaVersion: "Formato",
};
const ORDEN = Object.keys(CLAVE);
const posicion = (clave: string) => {
  const i = ORDEN.indexOf(clave);
  return i === -1 ? ORDEN.length : i;
};

export const accion = (codigo: string) => ACCION[codigo] ?? humanizar(codigo);
export const entidad = (codigo: string) =>
  ENTIDAD[codigo] ?? humanizar(codigo);

/** A short handle to tell resources apart: the version for rules, the id's tail otherwise. */
export function referencia(evento: EventoAuditoria) {
  if (evento.entidad === "REGLAS") return `Versión ${evento.recursoId}`;
  return `Ref. ${evento.recursoId.slice(-6)}`;
}

/** Demo users by name; any other actor (scripts, the seed) is the system. */
export function actor(
  actorId: string,
  usuarios: readonly { userId: string; nombre: string }[],
) {
  const usuario = actorId.startsWith("demo-")
    ? usuarios.find((u) => u.userId === actorId)
    : undefined;
  return usuario?.nombre ?? "Sistema";
}

const NUMERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const esFactor = (clave: string): clave is Factor =>
  ["HE", "DS", "CT", "VP"].includes(clave);
/** Long opaque values (hashes, ids) keep their head: enough to match, not to read. */
const corto = (texto: string) =>
  texto.length > 14 ? `${texto.slice(0, 10)}…` : texto;

function valor(clave: string, dato: unknown): string {
  if (dato === null || dato === undefined)
    return clave === "versionAnterior" ? "Ninguna" : "—";
  if (clave === "codigosError" && Array.isArray(dato))
    return dato.length
      ? dato.map((c) => problema(String(c))).join(", ")
      : "Ninguno";
  if (clave === "estadoAnterior")
    return ESTADO_IMPORTACION[String(dato)] ?? humanizar(String(dato));
  if (clave === "etapa") return ETAPA[String(dato)] ?? humanizar(String(dato));
  if (clave === "codigo") return problema(String(dato));
  if (clave === "effectiveFrom" && typeof dato === "string")
    return `${diaCorto(dato)} ${dato.slice(0, 4)}`;
  if (
    (clave === "weights" || clave === "thresholds") &&
    typeof dato === "object"
  )
    return Object.entries(dato as Record<string, number>)
      .map(([f, n]) =>
        esFactor(f)
          ? `${FACTOR[f]} ${clave === "weights" ? `${Math.round(n * 100)} %` : valorFactor(f, n)}`
          : `${f} ${n}`,
      )
      .join(", ");
  if (typeof dato === "number") return NUMERO.format(dato);
  if (typeof dato === "boolean") return dato ? "Sí" : "No";
  if (Array.isArray(dato)) return dato.map(String).join(", ");
  if (typeof dato === "object") return JSON.stringify(dato);
  return corto(String(dato));
}

/** The event's details as label/value pairs, known keys first and in words. */
export function detalles(evento: EventoAuditoria) {
  return Object.entries(evento.detalles)
    .sort(([a], [b]) => posicion(a) - posicion(b))
    .map(([clave, dato]) => ({
      clave: CLAVE[clave] ?? humanizar(clave),
      valor: valor(clave, dato),
    }));
}
