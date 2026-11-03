import type {
  ConfiguracionIndice as ReglasDb,
  Prisma,
} from "@prisma/client";
import type { FechaISO, RegistroLaboral } from "../../shared/contracts";
import { registroDesdeDb } from "./evaluaciones";
import { fechaDesdeDb } from "./fechas";
import { periodosAfectados } from "./reglas";

const DIA_MS = 86_400_000;

export type AlcanceSimulacion = {
  /** The version in force at `inicio`: the one every affected week is governed by today. */
  base: ReglasDb | null;
  siguiente: { version: string; effectiveFrom: Date } | null;
  /** Weeks with loaded data in [inicio, siguiente): what publication would reprocess. */
  semanas: number;
  ultimaSemana: FechaISO | null;
};

/** The cheap facts a simulation depends on; publication reads them again to detect drift. */
export async function leerAlcance(
  tx: Prisma.TransactionClient,
  inicio: Date,
): Promise<AlcanceSimulacion> {
  const [base, siguiente, ultima] = await Promise.all([
    tx.configuracionIndice.findFirst({
      where: { effectiveFrom: { lte: inicio } },
      orderBy: { effectiveFrom: "desc" },
    }),
    tx.configuracionIndice.findFirst({
      where: { effectiveFrom: { gt: inicio } },
      orderBy: { effectiveFrom: "asc" },
      select: { version: true, effectiveFrom: true },
    }),
    tx.periodoEmpleado.aggregate({
      _max: { periodStart: true },
      where: { registroVigenteId: { not: null } },
    }),
  ]);
  const semanas = await tx.periodoEmpleado.count({
    where: periodosAfectados(inicio, siguiente?.effectiveFrom ?? null),
  });
  return {
    base,
    siguiente,
    semanas,
    ultimaSemana: ultima._max.periodStart
      ? fechaDesdeDb(ultima._max.periodStart)
      : null,
  };
}

/** Everyone with at least one affected week, in a stable order for batching. */
export async function personasDelAlcance(
  tx: Prisma.TransactionClient,
  inicio: Date,
  siguiente: Date | null,
): Promise<string[]> {
  const filas = await tx.periodoEmpleado.groupBy({
    by: ["employeeId"],
    where: periodosAfectados(inicio, siguiente),
    orderBy: { employeeId: "asc" },
  });
  return filas.map((f) => f.employeeId);
}

/**
 * The confirmed weeks of a batch of people, from the week before `inicio` (the
 * history a first affected week compares against) to the end of the range.
 */
export async function leerSeries(
  tx: Prisma.TransactionClient,
  personas: string[],
  inicio: Date,
  siguiente: Date | null,
): Promise<{
  series: Map<string, RegistroLaboral[]>;
  equipos: Map<string, string | null>;
}> {
  const desde = new Date(inicio.getTime() - 7 * DIA_MS);
  const [periodos, empleados] = await Promise.all([
    tx.periodoEmpleado.findMany({
      where: {
        employeeId: { in: personas },
        periodStart: siguiente ? { gte: desde, lt: siguiente } : { gte: desde },
        registroVigente: { is: { importacion: { is: { status: "CONFIRMADA" } } } },
      },
      orderBy: [{ employeeId: "asc" }, { periodStart: "asc" }],
      include: { registroVigente: true },
    }),
    tx.empleado.findMany({
      where: { employeeId: { in: personas } },
      select: { employeeId: true, teamId: true },
    }),
  ]);
  const series = new Map<string, RegistroLaboral[]>();
  for (const periodo of periodos) {
    if (!periodo.registroVigente) continue;
    const lista = series.get(periodo.employeeId) ?? [];
    lista.push(
      registroDesdeDb(periodo.registroVigente, {
        employeeId: periodo.employeeId,
        periodStart: fechaDesdeDb(periodo.periodStart),
        periodEnd: fechaDesdeDb(periodo.periodEnd),
      }),
    );
    series.set(periodo.employeeId, lista);
  }
  return {
    series,
    equipos: new Map(empleados.map((e) => [e.employeeId, e.teamId])),
  };
}

export async function nombresDeEquipos(
  tx: Prisma.TransactionClient,
  teamIds: string[],
): Promise<Map<string, string>> {
  const equipos = await tx.equipo.findMany({
    where: { teamId: { in: teamIds } },
    select: { teamId: true, nombre: true },
  });
  return new Map(equipos.map((e) => [e.teamId, e.nombre]));
}
