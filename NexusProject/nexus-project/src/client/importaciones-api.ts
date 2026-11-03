import type {
  ApiError,
  ErrorValidacionImportacion,
  JobDTO,
  ResultadoCancelacion,
  ResultadoImportacion,
  VistaPrevia,
} from "../shared/contracts";
import type {
  PlantillaImportacion,
  ResultadoImportacionTareas,
  VistaPreviaTareas,
} from "../shared/contratos/importaciones";

export class ErrorImportacionHttp extends Error {
  constructor(
    public status: number,
    public detalle: ApiError,
    public vistaPrevia?: VistaPrevia | VistaPreviaTareas,
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
      "Se perdió la conexión. Es posible que la operación haya llegado al servidor: recupere su estado antes de iniciar otra importación.",
    );
  }
  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    throw new Error(
      "El servidor devolvió una respuesta inesperada. Consulte o recupere la operación antes de repetirla.",
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
              mensaje: `No se pudo completar la solicitud (código ${respuesta.status}). Inténtelo nuevamente.`,
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
const archivo = (file: File) => {
  const body = new FormData();
  body.append("file", file);
  return { method: "POST", body };
};

/** Where the browser downloads the template of a dataset (a CSV with a header and an example). */
export const rutaPlantilla = (tipo: PlantillaImportacion) =>
  `/api/importaciones/plantillas/${tipo}`;

export const importacionesApi = {
  validar: (file: File) =>
    solicitar<VistaPrevia>("/api/importaciones/validar", archivo(file)),
  validarTareas: (file: File) =>
    solicitar<VistaPreviaTareas>(
      "/api/importaciones/tareas/validar",
      archivo(file),
    ),
  confirmar: (id: string) =>
    solicitar<ResultadoImportacion | ResultadoImportacionTareas>(
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
