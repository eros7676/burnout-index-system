import type { EstadoErrorHttp } from "../../shared/api";
import type { ApiError, ErrorCampo } from "../../shared/contracts";

/** Errores de CU01/HTTP sin ampliar el catálogo de errores del motor CU02. */
export class ErrorImportacion extends Error {
  constructor(
    readonly estadoHttp: EstadoErrorHttp,
    readonly codigo: string,
    mensaje: string,
    readonly detalles: ErrorCampo[] = [],
  ) {
    super(mensaje);
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
