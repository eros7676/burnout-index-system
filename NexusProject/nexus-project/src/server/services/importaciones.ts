import { randomUUID } from "node:crypto";
import { registrarEvento } from "../repositories/auditoria";
import { ErrorFormatoImportacion } from "./csv-importacion";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ResultadoCancelacion,
  ResultadoImportacion,
  VistaPrevia,
} from "../../shared/contracts";
import {
  bloquearImportacion,
  eliminarTemporalesVencidos,
  jsonImportacion,
  resultadoGuardado,
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

export const MAX_ARCHIVO_CSV = 5 * 1024 * 1024;
export const VIGENCIA_PREVIA_MS = 30 * 60 * 1000;
export type OpcionesImportacion = OpcionesProcesamiento & {
  ahora?: () => Date;
};

export function comprobarArchivoCsv(archivo: File) {
  if (archivo.size > MAX_ARCHIVO_CSV)
    throw new ErrorImportacion(413, "ARCHIVO_EXCESIVO", "Máximo 5 MiB de CSV.");
  const mime = archivo.type.toLowerCase().split(";")[0];
  if (
    !/\.csv$/i.test(archivo.name) ||
    ![
      "",
      "text/csv",
      "application/csv",
      "text/plain",
      "application/octet-stream",
      "application/vnd.ms-excel",
    ].includes(mime)
  )
    throw new ErrorImportacion(
      415,
      "FORMATO_NO_CSV",
      "Seleccione un archivo CSV UTF-8.",
    );
}

async function validarImportacionInterna(
  db: PrismaClient,
  archivo: File,
  actorId: string,
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
  const expiresAt = new Date(ahora.getTime() + VIGENCIA_PREVIA_MS);
  const carga = await db.$transaction(async (tx) => {
    const creada = await tx.importacion.create({
      data: {
        sourceName: archivo.name.slice(0, 255),
        sourceHash,
        uploadedBy: actorId,
        uploadedAt: ahora,
        status: validacion.status,
        expiresAt,
        totalFilas: validacion.totalFilas,
        nuevas: validacion.nuevas,
        omitidas: validacion.omitidas,
        errores: jsonImportacion(validacion.errores),
        warnings: jsonImportacion(validacion.warnings),
        temporal: {
          create: {
            // Las celdas recortadas son strings: conservan precisión y también las filas omitidas.
            datos: jsonImportacion(filas),
            // JSON textual evita el recorte numérico de Prisma/MySQL en la muestra temporal.
            muestra: JSON.stringify(validacion.muestra),
          },
        },
      },
    });
    await registrarEvento(tx, {
      accion:
        validacion.status === "VALIDADA"
          ? "IMPORTACION_VALIDADA"
          : "IMPORTACION_RECHAZADA",
      entidad: "IMPORTACION",
      recursoId: creada.importId,
      actorId,
      detalles: {
        sourceHash,
        schemaVersion: "indicadores-v1",
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
    expiresAt: expiresAt.toISOString(),
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
  actorId: string,
  opciones: OpcionesImportacion = {},
): Promise<VistaPrevia> {
  // Los límites de transporte se rechazan incluso si MySQL no está disponible.
  comprobarArchivoCsv(archivo);
  try {
    return await validarImportacionInterna(db, archivo, actorId, opciones);
  } catch (error) {
    if (
      error instanceof ErrorFormatoImportacion ||
      error instanceof ErrorImportacion
    ) {
      await db.$transaction((tx) =>
        registrarEvento(tx, {
          accion: "IMPORTACION_RECHAZADA",
          entidad: "IMPORTACION",
          recursoId: randomUUID(),
          actorId,
          detalles: { etapa: "FORMATO", codigo: error.codigo },
        }),
      );
    }
    throw error;
  }
}

export async function confirmarImportacion(
  db: PrismaClient,
  importId: string,
  actorId: string,
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
          "La vista previa venció; valide el archivo nuevamente.",
        );
      if (carga.status !== "VALIDADA" || !carga.temporal)
        throw new ErrorImportacion(
          409,
          "ESTADO_INCOMPATIBLE",
          "La importación no está validada para confirmar.",
        );
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
          "Cambió el catálogo o hay un conflicto; valide el archivo nuevamente.",
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
            createdBy: actorId,
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
          confirmedBy: actorId,
          nuevas: nuevas.length,
          omitidas: validacion.omitidas,
          warnings: jsonImportacion(validacion.warnings),
          resultadoConfirmacion: jsonImportacion(resultado),
        },
      });
      await registrarEvento(tx, {
        accion: "IMPORTACION_CONFIRMADA",
        entidad: "IMPORTACION",
        recursoId: importId,
        actorId,
        detalles: {
          sourceHash: carga.sourceHash,
          schemaVersion: "indicadores-v1",
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
        "Otra carga modificó los períodos; valide nuevamente.",
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
      opciones,
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
  actorId: string,
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
        "Una importación confirmada no se puede cancelar.",
      );
    // Contract §4: only VALIDADA may become CANCELADA. A rejected batch keeps its status;
    // its temporary rows expire with the preview like any other.
    if (carga.status === "RECHAZADA")
      throw new ErrorImportacion(
        409,
        "ESTADO_INCOMPATIBLE",
        "Una importación rechazada no se puede cancelar; valide un CSV corregido.",
      );
    if (carga.expiresAt <= reloj())
      throw new ErrorImportacion(
        410,
        "VISTA_PREVIA_VENCIDA",
        "La vista previa venció; valide nuevamente.",
      );
    await tx.importacionTemporal.deleteMany({ where: { importId } });
    await tx.importacion.update({
      where: { importId },
      data: { status: "CANCELADA", cancelledAt: reloj(), cancelledBy: actorId },
    });
    await registrarEvento(tx, {
      accion: "IMPORTACION_CANCELADA",
      entidad: "IMPORTACION",
      recursoId: importId,
      actorId,
      detalles: { estadoAnterior: carga.status },
    });
    return { importId, status: "CANCELADA" };
  });
}
