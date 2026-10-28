import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@prisma/client";
import { fechaParaDb } from "../src/server/repositories/fechas";
import { empleadosSemilla, equiposSemilla, reglasSemilla } from "./seed-data";

/** Ejecutar en una transacción. Repetir el seed no modifica el catálogo ni el historial. */
export async function sembrarBase(tx: Prisma.TransactionClient) {
  for (const equipo of equiposSemilla) {
    await tx.equipo.upsert({
      where: { teamId: equipo.teamId },
      create: equipo,
      update: {},
    });
  }
  for (const empleado of empleadosSemilla) {
    await tx.empleado.upsert({
      where: { employeeId: empleado.employeeId },
      create: empleado,
      update: {},
    });
  }

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
