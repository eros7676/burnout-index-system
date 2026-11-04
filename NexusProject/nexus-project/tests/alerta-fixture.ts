// A person with real alerts, made through the import → evaluation → alert path, for the follow-up and
// export MySQL tests. Everything it creates is removed when the scenario ends.
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { UsuarioDemoDTO } from "../src/shared/contracts";
import { USUARIOS_DEMO } from "../src/server/http/permisos-demo";
import type { SesionSeguimiento } from "../src/server/services/seguimiento";
import {
  confirmarImportacion,
  validarImportacion,
} from "../src/server/services/importaciones";

const ENCABEZADO =
  "employee_id,period_start,period_end,horas_extra,dias_consecutivos_sin_descanso,tareas_activas,tareas_pendientes,tareas_vencidas,vacaciones_pendientes_dias\n";
const SEMANAS: Record<string, string> = {
  "2026-10-05": "2026-10-11",
  "2026-10-12": "2026-10-18",
  "2026-10-19": "2026-10-25",
};

export type Escenario = {
  employeeId: string;
  /** Alerts of the person, oldest week first. */
  alertas: () => Promise<{ alertId: string; periodStart: string }[]>;
  /** Imports one more week (sustained Alto), which creates one more alert. */
  importarSemana: (periodStart: string) => Promise<void>;
};

export const usuario = (userId: string): UsuarioDemoDTO =>
  USUARIOS_DEMO.find((u) => u.userId === userId) as UsuarioDemoDTO;

export const sesion = (userId: string): SesionSeguimiento => {
  const u = usuario(userId);
  return {
    usuario: u,
    usuarios: USUARIOS_DEMO,
    actor: {
      actorId: u.userId,
      actorNombre: u.nombre,
      actorRol: u.rol,
      origen: "WEB",
      solicitudId: randomUUID(),
    },
  };
};

type Opciones = {
  tipo?: "TECNICO" | "TEAM_LEAD";
  teamId?: string;
  /** No responsable in the catalog: the alert has no recipient. */
  sinResponsable?: boolean;
  semanas?: string[];
  nombre?: string;
};

export async function conAlerta(
  db: PrismaClient,
  opciones: Opciones,
  ejecutar: (e: Escenario) => Promise<void>,
) {
  const employeeId = `B7-${randomUUID()}`;
  const tipo = opciones.tipo ?? "TECNICO";
  const importaciones: string[] = [];
  const importar = async (semanas: string[]) => {
    const csv =
      ENCABEZADO +
      semanas
        .map(
          (inicio) =>
            `${employeeId},${inicio},${SEMANAS[inicio]},16,16,10,7,5,14\n`,
        )
        .join("");
    const previa = await validarImportacion(
      db,
      new File([csv], "b7.csv", { type: "text/csv" }),
      "demo-b7",
    );
    if (previa.status !== "VALIDADA")
      throw new Error(`La importación de prueba no validó: ${JSON.stringify(previa.errores)}`);
    importaciones.push(previa.importId);
    const confirmada = await confirmarImportacion(db, previa.importId, "demo-b7");
    if (confirmada.procesamiento?.estado !== "COMPLETADO")
      throw new Error("El procesamiento de prueba no terminó.");
  };
  try {
    await db.empleado.create({
      data: {
        employeeId,
        nombre: opciones.nombre ?? `Persona ficticia ${employeeId.slice(3, 11)}`,
        tipo,
        teamId: opciones.teamId ?? "EQ-01",
        responsableId: opciones.sinResponsable
          ? null
          : tipo === "TECNICO"
            ? "TL-01"
            : "GER-01",
      },
    });
    await importar(opciones.semanas ?? ["2026-10-05", "2026-10-12"]);
    await ejecutar({
      employeeId,
      alertas: async () =>
        (
          await db.alerta.findMany({
            where: { employeeId },
            include: { evaluacion: { include: { periodo: true } } },
          })
        )
          .map((a) => ({
            alertId: a.alertId,
            periodStart: a.evaluacion.periodo.periodStart
              .toISOString()
              .slice(0, 10),
          }))
          .sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
      importarSemana: (periodStart) => importar([periodStart]),
    });
  } finally {
    await db.$transaction(async (tx) => {
      await tx.notaSeguimiento.deleteMany({ where: { caso: { employeeId } } });
      await tx.medidaSeguimiento.deleteMany({ where: { caso: { employeeId } } });
      await tx.casoSeguimiento.deleteMany({ where: { employeeId } });
      await tx.intentoNotificacion.deleteMany({
        where: { alerta: { employeeId } },
      });
      await tx.alerta.deleteMany({ where: { employeeId } });
      await tx.periodoEmpleado.updateMany({
        where: { employeeId },
        data: { registroVigenteId: null, evaluacionVigenteId: null },
      });
      await tx.evaluacion.updateMany({
        where: { employeeId },
        data: { supersedesEvaluationId: null },
      });
      await tx.evaluacion.deleteMany({ where: { employeeId } });
      for (const importId of importaciones) {
        await tx.processingJobPar.deleteMany({ where: { job: { importId } } });
        await tx.processingJob.deleteMany({ where: { importId } });
      }
      await tx.registroLaboral.deleteMany({ where: { employeeId } });
      await tx.periodoEmpleado.deleteMany({ where: { employeeId } });
      for (const importId of importaciones) {
        await tx.importacionTemporal.deleteMany({ where: { importId } });
        await tx.importacion.delete({ where: { importId } });
      }
      await tx.empleado.deleteMany({ where: { employeeId } });
    });
  }
}
