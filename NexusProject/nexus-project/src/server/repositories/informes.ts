import { Prisma, type PrismaClient } from "@prisma/client";
import type { Alerta, Factor, InformeDTO } from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";

type Cliente = PrismaClient | Prisma.TransactionClient;
const FACTORES = new Set<Factor>(["HE", "DS", "CT", "VP"]);

function leerCausas(valor: Prisma.JsonValue): Factor[] {
  if (
    !Array.isArray(valor) ||
    valor.some((item) => typeof item !== "string" || !FACTORES.has(item as Factor))
  ) {
    throw new ErrorDominio(
      "CONTRATO_INVALIDO",
      "La alerta guardada no tiene causas reconocibles.",
    );
  }
  return valor as Factor[];
}

function leerTextos(valor: Prisma.JsonValue): string[] {
  if (!Array.isArray(valor) || valor.some((item) => typeof item !== "string")) {
    throw new ErrorDominio(
      "CONTRATO_INVALIDO",
      "La alerta guardada no tiene sugerencias reconocibles.",
    );
  }
  return valor as string[];
}

export async function leerEmpleadoInforme(
  db: Cliente,
  employeeId: string,
): Promise<InformeDTO["empleado"]> {
  const fila = await db.empleado.findUnique({ where: { employeeId } });
  if (!fila) {
    throw new ErrorDominio(
      "EMPLEADO_NO_EXISTE",
      "La evaluación no apunta a un empleado del catálogo.",
    );
  }
  if (!fila.teamId || (fila.tipo !== "TECNICO" && fila.tipo !== "TEAM_LEAD")) {
    throw new ErrorDominio(
      "CONTRATO_INVALIDO",
      "El informe P0 solo identifica técnicos y team leads con equipo.",
    );
  }
  return {
    employeeId: fila.employeeId,
    nombre: fila.nombre,
    teamId: fila.teamId,
    tipo: fila.tipo,
  };
}

/** Lee la alerta de esa evaluación, sea ACTIVA o SUPERADA. No crea ni la modifica. */
export async function leerAlertaEvaluacion(
  db: Cliente,
  evaluationId: string,
): Promise<Alerta | null> {
  const fila = await db.alerta.findUnique({ where: { evaluationId } });
  if (!fila) return null;
  return {
    alertId: fila.alertId,
    evaluationId: fila.evaluationId,
    employeeId: fila.employeeId,
    destinatarioId: fila.destinatarioId,
    motivoDestinatario: fila.motivoDestinatario,
    causas: leerCausas(fila.causas),
    sugerencias: leerTextos(fila.sugerencias),
    vigencia: fila.vigencia,
    canal: fila.canal,
    estadoEnvio: fila.estadoEnvio,
    createdAt: fila.createdAt.toISOString(),
  };
}
