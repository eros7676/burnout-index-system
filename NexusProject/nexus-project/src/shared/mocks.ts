import type { CuerposExito, OperacionApi, RespuestaApi } from "./api";
import type {
  Alerta,
  ConfiguracionIndice,
  Evaluacion,
  FilaTablero,
  InformeDTO,
  JobDTO,
  RegistroLaboral,
  ResultadoImportacion,
  ResumenDTO,
  VistaPrevia,
} from "./contracts";
import { ErrorDominio } from "./errors";

/** Datos fijos para desarrollar consumidores. No son seed, motor ni API real. */
const createdAt = "2026-10-19T12:00:00.000Z";
const factores = ["HE", "DS", "CT", "VP"] as const;
const recomendaciones = [
  "Revisar las horas extra.",
  "Revisar los descansos.",
  "Revisar pendientes y vencimientos.",
  "Planificar el saldo de vacaciones.",
];

export const reglasMock: ConfiguracionIndice = {
  version: "v1",
  effectiveFrom: "2026-01-05",
  windowDays: 7,
  persistencePeriods: 2,
  weights: { HE: 0.3, DS: 0.3, CT: 0.25, VP: 0.15 },
  thresholds: { HE: 8, DS: 6, CT: 0.35, VP: 10 },
  mediumLimit: 40,
  highLimit: 70,
  minExceededFactors: 2,
  createdBy: "demo-local",
  createdAt,
};
export const registroAnteriorMock: RegistroLaboral = {
  employeeId: "EMP-001",
  periodStart: "2026-10-05",
  periodEnd: "2026-10-11",
  horasExtra: 16,
  diasConsecutivosSinDescanso: 9,
  tareasActivas: 10,
  tareasPendientes: 7,
  tareasVencidas: 5,
  vacacionesPendientesDias: 14,
  horasTrabajadas: 56,
  diasDesdeUltimasVacaciones: 120,
  recordId: "mock-record-1",
  sourceImportId: "mock-import-1",
  dataVersion: 1,
  fingerprint: "mock-data-1",
};
export const registroActualMock: RegistroLaboral = {
  ...registroAnteriorMock,
  periodStart: "2026-10-12",
  periodEnd: "2026-10-18",
  diasConsecutivosSinDescanso: 16,
  diasDesdeUltimasVacaciones: 127,
  recordId: "mock-record-2",
  fingerprint: "mock-data-2",
};

export const evaluacionIncompletaMock: Evaluacion = {
  employeeId: "EMP-001",
  periodStart: "2026-10-05",
  periodEnd: "2026-10-11",
  evaluationId: "mock-evaluation-1",
  rulesVersion: "v1",
  engineVersion: "cu02-v1",
  processingFingerprint: "mock-processing-1",
  indice: 83.71,
  nivel: "INCOMPLETO",
  indicadores: { HE: 16, DS: 9, CT: 0.58, VP: 14 },
  scores: { HE: 100, DS: 75, CT: 580 / 7, VP: 70 },
  contribuciones: { HE: 30, DS: 22.5, CT: 145 / 7, VP: 10.5 },
  ranking: [...factores],
  excedidas: [...factores],
  persistencia: {
    anterior: null,
    comunesExcedidas: [],
    cumple: false,
    motivo: "HISTORIAL_INSUFICIENTE",
  },
  snapshot: {
    actual: registroAnteriorMock,
    anterior: null,
    reglas: reglasMock,
  },
  supersedesEvaluationId: null,
  vigente: true,
  createdAt,
};
export const evaluacionAltaMock: Evaluacion = {
  ...evaluacionIncompletaMock,
  periodStart: "2026-10-12",
  periodEnd: "2026-10-18",
  evaluationId: "mock-evaluation-2",
  processingFingerprint: "mock-processing-2",
  indice: 91.21,
  nivel: "ALTO",
  indicadores: { HE: 16, DS: 16, CT: 0.58, VP: 14 },
  scores: { HE: 100, DS: 100, CT: 580 / 7, VP: 70 },
  contribuciones: { HE: 30, DS: 30, CT: 145 / 7, VP: 10.5 },
  persistencia: {
    anterior: {
      periodo: {
        employeeId: "EMP-001",
        periodStart: "2026-10-05",
        periodEnd: "2026-10-11",
      },
      indice: 83.71,
      excedidas: [...factores],
      dataFingerprint: registroAnteriorMock.fingerprint,
    },
    comunesExcedidas: [...factores],
    cumple: true,
    motivo: "SOSTENIDO",
  },
  snapshot: {
    actual: registroActualMock,
    anterior: registroAnteriorMock,
    reglas: reglasMock,
  },
};
export const alertaMock: Alerta = {
  alertId: "mock-alert-1",
  evaluationId: evaluacionAltaMock.evaluationId,
  employeeId: "EMP-001",
  destinatarioId: "TL-01",
  motivoDestinatario: "OK",
  causas: [...factores],
  sugerencias: recomendaciones,
  vigencia: "ACTIVA",
  canal: "INTERNO",
  estadoEnvio: "NO_APLICA",
  createdAt,
};
export const informeMock: InformeDTO = {
  evaluacion: evaluacionAltaMock,
  empleado: {
    employeeId: "EMP-001",
    nombre: "Persona ficticia 001",
    teamId: "EQ-01",
    tipo: "TECNICO",
  },
  factores: factores.map((codigo) => ({
    codigo,
    valor: evaluacionAltaMock.indicadores[codigo],
    umbral: reglasMock.thresholds[codigo],
    score: evaluacionAltaMock.scores[codigo],
    contribucion: evaluacionAltaMock.contribuciones[codigo],
    excedido: true,
  })),
  explicacion:
    "91,21 puntos; dos semanas consecutivas ≥70 y cuatro factores comunes excedidos. Parámetros demostrativos; requiere revisión humana.",
  recomendaciones,
  alerta: alertaMock,
};
export const vistaPreviaMock: VistaPrevia = {
  importId: "mock-import-1",
  status: "VALIDADA",
  expiresAt: "2026-10-19T12:30:00.000Z",
  totalFilas: 2,
  nuevas: 2,
  omitidas: 0,
  muestra: [registroAnteriorMock, registroActualMock].map((r) => ({
    employeeId: r.employeeId,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    horasExtra: r.horasExtra,
    diasConsecutivosSinDescanso: r.diasConsecutivosSinDescanso,
    tareasActivas: r.tareasActivas,
    tareasPendientes: r.tareasPendientes,
    tareasVencidas: r.tareasVencidas,
    vacacionesPendientesDias: r.vacacionesPendientesDias,
    horasTrabajadas: r.horasTrabajadas,
    diasDesdeUltimasVacaciones: r.diasDesdeUltimasVacaciones,
  })),
  errores: [],
  warnings: [],
};
export const jobMock: JobDTO = {
  jobId: "mock-job-1",
  estado: "COMPLETADO",
  totalPares: 2,
  completados: 2,
  errores: [],
  updatedAt: createdAt,
};
export const resultadoImportacionMock: ResultadoImportacion = {
  importId: "mock-import-1",
  status: "CONFIRMADA",
  insertados: 2,
  omitidos: 0,
  afectados: [registroAnteriorMock, registroActualMock].map(
    ({ employeeId, periodStart, periodEnd }) => ({
      employeeId,
      periodStart,
      periodEnd,
    }),
  ),
  procesamiento: jobMock,
};
const filaAltaMock: FilaTablero = {
  employeeId: "EMP-001",
  teamId: "EQ-01",
  nombre: "Persona ficticia 001",
  periodStart: "2026-10-12",
  periodEnd: "2026-10-18",
  processingState: "COMPLETADO",
  actualizado: true,
  evaluationId: evaluacionAltaMock.evaluationId,
  indice: 91.21,
  nivel: "ALTO",
  alertId: alertaMock.alertId,
};
export const resumenMock: ResumenDTO = {
  totalEvaluaciones: 1,
  conteo: { BAJO: 0, MEDIO: 0, ALTO: 1, INCOMPLETO: 0 },
  porcentajes: { BAJO: 0, MEDIO: 0, ALTO: 100, INCOMPLETO: 0 },
  noProcesados: 0,
  promedioIndice: 91.21,
  muestraPromedio: 1,
};

/** Cada endpoint tiene un cuerpo de éxito comprobado contra el contrato común. */
export const cuerposExitoMock = {
  validarImportacion: vistaPreviaMock,
  confirmarImportacion: resultadoImportacionMock,
  cancelarImportacion: { importId: "mock-import-1", status: "CANCELADA" },
  consultarProcesamiento: jobMock,
  reintentarProcesamiento: jobMock,
  listarEvaluaciones: {
    items: [filaAltaMock],
    total: 1,
    page: 1,
    pageSize: 50,
  },
  obtenerInforme: informeMock,
  obtenerResumen: resumenMock,
  listarAlertas: { items: [alertaMock], total: 1, page: 1, pageSize: 50 },
} satisfies CuerposExito;

/** Copia aislada por consumidor; no hace fetch ni conserva estado. */
export function crearRespuestaMock<K extends OperacionApi>(
  operacion: K,
): RespuestaApi<K> {
  return { status: 200, body: structuredClone(cuerposExitoMock[operacion]) };
}

const errorFila = {
  fila: 2,
  campo: "horas_extra",
  codigo: "OBLIGATORIO",
  detalle: "Falta horas_extra.",
};
export const validacionRechazadaMock = {
  status: 422,
  body: {
    vistaPrevia: {
      ...vistaPreviaMock,
      status: "RECHAZADA",
      nuevas: 0,
      muestra: [],
      errores: [errorFila],
    },
    error: {
      codigo: "VALIDACION_INVALIDA",
      mensaje: "El lote contiene errores.",
      detalles: [errorFila],
    },
  },
} satisfies RespuestaApi<"validarImportacion">;

/** HTTP 200 confirma la carga aunque su procesamiento haya fallado. */
export const confirmacionFallidaMock = {
  status: 200,
  body: {
    ...resultadoImportacionMock,
    procesamiento: {
      ...jobMock,
      estado: "FALLIDO",
      completados: 1,
      errores: [
        {
          par: resultadoImportacionMock.afectados[1],
          codigo: "ERROR_ALERTA",
          detalle: "Fallo simulado al guardar alerta.",
        },
      ],
    },
  },
} satisfies RespuestaApi<"confirmarImportacion">;
export const importacionRepetidaMock: ResultadoImportacion = {
  ...resultadoImportacionMock,
  importId: "mock-import-2",
  insertados: 0,
  omitidos: 2,
  afectados: [],
  procesamiento: null,
};

/** Escenarios de presentación independientes, no evaluaciones calculadas por T07. */
export const filasEscenarioMock: FilaTablero[] = [
  filaAltaMock,
  {
    ...filaAltaMock,
    periodStart: "2026-10-05",
    periodEnd: "2026-10-11",
    evaluationId: "mock-evaluation-1",
    indice: 83.71,
    nivel: "INCOMPLETO",
    alertId: null,
  },
  {
    ...filaAltaMock,
    employeeId: "EMP-002",
    nombre: "Persona ficticia 002",
    evaluationId: "mock-evaluation-low",
    indice: 0,
    nivel: "BAJO",
    alertId: null,
  },
  {
    ...filaAltaMock,
    employeeId: "EMP-003",
    nombre: "Persona ficticia 003",
    evaluationId: "mock-evaluation-medium",
    indice: 48.93,
    nivel: "MEDIO",
    alertId: null,
  },
  {
    ...filaAltaMock,
    employeeId: "EMP-004",
    nombre: "Persona ficticia 004",
    processingState: "PENDIENTE",
    actualizado: false,
    evaluationId: null,
    indice: null,
    nivel: null,
    alertId: null,
  },
  {
    ...filaAltaMock,
    employeeId: "EMP-005",
    nombre: "Persona ficticia 005",
    processingState: "FALLIDO",
    actualizado: false,
    evaluationId: null,
    indice: null,
    nivel: null,
    alertId: null,
  },
];
export const resumenVacioMock: ResumenDTO = {
  totalEvaluaciones: 0,
  conteo: { BAJO: 0, MEDIO: 0, ALTO: 0, INCOMPLETO: 0 },
  porcentajes: { BAJO: 0, MEDIO: 0, ALTO: 0, INCOMPLETO: 0 },
  noProcesados: 0,
  promedioIndice: null,
  muestraPromedio: 0,
};
export const errorContratoMock = new ErrorDominio(
  "CONTRATO_INVALIDO",
  "Registro inválido.",
).toApiError();
