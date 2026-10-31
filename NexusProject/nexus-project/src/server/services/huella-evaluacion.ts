import { createHash } from "node:crypto";
import type {
  ConfiguracionIndice,
  RegistroLaboral,
} from "../../shared/contracts";

export const ENGINE_VERSION = "cu02-v1" as const;
export type SnapshotEvaluacion = {
  actual: RegistroLaboral;
  anterior: RegistroLaboral | null;
  reglas: ConfiguracionIndice;
};

/** Orden canónico de claves; no depende del orden de propiedades de JSON/MySQL. */
export function serializarCanonico(valor: unknown): string {
  if (Array.isArray(valor))
    return `[${valor.map(serializarCanonico).join(",")}]`;
  if (valor !== null && typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    return `{${Object.keys(objeto)
      .sort()
      .map(
        (clave) =>
          `${JSON.stringify(clave)}:${serializarCanonico(objeto[clave])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(valor) ?? "null";
}

/** Incluye datos/versiones y ausencia explícita de antecedente; no incluye el job. */
export function huellaEvaluacion(snapshot: SnapshotEvaluacion): string {
  return createHash("sha256")
    .update(serializarCanonico({ engineVersion: ENGINE_VERSION, ...snapshot }))
    .digest("hex");
}
