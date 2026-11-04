// Reads of people and teams: the paged directory, the profile and the team aggregates. Each read
// runs in one snapshot, so a page never mixes two states of the catalog.
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FechaISO } from "../../shared/contracts";
import type {
  AsignacionDTO,
  DirectorioPersonasDTO,
  EquipoDTO,
  EquipoFilaDTO,
  EquiposDTO,
  FichaPersonaDTO,
  OpcionesEquipoDTO,
  OpcionesPersonaDTO,
  PersonaFilaDTO,
} from "../../shared/contratos/organizacion";
import { conteoVacio } from "../../shared/semanas";
import { fechaDesdeDb } from "../repositories/fechas";
import {
  alertasActivasPorEquipo,
  tareasPorEquipo,
  resumenPorEquipoYSemana,
  tamanosDeEquipos,
} from "../repositories/equipos-resumen";
import { paginaDirectorio } from "../repositories/personas-directorio";
import { leerSemanasPersonas, semanasCargadas } from "../repositories/personas-semanas";
import { promedioDesdeCentesimos, suprimirGrupos } from "./equipos-agregados";
import { obtenerEvaluacion } from "./evaluaciones";
import { recomendacionesDe } from "./recomendaciones";
import type {
  filtrosDirectorio,
  filtrosEquipos,
} from "./organizacion-filtros";
import { noEncontrado } from "./organizacion-errores";
import {
  lunesActual,
  sugerirCodigoEquipo,
  sugerirLegajo,
} from "./organizacion-validacion";

export type Reloj = { ahora: () => Date };
export const relojReal: Reloj = { ahora: () => new Date() };

const LECTURA = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  timeout: 30000,
};
/** Weeks each row of the directory carries, ending at the chosen one. */
const SEMANAS_POR_FILA = 8;
/** Weeks of the Alto trend on a team. */
const SEMANAS_TENDENCIA = 8;

const referencia = (e: { employeeId: string; nombre: string } | null) =>
  e ? { employeeId: e.employeeId, nombre: e.nombre } : null;

/** The audit actor ids this prototype writes, as people read them. */
export function nombreDeActor(actorId: string): string {
  if (actorId === "sistema") return "Instalación";
  if (actorId === "demo-rrhh") return "RR. HH.";
  if (actorId === "demo-gerencia") return "Gerencia";
  if (actorId === "demo-local") return "Sistema";
  const equipo = /^demo-tl-(\d+)$/.exec(actorId);
  return equipo ? `Team Lead del equipo EQ-${equipo[1]}` : actorId;
}

// --- People -------------------------------------------------------------------------------

export async function consultarDirectorio(
  db: PrismaClient,
  filtros: ReturnType<typeof filtrosDirectorio>,
): Promise<DirectorioPersonasDTO> {
  return db.$transaction(async (tx) => {
    const semanas = await semanasCargadas(tx, filtros.teamId);
    const periodStart = filtros.periodStart ?? semanas[0] ?? null;
    const { ids, total } = await paginaDirectorio(tx, {
      periodStart,
      teamId: filtros.teamId,
      estado: filtros.estado,
      q: filtros.q,
      nivel: filtros.nivel,
      tipo: filtros.tipo,
      orden: filtros.orden,
      page: filtros.page,
      pageSize: filtros.pageSize,
    });
    const empleados = ids.length
      ? await tx.empleado.findMany({
          where: { employeeId: { in: ids } },
          include: { equipo: true, responsable: true },
        })
      : [];
    const porId = new Map(empleados.map((e) => [e.employeeId, e]));
    const semanasPorPersona = periodStart
      ? await leerSemanasPersonas(tx, {
          employeeIds: ids,
          hasta: periodStart,
          semanas: SEMANAS_POR_FILA,
        })
      : new Map();
    const items: PersonaFilaDTO[] = ids.map((id) => {
      const e = porId.get(id)!;
      return {
        employeeId: e.employeeId,
        nombre: e.nombre,
        tipo: e.tipo,
        activo: e.activo,
        enCobertura: e.enCobertura,
        teamId: e.teamId,
        equipo: e.equipo?.nombre ?? null,
        responsable: e.responsable?.nombre ?? null,
        semanas: semanasPorPersona.get(id) ?? [],
      };
    });
    return {
      items,
      total,
      page: filtros.page,
      pageSize: filtros.pageSize,
      periodStart,
      semanas,
    };
  }, LECTURA);
}

export async function consultarFicha(
  db: PrismaClient,
  employeeId: string,
  semanasAtras: number,
): Promise<FichaPersonaDTO> {
  return db.$transaction(async (tx) => {
    const e = await tx.empleado.findUnique({
      where: { employeeId },
      include: { equipo: true, responsable: true, lidera: true },
    });
    if (!e) throw noEncontrado("La persona no existe.");
    const [filas, gerenciaDe, ultimo] = await Promise.all([
      tx.asignacionEmpleado.findMany({
        where: { employeeId },
        orderBy: { desde: "desc" },
        include: { equipo: { select: { nombre: true } } },
      }),
      tx.equipo.count({ where: { gerenteId: employeeId, activo: true } }),
      tx.periodoEmpleado.findFirst({
        where: {
          employeeId,
          registroVigente: { importacion: { status: "CONFIRMADA" } },
        },
        orderBy: { periodStart: "desc" },
        select: { periodStart: true },
      }),
    ]);
    const responsables = new Map(
      (
        await tx.empleado.findMany({
          where: {
            employeeId: {
              in: [
                ...new Set(
                  filas.flatMap((f) => (f.responsableId ? [f.responsableId] : [])),
                ),
              ],
            },
          },
          select: { employeeId: true, nombre: true },
        })
      ).map((r) => [r.employeeId, r.nombre]),
    );
    const asignaciones: AsignacionDTO[] = filas.map((f) => ({
      asignacionId: f.asignacionId,
      desde: fechaDesdeDb(f.desde),
      hasta: f.hasta ? fechaDesdeDb(f.hasta) : null,
      tipo: f.tipo,
      teamId: f.teamId,
      equipo: f.equipo?.nombre ?? null,
      responsable: f.responsableId ? (responsables.get(f.responsableId) ?? null) : null,
      enCobertura: f.enCobertura,
      activo: f.activo,
      motivo: f.motivo,
      comentario: f.comentario,
      registradoPor: nombreDeActor(f.registradoPor),
    }));
    const ultimaSemanaCargada = ultimo ? fechaDesdeDb(ultimo.periodStart) : null;
    const semanas = ultimaSemanaCargada
      ? ((
          await leerSemanasPersonas(tx, {
            employeeIds: [employeeId],
            hasta: ultimaSemanaCargada,
            semanas: semanasAtras,
          })
        ).get(employeeId) ?? [])
      : [];
    // The newest week's suggestions, as its report says them (same evaluation, same function).
    const reciente = semanas[0];
    const evaluacion =
      reciente?.actualizado && reciente.evaluationId
        ? await obtenerEvaluacion(tx, reciente.evaluationId)
        : null;
    const recomendaciones = evaluacion?.excedidas.length ? recomendacionesDe(evaluacion) : [];
    return {
      persona: {
        employeeId: e.employeeId,
        nombre: e.nombre,
        tipo: e.tipo,
        activo: e.activo,
        enCobertura: e.enCobertura,
        teamId: e.teamId,
        equipo: e.equipo?.nombre ?? null,
        responsableId: e.responsableId,
        responsable: e.responsable?.nombre ?? null,
        fechaIngreso: e.fechaIngreso ? fechaDesdeDb(e.fechaIngreso) : null,
        fechaBaja: e.fechaBaja ? fechaDesdeDb(e.fechaBaja) : null,
        vigenteDesde: asignaciones[0]?.desde ?? null,
        lidera:
          e.lidera?.activo ? { teamId: e.lidera.teamId, nombre: e.lidera.nombre } : null,
        gerenciaDe,
      },
      asignaciones,
      semanas,
      ultimaSemanaCargada,
      recomendaciones,
    };
  }, LECTURA);
}

export async function consultarOpcionesPersona(
  db: PrismaClient,
  reloj: Reloj = relojReal,
): Promise<OpcionesPersonaDTO> {
  return db.$transaction(async (tx) => {
    const [legajos, equipos] = await Promise.all([
      tx.empleado.findMany({ select: { employeeId: true } }),
      tx.equipo.findMany({
        where: { activo: true },
        orderBy: { teamId: "asc" },
        include: { lider: true, gerente: true },
      }),
    ]);
    return {
      legajoSugerido: sugerirLegajo(legajos.map((l) => l.employeeId)),
      lunesActual: lunesActual(reloj.ahora()),
      equipos: equipos.map((e) => ({
        teamId: e.teamId,
        nombre: e.nombre,
        lider: e.lider?.nombre ?? null,
        gerente: e.gerente?.nombre ?? null,
      })),
    };
  }, LECTURA);
}

// --- Teams --------------------------------------------------------------------------------

/**
 * One row per team with the aggregates of the chosen week. Suppression is decided over all active
 * teams, whatever the viewer is allowed to see, so a team is hidden for the same reason everywhere.
 */
async function calcularEquipos(
  tx: Prisma.TransactionClient,
  { periodStart, semanas }: { periodStart: FechaISO | null; semanas: FechaISO[] },
): Promise<EquipoFilaDTO[]> {
  const equipos = await tx.equipo.findMany({
    orderBy: { teamId: "asc" },
    include: { lider: true, gerente: true },
  });
  const tamanos = await tamanosDeEquipos(
    tx,
    equipos.map((e) => e.teamId),
  );
  const activos = equipos.filter((e) => e.activo);
  const suprimidos = new Map(
    suprimirGrupos(
      activos.map((e) => ({
        teamId: e.teamId,
        personasEvaluables: tamanos.get(e.teamId)!.evaluables,
      })),
    ).map((e) => [e.teamId, e.suprimido]),
  );
  const visibles = activos.filter((e) => !suprimidos.get(e.teamId));
  const ventana = periodStart
    ? semanas.filter((s) => s <= periodStart).slice(0, SEMANAS_TENDENCIA).reverse()
    : [];
  const [resumen, alertas, tareas] = await Promise.all([
    periodStart
      ? resumenPorEquipoYSemana(tx, {
          teamIds: visibles.map((e) => e.teamId),
          semanas: ventana,
        })
      : new Map(),
    alertasActivasPorEquipo(
      tx,
      visibles.map((e) => e.teamId),
    ),
    periodStart
      ? tareasPorEquipo(tx, { teamIds: visibles.map((e) => e.teamId), periodStart })
      : new Map(),
  ]);
  return equipos.map((e) => {
    const tamano = tamanos.get(e.teamId)!;
    const base = {
      teamId: e.teamId,
      nombre: e.nombre,
      activo: e.activo,
      lider: referencia(e.lider),
      gerente: referencia(e.gerente),
      personasActivas: tamano.activas,
      personasEvaluables: tamano.evaluables,
    };
    const suprimido = e.activo ? (suprimidos.get(e.teamId) ?? null) : null;
    if (!e.activo || suprimido)
      return {
        ...base,
        suprimido,
        alertasActivas: null,
        conteo: null,
        promedioIndice: null,
        evaluadas: null,
        tendenciaAlto: null,
        tareas: null,
      };
    const porSemana = resumen.get(e.teamId);
    const actual = periodStart ? porSemana?.get(periodStart) : undefined;
    return {
      ...base,
      suprimido: null,
      alertasActivas: alertas.get(e.teamId) ?? 0,
      conteo: periodStart ? (actual?.conteo ?? conteoVacio()) : null,
      promedioIndice: actual ? promedioDesdeCentesimos(actual.centesimos, actual.evaluadas) : null,
      evaluadas: periodStart ? (actual?.evaluadas ?? 0) : null,
      tendenciaAlto: periodStart
        ? ventana.map((s) => ({ periodStart: s, alto: porSemana?.get(s)?.conteo.ALTO ?? 0 }))
        : null,
      tareas: periodStart
        ? (tareas.get(e.teamId) ?? { activas: 0, vencidas: 0, personasConVencidas: 0, personas: 0 })
        : null,
    };
  });
}

export async function consultarEquipos(
  db: PrismaClient,
  filtros: ReturnType<typeof filtrosEquipos>,
): Promise<EquiposDTO> {
  return db.$transaction(async (tx) => {
    const semanas = await semanasCargadas(tx, filtros.teamId);
    const periodStart = filtros.periodStart ?? semanas[0] ?? null;
    const filas = await calcularEquipos(tx, { periodStart, semanas });
    return {
      periodStart,
      semanas,
      items: filas.filter(
        (f) =>
          f.activo === (filtros.estado === "ACTIVOS") &&
          (!filtros.teamId || f.teamId === filtros.teamId),
      ),
    };
  }, LECTURA);
}

export async function consultarEquipo(
  db: PrismaClient,
  teamId: string,
  periodStartPedido?: FechaISO,
): Promise<EquipoDTO> {
  return db.$transaction(async (tx) => {
    const semanas = await semanasCargadas(tx, teamId);
    const periodStart = periodStartPedido ?? semanas[0] ?? null;
    const fila = (await calcularEquipos(tx, { periodStart, semanas })).find(
      (f) => f.teamId === teamId,
    );
    if (!fila) throw noEncontrado("El equipo no existe.");
    const tecnicosActivos = await tx.empleado.count({
      where: { teamId, activo: true, tipo: "TECNICO" },
    });
    return { ...fila, periodStart, semanas, tecnicosActivos };
  }, LECTURA);
}

export async function consultarOpcionesEquipo(
  db: PrismaClient,
  reloj: Reloj = relojReal,
): Promise<OpcionesEquipoDTO> {
  return db.$transaction(async (tx) => {
    const [equipos, lideres, gerentes] = await Promise.all([
      tx.equipo.findMany({ select: { teamId: true, liderId: true, activo: true } }),
      tx.empleado.findMany({
        where: { activo: true, tipo: "TEAM_LEAD" },
        orderBy: { nombre: "asc" },
        include: { equipo: { select: { nombre: true } } },
      }),
      tx.empleado.findMany({
        where: { activo: true, tipo: "GERENCIA" },
        orderBy: { nombre: "asc" },
        select: { employeeId: true, nombre: true },
      }),
    ]);
    const lideraDe = new Map(
      equipos.flatMap((e) => (e.activo && e.liderId ? [[e.liderId, e.teamId] as const] : [])),
    );
    return {
      codigoSugerido: sugerirCodigoEquipo(equipos.map((e) => e.teamId)),
      lunesActual: lunesActual(reloj.ahora()),
      lideres: lideres.map((l) => ({
        employeeId: l.employeeId,
        nombre: l.nombre,
        teamId: l.teamId,
        equipo: l.equipo?.nombre ?? null,
        lideraTeamId: lideraDe.get(l.employeeId) ?? null,
      })),
      gerentes,
    };
  }, LECTURA);
}
