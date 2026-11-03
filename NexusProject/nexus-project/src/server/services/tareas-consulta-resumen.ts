// Pure rules of the task evidence: the summary by status, its reconciliation against the week's counts,
// who may read the rows and which references may become links. No database, no request.
import type { UsuarioDemoDTO } from "../../shared/contracts";
import type {
  CampoConciliado,
  ConciliacionTareasDTO,
  DetalleTareas,
  EstadoTarea,
  ResumenTareasDTO,
} from "../../shared/contratos/tareas";

/** One row of `GROUP BY estadoCierre` over a record's tasks. */
export type GrupoEstado = {
  estado: EstadoTarea;
  n: number;
  diasAtrasoMax: number | null;
  diasAtrasoTotal: number | null;
};

export function resumirGrupos(grupos: readonly GrupoEstado[]): ResumenTareasDTO {
  const resumen: ResumenTareasDTO = {
    total: 0,
    completadas: 0,
    pendientes: 0,
    vencidas: 0,
    diasAtrasoMax: 0,
    diasAtrasoTotal: 0,
  };
  for (const g of grupos) {
    resumen.total += g.n;
    if (g.estado === "COMPLETADA") resumen.completadas += g.n;
    else if (g.estado === "PENDIENTE") resumen.pendientes += g.n;
    else resumen.vencidas += g.n;
    resumen.diasAtrasoMax = Math.max(resumen.diasAtrasoMax, g.diasAtrasoMax ?? 0);
    resumen.diasAtrasoTotal += g.diasAtrasoTotal ?? 0;
  }
  return resumen;
}

export type ConteosSemana = {
  tareasActivas: number;
  tareasPendientes: number;
  tareasVencidas: number;
};

/**
 * The task rows must reproduce the week's three stored counts (A = every row,
 * P = every row open at close, V = the overdue ones among them). The summary's
 * `pendientes` are the open ones within their deadline, so P adds the overdue back.
 */
export function conciliar(
  conteos: ConteosSemana,
  resumen: ResumenTareasDTO,
): ConciliacionTareasDTO {
  const campos: { campo: CampoConciliado; resumen: number; detalle: number }[] = [
    { campo: "tareasActivas", resumen: conteos.tareasActivas, detalle: resumen.total },
    {
      campo: "tareasPendientes",
      resumen: conteos.tareasPendientes,
      detalle: resumen.pendientes + resumen.vencidas,
    },
    { campo: "tareasVencidas", resumen: conteos.tareasVencidas, detalle: resumen.vencidas },
  ];
  return { coincide: campos.every((c) => c.resumen === c.detalle), campos };
}

/**
 * A week has detail when task rows back it, when a fingerprint says they were attached,
 * or when it has no tasks at all (nothing to corroborate). Otherwise the summary
 * was imported alone and its counts cannot be checked.
 */
export function detalleDe(
  conteos: ConteosSemana,
  resumen: ResumenTareasDTO,
  conHuella: boolean,
): DetalleTareas {
  return conHuella || resumen.total > 0 || conteos.tareasActivas === 0
    ? "CON_DETALLE"
    : "SIN_DETALLE";
}

/** The part of the signed-in user the visibility rule needs. */
type Lector = Pick<UsuarioDemoDTO, "rol" | "teamId" | "employeeId">;
type Sujeto = { employeeId: string; tipo: string; teamId: string | null };

/**
 * Who reads a person's task rows (research §5, ILO 10.6): RR. HH. everyone, a Team Lead their
 * team, Gerencia the Team Leads. A person's own rows go through /api/mis-datos/tareas, never here.
 */
export function puedeVerDetalleTareas(lector: Lector, sujeto: Sujeto): boolean {
  switch (lector.rol) {
    case "RRHH":
      return true;
    case "TEAM_LEAD":
      return lector.teamId !== null && sujeto.teamId === lector.teamId;
    case "GERENCIA":
      return sujeto.tipo === "TEAM_LEAD";
    default:
      return false;
  }
}

/** A reference becomes a link only when it is a well-formed https URL. */
export function enlaceSeguro(ref: string | null): string | null {
  if (!ref || !ref.startsWith("https://")) return null;
  try {
    const url = new URL(ref);
    return url.protocol === "https:" && url.hostname !== "" && !/\s/.test(ref)
      ? ref
      : null;
  } catch {
    return null;
  }
}
