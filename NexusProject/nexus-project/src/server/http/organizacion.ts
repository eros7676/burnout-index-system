// HTTP adapters of people and teams. They parse and answer; the rules live in the services.
// Errors share the public shape { error: { codigo, mensaje, detalles } } and field errors carry
// the field, so a form can show each one next to its control.
import type { PrismaClient } from "@prisma/client";
import { registrarEvento } from "../repositories/auditoria";
import {
  consultarDirectorio,
  consultarEquipo,
  consultarEquipos,
  consultarFicha,
  consultarOpcionesEquipo,
  consultarOpcionesPersona,
  relojReal,
  type Reloj,
} from "../services/organizacion-consultas";
import { ErrorOrganizacion } from "../services/organizacion-errores";
import {
  filtroSemanaEquipo,
  filtrosDirectorio,
  filtrosEquipos,
  identificador,
  semanasDeFicha,
  sinFiltros,
} from "../services/organizacion-filtros";
import {
  confirmarImportacionPersonas,
  validarImportacionPersonas,
} from "../services/organizacion-importacion";
import {
  cambiarLider,
  crearEquipo,
  desactivarEquipo,
  editarEquipo,
} from "../services/organizacion-equipos";
import {
  cambiarAsignacion,
  crearPersona,
  darDeBaja,
  editarPersona,
  esLlaveDuplicada,
} from "../services/organizacion-personas";
import { MAX_BYTES_PERSONAS } from "../services/organizacion-csv";
import { actorDemo } from "./permisos-demo";

const MAX_JSON = 16 * 1024;
const MAX_MULTIPART = MAX_BYTES_PERSONAS + 64 * 1024;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function errorPublico(
  status: number,
  codigo: string,
  mensaje: string,
  detalles: ErrorOrganizacion["detalles"] = [],
) {
  return json({ error: { codigo, mensaje, detalles } }, status);
}

async function responder(ejecutar: () => Promise<Response>) {
  try {
    return await ejecutar();
  } catch (error) {
    if (error instanceof ErrorOrganizacion)
      return errorPublico(error.status, error.codigo, error.message, error.detalles);
    if (esLlaveDuplicada(error))
      return errorPublico(
        409,
        "ESTADO_INCOMPATIBLE",
        "Otra operación modificó los mismos datos. Actualice la página e intente nuevamente.",
      );
    // The client gets a generic body; the cause stays in the server log.
    console.error(error);
    return errorPublico(500, "ERROR_INTERNO", "No se pudo completar la operación.");
  }
}

const rechazar = (mensaje: string, status: 400 | 413 = 400, codigo = "PETICION_INVALIDA") =>
  new ErrorOrganizacion(status, codigo, mensaje);

/** Bounds the bytes while they arrive, whatever Content-Length says. */
async function leerAcotado(request: Request, maximo: number): Promise<Uint8Array> {
  const longitud = request.headers.get("content-length");
  if (longitud && /^\d+$/.test(longitud) && Number(longitud) > maximo)
    throw rechazar("El cuerpo excede el tamaño permitido.", 413, "ARCHIVO_EXCESIVO");
  if (!request.body) throw rechazar("Falta el cuerpo de la petición.");
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
        throw rechazar("El cuerpo excede el tamaño permitido.", 413, "ARCHIVO_EXCESIVO");
      }
      trozos.push(value);
    }
  } finally {
    lector.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let desplazamiento = 0;
  for (const trozo of trozos) {
    bytes.set(trozo, desplazamiento);
    desplazamiento += trozo.length;
  }
  return bytes;
}

async function leerJson(request: Request): Promise<unknown> {
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get("content-type") ?? ""))
    throw rechazar("Use application/json.");
  const bytes = await leerAcotado(request, MAX_JSON);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw rechazar("El cuerpo no es un JSON válido.");
  }
}

/** The people file (and, on confirmation, the fingerprint of the previewed one). */
async function leerArchivo(request: Request, campos: readonly string[]) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType))
    throw rechazar("Use multipart/form-data con el campo file.");
  const bytes = await leerAcotado(request, MAX_MULTIPART);
  let form: FormData;
  try {
    form = await new Response(bytes as Uint8Array<ArrayBuffer>, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw rechazar("El multipart es inválido.");
  }
  const archivos = form.getAll("file");
  if (
    [...form.keys()].some((k) => k !== "file" && !campos.includes(k)) ||
    archivos.length !== 1 ||
    !(archivos[0] instanceof File)
  )
    throw rechazar("Debe enviar exactamente un archivo en el campo file.");
  const extra: Record<string, string> = {};
  for (const campo of campos) {
    const valor = form.getAll(campo);
    if (valor.length !== 1 || typeof valor[0] !== "string")
      throw rechazar(`Falta el campo ${campo}.`);
    extra[campo] = valor[0];
  }
  return {
    bytes: new Uint8Array(await archivos[0].arrayBuffer()),
    extra,
  };
}

export function crearHttpOrganizacion(
  db: PrismaClient,
  { reloj = relojReal }: { reloj?: Reloj } = {},
) {
  const parametros = (request: Request) => new URL(request.url).searchParams;
  return {
    directorio: (request: Request) =>
      responder(async () =>
        json(await consultarDirectorio(db, filtrosDirectorio(parametros(request)))),
      ),
    opcionesPersona: (request: Request) =>
      responder(async () => {
        sinFiltros(parametros(request));
        return json(await consultarOpcionesPersona(db, reloj));
      }),
    ficha: (request: Request, employeeId: string) =>
      responder(async () => {
        const ficha = await consultarFicha(
          db,
          identificador(employeeId, "legajo"),
          semanasDeFicha(parametros(request)),
        );
        // A lost access event must not turn a successful read into a failure.
        try {
          await registrarEvento(db, {
            accion: "FICHA_CONSULTADA",
            recursoId: ficha.persona.employeeId,
            sujetoId: ficha.persona.employeeId,
            actor: actorDemo(request),
            detalles: {},
          });
        } catch (error) {
          console.error("Audit event FICHA_CONSULTADA not recorded", error);
        }
        return json(ficha);
      }),
    crearPersona: (request: Request) =>
      responder(async () =>
        json(await crearPersona(db, await leerJson(request), actorDemo(request), reloj), 201),
      ),
    editarPersona: (request: Request, employeeId: string) =>
      responder(async () =>
        json(
          await editarPersona(
            db,
            identificador(employeeId, "legajo"),
            await leerJson(request),
            actorDemo(request),
          ),
        ),
      ),
    cambiarAsignacion: (request: Request, employeeId: string) =>
      responder(async () =>
        json(
          await cambiarAsignacion(
            db,
            identificador(employeeId, "legajo"),
            await leerJson(request),
            actorDemo(request),
            reloj,
          ),
        ),
      ),
    darDeBaja: (request: Request, employeeId: string) =>
      responder(async () =>
        json(
          await darDeBaja(
            db,
            identificador(employeeId, "legajo"),
            await leerJson(request),
            actorDemo(request),
            reloj,
          ),
        ),
      ),
    validarImportacion: (request: Request) =>
      responder(async () => {
        const { bytes } = await leerArchivo(request, []);
        return json(await validarImportacionPersonas(db, bytes, reloj));
      }),
    confirmarImportacion: (request: Request) =>
      responder(async () => {
        const { bytes, extra } = await leerArchivo(request, ["huella"]);
        return json(
          await confirmarImportacionPersonas(db, bytes, extra.huella, actorDemo(request), reloj),
        );
      }),
    equipos: (request: Request) =>
      responder(async () =>
        json(await consultarEquipos(db, filtrosEquipos(parametros(request)))),
      ),
    opcionesEquipo: (request: Request) =>
      responder(async () => {
        sinFiltros(parametros(request));
        return json(await consultarOpcionesEquipo(db, reloj));
      }),
    equipo: (request: Request, teamId: string) =>
      responder(async () =>
        json(
          await consultarEquipo(
            db,
            identificador(teamId, "equipo"),
            filtroSemanaEquipo(parametros(request)).periodStart,
          ),
        ),
      ),
    crearEquipo: (request: Request) =>
      responder(async () =>
        json(await crearEquipo(db, await leerJson(request), actorDemo(request), reloj), 201),
      ),
    editarEquipo: (request: Request, teamId: string) =>
      responder(async () =>
        json(
          await editarEquipo(
            db,
            identificador(teamId, "equipo"),
            await leerJson(request),
            actorDemo(request),
            reloj,
          ),
        ),
      ),
    cambiarLider: (request: Request, teamId: string) =>
      responder(async () =>
        json(
          await cambiarLider(
            db,
            identificador(teamId, "equipo"),
            await leerJson(request),
            actorDemo(request),
            reloj,
          ),
        ),
      ),
    desactivarEquipo: (request: Request, teamId: string) =>
      responder(async () =>
        json(
          await desactivarEquipo(
            db,
            identificador(teamId, "equipo"),
            await leerJson(request),
            actorDemo(request),
          ),
        ),
      ),
  };
}
