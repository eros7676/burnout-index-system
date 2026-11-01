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
import { fechaParaDb } from "../repositories/fechas";
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

export async function validarImportacion(
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
  const carga = await db.importacion.create({
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
      for (const { datos, fingerprint } of nuevas) {
        const { periodStart, periodEnd, ...metricas } = datos;
        const clave = {
          employeeId: datos.employeeId,
          periodStart: fechaParaDb(periodStart),
          periodEnd: fechaParaDb(periodEnd),
        };
        const periodo = await tx.periodoEmpleado.upsert({
          where: { employeeId_periodStart_periodEnd: clave },
          create: clave,
          update: {},
        });
        if (periodo.registroVigenteId)
          throw new ErrorImportacion(
            409,
            "CONFLICTO_HISTORICO",
            "El período ya tiene datos; valide nuevamente.",
          );
        const registro = await tx.registroLaboral.create({
          data: {
            ...metricas,
            periodoId: periodo.periodoId,
            sourceImportId: importId,
            fingerprint,
          },
        });
        await tx.periodoEmpleado.update({
          where: { periodoId: periodo.periodoId },
          data: { registroVigenteId: registro.recordId },
        });
      }
      const afectados = await obtenerParesAfectados(
        tx,
        nuevas.map((f) => f.datos),
      );
      let jobId: string | null = null;
      if (afectados.length) {
        const pares = [];
        for (const [orden, par] of afectados.entries()) {
          const periodo = await tx.periodoEmpleado.findUniqueOrThrow({
            where: {
              employeeId_periodStart_periodEnd: {
                employeeId: par.employeeId,
                periodStart: fechaParaDb(par.periodStart),
                periodEnd: fechaParaDb(par.periodEnd),
              },
            },
          });
          pares.push({ periodoId: periodo.periodoId, orden });
        }
        const job = await tx.processingJob.create({
          data: {
            origen: "IMPORTACION",
            importId,
            createdBy: actorId,
            pares: { create: pares },
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
    return { importId, status: "CANCELADA" };
  });
}
