// The editor's form: text as typed in, read into a proposal, and the server's
// problems placed next to the field they belong to. Only the shape of what was
// typed is checked here; weights, limits and dates are judged once, by the server
// (`validarPropuesta`), so the two never disagree. Relative imports only (unit tests).
import type { ErrorCampo, Factor } from "../../shared/contracts";
import type { PropuestaReglas } from "../../shared/contratos/reglas";
import { FACTORES } from "./parametros";

export type CampoFormulario =
  | `weights.${Factor}`
  | `thresholds.${Factor}`
  | "mediumLimit"
  | "highLimit"
  | "minExceededFactors"
  | "effectiveFrom"
  | "motivo";
export type Formulario = Record<CampoFormulario, string>;

export const CAMPOS_FORMULARIO: readonly CampoFormulario[] = [
  ...FACTORES.map((f) => `weights.${f}` as const),
  ...FACTORES.map((f) => `thresholds.${f}` as const),
  "mediumLimit",
  "highLimit",
  "minExceededFactors",
  "effectiveFrom",
  "motivo",
];

const TEXTO = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 4,
  useGrouping: false,
});

/** A number as it is typed: decimal comma, no thousands separator. */
const escribir = (n: number) => TEXTO.format(n);
/** A weight is typed in percent; two decimals are enough for a weight. */
const PESO = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 2,
  useGrouping: false,
});
const escribirPeso = (proporcion: number) => PESO.format(proporcion * 100);

export function formularioDe(propuesta: PropuestaReglas, motivo: string): Formulario {
  const f: Partial<Formulario> = {};
  for (const factor of FACTORES) {
    f[`weights.${factor}`] = escribirPeso(propuesta.weights[factor]);
    f[`thresholds.${factor}`] = escribir(propuesta.thresholds[factor]);
  }
  f.mediumLimit = escribir(propuesta.mediumLimit);
  f.highLimit = escribir(propuesta.highLimit);
  f.minExceededFactors = String(propuesta.minExceededFactors);
  f.effectiveFrom = propuesta.effectiveFrom;
  f.motivo = motivo;
  return f as Formulario;
}

const NUMERO = /^\d+(?:[.,]\d+)?$/;
/** Accepts a decimal comma or point; anything else (units, signs, exponents) is not a number. */
export function leerNumero(texto: string): number | null {
  const limpio = texto.trim();
  return NUMERO.test(limpio) ? Number(limpio.replace(",", ".")) : null;
}

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
function fechaReal(texto: string) {
  const partes = FECHA.exec(texto);
  if (!partes) return false;
  const [, anio, mes, dia] = partes.map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

export type ErroresFormulario = Partial<Record<CampoFormulario, string>>;
export type Lectura = {
  /** Null while any field cannot be read. */
  propuesta: PropuestaReglas | null;
  motivo: string;
  errores: ErroresFormulario;
};

const EJEMPLO: Partial<Record<CampoFormulario, string>> = {
  "weights.HE": "30",
  "weights.DS": "30",
  "weights.CT": "25",
  "weights.VP": "15",
  "thresholds.HE": "8",
  "thresholds.DS": "6",
  "thresholds.CT": "0,35",
  "thresholds.VP": "10",
  mediumLimit: "40",
  highLimit: "70",
};

export function leerFormulario(f: Formulario): Lectura {
  const errores: ErroresFormulario = {};
  const numero = (campo: CampoFormulario) => {
    const n = leerNumero(f[campo]);
    if (n === null)
      errores[campo] = `Ingrese un número (por ejemplo, ${EJEMPLO[campo] ?? "10"}).`;
    return n;
  };
  const pesos: Partial<Record<Factor, number>> = {};
  const umbrales: Partial<Record<Factor, number>> = {};
  for (const factor of FACTORES) {
    const peso = numero(`weights.${factor}`);
    // Percent text to a proportion in whole ten-thousandths, so 30 is exactly 0.3.
    if (peso !== null) pesos[factor] = Math.round(peso * 100) / 10_000;
    const umbral = numero(`thresholds.${factor}`);
    if (umbral !== null) umbrales[factor] = umbral;
  }
  const mediumLimit = numero("mediumLimit");
  const highLimit = numero("highLimit");
  const minimo = Number(f.minExceededFactors);
  if (![2, 3, 4].includes(minimo))
    errores.minExceededFactors = "Seleccione 2, 3 o 4 factores.";
  if (!fechaReal(f.effectiveFrom.trim()))
    errores.effectiveFrom = "Ingrese una fecha válida.";

  const motivo = f.motivo.trim();
  if (
    Object.keys(errores).length > 0 ||
    mediumLimit === null ||
    highLimit === null
  )
    return { propuesta: null, motivo, errores };
  return {
    propuesta: {
      weights: pesos as Record<Factor, number>,
      thresholds: umbrales as Record<Factor, number>,
      mediumLimit,
      highLimit,
      minExceededFactors: minimo as 2 | 3 | 4,
      effectiveFrom: f.effectiveFrom.trim(),
    },
    motivo,
    errores,
  };
}

/** Sum of the four weights in percent, or null when any of them cannot be read. */
export function sumaPesos(f: Formulario): number | null {
  let total = 0;
  for (const factor of FACTORES) {
    const peso = leerNumero(f[`weights.${factor}`]);
    if (peso === null) return null;
    total += peso;
  }
  return Math.round(total * 100) / 100;
}

/** True when what is typed differs from what is stored (numbers compare by value, text trimmed). */
export function sinGuardar(
  f: Formulario,
  guardada: PropuestaReglas,
  motivoGuardado: string,
): boolean {
  const guardado = formularioDe(guardada, motivoGuardado);
  return CAMPOS_FORMULARIO.some((campo) => {
    const a = f[campo].trim();
    const b = guardado[campo].trim();
    if (campo === "motivo") return a !== b;
    const na = leerNumero(a);
    const nb = leerNumero(b);
    return na !== null && nb !== null ? na !== nb : a !== b;
  });
}

/** Groups and the reason have their own message slot besides the individual fields. */
const CON_LUGAR = new Set<string>([
  ...CAMPOS_FORMULARIO,
  "weights",
  "thresholds",
  "justificacion",
]);

/**
 * The server's problems by field. What has no field of its own (a draft with no
 * changes, an unreadable document) goes to `generales`. Nothing typed is cleared.
 */
export function erroresDeServidor(problemas: readonly ErrorCampo[]): {
  porCampo: Record<string, string>;
  generales: string[];
} {
  const porCampo: Record<string, string> = {};
  const generales: string[] = [];
  for (const p of problemas) {
    if (p.campo && CON_LUGAR.has(p.campo))
      porCampo[p.campo] = porCampo[p.campo] ? `${porCampo[p.campo]} ${p.detalle}` : p.detalle;
    else generales.push(p.detalle);
  }
  return { porCampo, generales };
}
