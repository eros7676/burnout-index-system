import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { ParPeriodo } from "../../shared/contracts";
import { ErrorImportacion } from "../services/error-importacion";
import type {
  FuenteTareas,
  GrupoTareas,
  RegistroSemana,
} from "../services/tareas-importacion";
import { fechaDesdeDb, fechaParaDb } from "./fechas";
import { lotes } from "./registros-importacion";
import { fuenteValidacionPrisma } from "./validacion-importacion";

/**
 * Rows per INSERT. MySQL caps a prepared statement at 65,535 placeholders on purpose
 * (https://bugs.mysql.com/bug.php?id=5194) and Prisma sends one placeholder per column
 * (https://github.com/prisma/prisma/issues/9132); TareaSemana has 15 columns, so 500 rows
 * use 7,500 and leave room for a wider table.
 */
export const TAMANO_LOTE_TAREAS = 500;
/** People per read: one IN list of ids, never one query per person. */
const PERSONAS_POR_LECTURA = 1000;
/** Employee-weeks whose fingerprint is written by one UPDATE. */
const SEMANAS_POR_ACTUALIZACION = 200;

const clave = (p: ParPeriodo) =>
  JSON.stringify([p.employeeId, p.periodStart, p.periodEnd]);

/** Read-only. The confirmation passes its transaction to check the stored weeks again. */
export function fuenteTareasPrisma(
  db: PrismaClient | Prisma.TransactionClient,
): FuenteTareas {
  const base = fuenteValidacionPrisma(db);
  return {
    empleados: base.empleados,
    primeraVigencia: base.primeraVigencia,
    async semanas(pares) {
      if (!pares.length) return [];
      const pedidas = new Set(pares.map(clave));
      const inicios = [...new Set(pares.map((p) => p.periodStart))].map(
        fechaParaDb,
      );
      const encontradas: RegistroSemana[] = [];
      // [periodStart, employeeId] is indexed: each read is a range over those two lists.
      for (const ids of lotes(
        [...new Set(pares.map((p) => p.employeeId))],
        PERSONAS_POR_LECTURA,
      )) {
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
                tareasActivas: true,
                tareasPendientes: true,
                tareasVencidas: true,
                huellaTareas: true,
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
            tareasActivas: registro.tareasActivas,
            tareasPendientes: registro.tareasPendientes,
            tareasVencidas: registro.tareasVencidas,
            huellaTareas: registro.huellaTareas,
          });
        }
      }
      return encontradas;
    },
  };
}

/**
 * Stores the task rows and marks each week's record with the fingerprint of its detail.
 * Always inside the confirmation's SERIALIZABLE transaction: a failure in any chunk rolls
 * back every row. A week that gained detail meanwhile fails the fingerprint UPDATE instead
 * of being overwritten.
 */
export async function guardarTareasImportadas(
  tx: Prisma.TransactionClient,
  importId: string,
  grupos: GrupoTareas[],
  tamanoLote = TAMANO_LOTE_TAREAS,
): Promise<number> {
  const filas = grupos.flatMap((g) =>
    g.tareas.map(
      (t): Prisma.TareaSemanaCreateManyInput => ({
        tareaSemanaId: randomUUID(),
        recordId: g.recordId,
        periodoId: g.periodoId,
        employeeId: g.employeeId,
        periodStart: fechaParaDb(g.periodStart),
        sourceImportId: importId,
        taskId: t.taskId,
        titulo: t.titulo,
        origen: t.origen,
        origenRef: t.origenRef,
        asignadaEl: fechaParaDb(t.asignadaEl),
        venceEl: t.venceEl ? fechaParaDb(t.venceEl) : null,
        completadaEl: t.completadaEl ? fechaParaDb(t.completadaEl) : null,
        estadoCierre: t.estadoCierre,
        diasAtraso: t.diasAtraso,
      }),
    ),
  );
  for (const lote of lotes(filas, tamanoLote))
    await tx.tareaSemana.createMany({ data: lote });
  for (const lote of lotes(grupos, SEMANAS_POR_ACTUALIZACION)) {
    const casos = Prisma.join(
      lote.map((g) => Prisma.sql`WHEN ${g.recordId} THEN ${g.huella}`),
      " ",
    );
    const cantidad = await tx.$executeRaw`
      UPDATE RegistroLaboral SET huellaTareas = CASE recordId ${casos} END
      WHERE recordId IN (${Prisma.join(lote.map((g) => g.recordId))})
        AND huellaTareas IS NULL`;
    if (cantidad !== lote.length)
      throw new ErrorImportacion(
        409,
        "CONFLICTO_CONCURRENTE",
        "Otra importación modificó las mismas semanas. Valide el archivo nuevamente.",
      );
  }
  return filas.length;
}
