// How the rules editor names and writes parameters, states and values.
// Relative imports only: this module is covered by the unit tests, which do not resolve "@/".
import type { Factor } from "../../shared/contracts";
import type {
  EstadoBorradorReglas,
  EstadoVersionReglas,
} from "../../shared/contratos/reglas";
import { FACTOR, diaCorto, entero, valorFactor } from "../../shared/formato";

export const FACTORES: readonly Factor[] = ["HE", "DS", "CT", "VP"];

/** What each factor measures in one week, as the engine computes it. */
export const MIDE: Record<Factor, string> = {
  HE: "Horas trabajadas por encima de la jornada",
  DS: "Días trabajados sin un día libre",
  CT: "Tareas vencidas y pendientes sobre las activas",
  VP: "Días de vacaciones sin tomar",
};

const NBSP = " ";
const PORCENTAJE = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** "30 %", with a non-breaking space so the sign never wraps alone. */
export const porcentaje = (proporcion: number) =>
  `${PORCENTAJE.format(proporcion * 100)}${NBSP}%`;

/** "5 ene 2026", from the date string (no browser time zone). */
export const fecha = (iso: string) => `${diaCorto(iso)} ${iso.slice(0, 4)}`;

export const ESTADO_BORRADOR: Record<EstadoBorradorReglas, string> = {
  BORRADOR: "Borrador",
  EN_REVISION: "En revisión",
  PUBLICADO: "Publicado",
  DESCARTADO: "Descartado",
};
export const TONO_BORRADOR: Record<
  EstadoBorradorReglas,
  "neutro" | "aviso" | "exito"
> = {
  BORRADOR: "neutro",
  EN_REVISION: "aviso",
  PUBLICADO: "exito",
  DESCARTADO: "neutro",
};

export const ESTADO_VERSION: Record<EstadoVersionReglas, string> = {
  PROGRAMADA: "Programada",
  VIGENTE: "Vigente",
  REEMPLAZADA: "Reemplazada",
};
export const TONO_VERSION: Record<
  EstadoVersionReglas,
  "neutro" | "aviso" | "exito"
> = {
  PROGRAMADA: "aviso",
  VIGENTE: "exito",
  REEMPLAZADA: "neutro",
};

const minuscula = (texto: string) => texto.charAt(0).toLowerCase() + texto.slice(1);
const esFactor = (texto: string): texto is Factor =>
  (FACTORES as readonly string[]).includes(texto);

/** Name of a parameter as the server reports it ("weights.HE"). */
export function etiquetaCampo(campo: string): string {
  const [grupo, factor] = campo.split(".");
  if (factor && esFactor(factor)) {
    if (grupo === "weights") return `Peso de ${minuscula(FACTOR[factor])}`;
    if (grupo === "thresholds") return `Umbral de ${minuscula(FACTOR[factor])}`;
  }
  switch (campo) {
    case "mediumLimit":
      return "Límite de Medio";
    case "highLimit":
      return "Límite de Alto";
    case "minExceededFactors":
      return "Mínimo de factores superados";
    case "effectiveFrom":
      return "Inicio de vigencia";
    case "estado":
      return "Estado";
    case "motivo":
      return "Motivo del cambio";
    default:
      return campo;
  }
}

/** A parameter's value as a person reads it: units, percent, dates, states. */
export function valorCampo(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const [grupo, factor] = campo.split(".");
  if (typeof valor === "number") {
    if (grupo === "weights") return porcentaje(valor);
    if (grupo === "thresholds" && factor && esFactor(factor))
      return valorFactor(factor, valor);
    if (campo === "minExceededFactors") return `${valor} factores`;
    return entero(valor);
  }
  if (typeof valor !== "string") return String(valor);
  if (campo === "effectiveFrom") return fecha(valor);
  if (campo === "estado" && valor in ESTADO_BORRADOR)
    return ESTADO_BORRADOR[valor as EstadoBorradorReglas];
  return valor;
}

/** Signed change of a count: "+3", "−2" (U+2212) or "=". */
export function diferencia(antes: number, despues: number): string {
  const d = despues - antes;
  if (d === 0) return "=";
  return `${d > 0 ? "+" : "−"}${entero(Math.abs(d))}`;
}

/** "1 semana" / "2 semanas", with thousands separated as es-AR does. */
export const plural = (n: number, uno: string, varios: string) =>
  n === 1 ? `1 ${uno}` : `${entero(n)} ${varios}`;
