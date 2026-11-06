// Contrato del prototipo. Fuente: DOCUMENTACION, pestaña «Contratos y pruebas».
// Estos tipos no validan datos en ejecución; CU01 y CU02 deben hacerlo en servidor.
import type { CambioAuditoria, EntidadAuditoria } from "./auditoria-catalogo";
import type {
  FiltroSeguimiento,
  ResumenSeguimiento,
} from "./contratos/seguimiento";

export type FechaISO = string; // YYYY-MM-DD validado en servidor
export type UsuarioDemoDTO = {
  userId: string; nombre: string;
  rol: 'RRHH' | 'GERENCIA' | 'TEAM_LEAD' | 'EMPLEADO';
  employeeId: string | null; teamId: string | null;
};
export type SesionDemoDTO = {
  usuario: UsuarioDemoDTO | null;
  usuarios: readonly UsuarioDemoDTO[];
  /** How an alert's notice leaves: real mail when the server has SMTP configured, simulated otherwise. */
  correo: "REAL" | "SIMULADO";
};
export type ResultadoAuditoria = 'EXITO' | 'FALLO' | 'DENEGADO';
export type OrigenAuditoria = 'WEB' | 'CLI' | 'SISTEMA';
/** One audit event as the screens and the export read it (audit-trail §2.1). */
export type EventoAuditoria = {
  eventoId: string;
  accion: string;
  /** Catalog label of `accion`; null for a code the catalog no longer knows. */
  etiqueta: string | null;
  entidad: string;
  recursoId: string;
  /** The person whose data the event concerns. */
  sujetoId: string | null;
  actorId: string;
  /** Operator snapshot at event time; null on events written before the snapshot existed. */
  actorNombre: string | null;
  actorRol: string | null;
  origen: OrigenAuditoria | null;
  resultado: ResultadoAuditoria;
  /** Code from the closed reason catalog (MOTIVOS_AUDITORIA). */
  motivo: string | null;
  solicitudId: string | null;
  correlacionId: string | null;
  /** Changed fields only; never index values. */
  cambios: CambioAuditoria[] | null;
  justificacion: string | null;
  detalles: Record<string, unknown>;
  createdAt: string; // ISO UTC with milliseconds
  /** Resolved when read, never stored: null when not applicable or unknown. */
  recursoNombre: string | null;
  sujetoNombre: string | null;
};
export type FiltrosAuditoria = {
  accion?: string; entidad?: EntidadAuditoria;
  recursoId?: string; sujetoId?: string; actorId?: string;
  correlacionId?: string; solicitudId?: string;
  /** Exact code of a resource, person, operation or request. */
  q?: string;
  resultado?: ResultadoAuditoria; origen?: OrigenAuditoria;
  /** "1" includes consultations, which are hidden by default. */
  consultas?: '1';
  desde?: string; hasta?: string;
  /** Opaque position returned as `siguiente` by the previous page. */
  cursor?: string; pageSize?: number;
};
export type PaginaAuditoria = {
  items: EventoAuditoria[];
  /** Matching events, counted up to AUDITORIA_LIMITES.conteoMaximo. */
  total: number;
  totalAcotado: boolean;
  pageSize: number;
  /** Cursor of the next page; null on the last one. */
  siguiente: string | null;
  /** Consultations left out of this page because `consultas` is off. */
  consultasOcultas: number;
};
export type Factor = 'HE' | 'DS' | 'CT' | 'VP';
export type Nivel = 'BAJO' | 'MEDIO' | 'ALTO' | 'INCOMPLETO';
export type EstadoJob =
  'PENDIENTE' | 'PROCESANDO' | 'COMPLETADO' | 'FALLIDO';
export type ParPeriodo = {
  employeeId: string;
  periodStart: FechaISO;
  periodEnd: FechaISO;
};
export type DatosLaborales = ParPeriodo & {
  horasExtra: number;
  diasConsecutivosSinDescanso: number;
  tareasActivas: number;
  tareasPendientes: number;
  tareasVencidas: number;
  vacacionesPendientesDias: number;
  horasTrabajadas: number | null;
  diasDesdeUltimasVacaciones: number | null;
};
export type RegistroLaboral = DatosLaborales & {
  recordId: string;
  sourceImportId: string;
  dataVersion: number;
  fingerprint: string;
};
export type ConfiguracionIndice = {
  version: string;
  effectiveFrom: FechaISO;
  windowDays: 7;
  persistencePeriods: 2;
  weights: Record<Factor, number>;
  thresholds: Record<Factor, number>;
  mediumLimit: number;
  highLimit: number;
  minExceededFactors: 2 | 3 | 4;
  createdBy: string;
  createdAt: string; // ISO UTC
};
export type Persistencia = {
  anterior: null | {
    periodo: ParPeriodo;
    indice: number;
    excedidas: Factor[];
    dataFingerprint: string;
  };
  comunesExcedidas: Factor[];
  cumple: boolean;
  motivo: 'HISTORIAL_INSUFICIENTE'
    | 'NO_SOSTENIDO' | 'SOSTENIDO';
};
export type Calculo = {
  indice: number;
  nivel: Nivel;
  indicadores: Record<Factor, number>;
  scores: Record<Factor, number>;
  contribuciones: Record<Factor, number>;
  ranking: Factor[];
  excedidas: Factor[];
  persistencia: Persistencia;
};
export type Evaluacion = Calculo & ParPeriodo & {
  evaluationId: string;
  rulesVersion: string;
  engineVersion: 'cu02-v1';
  processingFingerprint: string;
  snapshot: {
    actual: RegistroLaboral;
    anterior: RegistroLaboral | null;
    reglas: ConfiguracionIndice;
  };
  supersedesEvaluationId: string | null;
  vigente: boolean;
  createdAt: string;
};
export type Alerta = {
  alertId: string;
  evaluationId: string;
  employeeId: string;
  destinatarioId: string | null;
  motivoDestinatario: 'OK' | 'SIN_DESTINATARIO';
  causas: Factor[];
  sugerencias: string[];
  vigencia: 'ACTIVA' | 'SUPERADA';
  canal: 'INTERNO' | 'SIMULADO' | 'CORREO';
  estadoEnvio: 'NO_APLICA' | 'PENDIENTE' | 'ENVIADO'
    | 'FALLIDO' | 'SIN_DESTINATARIO';
  createdAt: string;
};
/** An alert with the names and week a screen needs, so it never fetches the people list (D10). */
export type AlertaListada = Alerta & {
  persona: {
    nombre: string;
    equipo: string;
    teamId: string;
    tipo: 'TECNICO' | 'TEAM_LEAD';
  } | null;
  /** Name of the recipient (Gerencia is not a person of the catalog's teams). */
  destinatario: string | null;
  /** The week the alert belongs to, with its stored result. */
  semana: {
    periodStart: FechaISO;
    periodEnd: FechaISO;
    nivel: Nivel | null;
    indice: number | null;
    actualizado: boolean;
  } | null;
  /** The person's weeks up to this one, oldest first (the eight-week strip). */
  serie: {
    periodStart: FechaISO;
    periodEnd: FechaISO;
    nivel: Nivel | null;
    indice: number | null;
    actualizado: boolean;
  }[];
  seguimiento: ResumenSeguimiento | null;
};
export type PaginaAlertas = Pagina<AlertaListada> & {
  /** Distinct people across every page of the filtered list (one person may have several alert-weeks). */
  personas: number;
  /** Teams to filter by, within the viewer's scope. */
  equipos: { teamId: string; nombre: string }[];
};
/** P1: historial de simulación; nunca representa entrega de correo real. */
export type ResultadoSimulado = "EXITO" | "FALLO";
export type IntentoNotificacion = {
  intentoId: string;
  alertId: string;
  requestId: string;
  numero: number;
  destinatarioId: string | null;
  resultado: ResultadoSimulado;
  /** SIMULADO, or CORREO when the attempt sent (or tried to send) real mail. */
  canal: "SIMULADO" | "CORREO";
  estado: "PENDIENTE" | "ENVIADO" | "FALLIDO" | "SIN_DESTINATARIO";
  detalle: string | null;
  createdAt: string;
  completedAt: string | null;
};
export type SolicitudNotificacion = {
  requestId: string;
  resultado: ResultadoSimulado;
};
// Reglas adicionales: vigente es un puntero por empleado/semana, no por rulesVersion; conservar versiones anteriores. anterior en Persistencia contiene el cálculo numérico con las reglas de la semana actual. cumple se refiere a las condiciones de ALTO (dos índices y factores comunes); motivo=NO_SOSTENIDO si hay anterior pero no se cumplen todas. Lista vacía de excedidas no es un dato faltante.
export type ErrorCampo = {
  fila: number | null; // encabezado=1, primera fila=2
  campo: string | null; // nombre CSV si corresponde
  codigo: string;
  detalle: string;
};
export type VistaPrevia = {
  importId: string;
  status: 'VALIDADA' | 'RECHAZADA';
  expiresAt: string;
  totalFilas: number;
  nuevas: number;
  omitidas: number;
  muestra: DatosLaborales[]; // primeras 10 válidas
  errores: ErrorCampo[];
  warnings: ErrorCampo[];
};
export type JobDTO = {
  jobId: string;
  estado: EstadoJob;
  totalPares: number;
  completados: number;
  errores: { par: ParPeriodo; codigo: string;
    detalle: string }[];
  updatedAt: string;
};
export type ResultadoImportacion = {
  importId: string;
  status: 'CONFIRMADA';
  insertados: number;
  omitidos: number;
  afectados: ParPeriodo[]; // nuevos y sucesores existentes
  procesamiento: JobDTO | null; // null si no hay afectados
};
export type FactorInforme = {
  codigo: Factor;
  valor: number;
  umbral: number;
  score: number;
  contribucion: number;
  excedido: boolean;
};
export type InformeDTO = {
  evaluacion: Evaluacion;
  empleado: { employeeId: string; nombre: string;
    teamId: string; tipo: 'TECNICO' | 'TEAM_LEAD' };
  factores: FactorInforme[]; // orden de ranking
  explicacion: string;
  recomendaciones: string[];
  alerta: Alerta | null;
  /** Days away in the evaluated week; null when its record has no day detail. */
  ausencias: AusenciasSemana | null;
};
export type FilaTablero = ParPeriodo & {
  teamId: string;
  nombre: string;
  processingState: EstadoJob;
  actualizado: boolean;
  evaluationId: string | null;
  indice: number | null;
  nivel: Nivel | null;
  alertId: string | null;
};
export type ResumenDTO = {
  totalEvaluaciones: number;
  conteo: Record<Nivel, number>;
  porcentajes: Record<Nivel, number>;
  noProcesados: number;
  promedioIndice: number | null;
  muestraPromedio: number;
  /** Per factor, how many current results exceed its threshold (of `totalEvaluaciones`). */
  excedidas: Record<Factor, number>;
};
export type Pagina<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export type ApiError = {
  error: { codigo: string; mensaje: string;
    detalles: ErrorCampo[] };
};

export type ResultadoCancelacion = { importId: string; status: 'CANCELADA' };
/** Único caso HTTP con vista previa además del error común (422). */
export type ErrorValidacionImportacion = { vistaPrevia: VistaPrevia; error: ApiError['error'] };
export type FiltrosComunes = { employeeId?: string; teamId?: string; periodStart?: FechaISO };
export type Paginacion = { page?: number; pageSize?: number };
export type FiltrosEvaluaciones = FiltrosComunes & Paginacion & { nivel?: Nivel };
export type FiltrosAlertas = FiltrosComunes &
  Paginacion & {
    /** Status of the follow-up case the alert belongs to, or none. */
    seguimiento?: FiltroSeguimiento;
    /** userId of the case owner. */
    asignadoA?: string;
    /** Only cases past their due date. */
    vencido?: "1";
    /** Only alerts addressed to the viewer: those they may open and manage (Team Lead, Gerencia). */
    dirigidas?: "1";
  };
// FilaTablero usa indice/nivel null solo cuando no hay evaluación; Evaluacion siempre tiene índice numérico. processingState describe ese par, no todos los pares del job: uno ya completado sigue COMPLETADO aunque falle otro. actualizado compara datos, antecedente, reglas y engineVersion esperados con el snapshot vigente. Si es false, señalar pendiente/fallo y no presentar el nivel anterior como actualizado; el detalle histórico sí puede conservarlo identificado.

/** One week of loaded work data, without any index: all the employee sees of themselves (RF10). */
export type DatosSemana = Omit<DatosLaborales, 'employeeId'>;
/** Days of a week on vacation and on other leave, from its day detail (jornadas-v1). */
export type AusenciasSemana = { vacaciones: number; licencias: number };
/** One week of a person: loaded data plus its current evaluation, with FilaTablero's vigencia rules. */
export type SemanaPersona = DatosSemana & {
  actualizado: boolean;
  processingState: EstadoJob;
  evaluationId: string | null;
  indice: number | null;
  nivel: Nivel | null;
  alertId: string | null;
  /** null: the week has no day detail, so whether the person was away is unknown. The index never
   * discounts these days (v1 weighs only the vacation balance); they are shown so a level is read
   * knowing the person was away. */
  ausencias: AusenciasSemana | null;
};
export type PersonaDTO = {
  employeeId: string; nombre: string;
  tipo: 'TECNICO' | 'TEAM_LEAD';
  teamId: string; equipo: string; responsable: string | null;
  semanas: SemanaPersona[]; // most recent first
};
export type PersonasDTO = { items: PersonaDTO[]; semanas: FechaISO[] };
export type MisDatosDTO = { nombre: string; equipo: string | null; semanas: DatosSemana[] };
export type ReglasDTO = {
  vigente: ConfiguracionIndice;
  versiones: { version: string; effectiveFrom: FechaISO; createdAt: string }[];
};
