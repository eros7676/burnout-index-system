import type { PrismaClient } from "@prisma/client";
import { actorDemo } from "./permisos-demo";
import type {
  ApiError,
  ErrorValidacionImportacion,
} from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import {
  ErrorFormatoImportacion,
  PLANTILLA_INDICADORES_CSV,
} from "../services/csv-importacion";
import { ErrorImportacion } from "../services/error-importacion";
import {
  cancelarImportacion,
  confirmarImportacion,
  MAX_ARCHIVO_CSV,
  validarImportacion,
  type OpcionesImportacion,
} from "../services/importaciones";
import { obtenerJob, procesarImportacion } from "../services/procesamientos";
import { validarImportacionTareas } from "../services/tareas-importacion-flujo";
import { PLANTILLA_TAREAS_CSV } from "../services/tareas-importacion";
import type { ErrorValidacionImportacionTareas } from "../../shared/contratos/importaciones";

// El runtime T15a verifica la sesión; los adaptadores internos usan demo-local por defecto.
const actor = actorDemo;
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export async function respuestaCu01(
  ejecutar: () => Promise<Response>,
): Promise<Response> {
  try {
    return await ejecutar();
  } catch (error) {
    if (
      error instanceof ErrorImportacion ||
      error instanceof ErrorFormatoImportacion
    )
      return json(error.toApiError(), error.estadoHttp);
    if (error instanceof ErrorDominio)
      return json(
        error.toApiError(),
        error.codigo === "NO_ENCONTRADO" ? 404 : 422,
      );
    // The client gets a generic body; the cause stays in the server log.
    console.error(error);
    const body: ApiError = {
      error: {
        codigo: "ERROR_INTERNO",
        mensaje: "No se pudo completar la solicitud.",
        detalles: [],
      },
    };
    return json(body, 500);
  }
}

/** Acota los bytes mientras llegan, incluso sin Content-Length o con uno incorrecto. */
async function leerCuerpoAcotado(
  request: Request,
  maximo: number,
): Promise<Uint8Array> {
  const longitud = request.headers.get("content-length");
  if (longitud && /^\d+$/.test(longitud) && Number(longitud) > maximo)
    throw new ErrorImportacion(
      413,
      "ARCHIVO_EXCESIVO",
      "El cuerpo excede el tamaño permitido.",
    );
  if (!request.body)
    throw new ErrorImportacion(
      400,
      "PETICION_INVALIDA",
      "Falta el cuerpo de la petición.",
    );
  const lector = request.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximo) {
        await lector.cancel();
        throw new ErrorImportacion(
          413,
          "ARCHIVO_EXCESIVO",
          "El cuerpo excede el tamaño permitido.",
        );
      }
      trozos.push(value);
    }
  } finally {
    lector.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const trozo of trozos) {
    bytes.set(trozo, offset);
    offset += trozo.length;
  }
  return bytes;
}

async function archivoDePeticion(request: Request): Promise<File> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType))
    throw new ErrorImportacion(
      400,
      "PETICION_INVALIDA",
      "Envíe el archivo como multipart/form-data, en el campo file.",
    );
  const bytes = await leerCuerpoAcotado(request, MAX_ARCHIVO_CSV + 64 * 1024);
  let form: FormData;
  try {
    form = await new Response(bytes as Uint8Array<ArrayBuffer>, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new ErrorImportacion(
      400,
      "PETICION_INVALIDA",
      "El contenido multipart es inválido.",
    );
  }
  const archivos = form.getAll("file");
  if (
    [...form.keys()].some((k) => k !== "file") ||
    archivos.length !== 1 ||
    !(archivos[0] instanceof File)
  )
    throw new ErrorImportacion(
      400,
      "PETICION_INVALIDA",
      "Debe enviar exactamente un archivo en el campo file.",
    );
  return archivos[0];
}

async function exigirObjetoVacio(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new ErrorImportacion(
      400,
      "PETICION_INVALIDA",
      "Envíe un cuerpo JSON {}.",
    );
  const bytes = await leerCuerpoAcotado(request, 4096);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ErrorImportacion(
      400,
      "PETICION_INVALIDA",
      "El JSON es inválido.",
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length
  )
    throw new ErrorImportacion(
      400,
      "PETICION_INVALIDA",
      "El cuerpo debe ser {}.",
    );
}

function comprobarId(id: string) {
  if (!/^[A-Za-z0-9_-]{1,36}$/.test(id))
    throw new ErrorImportacion(
      400,
      "PETICION_INVALIDA",
      "Identificador inválido.",
    );
}

const MENSAJE_RECHAZO =
  "El archivo contiene errores. Corríjalo y valídelo nuevamente.";

/** The downloadable templates: header plus one example row (RFC 4180: CRLF; BOM for Excel). */
const PLANTILLAS = {
  indicadores: {
    archivo: "plantilla-indicadores-semanales.csv",
    contenido: PLANTILLA_INDICADORES_CSV,
  },
  tareas: { archivo: "plantilla-tareas.csv", contenido: PLANTILLA_TAREAS_CSV },
} as const;

/** Los Route Handlers delegan aquí; cliente y fallos inyectables para integración. */
export function crearHttpCu01(
  db: PrismaClient,
  opciones: OpcionesImportacion = {},
) {
  return {
    validar: (request: Request) =>
      respuestaCu01(async () => {
        const vistaPrevia = await validarImportacion(
          db,
          await archivoDePeticion(request),
          actor(request),
          opciones,
        );
        if (vistaPrevia.status === "RECHAZADA") {
          const error: ErrorValidacionImportacion = {
            vistaPrevia,
            error: {
              codigo: "FILAS_INVALIDAS",
              mensaje: MENSAJE_RECHAZO,
              detalles: vistaPrevia.errores,
            },
          };
          return json(error, 422);
        }
        return json(vistaPrevia);
      }),
    validarTareas: (request: Request) =>
      respuestaCu01(async () => {
        const vistaPrevia = await validarImportacionTareas(
          db,
          await archivoDePeticion(request),
          actor(request),
          opciones,
        );
        if (vistaPrevia.status === "RECHAZADA") {
          const error: ErrorValidacionImportacionTareas = {
            vistaPrevia,
            error: {
              codigo: "FILAS_INVALIDAS",
              mensaje: MENSAJE_RECHAZO,
              detalles: vistaPrevia.errores,
            },
          };
          return json(error, 422);
        }
        return json(vistaPrevia);
      }),
    plantilla: (_request: Request, tipo: string) =>
      respuestaCu01(async () => {
        if (!Object.hasOwn(PLANTILLAS, tipo))
          throw new ErrorImportacion(
            404,
            "NO_ENCONTRADO",
            "La plantilla no existe.",
          );
        const { archivo, contenido } =
          PLANTILLAS[tipo as keyof typeof PLANTILLAS];
        const cuerpo = `﻿${contenido.replaceAll("\n", "\r\n")}`;
        return new Response(cuerpo, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${archivo}"`,
            "Cache-Control": "no-store",
          },
        });
      }),
    confirmar: (request: Request, id: string) =>
      respuestaCu01(async () => {
        comprobarId(id);
        await exigirObjetoVacio(request);
        return json(
          await confirmarImportacion(db, id, actor(request), opciones),
        );
      }),
    cancelar: (request: Request, id: string) =>
      respuestaCu01(async () => {
        comprobarId(id);
        return json(
          await cancelarImportacion(db, id, actor(request), opciones),
        );
      }),
    consultar: (_request: Request, jobId: string) =>
      respuestaCu01(async () => {
        comprobarId(jobId);
        return json(await obtenerJob(db, jobId));
      }),
    reintentar: (request: Request, jobId: string) =>
      respuestaCu01(async () => {
        comprobarId(jobId);
        await exigirObjetoVacio(request);
        const quien = actor(request);
        return json(
          await procesarImportacion(db, jobId, {
            ...opciones,
            actor: quien,
            reintentadoPor: quien,
          }),
        );
      }),
  };
}
