// Contrato del prototipo. Fuente: DOCUMENTACION, pestaña «Contratos y pruebas».
// Estos tipos no validan datos en ejecución; CU01 y CU02 deben hacerlo en servidor.
export type FechaISO = string; // YYYY-MM-DD validado en servidor
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
  canal: 'INTERNO' | 'SIMULADO';
  estadoEnvio: 'NO_APLICA' | 'PENDIENTE' | 'ENVIADO'
    | 'FALLIDO' | 'SIN_DESTINATARIO';
  createdAt: string;
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
// FilaTablero usa indice/nivel null solo cuando no hay evaluación; Evaluacion siempre tiene índice numérico. processingState describe ese par, no todos los pares del job: uno ya completado sigue COMPLETADO aunque falle otro. actualizado compara datos, antecedente, reglas y engineVersion esperados con el snapshot vigente. Si es false, señalar pendiente/fallo y no presentar el nivel anterior como actualizado; el detalle histórico sí puede conservarlo identificado.
