import type { PrismaClient } from "@prisma/client";
import type {
  ApiError,
  ErrorValidacionImportacion,
} from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import { ErrorFormatoImportacion } from "../services/csv-importacion";
import { ErrorImportacion } from "../services/error-importacion";
import {
  cancelarImportacion,
  confirmarImportacion,
  MAX_ARCHIVO_CSV,
  validarImportacion,
  type OpcionesImportacion,
} from "../services/importaciones";
import { obtenerJob, procesarImportacion } from "../services/procesamientos";

// P0: operador ficticio local. Identidad y permisos de sesión corresponden a P1.
const ACTOR_LOCAL = "demo-local";
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
    const body: ApiError = {
      error: {
        codigo: "ERROR_INTERNO",
        mensaje: "No se pudo completar la petición.",
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
      "Use multipart/form-data con el campo file.",
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
      "El multipart es inválido.",
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
    throw new ErrorImportacion(400, "PETICION_INVALIDA", "Envíe JSON {}.");
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

/** Los cinco Route Handlers delegan aquí; cliente y fallos inyectables para integración. */
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
          ACTOR_LOCAL,
          opciones,
        );
        if (vistaPrevia.status === "RECHAZADA") {
          const error: ErrorValidacionImportacion = {
            vistaPrevia,
            error: {
              codigo: "FILAS_INVALIDAS",
              mensaje:
                "El lote contiene errores; corrija el CSV y valide nuevamente.",
              detalles: vistaPrevia.errores,
            },
          };
          return json(error, 422);
        }
        return json(vistaPrevia);
      }),
    confirmar: (request: Request, id: string) =>
      respuestaCu01(async () => {
        comprobarId(id);
        await exigirObjetoVacio(request);
        return json(await confirmarImportacion(db, id, ACTOR_LOCAL, opciones));
      }),
    cancelar: (_request: Request, id: string) =>
      respuestaCu01(async () => {
        comprobarId(id);
        return json(await cancelarImportacion(db, id, ACTOR_LOCAL, opciones));
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
        return json(await procesarImportacion(db, jobId, opciones));
      }),
  };
}
