import { Prisma } from "@prisma/client";
import type { FechaISO } from "../../shared/contracts";
import type {
  EstadoPersona,
  FiltroNivel,
  OrdenDirectorio,
} from "../../shared/contratos/organizacion";
import { ENGINE_VERSION } from "../services/huella-evaluacion";

/**
 * Joins a week's period (`p`) to its predecessor (`q`) and to the evaluation in force (`v`), and
 * keeps `v` only while it is current. A result is current when it was computed from the record,
 * the predecessor, the rules and the engine in force today (T14). Records and rule versions are
 * immutable, so comparing their ids says what the fingerprint hash says, without hashing in SQL.
 * tests/organizacion.mysql.test.ts checks it against the hash reader.
 */
export const evaluacionVigenteSql = Prisma.sql`
  LEFT JOIN PeriodoEmpleado q
    ON q.employeeId = p.employeeId AND q.periodStart = DATE_SUB(p.periodStart, INTERVAL 7 DAY)
  LEFT JOIN Evaluacion v
    ON v.evaluationId = p.evaluacionVigenteId AND v.periodoId = p.periodoId
   AND v.engineVersion = ${ENGINE_VERSION}
   AND v.actualRecordId = p.registroVigenteId
   AND v.anteriorRecordId <=> q.registroVigenteId
   AND v.rulesVersion = (
     SELECT c.version FROM ConfiguracionIndice c
     WHERE c.effectiveFrom <= p.periodStart ORDER BY c.effectiveFrom DESC LIMIT 1
   )`;

/** Case and accent insensitive, whatever the column collation (the catalog is utf8mb4_bin). */
const COTEJO = Prisma.raw("utf8mb4_0900_ai_ci");
const comodines = (texto: string) => texto.replace(/[\\%_]/g, "\\$&");

export type PaginaDirectorio = {
  periodStart: FechaISO | null;
  teamId?: string;
  estado: EstadoPersona;
  q?: string;
  nivel?: FiltroNivel;
  tipo?: "TECNICO" | "TEAM_LEAD";
  orden: OrdenDirectorio;
  page: number;
  pageSize: number;
};

/**
 * The ids of one page of people, filtered and ordered in SQL, and the total that matches.
 * Ordering by index and the level filter read the result in force for the chosen week; ordering by
 * load reads the week's current record. People without a value come last. Without a loaded week there is no result to order by.
 */
export async function paginaDirectorio(
  tx: Prisma.TransactionClient,
  f: PaginaDirectorio,
): Promise<{ ids: string[]; total: number }> {
  // 1900-01-01 matches no period: every person has "no data".
  const semana = f.periodStart ?? "1900-01-01";
  const condiciones: Prisma.Sql[] = [Prisma.sql`e.activo = ${f.estado === "ACTIVAS"}`];
  if (f.teamId) condiciones.push(Prisma.sql`e.teamId = ${f.teamId}`);
  if (f.q) {
    const patron = `%${comodines(f.q)}%`;
    condiciones.push(
      Prisma.sql`(e.nombre COLLATE ${COTEJO} LIKE ${patron} OR e.employeeId COLLATE ${COTEJO} LIKE ${patron})`,
    );
  }
  if (f.tipo) condiciones.push(Prisma.sql`e.tipo = ${f.tipo}`);
  if (f.nivel === "DESACTUALIZADO")
    condiciones.push(Prisma.sql`p.registroVigenteId IS NOT NULL AND v.evaluationId IS NULL`);
  else if (f.nivel) condiciones.push(Prisma.sql`v.nivel = ${f.nivel}`);
  const desde = Prisma.sql`
    FROM Empleado e
    LEFT JOIN PeriodoEmpleado p ON p.employeeId = e.employeeId AND p.periodStart = ${semana}
    ${evaluacionVigenteSql}
    LEFT JOIN RegistroLaboral r ON r.recordId = p.registroVigenteId
    WHERE ${Prisma.join(condiciones, " AND ")}`;
  const porNombre = Prisma.sql`e.nombre COLLATE ${COTEJO} ASC, e.employeeId ASC`;
  // Highest first; a person with no value for the week (no record, no current result) comes last.
  const columna = {
    indice: Prisma.sql`v.indice`,
    vencidas: Prisma.sql`r.tareasVencidas`,
    horasExtra: Prisma.sql`r.horasExtra`,
    diasSinDescanso: Prisma.sql`r.diasConsecutivosSinDescanso`,
    nombre: null,
  }[f.orden];
  const orden = columna
    ? Prisma.sql`(${columna} IS NULL) ASC, ${columna} DESC, ${porNombre}`
    : porNombre;
  const filas = await tx.$queryRaw<{ employeeId: string }[]>`
    SELECT e.employeeId AS employeeId ${desde}
    ORDER BY ${orden}
    LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`;
  const [conteo] = await tx.$queryRaw<
    { total: bigint }[]
  >`SELECT COUNT(*) AS total ${desde}`;
  return { ids: filas.map((r) => r.employeeId), total: Number(conteo.total) };
}
