import { createHash } from "node:crypto";
import type { CambioAuditoria } from "../../shared/auditoria-catalogo";
import type { ConfiguracionIndice, Factor } from "../../shared/contracts";
import type { PropuestaReglas } from "../../shared/contratos/reglas";
import { calcularCambios } from "../repositories/auditoria";
import { serializarCanonico } from "./huella-evaluacion";

const FACTORES = ["HE", "DS", "CT", "VP"] as const satisfies readonly Factor[];

/** The editable part of a published version. */
export function propuestaDesde(
  reglas: ConfiguracionIndice,
  effectiveFrom = reglas.effectiveFrom,
): PropuestaReglas {
  return {
    weights: { ...reglas.weights },
    thresholds: { ...reglas.thresholds },
    mediumLimit: reglas.mediumLimit,
    highLimit: reglas.highLimit,
    minExceededFactors: reglas.minExceededFactors,
    effectiveFrom,
  };
}

/** A complete version, ready for the existing publication path. */
export function configuracionDe(
  propuesta: PropuestaReglas,
  datos: { version: string; createdBy: string; createdAt: string },
): ConfiguracionIndice {
  return {
    ...datos,
    effectiveFrom: propuesta.effectiveFrom,
    windowDays: 7,
    persistencePeriods: 2,
    weights: { ...propuesta.weights },
    thresholds: { ...propuesta.thresholds },
    mediumLimit: propuesta.mediumLimit,
    highLimit: propuesta.highLimit,
    minExceededFactors: propuesta.minExceededFactors,
  };
}

/**
 * Content fingerprint of a draft: SHA-256 over the canonical proposal and its reason.
 * It plays the role of a strong validator (HTTP ETag): a request that quotes a
 * different one read an older draft (RFC 9110 §13.1.1, lost updates), and a
 * simulation is valid only for the exact content it ran on.
 */
export function huellaBorrador(propuesta: PropuestaReglas, motivo: string) {
  return createHash("sha256")
    .update(serializarCanonico({ propuesta, motivo }))
    .digest("hex");
}

/** One flat key per parameter: `weights.HE`, `thresholds.CT`, `mediumLimit`… */
export function aplanar(
  propuesta: PropuestaReglas,
): Record<string, number | string> {
  return {
    ...Object.fromEntries(
      FACTORES.map((f) => [`weights.${f}`, propuesta.weights[f]]),
    ),
    ...Object.fromEntries(
      FACTORES.map((f) => [`thresholds.${f}`, propuesta.thresholds[f]]),
    ),
    mediumLimit: propuesta.mediumLimit,
    highLimit: propuesta.highLimit,
    minExceededFactors: propuesta.minExceededFactors,
    effectiveFrom: propuesta.effectiveFrom,
  };
}

/** Changed parameters only, in the audit trail's diff shape. */
export function cambiosEntre(
  antes: PropuestaReglas,
  despues: PropuestaReglas,
): CambioAuditoria[] {
  return calcularCambios(aplanar(antes), aplanar(despues));
}

/**
 * Same rules at the draft's first week. The start date alone does not count as a
 * change: a draft that only moves the date would republish the same parameters.
 */
export function mismosParametros(a: PropuestaReglas, b: PropuestaReglas) {
  return (
    cambiosEntre(a, { ...b, effectiveFrom: a.effectiveFrom }).length === 0
  );
}
