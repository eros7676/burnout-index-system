import {
  Prisma,
  type PrismaClient,
  type IntentoNotificacion as FilaIntento,
} from "@prisma/client";
import type {
  IntentoNotificacion,
  SolicitudNotificacion,
} from "../../shared/contracts";
import { mensajeAviso, simularCorreo } from "../../lib/mail";
import type { Factor } from "../../shared/contracts";
import { configCorreo, enviadorSmtp, motivoFallo, type ConfigCorreo, type Enviador } from "../correo";
import {
  calcularCambios,
  registrarEvento,
  type Actor,
} from "../repositories/auditoria";
import { fechaDesdeDb } from "../repositories/fechas";
import { resolverDestinatario } from "./destinatario-alerta";

/** Internal adapters (scripts, tests) act like `actorDemo` does without a session. */
const ACTOR_INTERNO: Actor = { actorId: "demo-local" };

/**
 * How a notice leaves: by real mail when the server has an SMTP configuration, simulated otherwise.
 * Tests pass their own `enviar` so no message leaves the machine.
 */
export type Correo = { config: ConfigCorreo | null; enviar?: Enviador };
const correoDelEntorno = (): Correo => ({ config: configCorreo() });

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
  // Attempts are only ever made on the simulated or the mail channel.
  canal: fila.canal === "CORREO" ? "CORREO" : "SIMULADO",
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
        // A real send runs inside the attempt's lock, so the SMTP timeouts must fit in the transaction.
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5_000, timeout: 40_000 },
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
  correo: Correo = correoDelEntorno(),
): Promise<IntentoNotificacion> {
  const canal = correo.config ? ("CORREO" as const) : ("SIMULADO" as const);
  if (canal === "CORREO" && solicitud.resultado === "FALLO")
    throw new ErrorNotificacion(409, "Con el correo real configurado no se simulan fallos.");
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
        canal,
      },
    });
    await tx.alerta.update({
      where: { alertId },
      data: { ...destino, canal, estadoEnvio: "PENDIENTE" },
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
        canal,
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
  correo: Correo = correoDelEntorno(),
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
    const real = intento.canal === "CORREO";
    const resultado = superada
      ? {
          estado: "FALLIDO" as const,
          detalle: real
            ? "La alerta fue superada antes de enviar el correo."
            : "La alerta fue superada antes de simular el envío.",
        }
      : real
        ? await enviarAviso(tx, alerta, intento.destinatarioId, correo)
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
                : real
                  ? ("ERROR_TECNICO" as const)
                  : ("SIMULADO_FALLO" as const),
          }),
      cambios: calcularCambios(
        { estadoEnvio: alerta.estadoEnvio },
        { estadoEnvio: resultado.estado },
      ),
      detalles: {
        numero: intento.numero,
        canal: intento.canal,
        estado: resultado.estado,
      },
    });
    return dto(final);
  });
}

/**
 * Sends the alert's notice by real mail to the demo inbox, naming whom it was for. A refused or
 * unreachable server ends the attempt as FALLIDO with the SMTP code; a new attempt can retry it.
 */
async function enviarAviso(
  tx: Prisma.TransactionClient,
  alerta: { alertId: string; evaluationId: string; employeeId: string; causas: Prisma.JsonValue; sugerencias: Prisma.JsonValue },
  destinatarioId: string | null,
  correo: Correo,
): Promise<{ estado: "ENVIADO" | "FALLIDO" | "SIN_DESTINATARIO"; detalle: string }> {
  if (!destinatarioId)
    return { estado: "SIN_DESTINATARIO", detalle: "No hay un responsable válido para enviar el correo." };
  if (!correo.config)
    return { estado: "FALLIDO", detalle: "El servidor ya no tiene configurado el correo real." };
  const [persona, destinatario, evaluacion] = await Promise.all([
    tx.empleado.findUniqueOrThrow({
      where: { employeeId: alerta.employeeId },
      select: { nombre: true, equipo: { select: { nombre: true } } },
    }),
    tx.empleado.findUniqueOrThrow({
      where: { employeeId: destinatarioId },
      select: { nombre: true, tipo: true },
    }),
    tx.evaluacion.findUniqueOrThrow({
      where: { evaluationId: alerta.evaluationId },
      select: { indice: true, periodo: { select: { periodStart: true, periodEnd: true } } },
    }),
  ]);
  const { asunto, texto } = mensajeAviso(
    {
      alertId: alerta.alertId,
      persona: { nombre: persona.nombre, equipo: persona.equipo?.nombre ?? null },
      destinatario,
      periodStart: fechaDesdeDb(evaluacion.periodo.periodStart),
      periodEnd: fechaDesdeDb(evaluacion.periodo.periodEnd),
      indice: Number(evaluacion.indice),
      causas: alerta.causas as Factor[],
      sugerencias: alerta.sugerencias as string[],
    },
    correo.config.appUrl,
  );
  try {
    await (correo.enviar ?? enviadorSmtp(correo.config))({ para: correo.config.destinoDemo, asunto, texto });
    return { estado: "ENVIADO", detalle: "Enviado por correo a la casilla de demostración." };
  } catch (error) {
    return { estado: "FALLIDO", detalle: `No se pudo enviar el correo (${motivoFallo(error)}).`.slice(0, 255) };
  }
}
