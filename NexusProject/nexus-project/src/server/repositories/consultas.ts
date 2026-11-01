import type { Prisma } from "@prisma/client";
import type { FilaTablero } from "../../shared/contracts";
import type { Consulta } from "../services/filtros-consultas";
import {
  ENGINE_VERSION,
  huellaEvaluacion,
} from "../services/huella-evaluacion";
import { registroDesdeDb, reglasDesdeDb } from "./evaluaciones";
import { fechaDesdeDb, fechaParaDb } from "./fechas";
import { leerAlertaEvaluacion } from "./informes";

/** Lecturas por lote dentro de la misma instantánea. No evalúa ni modifica jobs/alertas. */
export async function leerResultados(
  tx: Prisma.TransactionClient,
  filtros: Consulta,
) {
  const periodos = await tx.periodoEmpleado.findMany({
    where: {
      employeeId: filtros.employeeId,
      periodStart: filtros.periodStart
        ? fechaParaDb(filtros.periodStart)
        : undefined,
      empleado: filtros.teamId ? { teamId: filtros.teamId } : undefined,
      registroVigente: { importacion: { status: "CONFIRMADA" } },
    },
    orderBy: [
      { periodStart: "desc" },
      { employeeId: "asc" },
      { periodoId: "asc" },
    ],
    include: {
      empleado: true,
      registroVigente: true,
      evaluacionVigente: { include: { alerta: true } },
      trabajos: {
        orderBy: [{ job: { createdAt: "desc" } }, { jobId: "desc" }],
        take: 1,
        include: { job: true },
      },
    },
  });
  if (!periodos.length) return [];
  const [reloj] = await tx.$queryRaw<
    { ahora: Date }[]
  >`SELECT UTC_TIMESTAMP(3) AS ahora`;
  const anteriores = await tx.periodoEmpleado.findMany({
    where: {
      OR: periodos.map((p) => ({
        employeeId: p.employeeId,
        periodStart: new Date(p.periodStart.getTime() - 7 * 86400000),
        periodEnd: new Date(p.periodEnd.getTime() - 7 * 86400000),
      })),
      registroVigente: { importacion: { status: "CONFIRMADA" } },
    },
    include: { registroVigente: true },
  });
  const mapa = new Map(
    anteriores.map((p) => [
      `${p.employeeId}/${p.periodStart.toISOString()}`,
      p,
    ]),
  );
  const reglas = (
    await tx.configuracionIndice.findMany({
      orderBy: { effectiveFrom: "desc" },
    })
  ).map(reglasDesdeDb);
  return periodos.map((p) => {
    const par = {
      employeeId: p.employeeId,
      periodStart: fechaDesdeDb(p.periodStart),
      periodEnd: fechaDesdeDb(p.periodEnd),
    };
    const anterior = mapa.get(
      `${p.employeeId}/${new Date(p.periodStart.getTime() - 7 * 86400000).toISOString()}`,
    );
    const regla = reglas.find((r) => r.effectiveFrom <= par.periodStart);
    const evaluacion = p.evaluacionVigente;
    const actualizado = !!(
      evaluacion &&
      p.registroVigente &&
      regla &&
      evaluacion.engineVersion === ENGINE_VERSION &&
      evaluacion.processingFingerprint ===
        huellaEvaluacion({
          actual: registroDesdeDb(p.registroVigente, par),
          anterior: anterior?.registroVigente
            ? registroDesdeDb(anterior.registroVigente, {
                employeeId: p.employeeId,
                periodStart: fechaDesdeDb(anterior.periodStart),
                periodEnd: fechaDesdeDb(anterior.periodEnd),
              })
            : null,
          reglas: regla,
        })
    );
    const ultimo = p.trabajos[0];
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
    const fila: FilaTablero = {
      ...par,
      teamId: p.empleado.teamId!,
      nombre: p.empleado.nombre,
      processingState: estado,
      actualizado,
      evaluationId: evaluacion?.evaluationId ?? null,
      indice: evaluacion ? Number(evaluacion.indice) : null,
      nivel: evaluacion?.nivel ?? null,
      alertId: alerta?.alertId ?? null,
    };
    return { fila, alerta };
  });
}

export { leerAlertaEvaluacion };
