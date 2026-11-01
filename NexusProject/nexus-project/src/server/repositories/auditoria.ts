import type { Prisma } from "@prisma/client";

export const ACCIONES_AUDITORIA = [
  "IMPORTACION_VALIDADA",
  "IMPORTACION_RECHAZADA",
  "IMPORTACION_CONFIRMADA",
  "IMPORTACION_CANCELADA",
  "REGLAS_PUBLICADAS",
] as const;
export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number];

/** Solo metadatos definidos por el servidor. Nunca pasar entrada cruda del usuario. */
export async function registrarEvento(
  tx: Prisma.TransactionClient,
  datos: {
    accion: AccionAuditoria;
    entidad: "IMPORTACION" | "REGLAS";
    recursoId: string;
    actorId: string;
    detalles: Prisma.InputJsonObject;
  },
) {
  return tx.eventoAuditoria.create({
    data: {
      ...datos,
      clave: `${datos.entidad}:${datos.recursoId}:${datos.accion}`,
    },
  });
}
