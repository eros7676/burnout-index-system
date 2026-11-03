// The organization endpoints as the screens call them. Failures become an `ErrorApi` that keeps
// the field errors of the response, so a form can show each one next to its control.
import type { ErrorCampo } from "@/shared/contracts";
import {
  RUTAS_ORGANIZACION as RUTAS,
  type CuerposOrganizacion,
  type FiltrosDirectorio,
  type PeticionesOrganizacion,
} from "@/shared/contratos/organizacion";

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly status = 0,
    readonly codigo = "",
    readonly detalles: ErrorCampo[] = [],
  ) {
    super(mensaje);
  }
}

type Operacion = keyof typeof RUTAS;
type Entrada = {
  params?: Record<string, string>;
  query?: object;
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
};

function ruta(
  operacion: Operacion,
  params: Entrada["params"],
  query: Entrada["query"],
) {
  let path: string = RUTAS[operacion].path;
  for (const [clave, valor] of Object.entries(params ?? {}))
    path = path.replace(`{${clave}}`, encodeURIComponent(valor));
  const filtros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(query ?? {}))
    if (valor !== undefined && valor !== "") filtros.set(clave, String(valor));
  return filtros.size ? `${path}?${filtros}` : path;
}

async function llamar<K extends Operacion>(
  operacion: K,
  { params, query, json, form, signal }: Entrada = {},
): Promise<CuerposOrganizacion[K]> {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta(operacion, params, query), {
      method: RUTAS[operacion].method,
      cache: "no-store",
      signal,
      ...(json !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(json),
          }
        : form
          ? { body: form }
          : {}),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ErrorApi(
      "No se pudo conectar. Revise la conexión e intente nuevamente.",
    );
  }
  let cuerpo;
  try {
    cuerpo = await respuesta.json();
  } catch {
    throw new ErrorApi(
      "El servidor no devolvió una respuesta válida. Intente nuevamente.",
      respuesta.status,
    );
  }
  if (!respuesta.ok)
    throw new ErrorApi(
      typeof cuerpo?.error?.mensaje === "string"
        ? cuerpo.error.mensaje
        : `Error HTTP ${respuesta.status}.`,
      respuesta.status,
      cuerpo?.error?.codigo,
      Array.isArray(cuerpo?.error?.detalles) ? cuerpo.error.detalles : [],
    );
  return cuerpo as CuerposOrganizacion[K];
}

type Cuerpo<K extends Operacion> = PeticionesOrganizacion[K] extends {
  body: infer B;
}
  ? B
  : never;
const archivo = (file: File, huella?: string) => {
  const form = new FormData();
  form.set("file", file);
  if (huella) form.set("huella", huella);
  return form;
};

export const organizacionApi = {
  directorio: (filtros: FiltrosDirectorio, signal: AbortSignal) =>
    llamar("listarDirectorioPersonas", { query: filtros, signal }),
  opcionesPersona: (signal: AbortSignal) =>
    llamar("consultarOpcionesPersona", { signal }),
  ficha: (employeeId: string, signal: AbortSignal, semanas?: number) =>
    llamar("obtenerFichaPersona", {
      params: { employeeId },
      query: { semanas },
      signal,
    }),
  crearPersona: (json: Cuerpo<"crearPersona">) =>
    llamar("crearPersona", { json }),
  editarPersona: (employeeId: string, json: Cuerpo<"editarPersona">) =>
    llamar("editarPersona", { params: { employeeId }, json }),
  cambiarAsignacion: (
    employeeId: string,
    json: Cuerpo<"cambiarAsignacionPersona">,
  ) => llamar("cambiarAsignacionPersona", { params: { employeeId }, json }),
  darDeBaja: (employeeId: string, json: Cuerpo<"darDeBajaPersona">) =>
    llamar("darDeBajaPersona", { params: { employeeId }, json }),
  validarImportacion: (file: File) =>
    llamar("validarImportacionPersonas", { form: archivo(file) }),
  confirmarImportacion: (file: File, huella: string) =>
    llamar("confirmarImportacionPersonas", { form: archivo(file, huella) }),
  equipos: (
    query: PeticionesOrganizacion["listarEquipos"]["query"],
    signal: AbortSignal,
  ) => llamar("listarEquipos", { query, signal }),
  opcionesEquipo: (signal: AbortSignal) =>
    llamar("consultarOpcionesEquipo", { signal }),
  equipo: (teamId: string, signal: AbortSignal, periodStart?: string) =>
    llamar("obtenerEquipo", {
      params: { teamId },
      query: { periodStart },
      signal,
    }),
  crearEquipo: (json: Cuerpo<"crearEquipo">) =>
    llamar("crearEquipo", { json }),
  editarEquipo: (teamId: string, json: Cuerpo<"editarEquipo">) =>
    llamar("editarEquipo", { params: { teamId }, json }),
  cambiarLider: (teamId: string, json: Cuerpo<"cambiarLiderEquipo">) =>
    llamar("cambiarLiderEquipo", { params: { teamId }, json }),
  desactivarEquipo: (teamId: string, json: Cuerpo<"desactivarEquipo">) =>
    llamar("desactivarEquipo", { params: { teamId }, json }),
};
