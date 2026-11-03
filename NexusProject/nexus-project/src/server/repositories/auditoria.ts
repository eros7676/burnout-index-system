import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  definicionAccion,
  type AccionAuditoria,
  type CambioAuditoria,
  type MotivoAuditoria,
} from "../../shared/auditoria-catalogo";

export {
  ACCIONES_AUDITORIA,
  type AccionAuditoria,
} from "../../shared/auditoria-catalogo";

/** Who acted and through which request. `proteger` builds it for every web request. */
export type ContextoAuditoria = {
  actorId: string;
  actorNombre?: string;
  actorRol?: string;
  origen?: "WEB" | "CLI" | "SISTEMA";
  solicitudId?: string;
};
/** A bare id is enough for CLI scripts and internal adapters. */
export type Actor = string | ContextoAuditoria;

export const idActor = (actor: Actor) =>
  typeof actor === "string" ? actor : actor.actorId;

/** Changed fields only, for the audit diff. Never pass index or indicator values. */
export function calcularCambios<T extends Record<string, unknown>>(
  antes: T,
  despues: Partial<T>,
): CambioAuditoria[] {
  return Object.keys(despues)
    .filter(
      (campo) =>
        JSON.stringify(antes[campo] ?? null) !==
        JSON.stringify(despues[campo] ?? null),
    )
    .map((campo) => ({
      campo,
      antes: antes[campo] ?? null,
      despues: despues[campo] ?? null,
    }));
}

/**
 * Appends one event inside the caller's transaction, so the change and its trace commit together.
 * Only server-defined metadata goes in `detalles`; never raw user input.
 */
export async function registrarEvento(
  tx: Prisma.TransactionClient,
  datos: {
    accion: AccionAuditoria;
    recursoId: string;
    actor: Actor;
    /** The person whose data the event concerns. */
    sujetoId?: string | null;
    resultado?: "EXITO" | "FALLO" | "DENEGADO";
    motivo?: MotivoAuditoria;
    /** One business operation across requests (importId, draft id, alertId). */
    correlacionId?: string | null;
    cambios?: CambioAuditoria[];
    justificacion?: string;
    detalles: Prisma.InputJsonObject;
  },
) {
  const definicion = definicionAccion(datos.accion);
  if (!definicion)
    throw new Error(`Unknown audit action: ${datos.accion}`);
  const justificacion = datos.justificacion?.trim() || null;
  if (definicion.requiereJustificacion && !justificacion)
    throw new Error(`${datos.accion} requires a justification.`);
  const resultado = datos.resultado ?? "EXITO";
  if (resultado !== "EXITO" && !datos.motivo)
    throw new Error(`${datos.accion} ${resultado} requires a reason code.`);
  const actor =
    typeof datos.actor === "string" ? { actorId: datos.actor } : datos.actor;
  return tx.eventoAuditoria.create({
    data: {
      accion: datos.accion,
      entidad: definicion.entidad,
      recursoId: datos.recursoId,
      sujetoId: datos.sujetoId ?? null,
      actorId: actor.actorId,
      actorNombre: actor.actorNombre ?? null,
      actorRol: actor.actorRol ?? null,
      origen: actor.origen ?? null,
      solicitudId: actor.solicitudId ?? null,
      resultado,
      motivo: datos.motivo ?? null,
      correlacionId: datos.correlacionId ?? null,
      ...(datos.cambios?.length
        ? { cambios: datos.cambios as Prisma.InputJsonArray }
        : {}),
      justificacion,
      detalles: datos.detalles,
      // One-shot transitions stay unique per resource; repeatable ones get a fresh key.
      clave: definicion.repetible
        ? `${datos.accion}:${datos.recursoId}:${randomUUID()}`
        : `${definicion.entidad}:${datos.recursoId}:${datos.accion}`,
    },
  });
}
