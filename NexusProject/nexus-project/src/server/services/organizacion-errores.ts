import type { ErrorCampo } from "../../shared/contracts";

/** A rejected organization request. `detalles` carry one entry per offending field or file row. */
export class ErrorOrganizacion extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 413 | 422,
    readonly codigo: string,
    mensaje: string,
    readonly detalles: ErrorCampo[] = [],
  ) {
    super(mensaje);
    this.name = "ErrorOrganizacion";
  }
}

export const errorCampo = (
  campo: string | null,
  codigo: string,
  detalle: string,
  fila: number | null = null,
): ErrorCampo => ({ fila, campo, codigo, detalle });

/** Field-level failure: HTTP 422 with every error next to its field. */
export const validacionFallida = (detalles: ErrorCampo[]) =>
  new ErrorOrganizacion(
    422,
    "VALIDACION_INVALIDA",
    "Revise los campos indicados.",
    detalles,
  );

export const noEncontrado = (mensaje: string) =>
  new ErrorOrganizacion(404, "NO_ENCONTRADO", mensaje);

export const conflicto = (mensaje: string, detalles: ErrorCampo[] = []) =>
  new ErrorOrganizacion(409, "ESTADO_INCOMPATIBLE", mensaje, detalles);

/** The body of a write: a JSON object with only the fields the operation takes. */
export function cuerpoPermitido(
  valor: unknown,
  permitidos: readonly string[],
): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor))
    throw new ErrorOrganizacion(
      400,
      "PETICION_INVALIDA",
      "El cuerpo debe ser un objeto JSON.",
    );
  const desconocidos = Object.keys(valor).filter((k) => !permitidos.includes(k));
  if (desconocidos.length)
    throw new ErrorOrganizacion(
      400,
      "PETICION_INVALIDA",
      `Campos no admitidos: ${desconocidos.join(", ")}.`,
    );
  return valor as Record<string, unknown>;
}
