import type { Prisma } from "@prisma/client";
import type { FechaISO, SemanaPersona } from "../../shared/contracts";
import { ENGINE_VERSION, huellaEvaluacion } from "../services/huella-evaluacion";
import { sumarDias } from "../services/organizacion-validacion";
import { registroDesdeDb, reglasDesdeDb } from "./evaluaciones";
import { fechaDesdeDb, fechaParaDb } from "./fechas";

const SEMANA = 7 * 86_400_000;

/**
 * The weeks of a set of people, bounded in time: `semanas` calendar weeks ending at `hasta`,
 * newest first per person. One query for the periods, one for their jobs, one for the rules; the
 * week before the oldest is read only as the predecessor of that week.
 *
 * It applies the same freshness rule as `leerResultados` (T14): a result counts as current only
 * when its fingerprint matches the data, the predecessor, the rules and the engine in force.
 * tests/organizacion.mysql.test.ts keeps both readers in step.
 */
export async function leerSemanasPersonas(
  tx: Prisma.TransactionClient,
  {
    employeeIds,
    hasta,
    semanas,
  }: { employeeIds: readonly string[]; hasta: FechaISO; semanas: number },
): Promise<Map<string, SemanaPersona[]>> {
  const porPersona = new Map<string, SemanaPersona[]>();
  if (!employeeIds.length) return porPersona;
  const antesDeLaVentana = sumarDias(hasta, -7 * semanas);
  const periodos = await tx.periodoEmpleado.findMany({
    where: {
      employeeId: { in: [...employeeIds] },
      periodStart: {
        gte: fechaParaDb(antesDeLaVentana),
        lte: fechaParaDb(hasta),
      },
      registroVigente: { importacion: { status: "CONFIRMADA" } },
    },
    orderBy: [{ periodStart: "desc" }, { employeeId: "asc" }],
    include: {
      registroVigente: true,
      evaluacionVigente: { include: { alerta: true } },
    },
  });
  const salida = periodos.filter(
    (p) => fechaDesdeDb(p.periodStart) > antesDeLaVentana,
  );
  if (!salida.length) return porPersona;

  const [reloj] = await tx.$queryRaw<
    { ahora: Date }[]
  >`SELECT UTC_TIMESTAMP(3) AS ahora`;
  const pares = await tx.processingJobPar.findMany({
    where: { periodoId: { in: salida.map((p) => p.periodoId) } },
    orderBy: [{ job: { createdAt: "desc" } }, { jobId: "desc" }],
    include: { job: true },
  });
  const ultimoTrabajo = new Map<string, (typeof pares)[number]>();
  for (const par of pares)
    if (!ultimoTrabajo.has(par.periodoId)) ultimoTrabajo.set(par.periodoId, par);
  const reglas = (
    await tx.configuracionIndice.findMany({ orderBy: { effectiveFrom: "desc" } })
  ).map(reglasDesdeDb);
  const porSemana = new Map(
    periodos.map((p) => [`${p.employeeId}/${p.periodStart.toISOString()}`, p]),
  );

  for (const p of salida) {
    const par = {
      employeeId: p.employeeId,
      periodStart: fechaDesdeDb(p.periodStart),
      periodEnd: fechaDesdeDb(p.periodEnd),
    };
    const registro = registroDesdeDb(p.registroVigente!, par);
    const previo = porSemana.get(
      `${p.employeeId}/${new Date(p.periodStart.getTime() - SEMANA).toISOString()}`,
    );
    const regla = reglas.find((r) => r.effectiveFrom <= par.periodStart);
    const evaluacion = p.evaluacionVigente;
    const actualizado = !!(
      evaluacion &&
      regla &&
      evaluacion.engineVersion === ENGINE_VERSION &&
      evaluacion.processingFingerprint ===
        huellaEvaluacion({
          actual: registro,
          anterior: previo?.registroVigente
            ? registroDesdeDb(previo.registroVigente, {
                employeeId: p.employeeId,
                periodStart: fechaDesdeDb(previo.periodStart),
                periodEnd: fechaDesdeDb(previo.periodEnd),
              })
            : null,
          reglas: regla,
        })
    );
    const ultimo = ultimoTrabajo.get(p.periodoId);
    let estado = ultimo?.estado ?? (actualizado ? "COMPLETADO" : "PENDIENTE");
    if (estado === "COMPLETADO" && !actualizado) estado = "PENDIENTE";
    if (
      estado === "PROCESANDO" &&
      (!ultimo?.job.leaseUntil || ultimo.job.leaseUntil <= reloj.ahora)
    )
      estado = "PENDIENTE";
    const alerta =
      actualizado && evaluacion?.alerta?.vigencia === "ACTIVA"
        ? evaluacion.alerta
        : null;
    const semana: SemanaPersona = {
      periodStart: par.periodStart,
      periodEnd: par.periodEnd,
      horasExtra: registro.horasExtra,
      diasConsecutivosSinDescanso: registro.diasConsecutivosSinDescanso,
      tareasActivas: registro.tareasActivas,
      tareasPendientes: registro.tareasPendientes,
      tareasVencidas: registro.tareasVencidas,
      vacacionesPendientesDias: registro.vacacionesPendientesDias,
      horasTrabajadas: registro.horasTrabajadas,
      diasDesdeUltimasVacaciones: registro.diasDesdeUltimasVacaciones,
      actualizado,
      processingState: estado,
      evaluationId: evaluacion?.evaluationId ?? null,
      indice: evaluacion ? Number(evaluacion.indice) : null,
      nivel: evaluacion?.nivel ?? null,
      alertId: alerta?.alertId ?? null,
    };
    porPersona.set(p.employeeId, [...(porPersona.get(p.employeeId) ?? []), semana]);
  }
  return porPersona;
}

/** Loaded weeks of the people in scope, newest first; at most `maximo` (a selector, not a history). */
export async function semanasCargadas(
  tx: Prisma.TransactionClient,
  teamId: string | undefined,
  maximo = 104,
): Promise<FechaISO[]> {
  const filas = await tx.periodoEmpleado.groupBy({
    by: ["periodStart"],
    where: {
      registroVigente: { importacion: { status: "CONFIRMADA" } },
      ...(teamId ? { empleado: { teamId } } : {}),
    },
    orderBy: { periodStart: "desc" },
    take: maximo,
  });
  return filas.map((f) => fechaDesdeDb(f.periodStart));
}
