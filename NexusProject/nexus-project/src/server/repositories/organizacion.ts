import type { Prisma } from "@prisma/client";
import type { FechaISO } from "../../shared/contracts";
import type {
  MotivoAsignacion,
  TipoPuesto,
} from "../../shared/contratos/organizacion";
import { fechaParaDb } from "./fechas";

/** Teams by id, for validating references in forms and files. */
export async function equiposConocidos(
  tx: Prisma.TransactionClient,
): Promise<Map<string, { activo: boolean }>> {
  const equipos = await tx.equipo.findMany({
    select: { teamId: true, activo: true },
  });
  return new Map(equipos.map((e) => [e.teamId, { activo: e.activo }]));
}

/**
 * Who a position reports to follows from the team (workforce-admin §3.1): technicians to the team's
 * lead, a Team Lead to the team's manager, Gerencia to nobody. It is derived, never typed.
 */
export async function derivarResponsable(
  tx: Prisma.TransactionClient,
  tipo: TipoPuesto,
  teamId: string | null,
): Promise<string | null> {
  if (tipo === "GERENCIA" || !teamId) return null;
  const equipo = await tx.equipo.findUnique({
    where: { teamId },
    select: { liderId: true, gerenteId: true },
  });
  return (tipo === "TEAM_LEAD" ? equipo?.gerenteId : equipo?.liderId) ?? null;
}

export type NuevaAsignacion = {
  employeeId: string;
  desde: FechaISO;
  tipo: TipoPuesto;
  teamId: string | null;
  responsableId: string | null;
  enCobertura: boolean;
  activo: boolean;
  motivo: MotivoAsignacion;
  comentario: string | null;
  registradoPor: string;
};

/** Closes the open row where the new one starts and appends it: one open row per person. */
export async function anexarAsignacion(
  tx: Prisma.TransactionClient,
  a: NuevaAsignacion,
) {
  const desde = fechaParaDb(a.desde);
  await tx.asignacionEmpleado.updateMany({
    where: { employeeId: a.employeeId, hasta: null },
    data: { hasta: desde },
  });
  return tx.asignacionEmpleado.create({ data: { ...a, desde } });
}

/** The open row of a person (the latest), if the person has a history. */
export const ultimaAsignacion = (tx: Prisma.TransactionClient, employeeId: string) =>
  tx.asignacionEmpleado.findFirst({
    where: { employeeId },
    orderBy: { desde: "desc" },
  });

export const primeraAsignacion = (tx: Prisma.TransactionClient, employeeId: string) =>
  tx.asignacionEmpleado.findFirst({
    where: { employeeId },
    orderBy: { desde: "asc" },
    select: { desde: true },
  });

/** Teams a person leads or manages, which must be handed over before the person leaves or moves. */
export async function responsabilidadesDe(
  tx: Prisma.TransactionClient,
  employeeId: string,
) {
  const [lidera, gerencia] = await Promise.all([
    tx.equipo.findFirst({
      where: { liderId: employeeId, activo: true },
      select: { teamId: true, nombre: true },
    }),
    tx.equipo.findMany({
      where: { gerenteId: employeeId, activo: true },
      select: { teamId: true, nombre: true },
      orderBy: { teamId: "asc" },
    }),
  ]);
  return { lidera, gerencia };
}

/** Names already in use, compared with `claveNombre`: the duplicates warning of hire and import. */
export async function nombresEnUso(tx: Prisma.TransactionClient): Promise<string[]> {
  const filas = await tx.empleado.findMany({ select: { nombre: true } });
  return filas.map((f) => f.nombre);
}

/**
 * Re-points the open row of one person from `desde`: in place when it started that very week
 * (a week keeps one row), otherwise closing it and appending the new one.
 */
export async function reasignarAsignacion(
  tx: Prisma.TransactionClient,
  employeeId: string,
  nueva: Omit<NuevaAsignacion, "employeeId" | "desde"> & { desde: FechaISO },
) {
  const abierta = await ultimaAsignacion(tx, employeeId);
  if (abierta && abierta.desde.getTime() === fechaParaDb(nueva.desde).getTime())
    return tx.asignacionEmpleado.update({
      where: { asignacionId: abierta.asignacionId },
      data: { teamId: nueva.teamId, responsableId: nueva.responsableId },
    });
  return anexarAsignacion(tx, { ...nueva, employeeId });
}

/** The same re-pointing for a whole team's technicians: three statements whatever the size. */
export async function reasignarResponsableEnLote(
  tx: Prisma.TransactionClient,
  employeeIds: readonly string[],
  { responsableId, desde, registradoPor }: { responsableId: string | null; desde: FechaISO; registradoPor: string },
) {
  if (!employeeIds.length) return;
  const lunes = fechaParaDb(desde);
  const abiertas = await tx.asignacionEmpleado.findMany({
    where: { employeeId: { in: [...employeeIds] }, hasta: null },
  });
  const deEstaSemana = abiertas.filter((a) => a.desde.getTime() === lunes.getTime());
  const anteriores = abiertas.filter((a) => a.desde.getTime() < lunes.getTime());
  if (deEstaSemana.length)
    await tx.asignacionEmpleado.updateMany({
      where: { asignacionId: { in: deEstaSemana.map((a) => a.asignacionId) } },
      data: { responsableId },
    });
  if (anteriores.length) {
    await tx.asignacionEmpleado.updateMany({
      where: { asignacionId: { in: anteriores.map((a) => a.asignacionId) } },
      data: { hasta: lunes },
    });
    await tx.asignacionEmpleado.createMany({
      data: anteriores.map((a) => ({
        employeeId: a.employeeId,
        desde: lunes,
        tipo: a.tipo,
        teamId: a.teamId,
        responsableId,
        enCobertura: a.enCobertura,
        activo: a.activo,
        motivo: "CAMBIO_LIDER" as const,
        comentario: null,
        registradoPor,
      })),
    });
  }
  await tx.empleado.updateMany({
    where: { employeeId: { in: [...employeeIds] } },
    data: { responsableId },
  });
}
