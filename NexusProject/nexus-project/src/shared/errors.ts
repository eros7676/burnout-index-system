import type { ApiError, ErrorCampo } from "./contracts";

export const CODIGOS_ERROR_FILA = [
  "OBLIGATORIO",
  "NUMERO_INVALIDO",
  "RANGO_INVALIDO",
  "FECHA_INVALIDA",
  "SEMANA_INVALIDA",
  "PERIODO_ABIERTO",
  "EMPLEADO_NO_EXISTE",
  "EMPLEADO_FUERA_COBERTURA",
  "DUPLICADO_LOTE",
  "CONFLICTO_HISTORICO",
] as const;
export type CodigoErrorFila = (typeof CODIGOS_ERROR_FILA)[number];
export type CodigoErrorDominio =
  | CodigoErrorFila
  | "CONTRATO_INVALIDO"
  | "CONFIGURACION_INVALIDA"
  | "REQUIERE_REPROCESO";
export const CODIGOS_WARNING = ["HORAS_EXTREMAS"] as const;

/** El motor lanza este error; nunca fabrica un nivel para representar un fallo. */
export class ErrorDominio extends Error {
  readonly codigo: CodigoErrorDominio;
  readonly detalles: ErrorCampo[];

  constructor(
    codigo: CodigoErrorDominio,
    mensaje: string,
    detalles: ErrorCampo[] = [],
  ) {
    super(mensaje);
    this.name = "ErrorDominio";
    this.codigo = codigo;
    this.detalles = detalles;
  }

  toApiError(): ApiError {
    return {
      error: {
        codigo: this.codigo,
        mensaje: this.message,
        detalles: this.detalles,
      },
    };
  }
}
