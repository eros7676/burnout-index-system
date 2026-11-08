// Lifecycle of a `tareas-v1` file: validate → preview → confirm. It follows the same states,
// 30-minute preview and audit events as `indicadores-v1` (importaciones.ts); only what is
// checked and what is written differ. Confirmation runs inside the caller's transaction.
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { idActor, registrarEvento, type Actor } from "../repositories/auditoria";
import { PLAZO_IMPORTACION } from "../repositories/transaccion-importacion";
import {
  crearImportacionTemporal,
  eliminarTemporalesVencidos,
  jsonImportacion,
} from "../repositories/importaciones";
import {
  fuenteTareasPrisma,
  guardarTareasImportadas,
  TAMANO_LOTE_TAREAS,
} from "../repositories/tareas-importacion";
import {
  ESQUEMA_TAREAS,
  type ResultadoImportacionTareas,
  type VistaPreviaTareas,
} from "../../shared/contratos/importaciones";
import { ErrorFormatoImportacion, comprobarArchivoCsv } from "./csv-importacion";
import { ErrorImportacion } from "./error-importacion";
import {
  leerCsvTareas,
  validarFilasTareas,
  type FilaCsvTareas,
} from "./tareas-importacion";

type Opciones = { ahora?: () => Date };

async function validarInterna(
  db: PrismaClient,
  archivo: File,
  actor: Actor,
  opciones: Opciones,
): Promise<VistaPreviaTareas> {
  comprobarArchivoCsv(archivo);
  const ahora = (opciones.ahora ?? (() => new Date()))();
  const { sourceHash, filas } = leerCsvTareas(
    new Uint8Array(await archivo.arrayBuffer()),
  );
  const validacion = await validarFilasTareas(
    filas,
    fuenteTareasPrisma(db),
    ahora,
  );
  await eliminarTemporalesVencidos(db, ahora);
  const { importId, expiresAt } = await db.$transaction(async (tx) => {
    const creada = await crearImportacionTemporal(tx, {
      nombreArchivo: archivo.name,
      sourceHash,
      schemaVersion: ESQUEMA_TAREAS,
      usuarioId: idActor(actor),
      ahora,
      validacion,
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
        schemaVersion: ESQUEMA_TAREAS,
        totalFilas: validacion.totalFilas,
        nuevas: validacion.nuevas,
        omitidas: validacion.omitidas,
        excluidas: validacion.excluidas,
        semanas: validacion.conciliacion.semanas,
        diferencias: validacion.conciliacion.diferencias,
        codigosError: [...new Set(validacion.errores.map((e) => e.codigo))],
      },
    });
    return creada;
  }, PLAZO_IMPORTACION);
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
    esquema: ESQUEMA_TAREAS,
    excluidas: validacion.excluidas,
    semanasNuevas: validacion.semanasNuevas,
    semanasOmitidas: validacion.semanasOmitidas,
    conciliacion: validacion.conciliacion,
    muestraTareas: validacion.muestra,
  };
}

/** A format rejection before the preview leaves a minimal event, as for any dataset. */
export async function registrarRechazoDeFormato(
  db: PrismaClient,
  actor: Actor,
  error: ErrorFormatoImportacion | ErrorImportacion,
  schemaVersion: string,
) {
  await db.$transaction((tx) =>
    registrarEvento(tx, {
      accion: "IMPORTACION_RECHAZADA",
      recursoId: randomUUID(),
      actor,
      detalles: { etapa: "FORMATO", codigo: error.codigo, schemaVersion },
    }),
  );
}

export async function validarImportacionTareas(
  db: PrismaClient,
  archivo: File,
  actor: Actor,
  opciones: Opciones = {},
): Promise<VistaPreviaTareas> {
  // Transport limits are refused even when MySQL is unavailable.
  comprobarArchivoCsv(archivo);
  try {
    return await validarInterna(db, archivo, actor, opciones);
  } catch (error) {
    if (
      error instanceof ErrorFormatoImportacion ||
      error instanceof ErrorImportacion
    )
      await registrarRechazoDeFormato(db, actor, error, ESQUEMA_TAREAS);
    throw error;
  }
}

/**
 * The confirmation of a task file, inside the transaction that holds the import's lock.
 * It validates again against the current catalogue and stored weeks, inserts the rows in
 * chunks, marks each record with its detail fingerprint, and records the event. The weekly
 * counts do not change, so there is nothing to calculate and no job.
 */
export async function confirmarTareasEnTransaccion(
  tx: Prisma.TransactionClient,
  carga: { importId: string; sourceHash: string; temporal: { datos: unknown } },
  actor: Actor,
  ahora: Date,
  opciones: { tamanoLoteTareas?: number } = {},
): Promise<ResultadoImportacionTareas> {
  const { importId } = carga;
  const validacion = await validarFilasTareas(
    carga.temporal.datos as FilaCsvTareas[],
    fuenteTareasPrisma(tx),
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
    (a, b) =>
      a.employeeId.localeCompare(b.employeeId) ||
      a.periodStart.localeCompare(b.periodStart),
  );
  const insertadas = await guardarTareasImportadas(
    tx,
    importId,
    grupos,
    opciones.tamanoLoteTareas ?? TAMANO_LOTE_TAREAS,
  );
  const resultado: ResultadoImportacionTareas = {
    importId,
    status: "CONFIRMADA",
    esquema: ESQUEMA_TAREAS,
    insertados: insertadas,
    omitidos: validacion.omitidas,
    afectados: [],
    procesamiento: null,
    semanas: grupos.length,
    excluidas: validacion.excluidas,
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
      schemaVersion: ESQUEMA_TAREAS,
      insertados: insertadas,
      omitidos: validacion.omitidas,
      excluidas: validacion.excluidas,
      semanas: grupos.length,
    },
  });
  await tx.importacionTemporal.delete({ where: { importId } });
  return resultado;
}
