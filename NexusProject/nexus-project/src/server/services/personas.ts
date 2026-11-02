import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  DatosSemana,
  MisDatosDTO,
  PersonaDTO,
  PersonasDTO,
  RegistroLaboral,
  ReglasDTO,
} from "../../shared/contracts";
import { leerResultados } from "../repositories/consultas";
import { reglasDesdeDb } from "../repositories/evaluaciones";

type Filtros = { teamId?: string; employeeId?: string };
const LECTURA = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  timeout: 30000,
};

function datosSemana(registro: RegistroLaboral): DatosSemana {
  return {
    periodStart: registro.periodStart,
    periodEnd: registro.periodEnd,
    horasExtra: registro.horasExtra,
    diasConsecutivosSinDescanso: registro.diasConsecutivosSinDescanso,
    tareasActivas: registro.tareasActivas,
    tareasPendientes: registro.tareasPendientes,
    tareasVencidas: registro.tareasVencidas,
    vacacionesPendientesDias: registro.vacacionesPendientesDias,
    horasTrabajadas: registro.horasTrabajadas,
    diasDesdeUltimasVacaciones: registro.diasDesdeUltimasVacaciones,
  };
}

/** Evaluated people (in coverage) with every confirmed week, read from one snapshot. */
export async function consultarPersonas(
  db: PrismaClient,
  filtros: Filtros,
): Promise<PersonasDTO> {
  return db.$transaction(async (tx) => {
    const empleados = await tx.empleado.findMany({
      where: {
        activo: true,
        enCobertura: true,
        tipo: { in: ["TECNICO", "TEAM_LEAD"] },
        teamId: filtros.teamId,
        employeeId: filtros.employeeId,
      },
      include: { equipo: true, responsable: true },
      orderBy: { employeeId: "asc" },
    });
    const resultados = await leerResultados(tx, {
      ...filtros,
      page: 1,
      pageSize: 1,
    });
    const porPersona = new Map<string, PersonaDTO["semanas"]>();
    for (const { fila, registro } of resultados) {
      if (!registro) continue;
      const semanas = porPersona.get(fila.employeeId) ?? [];
      semanas.push({
        ...datosSemana(registro),
        actualizado: fila.actualizado,
        processingState: fila.processingState,
        evaluationId: fila.evaluationId,
        indice: fila.indice,
        nivel: fila.nivel,
        alertId: fila.alertId,
      });
      porPersona.set(fila.employeeId, semanas);
    }
    const items = empleados.map((e) => ({
      employeeId: e.employeeId,
      nombre: e.nombre,
      tipo: e.tipo as PersonaDTO["tipo"],
      teamId: e.teamId!,
      equipo: e.equipo?.nombre ?? e.teamId!,
      responsable: e.responsable?.nombre ?? null,
      semanas: porPersona.get(e.employeeId) ?? [],
    }));
    const semanas = [
      ...new Set(resultados.map((r) => r.fila.periodStart)),
    ].sort((a, b) => (a < b ? 1 : -1));
    return { items, semanas };
  }, LECTURA);
}

/** The signed-in person's own loaded weeks; carries no index, level or alert by construction. */
export async function consultarMisDatos(
  db: PrismaClient,
  employeeId: string,
): Promise<MisDatosDTO> {
  return db.$transaction(async (tx) => {
    const empleado = await tx.empleado.findUniqueOrThrow({
      where: { employeeId },
      include: { equipo: true },
    });
    const resultados = await leerResultados(tx, {
      employeeId,
      page: 1,
      pageSize: 1,
    });
    return {
      nombre: empleado.nombre,
      equipo: empleado.equipo?.nombre ?? null,
      semanas: resultados.flatMap((r) =>
        r.registro ? [datosSemana(r.registro)] : [],
      ),
    };
  }, LECTURA);
}

/** Published rule versions, newest first; the first one is the one in force. */
export async function consultarReglas(db: PrismaClient): Promise<ReglasDTO> {
  const versiones = (
    await db.configuracionIndice.findMany({ orderBy: { effectiveFrom: "desc" } })
  ).map(reglasDesdeDb);
  return {
    vigente: versiones[0],
    versiones: versiones.map(({ version, effectiveFrom, createdAt }) => ({
      version,
      effectiveFrom,
      createdAt,
    })),
  };
}
