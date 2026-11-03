import {
  idActor,
  registrarEvento,
  type Actor,
} from "../repositories/auditoria";
import {
  comprobarArchivoCsv,
  ErrorFormatoImportacion,
  MAX_ARCHIVO_CSV,
} from "./csv-importacion";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ResultadoCancelacion,
  ResultadoImportacion,
  VistaPrevia,
} from "../../shared/contracts";
import {
  bloquearImportacion,
  crearImportacionTemporal,
  eliminarTemporalesVencidos,
  jsonImportacion,
  resultadoGuardado,
  VIGENCIA_PREVIA_MS,
} from "../repositories/importaciones";
import { transaccionImportacion } from "../repositories/transaccion-importacion";
import { fuenteValidacionPrisma } from "../repositories/validacion-importacion";
import {
  clavePeriodo,
  filtroPeriodo,
  guardarRegistrosImportados,
  lotes,
  parDesdePeriodo,
} from "../repositories/registros-importacion";
import { obtenerJob } from "../repositories/procesamientos";
import { leerCsvImportacion, type FilaCsv } from "./csv-importacion";
import { validarFilasImportacion } from "./validacion-importacion";
import { obtenerParesAfectados } from "./evaluaciones";
import {
  procesarImportacion,
  type OpcionesProcesamiento,
} from "./procesamientos";
import { ErrorImportacion } from "./error-importacion";
import {
  confirmarTareasEnTransaccion,
  registrarRechazoDeFormato,
} from "./tareas-importacion-flujo";
import {
  ESQUEMA_INDICADORES,
  ESQUEMA_TAREAS,
} from "../../shared/contratos/importaciones";

export { comprobarArchivoCsv, MAX_ARCHIVO_CSV, VIGENCIA_PREVIA_MS };
export type OpcionesImportacion = OpcionesProcesamiento & {
  ahora?: () => Date;
  /** Rows per INSERT when storing task detail; tests lower it to fail between chunks. */
  tamanoLoteTareas?: number;
};

async function validarImportacionInterna(
  db: PrismaClient,
  archivo: File,
  actor: Actor,
  opciones: OpcionesImportacion = {},
): Promise<VistaPrevia> {
  comprobarArchivoCsv(archivo);
  const ahora = (opciones.ahora ?? (() => new Date()))();
  const { sourceHash, filas } = leerCsvImportacion(
    new Uint8Array(await archivo.arrayBuffer()),
  );
  const validacion = await validarFilasImportacion(
    filas,
    fuenteValidacionPrisma(db),
    ahora,
  );
  await eliminarTemporalesVencidos(db, ahora);
  const carga = await db.$transaction(async (tx) => {
    const creada = await crearImportacionTemporal(tx, {
      nombreArchivo: archivo.name,
      sourceHash,
      schemaVersion: ESQUEMA_INDICADORES,
      usuarioId: idActor(actor),
      ahora,
      validacion,
      // Las celdas recortadas son strings: conservan precisión y también las filas omitidas.
      filas,
      muestra: validacion.muestra,
    });
    await registrarEvento(tx, {
      accion:
        validacion.status === "VALIDADA"
          ? "IMPORTACION_VALIDADA"
          : "IMPORTACION_RECHAZADA",
      recursoId: creada.importId,
      correlacionId: creada.importId,
      actor,
      detalles: {
        sourceHash,
        schemaVersion: ESQUEMA_INDICADORES,
        totalFilas: validacion.totalFilas,
        nuevas: validacion.nuevas,
        omitidas: validacion.omitidas,
        codigosError: [...new Set(validacion.errores.map((e) => e.codigo))],
      },
    });
    return creada;
  });
  const { status, totalFilas, nuevas, omitidas, muestra, errores, warnings } =
    validacion;
  return {
    importId: carga.importId,
    expiresAt: carga.expiresAt.toISOString(),
    status,
    totalFilas,
    nuevas,
    omitidas,
    muestra,
    errores,
    warnings,
  };
}

/** Los rechazos de formato previos a la vista previa también dejan un evento mínimo. */
export async function validarImportacion(
  db: PrismaClient,
  archivo: File,
  actor: Actor,
  opciones: OpcionesImportacion = {},
): Promise<VistaPrevia> {
  // Los límites de transporte se rechazan incluso si MySQL no está disponible.
  comprobarArchivoCsv(archivo);
  try {
    return await validarImportacionInterna(db, archivo, actor, opciones);
  } catch (error) {
    if (
      error instanceof ErrorFormatoImportacion ||
      error instanceof ErrorImportacion
    ) {
      await registrarRechazoDeFormato(db, actor, error, ESQUEMA_INDICADORES);
    }
    throw error;
  }
}

export async function confirmarImportacion(
  db: PrismaClient,
  importId: string,
  actor: Actor,
  opciones: OpcionesImportacion = {},
): Promise<ResultadoImportacion> {
  const reloj = opciones.ahora ?? (() => new Date());
  await eliminarTemporalesVencidos(db, reloj());
  let confirmacion;
  try {
    confirmacion = await transaccionImportacion(db, async (tx) => {
      const carga = await bloquearImportacion(tx, importId);
      if (carga.status === "CONFIRMADA")
        return {
          repetida: true,
          resultado: resultadoGuardado(carga.resultadoConfirmacion),
        };
      if (carga.expiresAt <= reloj())
        throw new ErrorImportacion(
          410,
          "VISTA_PREVIA_VENCIDA",
          "La vista previa venció. Valide el archivo nuevamente.",
        );
      if (carga.status !== "VALIDADA" || !carga.temporal)
        throw new ErrorImportacion(
          409,
          "ESTADO_INCOMPATIBLE",
          "La importación no está validada, por lo que no puede confirmarse.",
        );
      if (carga.schemaVersion === ESQUEMA_TAREAS)
        return {
          repetida: false,
          resultado: await confirmarTareasEnTransaccion(
            tx,
            { importId, sourceHash: carga.sourceHash, temporal: carga.temporal },
            actor,
            reloj(),
            opciones,
          ),
        };
      const filas = carga.temporal.datos as unknown as FilaCsv[];
      const validacion = await validarFilasImportacion(
        filas,
        fuenteValidacionPrisma(tx),
        reloj(),
      );
      if (validacion.status === "RECHAZADA")
        throw new ErrorImportacion(
          409,
          "REVALIDACION_FALLIDA",
          "Cambiaron los datos de las personas o hay un conflicto con otra importación. Valide el archivo nuevamente.",
          validacion.errores,
        );
      // Orden estable reduce deadlocks entre lotes que comparten períodos.
      const nuevas = [...validacion.filasNuevas].sort((a, b) =>
        a.datos.employeeId < b.datos.employeeId
          ? -1
          : a.datos.employeeId > b.datos.employeeId
            ? 1
            : a.datos.periodStart.localeCompare(b.datos.periodStart),
      );
      const ids = await guardarRegistrosImportados(tx, importId, nuevas);
      const afectados = await obtenerParesAfectados(
        tx,
        nuevas.map((f) => f.datos),
      );
      let jobId: string | null = null;
      if (afectados.length) {
        for (const lote of lotes(
          afectados.filter((p) => !ids.has(clavePeriodo(p))),
        )) {
          const periodos = await tx.periodoEmpleado.findMany({
            where: { OR: lote.map(filtroPeriodo) },
            select: {
              periodoId: true,
              employeeId: true,
              periodStart: true,
              periodEnd: true,
            },
          });
          for (const p of periodos)
            ids.set(clavePeriodo(parDesdePeriodo(p)), p.periodoId);
        }
        const pares = afectados.map((par, orden) => {
          const periodoId = ids.get(clavePeriodo(par));
          if (!periodoId)
            throw new Error("Falta un período afectado por la importación.");
          return { periodoId, orden };
        });
        const job = await tx.processingJob.create({
          data: {
            origen: "IMPORTACION",
            importId,
            createdBy: idActor(actor),
            pares: { createMany: { data: pares } },
          },
        });
        jobId = job.jobId;
      }
      const resultado: ResultadoImportacion = {
        importId,
        status: "CONFIRMADA",
        insertados: nuevas.length,
        omitidos: validacion.omitidas,
        afectados,
        procesamiento: jobId
          ? {
              jobId,
              estado: "PENDIENTE",
              totalPares: afectados.length,
              completados: 0,
              errores: [],
              updatedAt: reloj().toISOString(),
            }
          : null,
      };
      await tx.importacion.update({
        where: { importId },
        data: {
          status: "CONFIRMADA",
          confirmedAt: reloj(),
          confirmedBy: idActor(actor),
          nuevas: nuevas.length,
          omitidas: validacion.omitidas,
          warnings: jsonImportacion(validacion.warnings),
          resultadoConfirmacion: jsonImportacion(resultado),
        },
      });
      await registrarEvento(tx, {
        accion: "IMPORTACION_CONFIRMADA",
        recursoId: importId,
        correlacionId: importId,
        actor,
        detalles: {
          sourceHash: carga.sourceHash,
          schemaVersion: ESQUEMA_INDICADORES,
          insertados: nuevas.length,
          omitidos: validacion.omitidas,
          jobId,
        },
      });
      await tx.importacionTemporal.delete({ where: { importId } });
      return { repetida: false, resultado };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    )
      throw new ErrorImportacion(
        409,
        "CONFLICTO_CONCURRENTE",
        "Otra importación modificó las mismas semanas. Valide el archivo nuevamente.",
      );
    throw error;
  }
  const { repetida, resultado } = confirmacion;
  if (repetida || !resultado.procesamiento) return resultado;
  // Trabajo esperado dentro de esta petición. Si el proceso muere, queda persistido y recuperable.
  try {
    resultado.procesamiento = await procesarImportacion(
      db,
      resultado.procesamiento.jobId,
      { ...opciones, actor },
    );
  } catch (error) {
    if (!(error instanceof ErrorImportacion && error.estadoHttp === 409))
      throw error;
    // Otro dueño recuperó el job; esta petición no puede escribir su estado.
    resultado.procesamiento = await obtenerJob(
      db,
      resultado.procesamiento.jobId,
    );
  }
  await db.importacion.update({
    where: { importId },
    data: { resultadoConfirmacion: jsonImportacion(resultado) },
  });
  return resultado;
}

export async function cancelarImportacion(
  db: PrismaClient,
  importId: string,
  actor: Actor,
  opciones: OpcionesImportacion = {},
): Promise<ResultadoCancelacion> {
  const reloj = opciones.ahora ?? (() => new Date());
  await eliminarTemporalesVencidos(db, reloj());
  return transaccionImportacion(db, async (tx) => {
    const carga = await bloquearImportacion(tx, importId);
    if (carga.status === "CANCELADA") return { importId, status: "CANCELADA" };
    if (carga.status === "CONFIRMADA")
      throw new ErrorImportacion(
        409,
        "ESTADO_INCOMPATIBLE",
        "Una importación confirmada no puede cancelarse.",
      );
    // Contract §4: only VALIDADA may become CANCELADA. A rejected batch keeps its status;
    // its temporary rows expire with the preview like any other.
    if (carga.status === "RECHAZADA")
      throw new ErrorImportacion(
        409,
        "ESTADO_INCOMPATIBLE",
        "Una importación rechazada no puede cancelarse. Valide un archivo corregido.",
      );
    if (carga.expiresAt <= reloj())
      throw new ErrorImportacion(
        410,
        "VISTA_PREVIA_VENCIDA",
        "La vista previa venció. Valide el archivo nuevamente.",
      );
    await tx.importacionTemporal.deleteMany({ where: { importId } });
    await tx.importacion.update({
      where: { importId },
      data: { status: "CANCELADA", cancelledAt: reloj(), cancelledBy: idActor(actor) },
    });
    await registrarEvento(tx, {
      accion: "IMPORTACION_CANCELADA",
      recursoId: importId,
      correlacionId: importId,
      actor,
      detalles: {
        estadoAnterior: carga.status,
        schemaVersion: carga.schemaVersion,
      },
    });
    return { importId, status: "CANCELADA" };
  });
}
