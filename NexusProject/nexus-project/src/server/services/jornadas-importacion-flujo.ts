// Lifecycle of a `jornadas-v1` file: validate → preview → confirm. The same states, 30-minute
// preview and audit events as the other datasets (tareas-importacion-flujo.ts); only what is
// checked and what is written differ. Confirmation runs inside the caller's transaction.
import type { Prisma, PrismaClient } from "@prisma/client";
import { idActor, registrarEvento, type Actor } from "../repositories/auditoria";
import {
  crearImportacionTemporal,
  eliminarTemporalesVencidos,
  jsonImportacion,
} from "../repositories/importaciones";
import {
  fuenteJornadasPrisma,
  guardarJornadasImportadas,
  TAMANO_LOTE_JORNADAS,
} from "../repositories/jornadas-importacion";
import {
  ESQUEMA_JORNADAS,
  type ResultadoImportacionJornadas,
  type VistaPreviaJornadas,
} from "../../shared/contratos/importaciones";
import { ErrorFormatoImportacion, comprobarArchivoCsv } from "./csv-importacion";
import { ErrorImportacion } from "./error-importacion";
import { leerCsvJornadas, validarFilasJornadas, type FilaCsvJornadas } from "./jornadas-importacion";
import { registrarRechazoDeFormato } from "./tareas-importacion-flujo";

type Opciones = { ahora?: () => Date };

async function validarInterna(
  db: PrismaClient,
  archivo: File,
  actor: Actor,
  opciones: Opciones,
): Promise<VistaPreviaJornadas> {
  const ahora = (opciones.ahora ?? (() => new Date()))();
  const { sourceHash, filas } = leerCsvJornadas(new Uint8Array(await archivo.arrayBuffer()));
  const validacion = await validarFilasJornadas(filas, fuenteJornadasPrisma(db), ahora);
  await eliminarTemporalesVencidos(db, ahora);
  const { importId, expiresAt } = await db.$transaction(async (tx) => {
    const creada = await crearImportacionTemporal(tx, {
      nombreArchivo: archivo.name,
      sourceHash,
      schemaVersion: ESQUEMA_JORNADAS,
      usuarioId: idActor(actor),
      ahora,
      validacion,
      filas,
      muestra: validacion.muestra,
    });
    await registrarEvento(tx, {
      accion: validacion.status === "VALIDADA" ? "IMPORTACION_VALIDADA" : "IMPORTACION_RECHAZADA",
      recursoId: creada.importId,
      correlacionId: creada.importId,
      actor,
      detalles: {
        sourceHash,
        schemaVersion: ESQUEMA_JORNADAS,
        totalFilas: validacion.totalFilas,
        nuevas: validacion.nuevas,
        omitidas: validacion.omitidas,
        semanas: validacion.conciliacion.semanas,
        diferencias: validacion.conciliacion.diferencias,
        codigosError: [...new Set(validacion.errores.map((e) => e.codigo))],
      },
    });
    return creada;
  });
  return {
    importId,
    expiresAt: expiresAt.toISOString(),
    status: validacion.status,
    totalFilas: validacion.totalFilas,
    nuevas: validacion.nuevas,
    omitidas: validacion.omitidas,
    muestra: [],
    errores: validacion.errores,
    warnings: validacion.warnings,
    esquema: ESQUEMA_JORNADAS,
    semanasNuevas: validacion.semanasNuevas,
    semanasOmitidas: validacion.semanasOmitidas,
    conciliacion: validacion.conciliacion,
    muestraJornadas: validacion.muestra,
  };
}

export async function validarImportacionJornadas(
  db: PrismaClient,
  archivo: File,
  actor: Actor,
  opciones: Opciones = {},
): Promise<VistaPreviaJornadas> {
  // Transport limits are refused even when MySQL is unavailable.
  comprobarArchivoCsv(archivo);
  try {
    return await validarInterna(db, archivo, actor, opciones);
  } catch (error) {
    if (error instanceof ErrorFormatoImportacion || error instanceof ErrorImportacion)
      await registrarRechazoDeFormato(db, actor, error, ESQUEMA_JORNADAS);
    throw error;
  }
}

/**
 * The confirmation of a day file, inside the transaction that holds the import's lock. It
 * validates again against the current catalogue and stored weeks, inserts the days in chunks,
 * marks each record with its detail fingerprint, and records the event. The summary does not
 * change, so there is nothing to calculate and no job.
 */
export async function confirmarJornadasEnTransaccion(
  tx: Prisma.TransactionClient,
  carga: { importId: string; sourceHash: string; temporal: { datos: unknown } },
  actor: Actor,
  ahora: Date,
  opciones: { tamanoLoteJornadas?: number } = {},
): Promise<ResultadoImportacionJornadas> {
  const { importId } = carga;
  const validacion = await validarFilasJornadas(
    carga.temporal.datos as FilaCsvJornadas[],
    fuenteJornadasPrisma(tx),
    ahora,
  );
  if (validacion.status === "RECHAZADA")
    throw new ErrorImportacion(
      409,
      "REVALIDACION_FALLIDA",
      "Cambiaron los datos de las personas o de los resúmenes semanales, o hay un conflicto con otra importación. Valide el archivo nuevamente.",
      validacion.errores,
    );
  // Stable order lowers the chance of deadlocks between batches that share weeks.
  const grupos = [...validacion.grupos].sort(
    (a, b) => a.employeeId.localeCompare(b.employeeId) || a.periodStart.localeCompare(b.periodStart),
  );
  const insertadas = await guardarJornadasImportadas(
    tx,
    importId,
    grupos,
    opciones.tamanoLoteJornadas ?? TAMANO_LOTE_JORNADAS,
  );
  const resultado: ResultadoImportacionJornadas = {
    importId,
    status: "CONFIRMADA",
    esquema: ESQUEMA_JORNADAS,
    insertados: insertadas,
    omitidos: validacion.omitidas,
    afectados: [],
    procesamiento: null,
    semanas: grupos.length,
  };
  await tx.importacion.update({
    where: { importId },
    data: {
      status: "CONFIRMADA",
      confirmedAt: ahora,
      confirmedBy: idActor(actor),
      nuevas: insertadas,
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
      schemaVersion: ESQUEMA_JORNADAS,
      insertados: insertadas,
      omitidos: validacion.omitidas,
      semanas: grupos.length,
    },
  });
  await tx.importacionTemporal.delete({ where: { importId } });
  return resultado;
}
