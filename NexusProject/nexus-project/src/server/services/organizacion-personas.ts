// Writes on people: hire, edit data, change team or position, deactivate. Each runs in one
// transaction with its audit events, so a change and its trace commit or fail together.
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ResultadoPersona,
  TipoPuesto,
} from "../../shared/contratos/organizacion";
import {
  calcularCambios,
  idActor,
  registrarEvento,
  type Actor,
} from "../repositories/auditoria";
import { fechaDesdeDb, fechaParaDb } from "../repositories/fechas";
import {
  anexarAsignacion,
  derivarResponsable,
  equiposConocidos,
  nombresEnUso,
  primeraAsignacion,
  responsabilidadesDe,
  ultimaAsignacion,
} from "../repositories/organizacion";
import { relojReal, type Reloj } from "./organizacion-consultas";
import {
  conflicto,
  cuerpoPermitido,
  errorCampo,
  ErrorOrganizacion,
  noEncontrado,
  validacionFallida,
} from "./organizacion-errores";
import {
  claveNombre,
  hoyBuenosAires,
  lunesActual,
  validarAlta,
  validarBaja,
  validarCambio,
  validarDatosPersona,
} from "./organizacion-validacion";

const ESCRITURA = { timeout: 30000 };

/** A concurrent hire of the same legajo loses on the primary key: the same answer as the check. */
export function esLlaveDuplicada(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

type Persona = NonNullable<Awaited<ReturnType<PrismaClient["empleado"]["findUnique"]>>>;

/** Whoever leads or manages a team cannot leave it or change position until it is handed over. */
async function exigirSinResponsabilidades(
  tx: Prisma.TransactionClient,
  persona: Persona,
  { cambiaEquipo, cambiaPuesto, baja }: { cambiaEquipo: boolean; cambiaPuesto: boolean; baja: boolean },
) {
  const { lidera, gerencia } = await responsabilidadesDe(tx, persona.employeeId);
  if (lidera && (baja || cambiaEquipo || cambiaPuesto))
    throw conflicto(
      `${persona.nombre} lidera el equipo ${lidera.nombre}. Asigne otro líder al equipo antes de ${baja ? "dar de baja a la persona" : "cambiar su equipo o puesto"}.`,
      [
        errorCampo(
          baja ? "fechaBaja" : cambiaPuesto ? "tipo" : "teamId",
          "LIDERA_EQUIPO",
          `La persona lidera el equipo ${lidera.nombre}.`,
        ),
      ],
    );
  if (gerencia.length && (baja || cambiaPuesto))
    throw conflicto(
      `${persona.nombre} es la persona de Gerencia responsable de ${gerencia.map((g) => g.nombre).join(", ")}. Asigne otra persona de Gerencia a esos equipos antes de ${baja ? "dar de baja a la persona" : "cambiar su puesto"}.`,
      [
        errorCampo(
          baja ? "fechaBaja" : "tipo",
          "GERENCIA_DE_EQUIPOS",
          "La persona es responsable de equipos activos.",
        ),
      ],
    );
}

const cambiosDeEquipo = async (
  tx: Prisma.TransactionClient,
  {
    employeeId,
    antes,
    despues,
    actor,
    correlacionId,
    motivo,
  }: {
    employeeId: string;
    antes: string | null;
    despues: string | null;
    actor: Actor;
    correlacionId: string;
    motivo: string;
  },
) => {
  if (antes === despues) return;
  if (antes)
    await registrarEvento(tx, {
      accion: "EQUIPO_MIEMBRO_QUITADO",
      recursoId: antes,
      sujetoId: employeeId,
      actor,
      correlacionId,
      detalles: { employeeId, motivo },
    });
  if (despues)
    await registrarEvento(tx, {
      accion: "EQUIPO_MIEMBRO_AGREGADO",
      recursoId: despues,
      sujetoId: employeeId,
      actor,
      correlacionId,
      detalles: { employeeId, motivo },
    });
};

export async function crearPersona(
  db: PrismaClient,
  cuerpo: unknown,
  actor: Actor,
  reloj: Reloj = relojReal,
): Promise<ResultadoPersona> {
  const entrada = cuerpoPermitido(cuerpo, [
    "employeeId", "nombre", "tipo", "teamId", "desde", "enCobertura", "confirmarNombreRepetido",
  ]);
  if (
    "confirmarNombreRepetido" in entrada &&
    typeof entrada.confirmarNombreRepetido !== "boolean"
  )
    throw new ErrorOrganizacion(400, "PETICION_INVALIDA", "confirmarNombreRepetido debe ser verdadero o falso.");
  try {
    return await db.$transaction(async (tx) => {
      const { valor, errores } = validarAlta(entrada, {
        lunesActual: lunesActual(reloj.ahora()),
        equipos: await equiposConocidos(tx),
      });
      if (!valor) throw validacionFallida(errores);
      if (await tx.empleado.findUnique({ where: { employeeId: valor.employeeId }, select: { employeeId: true } }))
        throw validacionFallida([
          errorCampo("employeeId", "LEGAJO_DUPLICADO", "Ya existe una persona con este legajo. Ingrese otro."),
        ]);
      if (
        entrada.confirmarNombreRepetido !== true &&
        (await nombresEnUso(tx)).some((n) => claveNombre(n) === claveNombre(valor.nombre))
      )
        throw new ErrorOrganizacion(409, "NOMBRE_REPETIDO", "Ya hay una persona con este nombre.", [
          errorCampo(
            "nombre",
            "NOMBRE_REPETIDO",
            "Ya hay una persona con este nombre. Verifique que no sea un duplicado y confirme para continuar.",
          ),
        ]);
      const responsableId = await derivarResponsable(tx, valor.tipo, valor.teamId);
      await tx.empleado.create({
        data: {
          employeeId: valor.employeeId,
          nombre: valor.nombre,
          tipo: valor.tipo,
          activo: true,
          enCobertura: valor.enCobertura,
          teamId: valor.teamId,
          responsableId,
          fechaIngreso: fechaParaDb(valor.desde),
        },
      });
      await anexarAsignacion(tx, {
        employeeId: valor.employeeId,
        desde: valor.desde,
        tipo: valor.tipo,
        teamId: valor.teamId,
        responsableId,
        enCobertura: valor.enCobertura,
        activo: true,
        motivo: "ALTA",
        comentario: null,
        registradoPor: idActor(actor),
      });
      const correlacionId = randomUUID();
      await registrarEvento(tx, {
        accion: "EMPLEADO_CREADO",
        recursoId: valor.employeeId,
        sujetoId: valor.employeeId,
        actor,
        correlacionId,
        cambios: calcularCambios<Record<string, unknown>>(
          {},
          {
            nombre: valor.nombre,
            tipo: valor.tipo,
            teamId: valor.teamId,
            responsableId,
            enCobertura: valor.enCobertura,
            fechaIngreso: valor.desde,
          },
        ),
        detalles: { via: "FORMULARIO", desde: valor.desde },
      });
      await cambiosDeEquipo(tx, {
        employeeId: valor.employeeId,
        antes: null,
        despues: valor.teamId,
        actor,
        correlacionId,
        motivo: "ALTA",
      });
      return { employeeId: valor.employeeId };
    }, ESCRITURA);
  } catch (error) {
    if (esLlaveDuplicada(error))
      throw validacionFallida([
        errorCampo("employeeId", "LEGAJO_DUPLICADO", "Ya existe una persona con este legajo. Ingrese otro."),
      ]);
    throw error;
  }
}

export async function editarPersona(
  db: PrismaClient,
  employeeId: string,
  cuerpo: unknown,
  actor: Actor,
): Promise<ResultadoPersona> {
  const entrada = cuerpoPermitido(cuerpo, ["nombre", "fechaIngreso"]);
  return db.$transaction(async (tx) => {
    const persona = await tx.empleado.findUnique({ where: { employeeId } });
    if (!persona) throw noEncontrado("La persona no existe.");
    const primera = await primeraAsignacion(tx, employeeId);
    const { valor, errores } = validarDatosPersona(entrada, {
      primerDesde: primera ? fechaDesdeDb(primera.desde) : null,
    });
    if (!valor) throw validacionFallida(errores);
    const antes = {
      nombre: persona.nombre,
      fechaIngreso: persona.fechaIngreso ? fechaDesdeDb(persona.fechaIngreso) : null,
    };
    const cambios = calcularCambios(antes, valor);
    if (!cambios.length)
      throw validacionFallida([
        errorCampo("nombre", "SIN_CAMBIOS", "No hay cambios para guardar."),
      ]);
    await tx.empleado.update({
      where: { employeeId },
      data: {
        ...(valor.nombre !== undefined ? { nombre: valor.nombre } : {}),
        ...(valor.fechaIngreso !== undefined
          ? { fechaIngreso: valor.fechaIngreso ? fechaParaDb(valor.fechaIngreso) : null }
          : {}),
      },
    });
    await registrarEvento(tx, {
      accion: "EMPLEADO_ACTUALIZADO",
      recursoId: employeeId,
      sujetoId: employeeId,
      actor,
      cambios,
      detalles: { campos: cambios.map((c) => c.campo) },
    });
    return { employeeId };
  }, ESCRITURA);
}

export async function cambiarAsignacion(
  db: PrismaClient,
  employeeId: string,
  cuerpo: unknown,
  actor: Actor,
  reloj: Reloj = relojReal,
): Promise<ResultadoPersona> {
  const entrada = cuerpoPermitido(cuerpo, [
    "motivo", "desde", "tipo", "teamId", "enCobertura", "comentario",
  ]);
  return db.$transaction(async (tx) => {
    const persona = await tx.empleado.findUnique({ where: { employeeId } });
    if (!persona) throw noEncontrado("La persona no existe.");
    if (!persona.activo)
      throw conflicto("La persona está dada de baja. No se puede modificar su asignación.");
    const ultima = await ultimaAsignacion(tx, employeeId);
    if (!ultima) throw conflicto("La persona no tiene historial de asignaciones.");
    const { valor, errores } = validarCambio(
      entrada,
      {
        tipo: persona.tipo,
        teamId: persona.teamId,
        enCobertura: persona.enCobertura,
        desde: fechaDesdeDb(ultima.desde),
        fechaIngreso: persona.fechaIngreso ? fechaDesdeDb(persona.fechaIngreso) : null,
      },
      { lunesActual: lunesActual(reloj.ahora()), equipos: await equiposConocidos(tx) },
    );
    if (!valor) throw validacionFallida(errores);
    await exigirSinResponsabilidades(tx, persona, {
      cambiaEquipo: valor.teamId !== persona.teamId,
      cambiaPuesto: valor.tipo !== persona.tipo,
      baja: false,
    });
    const responsableId = await derivarResponsable(tx, valor.tipo, valor.teamId);
    const registradoPor = idActor(actor);
    const datos = {
      tipo: valor.tipo as TipoPuesto,
      teamId: valor.teamId,
      responsableId,
      enCobertura: valor.enCobertura,
    };
    if (valor.motivo === "CORRECCION")
      await tx.asignacionEmpleado.update({
        where: { asignacionId: ultima.asignacionId },
        data: { ...datos, motivo: "CORRECCION", comentario: valor.comentario, registradoPor },
      });
    else
      await anexarAsignacion(tx, {
        employeeId,
        desde: valor.desde,
        ...datos,
        activo: true,
        motivo: valor.motivo,
        comentario: valor.comentario,
        registradoPor,
      });
    await tx.empleado.update({ where: { employeeId }, data: datos });
    const correlacionId = randomUUID();
    await registrarEvento(tx, {
      accion: "EMPLEADO_ACTUALIZADO",
      recursoId: employeeId,
      sujetoId: employeeId,
      actor,
      correlacionId,
      cambios: calcularCambios(
        {
          tipo: persona.tipo,
          teamId: persona.teamId,
          responsableId: persona.responsableId,
          enCobertura: persona.enCobertura,
        },
        datos,
      ),
      justificacion: valor.comentario ?? undefined,
      detalles: { motivo: valor.motivo, desde: valor.desde },
    });
    await cambiosDeEquipo(tx, {
      employeeId,
      antes: persona.teamId,
      despues: valor.teamId,
      actor,
      correlacionId,
      motivo: valor.motivo,
    });
    return { employeeId };
  }, ESCRITURA);
}

export async function darDeBaja(
  db: PrismaClient,
  employeeId: string,
  cuerpo: unknown,
  actor: Actor,
  reloj: Reloj = relojReal,
): Promise<ResultadoPersona> {
  const entrada = cuerpoPermitido(cuerpo, ["fechaBaja", "justificacion"]);
  return db.$transaction(async (tx) => {
    const persona = await tx.empleado.findUnique({ where: { employeeId } });
    if (!persona) throw noEncontrado("La persona no existe.");
    if (!persona.activo) throw conflicto("La persona ya está dada de baja.");
    const ultima = await ultimaAsignacion(tx, employeeId);
    if (!ultima) throw conflicto("La persona no tiene historial de asignaciones.");
    const { valor, errores } = validarBaja(entrada, {
      hoy: hoyBuenosAires(reloj.ahora()),
      desdeActual: fechaDesdeDb(ultima.desde),
    });
    if (!valor) throw validacionFallida(errores);
    await exigirSinResponsabilidades(tx, persona, {
      cambiaEquipo: false,
      cambiaPuesto: false,
      baja: true,
    });
    await anexarAsignacion(tx, {
      employeeId,
      desde: valor.desdeBaja,
      tipo: persona.tipo,
      teamId: persona.teamId,
      responsableId: persona.responsableId,
      enCobertura: persona.enCobertura,
      activo: false,
      motivo: "BAJA",
      comentario: valor.justificacion,
      registradoPor: idActor(actor),
    });
    await tx.empleado.update({
      where: { employeeId },
      data: { activo: false, fechaBaja: fechaParaDb(valor.fechaBaja) },
    });
    const correlacionId = randomUUID();
    await registrarEvento(tx, {
      accion: "EMPLEADO_DESACTIVADO",
      recursoId: employeeId,
      sujetoId: employeeId,
      actor,
      correlacionId,
      cambios: calcularCambios<Record<string, unknown>>(
        { activo: true, fechaBaja: null },
        { activo: false, fechaBaja: valor.fechaBaja },
      ),
      justificacion: valor.justificacion,
      detalles: { desdeBaja: valor.desdeBaja },
    });
    await cambiosDeEquipo(tx, {
      employeeId,
      antes: persona.teamId,
      despues: null,
      actor,
      correlacionId,
      motivo: "BAJA",
    });
    return { employeeId };
  }, ESCRITURA);
}
