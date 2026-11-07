import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@prisma/client";
import { fechaParaDb } from "../src/server/repositories/fechas";
import { semillaGenerica, type Semilla } from "./seed-data";

/** Ejecutar en una transacción. Repetir el seed no modifica el catálogo ni el historial. */
export async function sembrarBase(
  tx: Prisma.TransactionClient,
  { equipos: equiposSemilla, empleados: empleadosSemilla, reglas: reglasSemilla }: Semilla = semillaGenerica,
) {
  for (const equipo of equiposSemilla) {
    await tx.equipo.upsert({
      where: { teamId: equipo.teamId },
      create: equipo,
      update: {},
    });
  }
  const ingreso = fechaParaDb(reglasSemilla.effectiveFrom);
  for (const empleado of empleadosSemilla) {
    await tx.empleado.upsert({
      where: { employeeId: empleado.employeeId },
      create: { ...empleado, fechaIngreso: ingreso },
      update: {},
    });
  }
  // Each team's lead and manager come from the catalog, as the migration backfills them.
  for (const lider of empleadosSemilla.filter((e) => e.tipo === "TEAM_LEAD")) {
    await tx.equipo.updateMany({
      where: { teamId: lider.teamId!, liderId: null },
      data: { liderId: lider.employeeId, gerenteId: lider.responsableId },
    });
  }
  await tx.asignacionEmpleado.createMany({
    data: empleadosSemilla.map((e) => ({
      employeeId: e.employeeId,
      desde: ingreso,
      tipo: e.tipo,
      teamId: e.teamId,
      responsableId: e.responsableId,
      enCobertura: e.enCobertura,
      activo: true,
      motivo: "ALTA" as const,
      comentario: "Alta inicial registrada por la instalación",
      registradoPor: "sistema",
    })),
    skipDuplicates: true,
  });

  const { effectiveFrom, createdAt, ...campos } = reglasSemilla;
  const esperada = { ...campos, effectiveFrom: fechaParaDb(effectiveFrom) };
  const existente = await tx.configuracionIndice.findUnique({
    where: { version: campos.version },
  });
  if (existente) {
    // Una v1 modificada no se sobreescribe silenciosamente al repetir la instalación.
    const { createdAt: _fechaCreacion, ...guardada } = existente;
    void _fechaCreacion;
    if (!isDeepStrictEqual(guardada, esperada)) {
      throw new Error(
        "La configuración v1 existente difiere del contrato; crear otra versión en T09.",
      );
    }
  } else {
    await tx.configuracionIndice.create({
      data: { ...esperada, createdAt: new Date(createdAt) },
    });
  }
  return {
    equipos: equiposSemilla.length,
    empleados: empleadosSemilla.length,
    evaluables: 49,
    reglas: "v1",
  };
}
