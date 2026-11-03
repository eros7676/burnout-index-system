// Decisions of the rules-draft lifecycle, without IO: who may move a draft where,
// when a draft counts as retroactive, how stale a simulation may be, how versions
// are named and labelled. Research: work/enterprise/research/workforce-admin.md §1.7, §2.3, §4.3.
import type {
  ApiError,
  ErrorCampo,
  FechaISO,
} from "../../shared/contracts";
import {
  MOTIVO_MAX,
  MOTIVO_MIN,
  type EstadoBorradorReglas,
  type EstadoVersionReglas,
  type SimulacionReglasDTO,
} from "../../shared/contratos/reglas";
import { fechaParaDb } from "../repositories/fechas";
import type { Problema } from "./reglas";

/** The editor may schedule a version this far ahead; a typo in the year would otherwise publish an immutable, unreachable version. */
export const SEMANAS_HORIZONTE = 52;
const SEMANA_MS = 7 * 86_400_000;

export type CodigoErrorBorrador =
  | "PETICION_INVALIDA"
  | "SIN_PERMISO"
  | "NO_ENCONTRADO"
  | "CONFLICTO_EDICION"
  | "ESTADO_INCOMPATIBLE"
  | "SIN_SIMULACION"
  | "SIMULACION_DESACTUALIZADA"
  | "APROBACION_REQUERIDA"
  | "MISMA_PERSONA"
  | "CONFIGURACION_INVALIDA"
  | "ALCANCE_EXCESIVO";

const ESTADO_HTTP: Record<CodigoErrorBorrador, 400 | 403 | 404 | 409 | 422> = {
  PETICION_INVALIDA: 400,
  SIN_PERMISO: 403,
  NO_ENCONTRADO: 404,
  CONFLICTO_EDICION: 409,
  ESTADO_INCOMPATIBLE: 409,
  SIN_SIMULACION: 409,
  SIMULACION_DESACTUALIZADA: 409,
  APROBACION_REQUERIDA: 409,
  MISMA_PERSONA: 403,
  CONFIGURACION_INVALIDA: 422,
  ALCANCE_EXCESIVO: 422,
};

/** A refused step of the lifecycle; the HTTP adapter turns it into its status and body. */
export class ErrorBorrador extends Error {
  readonly status: 400 | 403 | 404 | 409 | 422;
  constructor(
    readonly codigo: CodigoErrorBorrador,
    mensaje: string,
    readonly detalles: ErrorCampo[] = [],
  ) {
    super(mensaje);
    this.name = "ErrorBorrador";
    this.status = ESTADO_HTTP[codigo];
  }
  toApiError(): ApiError {
    return {
      error: {
        codigo: this.codigo,
        mensaje: this.message,
        detalles: this.detalles,
      },
    };
  }
}

export const detalleDe = (problemas: Problema[]): ErrorCampo[] =>
  problemas.map((p) => ({
    fila: null,
    campo: p.campo,
    codigo: "CONFIGURACION_INVALIDA",
    detalle: p.detalle,
  }));

export function rechazarPorProblemas(
  problemas: Problema[],
  mensaje = "El borrador tiene datos para corregir.",
): never {
  throw new ErrorBorrador("CONFIGURACION_INVALIDA", mensaje, detalleDe(problemas));
}

// ── Fingerprint (optimistic concurrency) ───────────────────────────────────

/** A request must quote the fingerprint of the content it read; any other value is a lost-update attempt. */
export function exigirHuella(actual: string, recibida: unknown): void {
  if (typeof recibida !== "string" || !/^[0-9a-f]{64}$/.test(recibida))
    throw new ErrorBorrador(
      "PETICION_INVALIDA",
      "La solicitud debe incluir la huella del borrador que se leyó.",
    );
  if (recibida !== actual)
    throw new ErrorBorrador(
      "CONFLICTO_EDICION",
      "El borrador cambió desde que se abrió. Recargue la página para ver la versión actual.",
    );
}

// ── Reason ─────────────────────────────────────────────────────────────────

/** A written reason, enforced here and not only in the form. `que` names it in the message. */
export function problemasDeMotivo(
  texto: unknown,
  campo = "motivo",
  que: { vacio: string; articulo: string } = {
    vacio: "Indique el motivo del cambio.",
    articulo: "El motivo",
  },
): Problema[] {
  if (typeof texto !== "string" || texto.trim() === "")
    return [{ campo, detalle: que.vacio }];
  const largo = texto.trim().length;
  if (largo < MOTIVO_MIN)
    return [
      {
        campo,
        detalle: `${que.articulo} debe tener al menos ${MOTIVO_MIN} caracteres.`,
      },
    ];
  if (largo > MOTIVO_MAX)
    return [
      {
        campo,
        detalle: `${que.articulo} no puede superar los ${MOTIVO_MAX} caracteres.`,
      },
    ];
  return [];
}

// ── Start of validity ──────────────────────────────────────────────────────

/** Monday of the week containing `fecha`. */
export function lunesDe(fecha: Date): FechaISO {
  const dia = fecha.getUTCDay();
  const atras = (dia + 6) % 7;
  return new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() - atras),
  )
    .toISOString()
    .slice(0, 10);
}

/** Calendar date in the product's zone (UTC−3, no daylight saving), as a UTC midnight. */
export function hoyEnArgentina(ahora: Date): Date {
  const local = new Date(ahora.getTime() - 3 * 3_600_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}

export type ContextoFecha = {
  /** Start of the oldest version: nothing can start before it, and it cannot be repeated. */
  primeraVigencia: FechaISO;
  /** Starts of every published version. */
  vigencias: readonly FechaISO[];
  /** Monday of the current week. */
  lunesActual: FechaISO;
};

/**
 * Checks that depend on the published history. The shape (a real Monday) is the
 * parameter validator's job; this adds: after the first version, not already used
 * (starts are unique) and within the horizon.
 */
export function problemasDeVigencia(
  effectiveFrom: FechaISO,
  contexto: ContextoFecha,
): Problema[] {
  if (effectiveFrom <= contexto.primeraVigencia)
    return [
      {
        campo: "effectiveFrom",
        detalle: "El inicio debe ser posterior al de la primera versión.",
      },
    ];
  if (contexto.vigencias.includes(effectiveFrom))
    return [
      {
        campo: "effectiveFrom",
        detalle: "Ya existe una versión con ese inicio de vigencia. Elija otra fecha.",
      },
    ];
  const limite = new Date(
    fechaParaDb(contexto.lunesActual).getTime() + SEMANAS_HORIZONTE * SEMANA_MS,
  )
    .toISOString()
    .slice(0, 10);
  if (effectiveFrom > limite)
    return [
      {
        campo: "effectiveFrom",
        detalle: `El inicio no puede superar ${SEMANAS_HORIZONTE} semanas desde hoy.`,
      },
    ];
  return [];
}

// ── Retroactivity and the four-eyes rule ───────────────────────────────────

/** Retroactive means it governs at least one week that is already evaluated. */
export const esRetroactivo = (semanasAfectadas: number) => semanasAfectadas > 0;

type DatosAprobacion = {
  estado: EstadoBorradorReglas;
  huella: string;
  simulacionHuella: string | null;
  creadoPor: string;
  aprobadoPor: string | null;
};

/** The approver is never the author (NIST SP 800-53 AC-5 separation of duties, AC-3(2) dual authorization). */
export function exigirOtraPersona(autorId: string, aprobadorId: string): void {
  if (autorId === aprobadorId)
    throw new ErrorBorrador(
      "MISMA_PERSONA",
      "La aprobación debe ser de una persona distinta de quien creó el borrador.",
    );
}

export function exigirEstado(
  estado: EstadoBorradorReglas,
  permitidos: readonly EstadoBorradorReglas[],
  mensaje: string,
): void {
  if (!permitidos.includes(estado))
    throw new ErrorBorrador("ESTADO_INCOMPATIBLE", mensaje);
}

/** A simulation counts only for the exact content it ran on. */
export function exigirSimulacion(
  b: Pick<DatosAprobacion, "huella" | "simulacionHuella">,
): void {
  if (b.simulacionHuella !== b.huella)
    throw new ErrorBorrador(
      "SIN_SIMULACION",
      "Simule el impacto del borrador actual antes de continuar.",
    );
}

/** What the simulation read must still be what is stored, or its figures describe other data. */
export function contextoVigente(
  simulado: SimulacionReglasDTO["contexto"] | undefined,
  actual: SimulacionReglasDTO["contexto"],
): boolean {
  return (
    !!simulado &&
    simulado.versionEnVigor === actual.versionEnVigor &&
    simulado.versionSiguiente === actual.versionSiguiente &&
    simulado.ultimaSemana === actual.ultimaSemana &&
    simulado.semanas === actual.semanas
  );
}

export function exigirContextoVigente(
  simulado: SimulacionReglasDTO["contexto"] | undefined,
  actual: SimulacionReglasDTO["contexto"],
): void {
  if (!contextoVigente(simulado, actual))
    throw new ErrorBorrador(
      "SIMULACION_DESACTUALIZADA",
      "Los datos o las versiones cambiaron desde la simulación. Simule nuevamente antes de publicar.",
    );
}

/**
 * Publication gate. A future-dated version needs only a current simulation. A
 * retroactive one also needs the approval of someone other than its author.
 */
export function exigirPublicable(
  b: DatosAprobacion,
  retroactivoAhora: boolean,
): void {
  exigirEstado(
    b.estado,
    ["BORRADOR", "EN_REVISION"],
    "Solo se puede publicar un borrador abierto.",
  );
  exigirSimulacion(b);
  if (!retroactivoAhora) return;
  if (b.estado !== "EN_REVISION" || b.aprobadoPor === null)
    throw new ErrorBorrador(
      "APROBACION_REQUERIDA",
      "La versión modifica semanas ya evaluadas. Requiere la aprobación de Gerencia antes de publicar.",
    );
  exigirOtraPersona(b.creadoPor, b.aprobadoPor);
}

// ── Versions ───────────────────────────────────────────────────────────────

/** Next `vN` after the highest numbered version; other names (command-line versions) are ignored. */
export function siguienteVersion(versiones: readonly string[]): string {
  const mayor = versiones.reduce((m, v) => {
    const n = /^v(\d+)$/.exec(v);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `v${mayor + 1}`;
}

/**
 * Programada: starts after this week. Vigente: the latest one that has started.
 * Reemplazada: started, and a later one has started too. `lunesActual` is the
 * Monday of the current week; a version that starts on it is already in force.
 */
export function estadosDeVersiones(
  inicios: readonly FechaISO[],
  lunesActual: FechaISO,
): Map<FechaISO, EstadoVersionReglas> {
  const iniciadas = inicios.filter((i) => i <= lunesActual);
  const vigente = iniciadas.reduce<FechaISO | null>(
    (m, i) => (m === null || i > m ? i : m),
    null,
  );
  return new Map(
    inicios.map((i) => [
      i,
      i > lunesActual ? "PROGRAMADA" : i === vigente ? "VIGENTE" : "REEMPLAZADA",
    ]),
  );
}
