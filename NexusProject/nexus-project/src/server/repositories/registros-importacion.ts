import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { ParPeriodo } from "../../shared/contracts";
import type { FilaNormalizada } from "../services/validacion-importacion";
import { ErrorImportacion } from "../services/error-importacion";
import { fechaDesdeDb, fechaParaDb } from "./fechas";

export const clavePeriodo = (p: ParPeriodo) =>
  JSON.stringify([p.employeeId, p.periodStart, p.periodEnd]);
export function lotes<T>(items: T[], size = 200): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    result.push(items.slice(i, i + size));
  return result;
}
export const filtroPeriodo = (p: ParPeriodo) => ({
  employeeId: p.employeeId,
  periodStart: fechaParaDb(p.periodStart),
  periodEnd: fechaParaDb(p.periodEnd),
});
export function parDesdePeriodo(p: {
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
}): ParPeriodo {
  return {
    employeeId: p.employeeId,
    periodStart: fechaDesdeDb(p.periodStart),
    periodEnd: fechaDesdeDb(p.periodEnd),
  };
}

/** Siempre dentro de la confirmación SERIALIZABLE. Sin skipDuplicates ni reemplazos. */
export async function guardarRegistrosImportados(
  tx: Prisma.TransactionClient,
  importId: string,
  filas: FilaNormalizada[],
): Promise<Map<string, string>> {
  const periodos = new Map<
    string,
    { periodoId: string; registroVigenteId: string | null }
  >();
  for (const lote of lotes(filas)) {
    const existentes = await tx.periodoEmpleado.findMany({
      where: { OR: lote.map((f) => filtroPeriodo(f.datos)) },
      select: {
        periodoId: true,
        employeeId: true,
        periodStart: true,
        periodEnd: true,
        registroVigenteId: true,
      },
    });
    for (const p of existentes)
      periodos.set(clavePeriodo(parDesdePeriodo(p)), p);
  }
  const nuevos: Prisma.PeriodoEmpleadoCreateManyInput[] = [];
  for (const { datos } of filas) {
    const key = clavePeriodo(datos);
    if (periodos.get(key)?.registroVigenteId)
      throw new ErrorImportacion(
        409,
        "CONFLICTO_HISTORICO",
        "El período ya tiene datos; valide nuevamente.",
      );
    if (!periodos.has(key)) {
      const periodoId = randomUUID();
      periodos.set(key, { periodoId, registroVigenteId: null });
      nuevos.push({ periodoId, ...filtroPeriodo(datos) });
    }
  }
  for (const data of lotes(nuevos))
    await tx.periodoEmpleado.createMany({ data });
  const registros = filas.map(({ datos, fingerprint }) => {
    const metricas = {
      employeeId: datos.employeeId,
      horasExtra: datos.horasExtra,
      diasConsecutivosSinDescanso: datos.diasConsecutivosSinDescanso,
      tareasActivas: datos.tareasActivas,
      tareasPendientes: datos.tareasPendientes,
      tareasVencidas: datos.tareasVencidas,
      vacacionesPendientesDias: datos.vacacionesPendientesDias,
      horasTrabajadas: datos.horasTrabajadas,
      diasDesdeUltimasVacaciones: datos.diasDesdeUltimasVacaciones,
    };
    return {
      ...metricas,
      recordId: randomUUID(),
      periodoId: periodos.get(clavePeriodo(datos))!.periodoId,
      sourceImportId: importId,
      fingerprint,
    };
  });
  for (const data of lotes(registros))
    await tx.registroLaboral.createMany({ data });
  // Los IDs y la fuente acotan el JOIN a los registros de este lote. Una carrera
  // nunca reemplaza un puntero: si cambió, se revierte la confirmación completa.
  for (const lote of lotes(registros)) {
    const cantidad = await tx.$executeRaw`
      UPDATE PeriodoEmpleado p JOIN RegistroLaboral r
        ON r.periodoId = p.periodoId AND r.sourceImportId = ${importId}
      SET p.registroVigenteId = r.recordId
      WHERE p.periodoId IN (${Prisma.join(lote.map((r) => r.periodoId))})
        AND p.registroVigenteId IS NULL AND r.dataVersion = 1`;
    if (cantidad !== lote.length)
      throw new ErrorImportacion(
        409,
        "CONFLICTO_CONCURRENTE",
        "Otra carga modificó los períodos; valide nuevamente.",
      );
  }
  return new Map([...periodos].map(([key, p]) => [key, p.periodoId]));
}
