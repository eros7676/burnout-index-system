// The one list of audited actions (NIST AU-2: the events and why they are logged).
// The server validates every event against it; the audit screen reads its labels and filters.
// Naming: ENTIDAD_PARTICIPIO (OWASP object_verb). Research: work/enterprise/research/audit-trail.md §3.

export type EntidadAuditoria =
  | "IMPORTACION"
  | "PROCESAMIENTO"
  | "REGLAS"
  | "EMPLEADO"
  | "EQUIPO"
  | "SEGUIMIENTO"
  | "NOTIFICACION"
  | "INFORME"
  | "TAREAS"
  | "EXPORTACION"
  | "AUDITORIA"
  | "SESION"
  | "ACCESO";

export type OperacionAuditoria =
  | "CREAR"
  | "MODIFICAR"
  | "BAJA"
  | "CONSULTAR"
  | "EXPORTAR"
  | "ACCESO"
  | "PROCESAR";

type Definicion = {
  entidad: EntidadAuditoria;
  operacion: OperacionAuditoria;
  /** Past tense, formal: what the actor did ("Confirmó una importación"). */
  etiqueta: string;
  /** Reads (consultations) are hidden by default in the audit screen. */
  esLectura?: true;
  /** Can happen more than once on the same resource; its key includes the request id. */
  repetible?: true;
  /** A written reason is mandatory (rules publication, deactivations, case closure). */
  requiereJustificacion?: true;
};

export const CATALOGO_AUDITORIA = {
  IMPORTACION_VALIDADA: { entidad: "IMPORTACION", operacion: "CREAR", etiqueta: "Validó un archivo" },
  IMPORTACION_RECHAZADA: { entidad: "IMPORTACION", operacion: "CREAR", etiqueta: "Validó un archivo con errores" },
  IMPORTACION_CONFIRMADA: { entidad: "IMPORTACION", operacion: "MODIFICAR", etiqueta: "Confirmó una importación" },
  IMPORTACION_CANCELADA: { entidad: "IMPORTACION", operacion: "BAJA", etiqueta: "Canceló una vista previa" },
  PROCESAMIENTO_REINTENTADO: { entidad: "PROCESAMIENTO", operacion: "PROCESAR", etiqueta: "Reintentó un procesamiento", repetible: true },
  PROCESAMIENTO_COMPLETADO: { entidad: "PROCESAMIENTO", operacion: "PROCESAR", etiqueta: "Completó un procesamiento", repetible: true },
  PROCESAMIENTO_FALLIDO: { entidad: "PROCESAMIENTO", operacion: "PROCESAR", etiqueta: "Registró un procesamiento fallido", repetible: true },
  REGLAS_PUBLICADAS: { entidad: "REGLAS", operacion: "MODIFICAR", etiqueta: "Publicó una versión de reglas" },
  REGLAS_BORRADOR_CREADO: { entidad: "REGLAS", operacion: "CREAR", etiqueta: "Creó un borrador de reglas" },
  REGLAS_BORRADOR_ACTUALIZADO: { entidad: "REGLAS", operacion: "MODIFICAR", etiqueta: "Modificó un borrador de reglas", repetible: true },
  REGLAS_BORRADOR_SIMULADO: { entidad: "REGLAS", operacion: "PROCESAR", etiqueta: "Simuló el impacto de un borrador", repetible: true },
  REGLAS_BORRADOR_EN_REVISION: { entidad: "REGLAS", operacion: "MODIFICAR", etiqueta: "Envió un borrador a aprobación", repetible: true },
  REGLAS_BORRADOR_APROBADO: { entidad: "REGLAS", operacion: "MODIFICAR", etiqueta: "Aprobó un borrador de reglas" },
  REGLAS_BORRADOR_RECHAZADO: { entidad: "REGLAS", operacion: "MODIFICAR", etiqueta: "Rechazó un borrador de reglas", repetible: true, requiereJustificacion: true },
  REGLAS_BORRADOR_DESCARTADO: { entidad: "REGLAS", operacion: "BAJA", etiqueta: "Descartó un borrador de reglas" },
  EMPLEADO_CREADO: { entidad: "EMPLEADO", operacion: "CREAR", etiqueta: "Dio de alta a una persona" },
  EMPLEADO_ACTUALIZADO: { entidad: "EMPLEADO", operacion: "MODIFICAR", etiqueta: "Modificó los datos laborales de una persona", repetible: true },
  EMPLEADO_DESACTIVADO: { entidad: "EMPLEADO", operacion: "BAJA", etiqueta: "Dio de baja a una persona", requiereJustificacion: true },
  EQUIPO_CREADO: { entidad: "EQUIPO", operacion: "CREAR", etiqueta: "Creó un equipo" },
  EQUIPO_ACTUALIZADO: { entidad: "EQUIPO", operacion: "MODIFICAR", etiqueta: "Modificó un equipo", repetible: true },
  EQUIPO_LIDER_CAMBIADO: { entidad: "EQUIPO", operacion: "MODIFICAR", etiqueta: "Cambió el líder de un equipo", repetible: true },
  EQUIPO_DESACTIVADO: { entidad: "EQUIPO", operacion: "BAJA", etiqueta: "Desactivó un equipo", requiereJustificacion: true },
  EQUIPO_MIEMBRO_AGREGADO: { entidad: "EQUIPO", operacion: "MODIFICAR", etiqueta: "Incorporó a una persona a un equipo", repetible: true },
  EQUIPO_MIEMBRO_QUITADO: { entidad: "EQUIPO", operacion: "MODIFICAR", etiqueta: "Retiró a una persona de un equipo", repetible: true },
  SEGUIMIENTO_ABIERTO: { entidad: "SEGUIMIENTO", operacion: "CREAR", etiqueta: "Abrió un seguimiento" },
  SEGUIMIENTO_ACTUALIZADO: { entidad: "SEGUIMIENTO", operacion: "MODIFICAR", etiqueta: "Actualizó un seguimiento", repetible: true },
  SEGUIMIENTO_NOTA_AGREGADA: { entidad: "SEGUIMIENTO", operacion: "MODIFICAR", etiqueta: "Agregó una nota a un seguimiento", repetible: true },
  SEGUIMIENTO_MEDIDA_REGISTRADA: { entidad: "SEGUIMIENTO", operacion: "MODIFICAR", etiqueta: "Registró una medida de seguimiento", repetible: true },
  SEGUIMIENTO_CERRADO: { entidad: "SEGUIMIENTO", operacion: "MODIFICAR", etiqueta: "Cerró un seguimiento", requiereJustificacion: true },
  NOTIFICACION_PREPARADA: { entidad: "NOTIFICACION", operacion: "CREAR", etiqueta: "Preparó un envío simulado" },
  NOTIFICACION_PROCESADA: { entidad: "NOTIFICACION", operacion: "PROCESAR", etiqueta: "Procesó un envío simulado" },
  INFORME_CONSULTADO: { entidad: "INFORME", operacion: "CONSULTAR", etiqueta: "Consultó un informe individual", esLectura: true, repetible: true },
  FICHA_CONSULTADA: { entidad: "EMPLEADO", operacion: "CONSULTAR", etiqueta: "Consultó la ficha de una persona", esLectura: true, repetible: true },
  TAREAS_CONSULTADAS: { entidad: "TAREAS", operacion: "CONSULTAR", etiqueta: "Consultó el detalle de tareas", esLectura: true, repetible: true },
  AUDITORIA_CONSULTADA: { entidad: "AUDITORIA", operacion: "CONSULTAR", etiqueta: "Consultó la auditoría", esLectura: true, repetible: true },
  EXPORTACION_GENERADA: { entidad: "EXPORTACION", operacion: "EXPORTAR", etiqueta: "Exportó datos", repetible: true },
  SESION_DEMO_INICIADA: { entidad: "SESION", operacion: "ACCESO", etiqueta: "Ingresó con un perfil de demostración", repetible: true },
  ACCESO_DENEGADO: { entidad: "ACCESO", operacion: "ACCESO", etiqueta: "Intentó una operación sin permiso", repetible: true },
} as const satisfies Record<string, Definicion>;

export type AccionAuditoria = keyof typeof CATALOGO_AUDITORIA;
export const ACCIONES_AUDITORIA = Object.keys(CATALOGO_AUDITORIA) as AccionAuditoria[];

export const definicionAccion = (accion: string): Definicion | undefined =>
  (CATALOGO_AUDITORIA as Record<string, Definicion>)[accion];

export const ENTIDADES_AUDITORIA: Record<EntidadAuditoria, string> = {
  IMPORTACION: "Importación",
  PROCESAMIENTO: "Procesamiento",
  REGLAS: "Reglas del índice",
  EMPLEADO: "Persona",
  EQUIPO: "Equipo",
  SEGUIMIENTO: "Seguimiento",
  NOTIFICACION: "Envío simulado",
  INFORME: "Informe",
  TAREAS: "Tareas",
  EXPORTACION: "Exportación",
  AUDITORIA: "Auditoría",
  SESION: "Sesión",
  ACCESO: "Acceso",
};

/** Closed reason codes for FALLO and DENEGADO outcomes (never free text). */
export const MOTIVOS_AUDITORIA = {
  SIN_PERMISO: "Sin permiso para la operación",
  FUERA_DE_EQUIPO: "Recurso de otro equipo",
  SIN_ASIGNACION: "Usuario sin asignación vigente",
  ORIGEN_NO_PERMITIDO: "Origen no permitido",
  ESTADO_INCOMPATIBLE: "Estado incompatible",
  VALIDACION: "Datos inválidos",
  SIN_DESTINATARIO: "Sin destinatario",
  SIMULADO_FALLO: "Fallo simulado",
  ERROR_TECNICO: "Error técnico",
} as const;
export type MotivoAuditoria = keyof typeof MOTIVOS_AUDITORIA;

export type CambioAuditoria = { campo: string; antes: unknown; despues: unknown };
