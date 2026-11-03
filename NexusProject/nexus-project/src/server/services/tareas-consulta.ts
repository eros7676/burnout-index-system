// The task evidence behind the weekly counts (research/task-evidence-scale.md §3-§5): one person-week,
// the ledger of a person's weeks, one task across closes, and the signed-in person's own tasks.
// Reads run in one repeatable-read snapshot. The task rows a role may see are decided here, never in the browser.
import { Prisma, type PrismaClient } from "@prisma/client";
import type { UsuarioDemoDTO } from "../../shared/contracts";
import type {
  EstadoTarea,
  HistorialTareaDTO,
  MisTareasDTO,
  PersonaTareasDTO,
  SemanaTareasDTO,
  SemanasConTareasDTO,
  TareasSemanaDTO,
} from "../../shared/contratos/tareas";
import { ErrorDominio } from "../../shared/errors";
import { fechaDesdeDb } from "../repositories/fechas";
import { leerResultados } from "../repositories/consultas";
import { registrarEvento, type ContextoAuditoria } from "../repositories/auditoria";
import {
  gruposPorRegistro,
  leerCierresTarea,
  leerImportacionTareas,
  leerPersona,
  leerRegistroSemana,
  leerResultadoDeRegistro,
  leerSemanasConRegistro,
  paginaTareas,
} from "../repositories/tareas-consulta";
import type {
  FiltroHistorial,
  FiltroMisTareas,
  FiltroSemana,
  FiltroSemanas,
} from "./tareas-consulta-filtros";
import {
  conciliar,
  detalleDe,
  puedeVerDetalleTareas,
  resumirGrupos,
} from "./tareas-consulta-resumen";

export type SesionTareas = { usuario: UsuarioDemoDTO; actor: ContextoAuditoria };

/** The role may not read what it asked for. The HTTP adapter answers 403. */
export class ErrorSinPermisoTareas extends Error {}

const LECTURA = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  timeout: 30000,
};
const NO_EXISTE = "No hay datos cargados para esa persona y semana.";

type Persona = NonNullable<Awaited<ReturnType<typeof leerPersona>>>;
type Lectura = NonNullable<Awaited<ReturnType<typeof leerRegistroSemana>>>;
type Cliente = PrismaClient | Prisma.TransactionClient;

const personaDto = (p: Persona): PersonaTareasDTO => ({
  employeeId: p.employeeId,
  nombre: p.nombre,
  tipo: p.tipo as PersonaTareasDTO["tipo"],
  teamId: p.teamId!,
  equipo: p.equipo?.nombre ?? p.teamId!,
});

/**
 * A person of the covered staff inside the reader's scope. `proteger` already narrowed a Team Lead's
 * request; checking again here means a call that skipped the guard still finds nobody else's team.
 */
async function personaEnAlcance(
  db: Cliente,
  employeeId: string,
  teamId: string | undefined,
  usuario: UsuarioDemoDTO,
): Promise<Persona> {
  const persona =
    usuario.rol === "EMPLEADO"
      ? null
      : await leerPersona(db, employeeId, teamId);
  if (
    !persona ||
    (persona.tipo !== "TECNICO" && persona.tipo !== "TEAM_LEAD") ||
    (usuario.rol === "TEAM_LEAD" && persona.teamId !== usuario.teamId)
  )
    throw new ErrorDominio("NO_ENCONTRADO", NO_EXISTE);
  return persona;
}

/** The week's block: counts from the summary, counts from the rows, and the rows when the reader may see them. */
async function armarSemana(
  tx: Prisma.TransactionClient,
  p: {
    persona: Persona;
    lectura: Lectura;
    estado?: EstadoTarea;
    page: number;
    pageSize: number;
    conResultado: boolean;
    tareasVisibles: boolean;
  },
): Promise<TareasSemanaDTO> {
  const { registro, periodo, vigente } = p.lectura;
  const periodStart = fechaDesdeDb(periodo.periodStart);
  const grupos = (await gruposPorRegistro(tx, [registro.recordId])).get(registro.recordId) ?? [];
  const resumen = resumirGrupos(grupos);
  const detalle = detalleDe(registro, resumen, registro.huellaTareas !== null);
  const conTareas = resumen.total > 0;
  const pagina =
    p.tareasVisibles && conTareas
      ? await paginaTareas(tx, {
          recordId: registro.recordId,
          estado: p.estado,
          page: p.page,
          pageSize: p.pageSize,
        })
      : { items: [], total: 0 };

  let resultado: TareasSemanaDTO["resultado"] = null;
  if (p.conResultado && vigente) {
    // The current record: its evaluation is the stored result, current only if it still matches data and rules.
    const [fila] = await leerResultados(tx, {
      employeeId: p.persona.employeeId,
      periodStart,
      page: 1,
      pageSize: 1,
    });
    if (fila?.fila.evaluationId && fila.fila.nivel !== null && fila.fila.indice !== null)
      resultado = {
        evaluationId: fila.fila.evaluationId,
        indice: fila.fila.indice,
        nivel: fila.fila.nivel,
        actualizado: fila.fila.actualizado,
      };
  } else if (p.conResultado) {
    // An earlier data version: the evaluation that used it, which is no longer the current result.
    const anterior = await leerResultadoDeRegistro(tx, registro.recordId);
    if (anterior)
      resultado = {
        evaluationId: anterior.evaluationId,
        indice: anterior.indice,
        nivel: anterior.nivel,
        actualizado: false,
      };
  }

  return {
    persona: personaDto(p.persona),
    semana: {
      periodStart,
      periodEnd: fechaDesdeDb(periodo.periodEnd),
      recordId: registro.recordId,
      vigente,
    },
    indicadores: {
      horasExtra: registro.horasExtra,
      diasConsecutivosSinDescanso: registro.diasConsecutivosSinDescanso,
      tareasActivas: registro.tareasActivas,
      tareasPendientes: registro.tareasPendientes,
      tareasVencidas: registro.tareasVencidas,
      vacacionesPendientesDias: registro.vacacionesPendientesDias,
    },
    resultado,
    detalle,
    resumen,
    conciliacion: detalle === "CON_DETALLE" ? conciliar(registro, resumen) : null,
    importacion: conTareas ? await leerImportacionTareas(tx, registro.recordId) : null,
    tareasVisibles: p.tareasVisibles,
    tareas: { ...pagina, page: p.page, pageSize: p.pageSize },
  };
}

/** The tasks of one person-week. A read that returns rows is recorded with the person as subject. */
export async function consultarTareasSemana(
  db: PrismaClient,
  filtro: FiltroSemana,
  sesion: SesionTareas,
): Promise<TareasSemanaDTO> {
  const persona = await personaEnAlcance(db, filtro.employeeId, filtro.teamId, sesion.usuario);
  const tareasVisibles = puedeVerDetalleTareas(sesion.usuario, persona);
  return db.$transaction(async (tx) => {
    const lectura = await leerRegistroSemana(tx, filtro);
    if (!lectura) throw new ErrorDominio("NO_ENCONTRADO", NO_EXISTE);
    const semana = await armarSemana(tx, {
      persona,
      lectura,
      estado: filtro.estado,
      page: filtro.page,
      pageSize: filtro.pageSize,
      conResultado: true,
      tareasVisibles,
    });
    if (tareasVisibles && semana.resumen.total > 0)
      await registrarEvento(tx, {
        accion: "TAREAS_CONSULTADAS",
        recursoId: semana.semana.recordId,
        actor: sesion.actor,
        sujetoId: persona.employeeId,
        detalles: {
          alcance: "SEMANA",
          periodStart: semana.semana.periodStart,
          ...(filtro.estado ? { estado: filtro.estado } : {}),
          pagina: filtro.page,
          filas: semana.tareas.items.length,
        },
      });
    return semana;
  }, LECTURA);
}

/** One row of the ledger: the summary's counts beside the counts of the rows. */
function filaLibro(
  s: Awaited<ReturnType<typeof leerSemanasConRegistro>>[number],
  grupos: Parameters<typeof resumirGrupos>[0],
): SemanaTareasDTO {
  const resumen = resumirGrupos(grupos);
  const detalle = detalleDe(s.registro, resumen, s.registro.huellaTareas !== null);
  return {
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    recordId: s.registro.recordId,
    indicadores: {
      tareasActivas: s.registro.tareasActivas,
      tareasPendientes: s.registro.tareasPendientes,
      tareasVencidas: s.registro.tareasVencidas,
    },
    detalle,
    resumen,
    coincide: detalle === "CON_DETALLE" ? conciliar(s.registro, resumen).coincide : null,
  };
}

async function libroDeSemanas(tx: Prisma.TransactionClient, employeeId: string, limite: number) {
  const semanas = await leerSemanasConRegistro(tx, employeeId, limite);
  const grupos = await gruposPorRegistro(tx, semanas.map((s) => s.registro.recordId));
  return semanas.map((s) => filaLibro(s, grupos.get(s.registro.recordId) ?? []));
}

/** A person's last weeks with the counts of the summary and of the rows. Counts only, so nothing is recorded. */
export async function consultarSemanasConTareas(
  db: PrismaClient,
  filtro: FiltroSemanas,
  sesion: SesionTareas,
): Promise<SemanasConTareasDTO> {
  const persona = await personaEnAlcance(db, filtro.employeeId, filtro.teamId, sesion.usuario);
  return db.$transaction(
    async (tx) => ({
      persona: personaDto(persona),
      semanas: await libroDeSemanas(tx, persona.employeeId, filtro.semanas),
    }),
    LECTURA,
  );
}

/** One task across the closes where it appeared. Same visibility as the rows; a refusal is recorded. */
export async function consultarHistorialTarea(
  db: PrismaClient,
  filtro: FiltroHistorial,
  sesion: SesionTareas,
): Promise<HistorialTareaDTO> {
  const persona = await personaEnAlcance(db, filtro.employeeId, filtro.teamId, sesion.usuario);
  if (!puedeVerDetalleTareas(sesion.usuario, persona)) {
    await registrarEvento(db, {
      accion: "ACCESO_DENEGADO",
      recursoId: `tareas:${persona.employeeId}`.slice(0, 64),
      actor: sesion.actor,
      sujetoId: persona.employeeId,
      resultado: "DENEGADO",
      motivo: "SIN_PERMISO",
      detalles: { alcance: "HISTORIAL", permiso: "TAREAS" },
    });
    throw new ErrorSinPermisoTareas(
      "No tiene permiso para consultar el detalle de tareas de esta persona.",
    );
  }
  return db.$transaction(async (tx) => {
    const { cierres, truncado, cabecera } = await leerCierresTarea(tx, persona.employeeId, filtro.taskId);
    if (!cabecera)
      throw new ErrorDominio("NO_ENCONTRADO", "No hay registros de esa tarea.");
    await registrarEvento(tx, {
      accion: "TAREAS_CONSULTADAS",
      recursoId: persona.employeeId,
      actor: sesion.actor,
      sujetoId: persona.employeeId,
      detalles: { alcance: "HISTORIAL", cierres: cierres.length },
    });
    return {
      persona: personaDto(persona),
      taskId: filtro.taskId,
      ...cabecera,
      cierres,
      truncado,
    };
  }, LECTURA);
}

/**
 * The signed-in person's own tasks. The person comes from the session; there is no parameter to name another.
 * It carries no index or level (RF10) and, like /api/mis-datos, leaves no consultation event.
 */
export async function consultarMisTareas(
  db: PrismaClient,
  filtro: FiltroMisTareas,
  sesion: SesionTareas,
): Promise<MisTareasDTO> {
  const employeeId = sesion.usuario.employeeId;
  if (!employeeId)
    throw new ErrorSinPermisoTareas("Su usuario no tiene datos de trabajo propios.");
  const persona = await leerPersona(db, employeeId);
  if (!persona) throw new ErrorDominio("NO_ENCONTRADO", NO_EXISTE);
  return db.$transaction(async (tx) => {
    const semanas = await libroDeSemanas(tx, employeeId, filtro.semanas);
    const periodStart = filtro.periodStart ?? semanas[0]?.periodStart;
    let semana: TareasSemanaDTO | null = null;
    if (periodStart) {
      const lectura = await leerRegistroSemana(tx, { employeeId, periodStart });
      if (!lectura) throw new ErrorDominio("NO_ENCONTRADO", NO_EXISTE);
      semana = await armarSemana(tx, {
        persona,
        lectura,
        estado: filtro.estado,
        page: filtro.page,
        pageSize: filtro.pageSize,
        conResultado: false,
        tareasVisibles: true,
      });
    }
    return {
      nombre: persona.nombre,
      equipo: persona.equipo?.nombre ?? null,
      semanas,
      semana,
    };
  }, LECTURA);
}
