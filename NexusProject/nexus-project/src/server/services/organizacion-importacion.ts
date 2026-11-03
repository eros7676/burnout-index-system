// personas-v1 in two steps and no state between them: «validate» reads the file and shows what it
// would do; «confirm» receives the same file again, checks it is the one that was previewed and
// validates it again against the catalog as it is now, so a stale preview cannot write anything.
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  ResultadoImportacionPersonas,
  VistaPreviaPersonas,
} from "../../shared/contratos/organizacion";
import { idActor, registrarEvento, type Actor } from "../repositories/auditoria";
import { fechaParaDb } from "../repositories/fechas";
import { equiposConocidos, nombresEnUso } from "../repositories/organizacion";
import { relojReal, type Reloj } from "./organizacion-consultas";
import { conflicto, ErrorOrganizacion, validacionFallida } from "./organizacion-errores";
import {
  leerCsvPersonas,
  validarFilasPersonas,
  type FilaPersonas,
  type PersonaExistente,
} from "./organizacion-csv";
import { claveNombre, lunesActual } from "./organizacion-validacion";

const MUESTRA = 20;
const IMPORTACION = { timeout: 120000, maxWait: 10000 };

async function validarContraCatalogo(
  tx: Prisma.TransactionClient,
  filas: readonly FilaPersonas[],
  reloj: Reloj,
) {
  const legajos = filas.flatMap((f) => {
    const id = f.celdas.employee_id?.trim();
    return id ? [id] : [];
  });
  const existentes = new Map<string, PersonaExistente>(
    (
      await tx.empleado.findMany({
        where: { employeeId: { in: legajos } },
        select: { employeeId: true, nombre: true, tipo: true, teamId: true, enCobertura: true },
      })
    ).map((e) => [e.employeeId, e]),
  );
  return validarFilasPersonas(filas, {
    lunesActual: lunesActual(reloj.ahora()),
    equipos: await equiposConocidos(tx),
    existentes,
    nombresExistentes: new Set((await nombresEnUso(tx)).map(claveNombre)),
  });
}

export async function validarImportacionPersonas(
  db: PrismaClient,
  bytes: Uint8Array,
  reloj: Reloj = relojReal,
): Promise<VistaPreviaPersonas> {
  const { huella, filas } = leerCsvPersonas(bytes);
  const resultado = await db.$transaction((tx) => validarContraCatalogo(tx, filas, reloj), {
    timeout: 30000,
  });
  return {
    esquema: "personas-v1",
    estado: resultado.errores.length ? "RECHAZADA" : "VALIDADA",
    huella,
    totalFilas: filas.length,
    nuevas: resultado.nuevas.length,
    omitidas: resultado.omitidas,
    muestra: resultado.nuevas.slice(0, MUESTRA).map(({ fila, ...p }) => ({ fila, ...p })),
    errores: resultado.errores,
    advertencias: resultado.advertencias,
  };
}

export async function confirmarImportacionPersonas(
  db: PrismaClient,
  bytes: Uint8Array,
  huellaPrevia: string,
  actor: Actor,
  reloj: Reloj = relojReal,
): Promise<ResultadoImportacionPersonas> {
  const { huella, filas } = leerCsvPersonas(bytes);
  if (huella !== huellaPrevia)
    throw new ErrorOrganizacion(
      409,
      "ARCHIVO_DISTINTO",
      "El archivo no es el que se validó. Vuelva a cargarlo para ver la vista previa.",
    );
  return db.$transaction(async (tx) => {
    const resultado = await validarContraCatalogo(tx, filas, reloj);
    if (resultado.errores.length) throw validacionFallida(resultado.errores);
    if (!resultado.nuevas.length)
      throw conflicto("El archivo no contiene personas nuevas: todas ya están registradas.");
    // Their responsable is the team's lead or manager, who exist before the file: the order of rows is free.
    const responsables = new Map(
      (
        await tx.equipo.findMany({
          where: { teamId: { in: [...new Set(resultado.nuevas.flatMap((n) => (n.teamId ? [n.teamId] : [])))] } },
          select: { teamId: true, liderId: true, gerenteId: true },
        })
      ).map((e) => [e.teamId, e]),
    );
    const responsableDe = (tipo: string, teamId: string | null) => {
      const equipo = teamId ? responsables.get(teamId) : undefined;
      return (tipo === "TEAM_LEAD" ? equipo?.gerenteId : tipo === "TECNICO" ? equipo?.liderId : null) ?? null;
    };
    const registradoPor = idActor(actor);
    await tx.empleado.createMany({
      data: resultado.nuevas.map((n) => ({
        employeeId: n.employeeId,
        nombre: n.nombre,
        tipo: n.tipo,
        activo: true,
        enCobertura: n.enCobertura,
        teamId: n.teamId,
        responsableId: responsableDe(n.tipo, n.teamId),
        fechaIngreso: fechaParaDb(n.desde),
      })),
    });
    await tx.asignacionEmpleado.createMany({
      data: resultado.nuevas.map((n) => ({
        employeeId: n.employeeId,
        desde: fechaParaDb(n.desde),
        tipo: n.tipo,
        teamId: n.teamId,
        responsableId: responsableDe(n.tipo, n.teamId),
        enCobertura: n.enCobertura,
        activo: true,
        motivo: "ALTA" as const,
        comentario: "Alta por importación de personas",
        registradoPor,
      })),
    });
    const correlacionId = randomUUID();
    for (const n of resultado.nuevas) {
      await registrarEvento(tx, {
        accion: "EMPLEADO_CREADO",
        recursoId: n.employeeId,
        sujetoId: n.employeeId,
        actor,
        correlacionId,
        detalles: { via: "IMPORTACION", esquema: "personas-v1", teamId: n.teamId, tipo: n.tipo, desde: n.desde },
      });
      if (n.teamId)
        await registrarEvento(tx, {
          accion: "EQUIPO_MIEMBRO_AGREGADO",
          recursoId: n.teamId,
          sujetoId: n.employeeId,
          actor,
          correlacionId,
          detalles: { employeeId: n.employeeId, motivo: "ALTA" },
        });
    }
    await registrarEvento(tx, {
      accion: "IMPORTACION_CONFIRMADA",
      recursoId: correlacionId,
      actor,
      correlacionId,
      detalles: {
        esquema: "personas-v1",
        huella,
        creadas: resultado.nuevas.length,
        omitidas: resultado.omitidas,
      },
    });
    return { correlacionId, creadas: resultado.nuevas.length, omitidas: resultado.omitidas };
  }, IMPORTACION);
}
