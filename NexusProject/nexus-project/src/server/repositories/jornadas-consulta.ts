import type { Prisma, PrismaClient } from "@prisma/client";
import type { AusenciasSemana } from "../../shared/contracts";
import type { DiaDTO } from "../../shared/contratos/jornadas";
import { fechaDesdeDb } from "./fechas";
import { lotes } from "./registros-importacion";

type Cliente = PrismaClient | Prisma.TransactionClient;
/** Records per read: one IN list, never one query per week. */
const REGISTROS_POR_LECTURA = 1000;

/**
 * Days away of each record version, from its day detail: one grouped read per thousand records.
 * A record without day rows maps to null (unknown, not zero), so a summary imported alone is never
 * shown as a week with no leave.
 */
export async function ausenciasDeRegistros(
  db: Cliente,
  recordIds: readonly string[],
): Promise<Map<string, AusenciasSemana | null>> {
  const salida = new Map<string, AusenciasSemana | null>(recordIds.map((id) => [id, null]));
  for (const ids of lotes([...new Set(recordIds)], REGISTROS_POR_LECTURA)) {
    const grupos = await db.jornadaSemana.groupBy({
      by: ["recordId", "tipo"],
      where: { recordId: { in: ids } },
      _count: { _all: true },
    });
    for (const g of grupos) {
      const a = salida.get(g.recordId) ?? { vacaciones: 0, licencias: 0 };
      if (g.tipo === "VACACIONES") a.vacaciones = g._count._all;
      if (g.tipo === "LICENCIA") a.licencias = g._count._all;
      salida.set(g.recordId, a);
    }
  }
  return salida;
}

/** The seven days of one record version, Monday first. */
export async function diasDeRegistro(db: Cliente, recordId: string): Promise<DiaDTO[]> {
  const filas = await db.jornadaSemana.findMany({
    where: { recordId },
    orderBy: { fecha: "asc" },
    select: { fecha: true, tipo: true, horasTrabajadas: true, horasExtra: true },
  });
  return filas.map((d) => ({
    fecha: fechaDesdeDb(d.fecha),
    tipo: d.tipo,
    horasTrabajadas: d.horasTrabajadas,
    horasExtra: d.horasExtra,
  }));
}
