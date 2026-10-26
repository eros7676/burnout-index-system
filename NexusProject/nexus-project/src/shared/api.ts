import type {
  Alerta,
  ApiError,
  ErrorValidacionImportacion,
  FilaTablero,
  FiltrosAlertas,
  FiltrosComunes,
  FiltrosEvaluaciones,
  InformeDTO,
  JobDTO,
  Pagina,
  ResultadoCancelacion,
  ResultadoImportacion,
  ResumenDTO,
  VistaPrevia,
} from "./contracts";

/** Catálogo acordado; no implica que existan Route Handlers. */
export const API_ROUTES = {
  validarImportacion: { method: "POST", path: "/api/importaciones/validar" },
  confirmarImportacion: {
    method: "POST",
    path: "/api/importaciones/{id}/confirmar",
  },
  cancelarImportacion: { method: "DELETE", path: "/api/importaciones/{id}" },
  consultarProcesamiento: {
    method: "GET",
    path: "/api/procesamientos/{jobId}",
  },
  reintentarProcesamiento: {
    method: "POST",
    path: "/api/procesamientos/{jobId}/reintentar",
  },
  listarEvaluaciones: { method: "GET", path: "/api/evaluaciones" },
  obtenerInforme: { method: "GET", path: "/api/evaluaciones/{evaluationId}" },
  obtenerResumen: { method: "GET", path: "/api/resumen" },
  listarAlertas: { method: "GET", path: "/api/alertas" },
} as const;

type CuerpoVacio = Record<string, never>;
/** File se envía como campo `file` de multipart/form-data, nunca como JSON. */
export type PeticionesApi = {
  validarImportacion: { file: File };
  confirmarImportacion: { params: { id: string }; body: CuerpoVacio };
  cancelarImportacion: { params: { id: string }; body?: undefined };
  consultarProcesamiento: { params: { jobId: string }; body?: undefined };
  reintentarProcesamiento: { params: { jobId: string }; body: CuerpoVacio };
  listarEvaluaciones: { query?: FiltrosEvaluaciones; body?: undefined };
  obtenerInforme: { params: { evaluationId: string }; body?: undefined };
  obtenerResumen: { query?: FiltrosComunes; body?: undefined };
  listarAlertas: { query?: FiltrosAlertas; body?: undefined };
};
export type CuerposExito = {
  validarImportacion: VistaPrevia;
  confirmarImportacion: ResultadoImportacion;
  cancelarImportacion: ResultadoCancelacion;
  consultarProcesamiento: JobDTO;
  reintentarProcesamiento: JobDTO;
  listarEvaluaciones: Pagina<FilaTablero>;
  obtenerInforme: InformeDTO;
  obtenerResumen: ResumenDTO;
  listarAlertas: Pagina<Alerta>;
};
export type OperacionApi = keyof typeof API_ROUTES;
export type EstadoErrorHttp = 400 | 404 | 409 | 410 | 413 | 415 | 422 | 500;
export type RespuestaApi<K extends OperacionApi> =
  | { status: 200; body: CuerposExito[K] }
  | { status: Exclude<EstadoErrorHttp, 422>; body: ApiError }
  | {
      status: 422;
      body: K extends "validarImportacion"
        ? ErrorValidacionImportacion
        : ApiError;
    };

export const API_DEFAULTS = {
  page: 1,
  pageSize: 50,
  maxPageSize: 100,
} as const;
export const HTTP_ERRORS = {
  400: "Petición o formato inválido",
  404: "Identificador inexistente",
  409: "Conflicto o estado incompatible",
  410: "Vista previa vencida",
  413: "Archivo demasiado grande",
  415: "Formato distinto de CSV",
  422: "Filas o configuración inválidas",
  500: "Error inesperado",
} as const satisfies Record<EstadoErrorHttp, string>;
