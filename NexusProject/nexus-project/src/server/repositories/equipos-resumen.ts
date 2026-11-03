import { Prisma } from "@prisma/client";
import type { FechaISO, Nivel } from "../../shared/contracts";
import { conteoVacio } from "../../shared/semanas";
import { evaluacionVigenteSql } from "./personas-directorio";

export type ResumenSemana = {
  conteo: Record<Nivel, number>;
  /** Sum of the current indices in integer hundredths. */
  centesimos: number;
  evaluadas: number;
};

/**
 * People per level and sum of indices, by team and week, aggregated in SQL over the people
 * currently in coverage (scope follows the current catalog, T15a). Only current results count.
 */
export async function resumenPorEquipoYSemana(
  tx: Prisma.TransactionClient,
  { teamIds, semanas }: { teamIds: readonly string[]; semanas: readonly FechaISO[] },
): Promise<Map<string, Map<FechaISO, ResumenSemana>>> {
  const resultado = new Map<string, Map<FechaISO, ResumenSemana>>();
  if (!teamIds.length || !semanas.length) return resultado;
  const filas = await tx.$queryRaw<
    { teamId: string; semana: string; nivel: Nivel; n: bigint; centesimos: Prisma.Decimal }[]
  >`
    SELECT e.teamId AS teamId, DATE_FORMAT(p.periodStart, '%Y-%m-%d') AS semana, v.nivel AS nivel,
           COUNT(*) AS n, SUM(v.indice * 100) AS centesimos
    FROM Empleado e
    JOIN PeriodoEmpleado p ON p.employeeId = e.employeeId AND p.periodStart IN (${Prisma.join(semanas)})
    ${evaluacionVigenteSql}
    WHERE e.teamId IN (${Prisma.join(teamIds)})
      AND e.activo = true AND e.enCobertura = true AND e.tipo IN ('TECNICO', 'TEAM_LEAD')
      AND v.evaluationId IS NOT NULL
    GROUP BY e.teamId, p.periodStart, v.nivel`;
  for (const fila of filas) {
    const porSemana = resultado.get(fila.teamId) ?? new Map();
    const resumen: ResumenSemana = porSemana.get(fila.semana) ?? {
      conteo: conteoVacio(),
      centesimos: 0,
      evaluadas: 0,
    };
    resumen.conteo[fila.nivel] += Number(fila.n);
    resumen.centesimos += Number(fila.centesimos.toString());
    resumen.evaluadas += Number(fila.n);
    porSemana.set(fila.semana, resumen);
    resultado.set(fila.teamId, porSemana);
  }
  return resultado;
}

/**
 * Active alerts of the people currently in each team. An alert counts only while its evaluation is
 * the current result of its week, the same rule that hides it from the alerts list when stale.
 */
export async function alertasActivasPorEquipo(
  tx: Prisma.TransactionClient,
  teamIds: readonly string[],
): Promise<Map<string, number>> {
  if (!teamIds.length) return new Map();
  const filas = await tx.$queryRaw<{ teamId: string; n: bigint }[]>`
    SELECT e.teamId AS teamId, COUNT(*) AS n
    FROM Alerta a
    JOIN Empleado e ON e.employeeId = a.employeeId
    JOIN PeriodoEmpleado p ON p.evaluacionVigenteId = a.evaluationId
    ${evaluacionVigenteSql}
    WHERE a.vigencia = 'ACTIVA' AND e.activo = true AND v.evaluationId IS NOT NULL
      AND e.teamId IN (${Prisma.join(teamIds)})
    GROUP BY e.teamId`;
  return new Map(filas.map((f) => [f.teamId, Number(f.n)]));
}

/** Active members and members in coverage per team, in two grouped counts. */
export async function tamanosDeEquipos(
  tx: Prisma.TransactionClient,
  teamIds: readonly string[],
): Promise<Map<string, { activas: number; evaluables: number; tecnicos: number }>> {
  const tamanos = new Map<string, { activas: number; evaluables: number; tecnicos: number }>(
    teamIds.map((id) => [id, { activas: 0, evaluables: 0, tecnicos: 0 }]),
  );
  if (!teamIds.length) return tamanos;
  const filas = await tx.$queryRaw<
    { teamId: string; activas: bigint; evaluables: bigint; tecnicos: bigint }[]
  >`
    SELECT teamId AS teamId, COUNT(*) AS activas,
           SUM(enCobertura = true AND tipo IN ('TECNICO', 'TEAM_LEAD')) AS evaluables,
           SUM(tipo = 'TECNICO') AS tecnicos
    FROM Empleado
    WHERE activo = true AND teamId IN (${Prisma.join(teamIds)})
    GROUP BY teamId`;
  for (const f of filas)
    tamanos.set(f.teamId, {
      activas: Number(f.activas),
      evaluables: Number(f.evaluables),
      tecnicos: Number(f.tecnicos),
    });
  return tamanos;
}
