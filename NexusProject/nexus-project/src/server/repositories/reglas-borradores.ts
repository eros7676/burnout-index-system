import type {
  BorradorReglas,
  EstadoBorradorReglas,
  Prisma,
} from "@prisma/client";
import type { CambioAuditoria } from "../../shared/auditoria-catalogo";
import type { UsuarioRefDTO } from "../../shared/contratos/reglas";
import { ErrorBorrador } from "../services/reglas-politica";

export type BorradorFila = BorradorReglas;

/**
 * Reads the draft under a row lock. Every step of the lifecycle starts here, so
 * two requests on the same draft run one after the other and the second one sees
 * the first one's result (MySQL: a locking read sees the latest committed data).
 */
export async function bloquearBorrador(
  tx: Prisma.TransactionClient,
  borradorId: string,
): Promise<BorradorFila> {
  const filas = await tx.$queryRaw<{ borradorId: string }[]>`
    SELECT borradorId FROM BorradorReglas WHERE borradorId = ${borradorId} FOR UPDATE`;
  if (filas.length !== 1) throw noEncontrado();
  return tx.borradorReglas.findUniqueOrThrow({ where: { borradorId } });
}

export async function leerBorrador(
  tx: Prisma.TransactionClient,
  borradorId: string,
): Promise<BorradorFila> {
  const fila = await tx.borradorReglas.findUnique({ where: { borradorId } });
  if (!fila) throw noEncontrado();
  return fila;
}

export const noEncontrado = () =>
  new ErrorBorrador("NO_ENCONTRADO", "No existe el borrador de reglas.");

export type FiltroBorradores = {
  estado?: EstadoBorradorReglas;
  page: number;
  pageSize: number;
};

/** Newest activity first; the page is cut in SQL. */
export async function listarBorradoresPaginado(
  tx: Prisma.TransactionClient,
  filtro: FiltroBorradores,
) {
  const where: Prisma.BorradorReglasWhereInput = filtro.estado
    ? { estado: filtro.estado }
    : {};
  const [total, items] = await Promise.all([
    tx.borradorReglas.count({ where }),
    tx.borradorReglas.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { borradorId: "asc" }],
      skip: (filtro.page - 1) * filtro.pageSize,
      take: filtro.pageSize,
    }),
  ]);
  return { total, items };
}

type EventoFila = {
  eventoId: string;
  accion: string;
  actorId: string;
  actorNombre: string | null;
  actorRol: string | null;
  createdAt: Date;
  justificacion: string | null;
  cambios: Prisma.JsonValue | null;
  correlacionId: string | null;
  recursoId: string;
};

export const usuarioDeEvento = (
  e: Pick<EventoFila, "actorId" | "actorNombre" | "actorRol">,
): UsuarioRefDTO => ({
  userId: e.actorId,
  nombre: e.actorNombre ?? e.actorId,
  rol: (e.actorRol as UsuarioRefDTO["rol"]) ?? null,
});

/** Events of drafts by correlation id, oldest first. */
export async function leerHistorial(
  tx: Prisma.TransactionClient,
  borradorIds: string[],
): Promise<EventoFila[]> {
  if (borradorIds.length === 0) return [];
  return tx.eventoAuditoria.findMany({
    where: { correlacionId: { in: borradorIds }, resultado: "EXITO" },
    orderBy: [{ createdAt: "asc" }, { eventoId: "asc" }],
    select: {
      eventoId: true,
      accion: true,
      actorId: true,
      actorNombre: true,
      actorRol: true,
      createdAt: true,
      justificacion: true,
      cambios: true,
      correlacionId: true,
      recursoId: true,
    },
  });
}

/** Who published each version, from the publication event. */
export async function leerPublicaciones(
  tx: Prisma.TransactionClient,
  versiones: string[],
): Promise<Map<string, EventoFila>> {
  const eventos = await tx.eventoAuditoria.findMany({
    where: {
      accion: "REGLAS_PUBLICADAS",
      recursoId: { in: versiones },
    },
    select: {
      eventoId: true,
      accion: true,
      actorId: true,
      actorNombre: true,
      actorRol: true,
      createdAt: true,
      justificacion: true,
      cambios: true,
      correlacionId: true,
      recursoId: true,
    },
  });
  return new Map(eventos.map((e) => [e.recursoId, e]));
}

export const cambiosDeEvento = (e: Pick<EventoFila, "cambios">): CambioAuditoria[] =>
  Array.isArray(e.cambios) ? (e.cambios as CambioAuditoria[]) : [];
