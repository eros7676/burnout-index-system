import {
  Prisma,
  type PrismaClient,
  type IntentoNotificacion as FilaIntento,
} from "@prisma/client";
import type {
  IntentoNotificacion,
  SolicitudNotificacion,
} from "../../shared/contracts";
import { simularCorreo } from "../../lib/mail";
import {
  calcularCambios,
  registrarEvento,
  type Actor,
} from "../repositories/auditoria";
import { resolverDestinatario } from "./destinatario-alerta";

/** Internal adapters (scripts, tests) act like `actorDemo` does without a session. */
const ACTOR_INTERNO: Actor = { actorId: "demo-local" };

export class ErrorNotificacion extends Error {
  constructor(
    public status: 404 | 409,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
const dto = (fila: FilaIntento): IntentoNotificacion => ({
  ...fila,
  createdAt: fila.createdAt.toISOString(),
  completedAt: fila.completedAt?.toISOString() ?? null,
});

async function transaccion<T>(
  db: PrismaClient,
  alertId: string,
  accion: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let n = 0; ; n++) {
    try {
      return await db.$transaction(
        async (tx) => {
          const filas = await tx.$queryRaw<
            { alertId: string }[]
          >`SELECT alertId FROM Alerta WHERE alertId = ${alertId} FOR UPDATE`;
          if (!filas.length)
            throw new ErrorNotificacion(404, "No existe esa alerta.");
          return accion(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (
        n >= 2 ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !(
          error.code === "P2034" ||
          (error.code === "P2010" && error.meta?.code === "1213")
        )
      )
        throw error;
    }
  }
}

export async function listarNotificaciones(
  db: PrismaClient,
  alertId: string,
): Promise<IntentoNotificacion[]> {
  if (
    !(await db.alerta.findUnique({
      where: { alertId },
      select: { alertId: true },
    }))
  )
    throw new ErrorNotificacion(404, "No existe esa alerta.");
  return (
    await db.intentoNotificacion.findMany({
      where: { alertId },
      orderBy: { numero: "desc" },
    })
  ).map(dto);
}

/**
 * Una sola notificación pendiente por alerta. Repetir requestId devuelve el mismo intento.
 * Crear el intento deja su evento NOTIFICACION_PREPARADA en la misma transacción.
 */
export async function prepararNotificacion(
  db: PrismaClient,
  alertId: string,
  solicitud: SolicitudNotificacion,
  actor: Actor = ACTOR_INTERNO,
): Promise<IntentoNotificacion> {
  return transaccion(db, alertId, async (tx) => {
    const existente = await tx.intentoNotificacion.findUnique({
      where: { alertId_requestId: { alertId, requestId: solicitud.requestId } },
    });
    if (existente) {
      if (existente.resultado !== solicitud.resultado)
        throw new ErrorNotificacion(
          409,
          "La solicitud ya existe con otro resultado simulado.",
        );
      return dto(existente);
    }
    const alerta = await tx.alerta.findUniqueOrThrow({
      where: { alertId },
      include: { empleado: { include: { responsable: true } } },
    });
    if (alerta.vigencia !== "ACTIVA")
      throw new ErrorNotificacion(409, "La alerta está superada.");
    const ultimo = await tx.intentoNotificacion.findFirst({
      where: { alertId },
      orderBy: { numero: "desc" },
    });
    if (ultimo?.estado === "PENDIENTE" || ultimo?.estado === "ENVIADO")
      return dto(ultimo);
    const destino = resolverDestinatario(
      alerta.empleado,
      alerta.empleado.responsable,
    );
    const intento = await tx.intentoNotificacion.create({
      data: {
        alertId,
        ...solicitud,
        numero: (ultimo?.numero ?? 0) + 1,
        destinatarioId: destino.destinatarioId,
      },
    });
    await tx.alerta.update({
      where: { alertId },
      data: { ...destino, canal: "SIMULADO", estadoEnvio: "PENDIENTE" },
    });
    await registrarEvento(tx, {
      accion: "NOTIFICACION_PREPARADA",
      recursoId: intento.intentoId,
      actor,
      sujetoId: alerta.employeeId,
      correlacionId: alertId,
      cambios: calcularCambios(
        { estadoEnvio: alerta.estadoEnvio },
        { estadoEnvio: "PENDIENTE" },
      ),
      detalles: {
        numero: intento.numero,
        canal: "SIMULADO",
        resultadoSolicitado: solicitud.resultado,
      },
    });
    return dto(intento);
  });
}

/**
 * Procesa un intento persistido; puede repetirse incluso tras reiniciar el servidor.
 * Solo el primer proceso deja su evento NOTIFICACION_PROCESADA, en la misma transacción.
 */
export async function procesarNotificacion(
  db: PrismaClient,
  alertId: string,
  intentoId: string,
  actor: Actor = ACTOR_INTERNO,
): Promise<IntentoNotificacion> {
  return transaccion(db, alertId, async (tx) => {
    const intento = await tx.intentoNotificacion.findFirst({
      where: { alertId, intentoId },
    });
    if (!intento)
      throw new ErrorNotificacion(404, "No existe ese intento en la alerta.");
    if (intento.estado !== "PENDIENTE") return dto(intento);
    const alerta = await tx.alerta.findUniqueOrThrow({ where: { alertId } });
    const superada = alerta.vigencia !== "ACTIVA";
    const resultado = superada
      ? {
          estado: "FALLIDO" as const,
          detalle: "La alerta fue superada antes de simular el envío.",
        }
      : simularCorreo(intento.destinatarioId, intento.resultado);
    const final = await tx.intentoNotificacion.update({
      where: { intentoId },
      data: { ...resultado, completedAt: new Date() },
    });
    await tx.alerta.update({
      where: { alertId },
      data: { estadoEnvio: resultado.estado },
    });
    await registrarEvento(tx, {
      accion: "NOTIFICACION_PROCESADA",
      recursoId: intentoId,
      actor,
      sujetoId: alerta.employeeId,
      correlacionId: alertId,
      resultado: resultado.estado === "ENVIADO" ? "EXITO" : "FALLO",
      ...(resultado.estado === "ENVIADO"
        ? {}
        : {
            motivo: superada
              ? ("ESTADO_INCOMPATIBLE" as const)
              : resultado.estado === "SIN_DESTINATARIO"
                ? ("SIN_DESTINATARIO" as const)
                : ("SIMULADO_FALLO" as const),
          }),
      cambios: calcularCambios(
        { estadoEnvio: alerta.estadoEnvio },
        { estadoEnvio: resultado.estado },
      ),
      detalles: {
        numero: intento.numero,
        canal: "SIMULADO",
        estado: resultado.estado,
      },
    });
    return dto(final);
  });
}
