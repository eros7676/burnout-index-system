import type { CodigoErrorFila } from "../../shared/errors";
import { fechaParaDb } from "../repositories/fechas";

export type EmpleadoValidacion = {
  employeeId: string;
  activo: boolean;
  enCobertura: boolean;
  tipo: string;
};

/** What every weekly dataset checks about its employee and week columns. */
export type ContextoSemana = {
  catalogo: Map<string, EmpleadoValidacion>;
  /** Earliest rule-version effectiveFrom (YYYY-MM-DD); null when none is published. */
  vigencia: string | null;
  /** Today in Buenos Aires (YYYY-MM-DD). */
  hoy: string;
};
export type CampoSemana = "employee_id" | "period_start" | "period_end";
export type ClaveSemana = {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  /** Both dates are real calendar dates (the pair can key a duplicate check). */
  fechasValidas: boolean;
};

/** Today in Buenos Aires, the clock that closes a week (RNF: «semanas ya terminadas»). */
export function hoyEnBuenosAires(ahora: Date): string {
  if (!Number.isFinite(ahora.getTime())) throw new TypeError("Reloj inválido.");
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

/**
 * Employee in the catalogue and in coverage, a real Monday-to-Sunday week that
 * has closed and has rules in force. Shared by `indicadores-v1` and `tareas-v1`
 * so both datasets accept exactly the same people and weeks.
 */
export function validarEmpleadoYSemana(
  celdas: Partial<Record<CampoSemana, string>>,
  contexto: ContextoSemana,
  error: (campo: CampoSemana, codigo: CodigoErrorFila, detalle: string) => void,
): ClaveSemana {
  const texto = (c: CampoSemana) => celdas[c]?.trim() ?? "";
  const employeeId = texto("employee_id"),
    periodStart = texto("period_start"),
    periodEnd = texto("period_end");
  if (!employeeId)
    error("employee_id", "OBLIGATORIO", "Falta el legajo de la persona.");
  else {
    const e = contexto.catalogo.get(employeeId);
    if (!e)
      error(
        "employee_id",
        "EMPLEADO_NO_EXISTE",
        "No existe una persona con este legajo.",
      );
    else if (
      !e.activo ||
      !e.enCobertura ||
      !["TECNICO", "TEAM_LEAD"].includes(e.tipo)
    )
      error(
        "employee_id",
        "EMPLEADO_FUERA_COBERTURA",
        "La persona con este legajo no está activa o no está incluida en la evaluación.",
      );
  }
  const fecha = (campo: "period_start" | "period_end") => {
    if (!texto(campo)) {
      error(campo, "OBLIGATORIO", "Falta la fecha.");
      return null;
    }
    try {
      return fechaParaDb(texto(campo));
    } catch {
      error(
        campo,
        "FECHA_INVALIDA",
        "La fecha debe existir y tener el formato AAAA-MM-DD (por ejemplo, 2026-10-05).",
      );
      return null;
    }
  };
  const inicio = fecha("period_start"),
    fin = fecha("period_end");
  if (inicio && fin) {
    if (
      inicio.getUTCDay() !== 1 ||
      fin.getUTCDay() !== 0 ||
      fin.getTime() - inicio.getTime() !== 6 * 86400000
    )
      error(
        "period_start",
        "SEMANA_INVALIDA",
        "La semana debe ir de lunes a domingo: la fecha de fin es la de inicio más 6 días.",
      );
    // Processing needs a rule version in force; without one the job would stop on this pair.
    if (contexto.vigencia === null || periodStart < contexto.vigencia)
      error(
        "period_start",
        "FECHA_INVALIDA",
        contexto.vigencia
          ? `No hay reglas de cálculo para esa semana; rigen desde ${contexto.vigencia}.`
          : "No hay reglas de cálculo publicadas.",
      );
    if (periodEnd >= contexto.hoy)
      error(
        "period_end",
        "PERIODO_ABIERTO",
        "La semana todavía no terminó (hora de Buenos Aires). Solo se importan semanas cerradas.",
      );
  }
  return { employeeId, periodStart, periodEnd, fechasValidas: !!(inicio && fin) };
}
