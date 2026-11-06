import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { ParPeriodo } from "../../shared/contracts";
import { ErrorImportacion } from "../services/error-importacion";
import type {
  FuenteJornadas,
  GrupoJornadas,
  RegistroJornadas,
} from "../services/jornadas-importacion";
import { fechaDesdeDb, fechaParaDb } from "./fechas";
import { lotes } from "./registros-importacion";
import { fuenteValidacionPrisma } from "./validacion-importacion";

/** Rows per INSERT: JornadaSemana has 10 columns, so 1,000 rows use 10,000 of MySQL's 65,535 placeholders. */
export const TAMANO_LOTE_JORNADAS = 1000;
/** People per read: one IN list of ids, never one query per person. */
const PERSONAS_POR_LECTURA = 1000;
/** Employee-weeks whose fingerprint is written by one UPDATE. */
const SEMANAS_POR_ACTUALIZACION = 200;

const clave = (p: ParPeriodo) => JSON.stringify([p.employeeId, p.periodStart, p.periodEnd]);

/** Read-only. The confirmation passes its transaction to check the stored weeks again. */
export function fuenteJornadasPrisma(db: PrismaClient | Prisma.TransactionClient): FuenteJornadas {
  const base = fuenteValidacionPrisma(db);
  return {
    empleados: base.empleados,
    primeraVigencia: base.primeraVigencia,
    async semanas(pares) {
      if (!pares.length) return [];
      const pedidas = new Set(pares.map(clave));
      const inicios = [...new Set(pares.map((p) => p.periodStart))].map(fechaParaDb);
      const encontradas: RegistroJornadas[] = [];
      // [periodStart, employeeId] is indexed: each read is a range over those two lists.
      for (const ids of lotes([...new Set(pares.map((p) => p.employeeId))], PERSONAS_POR_LECTURA)) {
        const periodos = await db.periodoEmpleado.findMany({
          where: { periodStart: { in: inicios }, employeeId: { in: ids } },
          select: {
            periodoId: true,
            employeeId: true,
            periodStart: true,
            periodEnd: true,
            registroVigente: {
              select: {
                recordId: true,
                horasExtra: true,
                horasTrabajadas: true,
                diasConsecutivosSinDescanso: true,
                diasDesdeUltimasVacaciones: true,
                huellaJornadas: true,
                importacion: { select: { status: true } },
              },
            },
          },
        });
        for (const p of periodos) {
          const registro = p.registroVigente;
          if (registro?.importacion.status !== "CONFIRMADA") continue;
          const par = {
            employeeId: p.employeeId,
            periodStart: fechaDesdeDb(p.periodStart),
            periodEnd: fechaDesdeDb(p.periodEnd),
          };
          if (!pedidas.has(clave(par))) continue;
          encontradas.push({
            ...par,
            recordId: registro.recordId,
            periodoId: p.periodoId,
            horasExtra: registro.horasExtra,
            horasTrabajadas: registro.horasTrabajadas,
            diasConsecutivosSinDescanso: registro.diasConsecutivosSinDescanso,
            diasDesdeUltimasVacaciones: registro.diasDesdeUltimasVacaciones,
            huellaJornadas: registro.huellaJornadas,
          });
        }
      }
      return encontradas;
    },
  };
}

/**
 * Stores the day rows and marks each week's record with the fingerprint of its days. Always
 * inside the confirmation's SERIALIZABLE transaction: a failure in any chunk rolls back every
 * row. A week that gained day detail meanwhile fails the fingerprint UPDATE instead of being
 * overwritten.
 */
export async function guardarJornadasImportadas(
  tx: Prisma.TransactionClient,
  importId: string,
  grupos: GrupoJornadas[],
  tamanoLote = TAMANO_LOTE_JORNADAS,
): Promise<number> {
  const filas = grupos.flatMap((g) =>
    g.dias.map(
      (d): Prisma.JornadaSemanaCreateManyInput => ({
        jornadaSemanaId: randomUUID(),
        recordId: g.recordId,
        periodoId: g.periodoId,
        employeeId: g.employeeId,
        periodStart: fechaParaDb(g.periodStart),
        sourceImportId: importId,
        fecha: fechaParaDb(d.fecha),
        tipo: d.tipo,
        horasTrabajadas: d.horasTrabajadas,
        horasExtra: d.horasExtra,
      }),
    ),
  );
  for (const lote of lotes(filas, tamanoLote)) await tx.jornadaSemana.createMany({ data: lote });
  for (const lote of lotes(grupos, SEMANAS_POR_ACTUALIZACION)) {
    const casos = Prisma.join(
      lote.map((g) => Prisma.sql`WHEN ${g.recordId} THEN ${g.huella}`),
      " ",
    );
    const cantidad = await tx.$executeRaw`
      UPDATE RegistroLaboral SET huellaJornadas = CASE recordId ${casos} END
      WHERE recordId IN (${Prisma.join(lote.map((g) => g.recordId))})
        AND huellaJornadas IS NULL`;
    if (cantidad !== lote.length)
      throw new ErrorImportacion(
        409,
        "CONFLICTO_CONCURRENTE",
        "Otra importación modificó las mismas semanas. Valide el archivo nuevamente.",
      );
  }
  return filas.length;
}
