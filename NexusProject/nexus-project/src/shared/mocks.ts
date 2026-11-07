import type { CuerposExito, OperacionApi, RespuestaApi } from "./api";
import type {
  Alerta,
  AlertaListada,
  PaginaAlertas,
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
import { MOCKS_ORGANIZACION } from "./contratos/organizacion";
import { MOCKS_IMPORTACIONES } from "./contratos/importaciones";
import { MOCKS_TAREAS } from "./contratos/tareas";
import { MOCKS_JORNADAS } from "./contratos/jornadas";
import { MOCKS_REGLAS } from "./contratos/reglas";
import { MOCKS_AUDITORIA } from "./contratos/auditoria";
import { MOCKS_SEGUIMIENTO } from "./contratos/seguimiento";
import { MOCKS_EXPORTACIONES } from "./contratos/exportaciones";

/** Datos fijos para desarrollar consumidores. No son seed, motor ni API real. */
const createdAt = "2026-10-19T12:00:00.000Z";
const factores = ["HE", "DS", "CT", "VP"] as const;
// What recomendacionesDe writes for evaluacionAltaMock (tests/informes.test.ts holds the same lines).
const recomendaciones = [
  "Horas extra: 16 h extra en la semana, el doble del umbral (8 h); también lo superó la semana anterior (16 h). Evitar asignaciones adicionales y revisar qué tareas se pueden redistribuir.",
  "Días consecutivos sin descanso: 16 días seguidos sin descanso, más del doble del umbral (6 días); también lo superó la semana anterior (9 días). Evaluar un día de descanso en los próximos días.",
  "Carga de tareas: 7 tareas pendientes de 10 al cierre, 5 vencidas; la semana anterior, 7 de 10. Revisar la asignación y los vencimientos: reasignar tareas o acordar nuevas fechas.",
  "Vacaciones pendientes: 14 días de vacaciones pendientes, 4 días por encima del umbral (10 días); las últimas vacaciones fueron hace 127 días. Evaluar un descanso programado.",
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
export const alertaListadaMock: AlertaListada = {
  ...alertaMock,
  persona: {
    nombre: "Persona ficticia 001",
    equipo: "Célula ficticia 1",
    teamId: "EQ-01",
    tipo: "TECNICO",
  },
  destinatario: "Team Lead ficticio 1",
  semana: {
    periodStart: "2026-10-12",
    periodEnd: "2026-10-18",
    nivel: "ALTO",
    indice: 91.21,
    actualizado: true,
  },
  serie: [
    {
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      nivel: "INCOMPLETO",
      indice: 83.71,
      actualizado: true,
    },
    {
      periodStart: "2026-10-12",
      periodEnd: "2026-10-18",
      nivel: "ALTO",
      indice: 91.21,
      actualizado: true,
    },
  ],
  seguimiento: null,
};
export const paginaAlertasMock: PaginaAlertas = {
  items: [alertaListadaMock],
  total: 1,
  personas: 1,
  page: 1,
  pageSize: 50,
  equipos: [{ teamId: "EQ-01", nombre: "Célula ficticia 1" }],
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
  ausencias: null,
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
  excedidas: { HE: 1, DS: 1, CT: 1, VP: 1 },
};

/** Cada endpoint tiene un cuerpo de éxito comprobado contra el contrato común. */
export const intentoNotificacionMock = {
  intentoId: "mock-intento-1",
  alertId: alertaMock.alertId,
  requestId: "00000000-0000-4000-8000-000000000001",
  numero: 1,
  destinatarioId: "TL-01",
  resultado: "EXITO",
  canal: "SIMULADO",
  estado: "PENDIENTE",
  detalle: null,
  createdAt,
  completedAt: null,
} satisfies import("./contracts").IntentoNotificacion;
const semanaMock = {
  periodStart: filaAltaMock.periodStart,
  periodEnd: filaAltaMock.periodEnd,
  horasExtra: 16,
  diasConsecutivosSinDescanso: 16,
  tareasActivas: 10,
  tareasPendientes: 7,
  tareasVencidas: 5,
  vacacionesPendientesDias: 14,
  horasTrabajadas: 56,
  diasDesdeUltimasVacaciones: 127,
};
export const personaMock = {
  employeeId: filaAltaMock.employeeId,
  nombre: filaAltaMock.nombre,
  tipo: "TECNICO",
  teamId: filaAltaMock.teamId,
  equipo: "Célula ficticia 1",
  responsable: "Team Lead ficticio 1",
  semanas: [
    {
      ...semanaMock,
      actualizado: filaAltaMock.actualizado,
      processingState: filaAltaMock.processingState,
      evaluationId: filaAltaMock.evaluationId,
      indice: filaAltaMock.indice,
      nivel: filaAltaMock.nivel,
      alertId: filaAltaMock.alertId,
      ausencias: null,
    },
  ],
} satisfies import("./contracts").PersonaDTO;
/** The default demo company, as src/server/empresas.ts lists it (that module is server-only). */
export const empresaMock = {
  id: "conecta",
  nombre: "Conecta Servicios Técnicos",
  rubro: "Mantenimiento y redes",
  descripcion: "Cuadrillas de mantenimiento, fibra óptica y mesa de ayuda técnica.",
} satisfies import("./contracts").EmpresaDTO;
export const cuerposExitoMock = {
  consultarSesionDemo: {
    empresa: empresaMock,
    empresas: [empresaMock],
    usuario: null,
    usuarios: [],
    correo: "SIMULADO",
  },
  seleccionarUsuarioDemo: {
    usuario: {
      userId: "demo-rrhh",
      nombre: "RR. HH.",
      rol: "RRHH",
      employeeId: null,
      teamId: null,
    },
  },
  listarAuditoria: {
    items: [],
    total: 0,
    totalAcotado: false,
    pageSize: 50,
    siguiente: null,
    consultasOcultas: 0,
  },
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
  listarAlertas: paginaAlertasMock,
  obtenerAlerta: alertaListadaMock,
  listarNotificaciones: [intentoNotificacionMock],
  prepararNotificacion: intentoNotificacionMock,
  procesarNotificacion: {
    ...intentoNotificacionMock,
    estado: "ENVIADO",
    detalle: "Enviado (simulado).",
    completedAt: createdAt,
  },
  listarPersonas: { items: [personaMock], semanas: [filaAltaMock.periodStart] },
  consultarMisDatos: {
    nombre: filaAltaMock.nombre,
    equipo: "Célula ficticia 1",
    semanas: [semanaMock],
  },
  consultarReglas: {
    vigente: reglasMock,
    versiones: [
      {
        version: reglasMock.version,
        effectiveFrom: reglasMock.effectiveFrom,
        createdAt: reglasMock.createdAt,
      },
    ],
  },
  ...MOCKS_ORGANIZACION,
  ...MOCKS_IMPORTACIONES,
  ...MOCKS_TAREAS,
  ...MOCKS_JORNADAS,
  ...MOCKS_REGLAS,
  ...MOCKS_AUDITORIA,
  ...MOCKS_SEGUIMIENTO,
  ...MOCKS_EXPORTACIONES,
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
  excedidas: { HE: 0, DS: 0, CT: 0, VP: 0 },
};
export const errorContratoMock = new ErrorDominio(
  "CONTRATO_INVALIDO",
  "Registro inválido.",
).toApiError();
