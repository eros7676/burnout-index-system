// A change set in words: field, before, after. Values are the identifiers and settings the event
// stored (never index values), so they are shown as stored, only translated where a word exists.
// Relative imports on purpose: tests/auditoria-ui.test.ts runs this outside Next.js.
import type { CambioAuditoria } from "../../shared/auditoria-catalogo";
import type { Factor } from "../../shared/contracts";
import { FACTOR, TIPO, diaCorto, valorFactor } from "../../shared/formato";
import { humanizar, problema } from "../importaciones/textos";

const ESTADO_IMPORTACION: Record<string, string> = {
  VALIDADA: "Validada",
  RECHAZADA: "Rechazada",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
};
const ETAPA: Record<string, string> = { FORMATO: "Formato del archivo" };

/** Field names, in reading order for the details list; anything else is humanized after them. */
const CAMPOS: Record<string, string> = {
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
  windowDays: "Ventana en días",
  persistencePeriods: "Semanas de persistencia",
  mediumLimit: "Límite de Medio",
  highLimit: "Límite de Alto",
  minExceededFactors: "Factores en común para Alto",
  semanas: "Semanas a recalcular",
  jobId: "Procesamiento",
  sourceHash: "Huella del archivo",
  schemaVersion: "Formato",
  nombre: "Nombre",
  tipo: "Tipo",
  teamId: "Equipo",
  responsableId: "Responsable",
  liderId: "Líder",
  gerenteId: "Gerente",
  enCobertura: "En cobertura",
  activo: "Activo",
  estado: "Estado",
};
const ORDEN = Object.keys(CAMPOS);
export const posicionCampo = (campo: string) => {
  const i = ORDEN.indexOf(campo);
  return i === -1 ? ORDEN.length : i;
};

const esFactor = (clave: string): clave is Factor =>
  Object.hasOwn(FACTOR, clave);
const porcentaje = (n: number) => `${Math.round(n * 100)} %`;
const NUMERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** "weights.HE" → "Peso de Horas extra"; "teamId" → "Equipo". */
export function etiquetaCampo(campo: string) {
  const [grupo, factor] = campo.split(".");
  if (factor && esFactor(factor)) {
    if (grupo === "weights") return `Peso de ${FACTOR[factor]}`;
    if (grupo === "thresholds") return `Umbral de ${FACTOR[factor]}`;
  }
  return CAMPOS[campo] ?? humanizar(campo);
}

/** A stored value as a person reads it; empty values read "—". */
export function textoDato(campo: string, dato: unknown): string {
  if (dato === null || dato === undefined || dato === "") return "—";
  const [grupo, factor] = campo.split(".");
  if (factor && esFactor(factor) && typeof dato === "number") {
    if (grupo === "weights") return porcentaje(dato);
    if (grupo === "thresholds") return valorFactor(factor, dato);
  }
  if (campo === "codigosError" && Array.isArray(dato))
    return dato.length ? dato.map((c) => problema(String(c))).join(", ") : "Ninguno";
  if (campo === "estadoAnterior")
    return ESTADO_IMPORTACION[String(dato)] ?? humanizar(String(dato));
  if (campo === "etapa") return ETAPA[String(dato)] ?? humanizar(String(dato));
  if (campo === "codigo") return problema(String(dato));
  if (campo === "tipo" && Object.hasOwn(TIPO, String(dato)))
    return TIPO[String(dato) as keyof typeof TIPO];
  if (campo === "effectiveFrom" && typeof dato === "string")
    return `${diaCorto(dato)} ${dato.slice(0, 4)}`;
  if ((campo === "weights" || campo === "thresholds") && typeof dato === "object")
    return Object.entries(dato as Record<string, number>)
      .map(([f, n]) =>
        esFactor(f)
          ? `${FACTOR[f]} ${campo === "weights" ? porcentaje(n) : valorFactor(f, n)}`
          : `${f} ${n}`,
      )
      .join(", ");
  if (typeof dato === "number") return NUMERO.format(dato);
  if (typeof dato === "boolean") return dato ? "Sí" : "No";
  if (Array.isArray(dato)) return dato.map(String).join(", ");
  if (typeof dato === "object") return JSON.stringify(dato);
  return String(dato);
}

export type FilaCambio = { campo: string; antes: string; despues: string };

/** The «Cambios» table: one row per changed field, nothing else. */
export const filasDeCambios = (
  cambios: readonly CambioAuditoria[] | null,
): FilaCambio[] =>
  (cambios ?? []).map((c) => ({
    campo: etiquetaCampo(c.campo),
    antes: textoDato(c.campo, c.antes),
    despues: textoDato(c.campo, c.despues),
  }));
