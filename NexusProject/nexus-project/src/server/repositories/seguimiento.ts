import type { Prisma, PrismaClient } from "@prisma/client";
import type { Factor } from "../../shared/contracts";
import {
  TIPOS_MEDIDA,
  type CasoSeguimientoDTO,
  type MedidaSeguimientoDTO,
  type NotaSeguimientoDTO,
  type ResumenSeguimiento,
  type TipoMedida,
  type UsuarioReferencia,
} from "../../shared/contratos/seguimiento";
import {
  casoDeAlerta,
  esVencido,
  type AlertaSeguimiento,
  type TipoPersona,
} from "../services/seguimiento-reglas";
import { fechaDesdeDb } from "./fechas";

export type Cliente = PrismaClient | Prisma.TransactionClient;

const incluirCaso = {
  medidas: { orderBy: [{ createdAt: "asc" }, { medidaId: "asc" }] },
  notas: { orderBy: [{ createdAt: "asc" }, { notaId: "asc" }] },
} satisfies Prisma.CasoSeguimientoInclude;
export type CasoDb = Prisma.CasoSeguimientoGetPayload<{
  include: typeof incluirCaso;
}>;

export type ContextoAlerta = {
  alerta: AlertaSeguimiento;
  persona: { nombre: string; tipo: TipoPersona; activo: boolean };
};

/** The alert as the follow-up rules see it, with its person and recipient; null when it does not exist. */
export async function leerAlertaSeguimiento(
  db: Cliente,
  alertId: string,
): Promise<ContextoAlerta | null> {
  const fila = await db.alerta.findUnique({
    where: { alertId },
    include: {
      empleado: {
        select: { nombre: true, tipo: true, teamId: true, activo: true },
      },
      destinatario: { select: { tipo: true } },
    },
  });
  if (!fila) return null;
  return {
    alerta: {
      alertId: fila.alertId,
      employeeId: fila.employeeId,
      createdAt: fila.createdAt,
      vigencia: fila.vigencia,
      personaTeamId: fila.empleado.teamId,
      destinatarioTipo: fila.destinatario?.tipo ?? null,
    },
    persona: {
      nombre: fila.empleado.nombre,
      tipo: fila.empleado.tipo,
      activo: fila.empleado.activo,
    },
  };
}

/** All the person's cases, newest first, with measures and notes. */
export function leerCasos(db: Cliente, employeeId: string) {
  return db.casoSeguimiento.findMany({
    where: { employeeId },
    include: incluirCaso,
    orderBy: [{ createdAt: "desc" }, { casoId: "desc" }],
  });
}

/** Locks the person so every follow-up write of that person runs one at a time. */
export async function bloquearPersona(
  tx: Prisma.TransactionClient,
  employeeId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT employeeId FROM Empleado WHERE employeeId = ${employeeId} FOR UPDATE`;
}

export type Nombres = ReadonlyMap<string, string>;
export const referencia = (
  nombres: Nombres,
  userId: string,
): UsuarioReferencia => ({ userId, nombre: nombres.get(userId) ?? userId });

const FACTORES = new Set<string>(["HE", "DS", "CT", "VP"]);

function dtoMedida(m: CasoDb["medidas"][number], nombres: Nombres): MedidaSeguimientoDTO {
  return {
    medidaId: m.medidaId,
    tipo: (m.tipo in TIPOS_MEDIDA ? m.tipo : "REVISAR_DOTACION") as TipoMedida,
    factor: m.factor && FACTORES.has(m.factor) ? (m.factor as Factor) : null,
    responsable: referencia(nombres, m.responsable),
    vence: m.vence ? fechaDesdeDb(m.vence) : null,
    hecha: m.hecha,
    createdAt: m.createdAt.toISOString(),
  };
}

function dtoNota(
  n: CasoDb["notas"][number],
  caso: CasoDb,
  nombres: Nombres,
): NotaSeguimientoDTO {
  return {
    notaId: n.notaId,
    autor: referencia(nombres, n.autorId),
    texto: n.texto,
    createdAt: n.createdAt.toISOString(),
    // The closing note is written with the closing instant itself.
    esCierre:
      caso.cerradoAt !== null && n.createdAt.getTime() === caso.cerradoAt.getTime(),
  };
}

export function dtoCaso(
  caso: CasoDb,
  nombres: Nombres,
  opciones: { verNotas: boolean; hoy: string },
): CasoSeguimientoDTO {
  const vence = caso.vence ? fechaDesdeDb(caso.vence) : null;
  return {
    casoId: caso.casoId,
    employeeId: caso.employeeId,
    alertaOrigenId: caso.alertaOrigenId,
    estado: caso.estado,
    asignadoA: referencia(nombres, caso.asignadoA),
    vence,
    vencido: esVencido({ estado: caso.estado, vence }, opciones.hoy),
    motivoCierre: caso.motivoCierre,
    abiertoPor: referencia(nombres, caso.abiertoPor),
    cerradoPor: caso.cerradoPor ? referencia(nombres, caso.cerradoPor) : null,
    createdAt: caso.createdAt.toISOString(),
    cerradoAt: caso.cerradoAt?.toISOString() ?? null,
    medidas: caso.medidas.map((m) => dtoMedida(m, nombres)),
    notas: opciones.verNotas
      ? caso.notas.map((n) => dtoNota(n, caso, nombres))
      : null,
    totalNotas: caso.notas.length,
  };
}

/**
 * The case each alert belongs to, for a list: one query for all the people involved, matched by the
 * same rule the detail uses. Alerts with no case are absent from the map.
 */
export async function resumirSeguimientos(
  db: Cliente,
  alertas: readonly { alertId: string; employeeId: string; createdAt: Date }[],
  nombres: Nombres,
  hoy: string,
): Promise<Map<string, ResumenSeguimiento>> {
  const resumenes = new Map<string, ResumenSeguimiento>();
  const personas = [...new Set(alertas.map((a) => a.employeeId))];
  if (!personas.length) return resumenes;
  const casos = await db.casoSeguimiento.findMany({
    where: { employeeId: { in: personas } },
    select: {
      casoId: true,
      employeeId: true,
      alertaOrigenId: true,
      estado: true,
      asignadoA: true,
      vence: true,
      createdAt: true,
      cerradoAt: true,
    },
  });
  const porPersona = new Map<string, typeof casos>();
  for (const c of casos)
    porPersona.set(c.employeeId, [...(porPersona.get(c.employeeId) ?? []), c]);
  for (const alerta of alertas) {
    const hallado = casoDeAlerta(porPersona.get(alerta.employeeId) ?? [], alerta);
    if (!hallado) continue;
    const { caso } = hallado;
    const vence = caso.vence ? fechaDesdeDb(caso.vence) : null;
    resumenes.set(alerta.alertId, {
      casoId: caso.casoId,
      estado: caso.estado,
      asignadoA: referencia(nombres, caso.asignadoA),
      vence,
      vencido: esVencido({ estado: caso.estado, vence }, hoy),
    });
  }
  return resumenes;
}
