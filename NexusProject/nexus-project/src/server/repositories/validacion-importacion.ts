import type { Prisma, PrismaClient } from "@prisma/client";
import type { FuenteValidacion } from "../services/validacion-importacion";
import { fechaDesdeDb, fechaParaDb } from "./fechas";

/** Solo lectura. T04 puede pasar su tx para el cotejo dentro de la confirmación. */
export function fuenteValidacionPrisma(
  db: PrismaClient | Prisma.TransactionClient,
): FuenteValidacion {
  return {
    async empleados(ids) {
      if (!ids.length) return [];
      return db.empleado.findMany({
        where: { employeeId: { in: ids } },
        select: {
          employeeId: true,
          activo: true,
          enCobertura: true,
          tipo: true,
        },
      });
    },
    async registros(pares) {
      if (!pares.length) return [];
      const periodos = await db.periodoEmpleado.findMany({
        where: {
          OR: pares.map((p) => ({
            employeeId: p.employeeId,
            periodStart: fechaParaDb(p.periodStart),
            periodEnd: fechaParaDb(p.periodEnd),
          })),
        },
        select: {
          employeeId: true,
          periodStart: true,
          periodEnd: true,
          registroVigente: {
            select: {
              fingerprint: true,
              importacion: { select: { status: true } },
            },
          },
        },
      });
      return periodos.flatMap((p) =>
        p.registroVigente?.importacion.status === "CONFIRMADA"
          ? [
              {
                employeeId: p.employeeId,
                periodStart: fechaDesdeDb(p.periodStart),
                periodEnd: fechaDesdeDb(p.periodEnd),
                fingerprint: p.registroVigente.fingerprint,
              },
            ]
          : [],
      );
    },
  };
}
