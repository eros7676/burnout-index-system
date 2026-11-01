import type {
  ApiError,
  ErrorValidacionImportacion,
  JobDTO,
  ResultadoCancelacion,
  ResultadoImportacion,
  VistaPrevia,
} from "../shared/contracts";

export class ErrorImportacionHttp extends Error {
  constructor(
    public status: number,
    public detalle: ApiError,
    public vistaPrevia?: VistaPrevia,
  ) {
    super(detalle.error.mensaje);
  }
}

async function solicitar<T>(ruta: string, opciones?: RequestInit): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, { ...opciones, cache: "no-store" });
  } catch {
    throw new Error(
      "Se perdió la conexión. La operación puede haber llegado al servidor; recuperá su estado antes de iniciar otra carga.",
    );
  }
  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    throw new Error(
      "El servidor no devolvió una respuesta JSON válida. Consultá o recuperá la operación antes de repetirla.",
    );
  }
  if (!respuesta.ok) {
    const cuerpo = datos as ApiError & Partial<ErrorValidacionImportacion>;
    throw new ErrorImportacionHttp(
      respuesta.status,
      cuerpo.error
        ? cuerpo
        : {
            error: {
              codigo: "HTTP",
              mensaje: `Error HTTP ${respuesta.status}.`,
              detalles: [],
            },
          },
      cuerpo.vistaPrevia,
    );
  }
  return datos as T;
}

const jsonPost = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
};
export const importacionesApi = {
  validar(file: File) {
    const body = new FormData();
    body.append("file", file);
    return solicitar<VistaPrevia>("/api/importaciones/validar", {
      method: "POST",
      body,
    });
  },
  confirmar: (id: string) =>
    solicitar<ResultadoImportacion>(
      `/api/importaciones/${encodeURIComponent(id)}/confirmar`,
      jsonPost,
    ),
  cancelar: (id: string) =>
    solicitar<ResultadoCancelacion>(
      `/api/importaciones/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  consultar: (id: string) =>
    solicitar<JobDTO>(`/api/procesamientos/${encodeURIComponent(id)}`),
  reintentar: (id: string) =>
    solicitar<JobDTO>(
      `/api/procesamientos/${encodeURIComponent(id)}/reintentar`,
      jsonPost,
    ),
};
