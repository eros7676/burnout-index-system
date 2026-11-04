// Rules of an alert's follow-up case, with no database: who may act, who may own, which transitions
// exist and what each step requires. Research: work/enterprise/research/workforce-admin.md §2.0, §2.4, §4.4.
import type {
  ErrorCampo,
  Factor,
  FechaISO,
  UsuarioDemoDTO,
} from "../../shared/contracts";
import {
  LIMITES_SEGUIMIENTO,
  MOTIVOS_CIERRE,
  TIPOS_MEDIDA_CLAVES,
  type EstadoSeguimiento,
} from "../../shared/contratos/seguimiento";

export type TipoPersona = "TECNICO" | "TEAM_LEAD" | "GERENCIA";

/** What the rules need to know of an alert. */
export type AlertaSeguimiento = {
  alertId: string;
  employeeId: string;
  createdAt: Date;
  vigencia: "ACTIVA" | "SUPERADA";
  /** Team of the person the alert is about. */
  personaTeamId: string | null;
  /** Type of the alert's recipient: Team Lead for a technician, Gerencia for a Team Lead; null when none. */
  destinatarioTipo: TipoPersona | null;
};

export type CasoParaReglas = {
  casoId: string;
  alertaOrigenId: string;
  estado: EstadoSeguimiento;
  createdAt: Date;
  cerradoAt: Date | null;
};

const FACTORES: readonly Factor[] = ["HE", "DS", "CT", "VP"];
const RRHH_USER_ID = "demo-rrhh";

// ── Dates ─────────────────────────────────────────────────────────────────

/** Today's date in the product's fixed zone (Buenos Aires), as YYYY-MM-DD. */
export function hoyEnBuenosAires(ahora: Date = new Date()): FechaISO {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** A real calendar date written YYYY-MM-DD. */
export function esFechaReal(valor: unknown): valor is FechaISO {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor))
    return false;
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  return (
    Number.isFinite(fecha.getTime()) &&
    fecha.toISOString().slice(0, 10) === valor
  );
}

/** The due date passed while the case is NUEVO or EN_CURSO; EN_ESPERA pauses it. */
export function esVencido(
  caso: { estado: EstadoSeguimiento; vence: FechaISO | null },
  hoy: FechaISO,
): boolean {
  return (
    (caso.estado === "NUEVO" || caso.estado === "EN_CURSO") &&
    caso.vence !== null &&
    caso.vence < hoy
  );
}

// ── Who may do what (matrix §2.0) ─────────────────────────────────────────

/** Reading the case status follows the alert's own scope (Gerencia reads all, D11; a Team Lead their team). */
export function puedeVer(
  usuario: UsuarioDemoDTO,
  alerta: AlertaSeguimiento,
): boolean {
  switch (usuario.rol) {
    case "RRHH":
    case "GERENCIA":
      return true;
    case "TEAM_LEAD":
      return alerta.personaTeamId !== null && alerta.personaTeamId === usuario.teamId;
    default:
      return false;
  }
}

/**
 * Open, assign, change and close: RR. HH. any alert; a Team Lead the alerts addressed to them (their
 * team's technicians, never their own, which go to Gerencia); Gerencia only the alerts addressed to Gerencia.
 */
export function puedeSeguir(
  usuario: UsuarioDemoDTO,
  alerta: AlertaSeguimiento,
): boolean {
  switch (usuario.rol) {
    case "RRHH":
      return true;
    case "TEAM_LEAD":
      return (
        alerta.destinatarioTipo === "TEAM_LEAD" &&
        alerta.personaTeamId !== null &&
        alerta.personaTeamId === usuario.teamId
      );
    case "GERENCIA":
      return alerta.destinatarioTipo === "GERENCIA";
    default:
      return false;
  }
}

/** Internal notes: RR. HH. and the case owner (§2.0; ServiceNow: work notes only for named roles). */
export function puedeAnotar(
  usuario: UsuarioDemoDTO,
  caso: { asignadoA: string },
  alerta: AlertaSeguimiento,
): boolean {
  if (usuario.rol === "RRHH") return true;
  return puedeSeguir(usuario, alerta) && caso.asignadoA === usuario.userId;
}

/** Anyone allowed may take a case; only RR. HH. hands it to somebody else. */
export const puedeReasignar = (usuario: UsuarioDemoDTO): boolean =>
  usuario.rol === "RRHH";

/** Who may own the case or one of its measures: RR. HH., and whoever the alert is addressed to. */
export function asignablesDe(
  alerta: AlertaSeguimiento,
  usuarios: readonly UsuarioDemoDTO[],
): UsuarioDemoDTO[] {
  return usuarios.filter(
    (u) =>
      u.rol === "RRHH" ||
      (u.rol === "TEAM_LEAD" &&
        alerta.destinatarioTipo === "TEAM_LEAD" &&
        alerta.personaTeamId !== null &&
        u.teamId === alerta.personaTeamId) ||
      (u.rol === "GERENCIA" && alerta.destinatarioTipo === "GERENCIA"),
  );
}

/** The alert's recipient, as a login; the RR. HH. queue when there is none (§2.4). */
export function asignadoPorDefecto(
  alerta: AlertaSeguimiento,
  usuarios: readonly UsuarioDemoDTO[],
): string {
  const destino = asignablesDe(alerta, usuarios).find((u) => u.rol !== "RRHH");
  return destino?.userId ?? RRHH_USER_ID;
}

// ── Which case an alert belongs to ────────────────────────────────────────

/**
 * One case per person while it is open. An alert belongs to the case opened from it; otherwise to the
 * earliest case that was still open when the alert was created (a closure covers every alert of the
 * person up to that moment). An alert created after the last closure belongs to no case, so the next
 * case needs a newer alert: closed cases never reopen. `casos` are all the person's cases.
 */
export function casoDeAlerta<T extends CasoParaReglas>(
  casos: readonly T[],
  alerta: Pick<AlertaSeguimiento, "alertId" | "createdAt">,
): { caso: T; relacion: "ORIGEN" | "ADJUNTA" } | null {
  const origen = casos.find((c) => c.alertaOrigenId === alerta.alertId);
  if (origen) return { caso: origen, relacion: "ORIGEN" };
  const instante = alerta.createdAt.getTime();
  const cubridor = [...casos]
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.casoId.localeCompare(b.casoId),
    )
    .find((c) => c.cerradoAt === null || instante <= c.cerradoAt.getTime());
  return cubridor ? { caso: cubridor, relacion: "ADJUNTA" } : null;
}

// ── Validation (field errors in the API's ErrorCampo shape) ───────────────

const error = (campo: string, codigo: string, detalle: string): ErrorCampo => ({
  fila: null,
  campo,
  codigo,
  detalle,
});

const TRANSICIONES: Record<EstadoSeguimiento, readonly EstadoSeguimiento[]> = {
  NUEVO: ["EN_CURSO"],
  EN_CURSO: ["EN_ESPERA"],
  EN_ESPERA: ["EN_CURSO"],
  CERRADO: [],
};

function validarVence(
  vence: unknown,
  hoy: FechaISO,
  errores: ErrorCampo[],
): void {
  if (!esFechaReal(vence))
    errores.push(
      error("vence", "VENCE_INVALIDO", "Debe ser una fecha real (por ejemplo, 2026-11-20)."),
    );
  else if (vence < hoy)
    errores.push(
      error("vence", "VENCE_PASADO", "La fecha de vencimiento no puede ser anterior a hoy."),
    );
}

/**
 * Status, owner and due date of a case. EN_CURSO needs a due date from today; one that lapsed while the
 * case waited must be replaced. A date already late is not re-checked unless the request touches it.
 */
export function validarActualizacion(
  actual: {
    estado: EstadoSeguimiento;
    asignadoA: string;
    vence: FechaISO | null;
  },
  cambios: {
    estado?: EstadoSeguimiento;
    asignadoA?: string;
    vence?: FechaISO | null;
  },
  hoy: FechaISO,
): ErrorCampo[] {
  if (actual.estado === "CERRADO")
    return [
      error("estado", "CASO_CERRADO", "El seguimiento está cerrado y no admite cambios."),
    ];
  const errores: ErrorCampo[] = [];
  const pasaA =
    cambios.estado !== undefined && cambios.estado !== actual.estado
      ? cambios.estado
      : null;
  if (pasaA && !TRANSICIONES[actual.estado].includes(pasaA))
    errores.push(
      error("estado", "TRANSICION_INVALIDA", "El estado pedido no corresponde desde el estado actual."),
    );
  const resultante = pasaA ?? actual.estado;
  const vence = cambios.vence !== undefined ? cambios.vence : actual.vence;
  if (cambios.vence) validarVence(cambios.vence, hoy, errores);
  if (!errores.some((e) => e.campo === "estado") && resultante === "EN_CURSO") {
    if (vence === null)
      errores.push(
        error("vence", "VENCE_OBLIGATORIO", "Un seguimiento en curso requiere fecha de vencimiento."),
      );
    else if (
      (pasaA || cambios.vence !== undefined) &&
      !cambios.vence &&
      esFechaReal(vence) &&
      vence < hoy
    )
      errores.push(
        error("vence", "VENCE_PASADO", "La fecha de vencimiento ya pasó: indique una nueva."),
      );
  }
  return errores;
}

export function validarNota(texto: unknown): ErrorCampo[] {
  const { min, max } = LIMITES_SEGUIMIENTO.nota;
  const largo = typeof texto === "string" ? texto.trim().length : 0;
  return largo >= min && largo <= max
    ? []
    : [
        error(
          "texto",
          "NOTA_INVALIDA",
          `La nota debe tener entre ${min} y ${max} caracteres.`,
        ),
      ];
}

export function validarMedida(
  medida: {
    tipo: unknown;
    factor?: unknown;
    responsableId: unknown;
    vence?: unknown;
  },
  responsablesPermitidos: readonly string[],
  hoy: FechaISO,
): ErrorCampo[] {
  const errores: ErrorCampo[] = [];
  if (!TIPOS_MEDIDA_CLAVES.includes(medida.tipo as never))
    errores.push(error("tipo", "TIPO_INVALIDO", "Seleccione un tipo de medida de la lista."));
  if (
    medida.factor !== undefined &&
    medida.factor !== null &&
    !FACTORES.includes(medida.factor as Factor)
  )
    errores.push(error("factor", "FACTOR_INVALIDO", "Seleccione un factor de la lista."));
  if (!responsablesPermitidos.includes(medida.responsableId as string))
    errores.push(
      error("responsableId", "RESPONSABLE_INVALIDO", "El responsable no puede actuar en este seguimiento."),
    );
  if (medida.vence !== undefined && medida.vence !== null)
    validarVence(medida.vence, hoy, errores);
  return errores;
}

/** Closing needs a reason and a justification, and the reason has to be true of the case. */
export function validarCierre(
  entrada: { motivoCierre: unknown; justificacion: unknown },
  contexto: {
    medidas: readonly { hecha: boolean }[];
    alertaOrigenVigencia: "ACTIVA" | "SUPERADA";
    personaActiva: boolean;
  },
): ErrorCampo[] {
  const errores: ErrorCampo[] = [];
  const { min, max } = LIMITES_SEGUIMIENTO.justificacion;
  const largo =
    typeof entrada.justificacion === "string"
      ? entrada.justificacion.trim().length
      : 0;
  if (largo < min || largo > max)
    errores.push(
      error(
        "justificacion",
        "JUSTIFICACION_INVALIDA",
        `La justificación debe tener entre ${min} y ${max} caracteres.`,
      ),
    );
  if (!MOTIVOS_CIERRE.includes(entrada.motivoCierre as never)) {
    errores.push(error("motivoCierre", "MOTIVO_INVALIDO", "Seleccione un motivo de cierre de la lista."));
    return errores;
  }
  switch (entrada.motivoCierre) {
    case "MEDIDAS_IMPLEMENTADAS":
      if (!contexto.medidas.length || contexto.medidas.some((m) => !m.hecha))
        errores.push(
          error(
            "motivoCierre",
            "MEDIDAS_PENDIENTES",
            "Para cerrar por medidas implementadas, registre al menos una medida y marque todas como hechas.",
          ),
        );
      break;
    case "SUPERADA_POR_RECALCULO":
      if (contexto.alertaOrigenVigencia !== "SUPERADA")
        errores.push(
          error("motivoCierre", "ALERTA_VIGENTE", "La alerta de origen sigue vigente: no fue superada por un recálculo."),
        );
      break;
    case "BAJA_PERSONA":
      if (contexto.personaActiva)
        errores.push(
          error("motivoCierre", "PERSONA_ACTIVA", "La persona sigue activa en el catálogo."),
        );
      break;
  }
  return errores;
}
