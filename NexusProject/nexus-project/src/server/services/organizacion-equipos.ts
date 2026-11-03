// Writes on teams: create, edit, change the lead, deactivate. The lead decides who the technicians
// report to, so changing it re-points the whole team in the same transaction.
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ErrorCampo } from "../../shared/contracts";
import type { ResultadoEquipo } from "../../shared/contratos/organizacion";
import {
  calcularCambios,
  idActor,
  registrarEvento,
  type Actor,
} from "../repositories/auditoria";
import {
  reasignarAsignacion,
  reasignarResponsableEnLote,
} from "../repositories/organizacion";
import { relojReal, type Reloj } from "./organizacion-consultas";
import {
  conflicto,
  cuerpoPermitido,
  errorCampo,
  noEncontrado,
  validacionFallida,
} from "./organizacion-errores";
import { esLlaveDuplicada } from "./organizacion-personas";
import {
  lunesActual,
  validarDatosEquipo,
  validarEquipoNuevo,
  validarJustificacion,
} from "./organizacion-validacion";

const ESCRITURA = { timeout: 30000 };

/** A lead is an active Team Lead who does not already lead another team. */
async function errorDeLider(
  tx: Prisma.TransactionClient,
  liderId: string,
  teamIdActual: string | null,
): Promise<ErrorCampo | null> {
  const p = await tx.empleado.findUnique({
    where: { employeeId: liderId },
    include: { lidera: true },
  });
  const err = (codigo: string, detalle: string) => errorCampo("liderId", codigo, detalle);
  if (!p) return err("PERSONA_INEXISTENTE", "La persona seleccionada no existe.");
  if (!p.activo) return err("PERSONA_INACTIVA", "La persona seleccionada está dada de baja.");
  if (p.tipo !== "TEAM_LEAD")
    return err("NO_ES_TEAM_LEAD", "La persona seleccionada no tiene el puesto de Team Lead.");
  if (p.lidera?.activo && p.lidera.teamId !== teamIdActual)
    return err("LIDERA_OTRO_EQUIPO", `La persona ya lidera el equipo ${p.lidera.nombre}.`);
  return null;
}

async function errorDeGerente(
  tx: Prisma.TransactionClient,
  gerenteId: string,
): Promise<ErrorCampo | null> {
  const p = await tx.empleado.findUnique({ where: { employeeId: gerenteId } });
  const err = (codigo: string, detalle: string) => errorCampo("gerenteId", codigo, detalle);
  if (!p) return err("PERSONA_INEXISTENTE", "La persona seleccionada no existe.");
  if (!p.activo) return err("PERSONA_INACTIVA", "La persona seleccionada está dada de baja.");
  if (p.tipo !== "GERENCIA")
    return err("NO_ES_GERENCIA", "La persona seleccionada no tiene el puesto de Gerencia.");
  return null;
}

/** The lead belongs to the team and reports to its manager. */
async function incorporarLider(
  tx: Prisma.TransactionClient,
  liderId: string,
  equipo: { teamId: string; gerenteId: string | null },
  { desde, actor, correlacionId }: { desde: string; actor: Actor; correlacionId: string },
) {
  const lider = await tx.empleado.findUniqueOrThrow({ where: { employeeId: liderId } });
  const responsableId = equipo.gerenteId;
  if (lider.teamId === equipo.teamId && lider.responsableId === responsableId) return;
  await reasignarAsignacion(tx, liderId, {
    desde,
    tipo: lider.tipo,
    teamId: equipo.teamId,
    responsableId,
    enCobertura: lider.enCobertura,
    activo: true,
    motivo: "CAMBIO_LIDER",
    comentario: null,
    registradoPor: idActor(actor),
  });
  await tx.empleado.update({
    where: { employeeId: liderId },
    data: { teamId: equipo.teamId, responsableId },
  });
  if (lider.teamId !== equipo.teamId) {
    if (lider.teamId)
      await registrarEvento(tx, {
        accion: "EQUIPO_MIEMBRO_QUITADO",
        recursoId: lider.teamId,
        sujetoId: liderId,
        actor,
        correlacionId,
        detalles: { employeeId: liderId, motivo: "CAMBIO_LIDER" },
      });
    await registrarEvento(tx, {
      accion: "EQUIPO_MIEMBRO_AGREGADO",
      recursoId: equipo.teamId,
      sujetoId: liderId,
      actor,
      correlacionId,
      detalles: { employeeId: liderId, motivo: "CAMBIO_LIDER" },
    });
  }
}

export async function crearEquipo(
  db: PrismaClient,
  cuerpo: unknown,
  actor: Actor,
  reloj: Reloj = relojReal,
): Promise<ResultadoEquipo> {
  const entrada = cuerpoPermitido(cuerpo, ["teamId", "nombre", "liderId", "gerenteId"]);
  try {
    return await db.$transaction(async (tx) => {
      const { valor, errores } = validarEquipoNuevo(entrada);
      if (!valor) throw validacionFallida(errores);
      const referencias: ErrorCampo[] = [];
      if (await tx.equipo.findUnique({ where: { teamId: valor.teamId }, select: { teamId: true } }))
        referencias.push(errorCampo("teamId", "EQUIPO_DUPLICADO", "Ya existe un equipo con este código. Ingrese otro."));
      if (valor.liderId) {
        const e = await errorDeLider(tx, valor.liderId, null);
        if (e) referencias.push(e);
      }
      if (valor.gerenteId) {
        const e = await errorDeGerente(tx, valor.gerenteId);
        if (e) referencias.push(e);
      }
      if (referencias.length) throw validacionFallida(referencias);
      await tx.equipo.create({
        data: {
          teamId: valor.teamId,
          nombre: valor.nombre,
          activo: true,
          liderId: valor.liderId,
          gerenteId: valor.gerenteId,
        },
      });
      const correlacionId = randomUUID();
      if (valor.liderId)
        await incorporarLider(tx, valor.liderId, valor, {
          desde: lunesActual(reloj.ahora()),
          actor,
          correlacionId,
        });
      await registrarEvento(tx, {
        accion: "EQUIPO_CREADO",
        recursoId: valor.teamId,
        sujetoId: valor.liderId,
        actor,
        correlacionId,
        cambios: calcularCambios<Record<string, unknown>>(
          {},
          { nombre: valor.nombre, liderId: valor.liderId, gerenteId: valor.gerenteId },
        ),
        detalles: { via: "FORMULARIO" },
      });
      return { teamId: valor.teamId };
    }, ESCRITURA);
  } catch (error) {
    if (esLlaveDuplicada(error))
      throw validacionFallida([
        errorCampo("teamId", "EQUIPO_DUPLICADO", "Ya existe un equipo con este código o esa persona ya lidera otro equipo."),
      ]);
    throw error;
  }
}

async function equipoActivo(tx: Prisma.TransactionClient, teamId: string) {
  const equipo = await tx.equipo.findUnique({ where: { teamId } });
  if (!equipo) throw noEncontrado("El equipo no existe.");
  if (!equipo.activo) throw conflicto("El equipo está desactivado. No se puede modificar.");
  return equipo;
}

export async function editarEquipo(
  db: PrismaClient,
  teamId: string,
  cuerpo: unknown,
  actor: Actor,
  reloj: Reloj = relojReal,
): Promise<ResultadoEquipo> {
  const entrada = cuerpoPermitido(cuerpo, ["nombre", "gerenteId"]);
  return db.$transaction(async (tx) => {
    const equipo = await equipoActivo(tx, teamId);
    const { valor, errores } = validarDatosEquipo(entrada);
    if (!valor) throw validacionFallida(errores);
    if (valor.gerenteId) {
      const e = await errorDeGerente(tx, valor.gerenteId);
      if (e) throw validacionFallida([e]);
    }
    const cambios = calcularCambios(
      { nombre: equipo.nombre, gerenteId: equipo.gerenteId },
      valor,
    );
    if (!cambios.length)
      throw validacionFallida([errorCampo("nombre", "SIN_CAMBIOS", "No hay cambios para guardar.")]);
    await tx.equipo.update({ where: { teamId }, data: valor });
    const correlacionId = randomUUID();
    if (cambios.some((c) => c.campo === "gerenteId") && equipo.liderId) {
      const lider = await tx.empleado.findUniqueOrThrow({ where: { employeeId: equipo.liderId } });
      await reasignarAsignacion(tx, equipo.liderId, {
        desde: lunesActual(reloj.ahora()),
        tipo: lider.tipo,
        teamId,
        responsableId: valor.gerenteId ?? null,
        enCobertura: lider.enCobertura,
        activo: true,
        motivo: "CAMBIO_LIDER",
        comentario: null,
        registradoPor: idActor(actor),
      });
      await tx.empleado.update({
        where: { employeeId: equipo.liderId },
        data: { responsableId: valor.gerenteId ?? null },
      });
    }
    await registrarEvento(tx, {
      accion: "EQUIPO_ACTUALIZADO",
      recursoId: teamId,
      actor,
      correlacionId,
      cambios,
      detalles: { campos: cambios.map((c) => c.campo) },
    });
    return { teamId };
  }, ESCRITURA);
}

export async function cambiarLider(
  db: PrismaClient,
  teamId: string,
  cuerpo: unknown,
  actor: Actor,
  reloj: Reloj = relojReal,
): Promise<ResultadoEquipo> {
  const entrada = cuerpoPermitido(cuerpo, ["liderId"]);
  try {
    return await db.$transaction(async (tx) => {
      const equipo = await equipoActivo(tx, teamId);
      const liderId = typeof entrada.liderId === "string" ? entrada.liderId.trim() : "";
      if (!liderId)
        throw validacionFallida([errorCampo("liderId", "OBLIGATORIO", "Seleccione al nuevo líder.")]);
      if (liderId === equipo.liderId)
        throw validacionFallida([
          errorCampo("liderId", "SIN_CAMBIOS", "La persona seleccionada ya lidera el equipo. Seleccione otra."),
        ]);
      const error = await errorDeLider(tx, liderId, teamId);
      if (error) throw validacionFallida([error]);
      const desde = lunesActual(reloj.ahora());
      const correlacionId = randomUUID();
      await tx.equipo.update({ where: { teamId }, data: { liderId } });
      await incorporarLider(tx, liderId, equipo, { desde, actor, correlacionId });
      const tecnicos = await tx.empleado.findMany({
        where: { teamId, activo: true, tipo: "TECNICO" },
        select: { employeeId: true },
      });
      await reasignarResponsableEnLote(
        tx,
        tecnicos.map((t) => t.employeeId),
        { responsableId: liderId, desde, registradoPor: idActor(actor) },
      );
      await registrarEvento(tx, {
        accion: "EQUIPO_LIDER_CAMBIADO",
        recursoId: teamId,
        sujetoId: liderId,
        actor,
        correlacionId,
        cambios: calcularCambios<Record<string, unknown>>(
          { liderId: equipo.liderId },
          { liderId },
        ),
        detalles: { desde, personasReasignadas: tecnicos.length },
      });
      return { teamId };
    }, ESCRITURA);
  } catch (error) {
    if (esLlaveDuplicada(error))
      throw validacionFallida([
        errorCampo("liderId", "LIDERA_OTRO_EQUIPO", "La persona ya lidera otro equipo."),
      ]);
    throw error;
  }
}

export async function desactivarEquipo(
  db: PrismaClient,
  teamId: string,
  cuerpo: unknown,
  actor: Actor,
): Promise<ResultadoEquipo> {
  const entrada = cuerpoPermitido(cuerpo, ["justificacion"]);
  return db.$transaction(async (tx) => {
    const equipo = await tx.equipo.findUnique({ where: { teamId } });
    if (!equipo) throw noEncontrado("El equipo no existe.");
    if (!equipo.activo) throw conflicto("El equipo ya está desactivado.");
    const { valor: justificacion, errores } = validarJustificacion(entrada.justificacion);
    if (!justificacion) throw validacionFallida(errores);
    const personas = await tx.empleado.count({
      where: {
        teamId,
        activo: true,
        ...(equipo.liderId ? { employeeId: { not: equipo.liderId } } : {}),
      },
    });
    if (personas)
      throw conflicto(
        `El equipo tiene ${personas} ${personas === 1 ? "persona activa" : "personas activas"}. Cámbielas de equipo antes de desactivarlo.`,
        [errorCampo("justificacion", "EQUIPO_CON_PERSONAS", "El equipo todavía tiene personas activas.")],
      );
    await tx.equipo.update({ where: { teamId }, data: { activo: false, liderId: null } });
    await registrarEvento(tx, {
      accion: "EQUIPO_DESACTIVADO",
      recursoId: teamId,
      sujetoId: equipo.liderId,
      actor,
      cambios: calcularCambios<Record<string, unknown>>(
        { activo: true, liderId: equipo.liderId },
        { activo: false, liderId: null },
      ),
      justificacion,
      detalles: {},
    });
    return { teamId };
  }, ESCRITURA);
}
