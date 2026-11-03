import type {
  Alerta,
  UsuarioDemoDTO,
  SesionDemoDTO,
  EventoAuditoria,
  FiltrosAuditoria,
  ApiError,
  ErrorValidacionImportacion,
  FilaTablero,
  FiltrosAlertas,
  FiltrosComunes,
  FiltrosEvaluaciones,
  InformeDTO,
  IntentoNotificacion,
  SolicitudNotificacion,
  JobDTO,
  Pagina,
  ResultadoCancelacion,
  ResultadoImportacion,
  ResumenDTO,
  VistaPrevia,
  PersonasDTO,
  MisDatosDTO,
  ReglasDTO,
} from "./contracts";
import {
  RUTAS_ORGANIZACION,
  type CuerposOrganizacion,
  type PeticionesOrganizacion,
} from "./contratos/organizacion";
import {
  RUTAS_IMPORTACIONES,
  type CuerposImportaciones,
  type PeticionesImportaciones,
} from "./contratos/importaciones";
import {
  RUTAS_TAREAS,
  type CuerposTareas,
  type PeticionesTareas,
} from "./contratos/tareas";
import {
  RUTAS_REGLAS,
  type CuerposReglas,
  type PeticionesReglas,
} from "./contratos/reglas";
import {
  RUTAS_AUDITORIA,
  type CuerposAuditoria,
  type PeticionesAuditoria,
} from "./contratos/auditoria";
import {
  RUTAS_SEGUIMIENTO,
  type CuerposSeguimiento,
  type PeticionesSeguimiento,
} from "./contratos/seguimiento";
import {
  RUTAS_EXPORTACIONES,
  type CuerposExportaciones,
  type PeticionesExportaciones,
} from "./contratos/exportaciones";

/** Agreed catalog; each entry is served by a Route Handler under src/app/api. */
export const API_ROUTES = {
  consultarSesionDemo: { method: "GET", path: "/api/demo/sesion" },
  seleccionarUsuarioDemo: { method: "POST", path: "/api/demo/sesion" },
  listarAuditoria: { method: "GET", path: "/api/auditoria" },
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
  listarNotificaciones: {
    method: "GET",
    path: "/api/alertas/{alertId}/notificaciones",
  },
  prepararNotificacion: {
    method: "POST",
    path: "/api/alertas/{alertId}/notificaciones",
  },
  procesarNotificacion: {
    method: "POST",
    path: "/api/alertas/{alertId}/notificaciones/{intentoId}/procesar",
  },
  listarPersonas: { method: "GET", path: "/api/personas" },
  consultarMisDatos: { method: "GET", path: "/api/mis-datos" },
  consultarReglas: { method: "GET", path: "/api/reglas" },
  ...RUTAS_ORGANIZACION,
  ...RUTAS_IMPORTACIONES,
  ...RUTAS_TAREAS,
  ...RUTAS_REGLAS,
  ...RUTAS_AUDITORIA,
  ...RUTAS_SEGUIMIENTO,
  ...RUTAS_EXPORTACIONES,
} as const;

type CuerpoVacio = Record<string, never>;
/** File se envía como campo `file` de multipart/form-data, nunca como JSON. */
export type PeticionesApi = {
  consultarSesionDemo: { body?: undefined };
  seleccionarUsuarioDemo: { body: { userId: string } };
  listarAuditoria: { query?: FiltrosAuditoria; body?: undefined };
  validarImportacion: { file: File };
  confirmarImportacion: { params: { id: string }; body: CuerpoVacio };
  cancelarImportacion: { params: { id: string }; body?: undefined };
  consultarProcesamiento: { params: { jobId: string }; body?: undefined };
  reintentarProcesamiento: { params: { jobId: string }; body: CuerpoVacio };
  listarEvaluaciones: { query?: FiltrosEvaluaciones; body?: undefined };
  obtenerInforme: { params: { evaluationId: string }; body?: undefined };
  obtenerResumen: { query?: FiltrosComunes; body?: undefined };
  listarAlertas: { query?: FiltrosAlertas; body?: undefined };
  listarNotificaciones: { params: { alertId: string }; body?: undefined };
  prepararNotificacion: {
    params: { alertId: string };
    body: SolicitudNotificacion;
  };
  procesarNotificacion: {
    params: { alertId: string; intentoId: string };
    body?: undefined;
  };
  listarPersonas: {
    query?: Pick<FiltrosComunes, "employeeId" | "teamId">;
    body?: undefined;
  };
  consultarMisDatos: { body?: undefined };
  consultarReglas: { body?: undefined };
} &
  PeticionesOrganizacion &
  PeticionesImportaciones &
  PeticionesTareas &
  PeticionesReglas &
  PeticionesAuditoria &
  PeticionesSeguimiento &
  PeticionesExportaciones;
export type CuerposExito = {
  consultarSesionDemo: SesionDemoDTO;
  seleccionarUsuarioDemo: { usuario: UsuarioDemoDTO };
  listarAuditoria: Pagina<EventoAuditoria>;
  validarImportacion: VistaPrevia;
  confirmarImportacion: ResultadoImportacion;
  cancelarImportacion: ResultadoCancelacion;
  consultarProcesamiento: JobDTO;
  reintentarProcesamiento: JobDTO;
  listarEvaluaciones: Pagina<FilaTablero>;
  obtenerInforme: InformeDTO;
  obtenerResumen: ResumenDTO;
  listarAlertas: Pagina<Alerta>;
  listarNotificaciones: IntentoNotificacion[];
  prepararNotificacion: IntentoNotificacion;
  procesarNotificacion: IntentoNotificacion;
  listarPersonas: PersonasDTO;
  consultarMisDatos: MisDatosDTO;
  consultarReglas: ReglasDTO;
} &
  CuerposOrganizacion &
  CuerposImportaciones &
  CuerposTareas &
  CuerposReglas &
  CuerposAuditoria &
  CuerposSeguimiento &
  CuerposExportaciones;
export type OperacionApi = keyof typeof API_ROUTES;
export type EstadoErrorHttp =
  400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 422 | 500;
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
  401: "Sesión demo ausente o inválida",
  403: "Operación o equipo sin permiso",
  400: "Petición o formato inválido",
  404: "Identificador inexistente",
  409: "Conflicto o estado incompatible",
  410: "Vista previa vencida",
  413: "Archivo demasiado grande",
  415: "Formato distinto de CSV",
  422: "Filas o configuración inválidas",
  500: "Error inesperado",
} as const satisfies Record<EstadoErrorHttp, string>;
