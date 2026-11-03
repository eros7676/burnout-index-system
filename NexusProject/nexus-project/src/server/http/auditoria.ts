// Audit trail reads over HTTP. Routes are wired in auditoria-runtime.ts behind `proteger`.
// Filters: audit-trail.md §4.1. Every read is recorded by the service (fail closed).
import type { PrismaClient } from "@prisma/client";
import {
  ACCIONES_AUDITORIA,
  ENTIDADES_AUDITORIA,
} from "../../shared/auditoria-catalogo";
import { API_DEFAULTS } from "../../shared/api";
import type { FormatoExportacion } from "../../shared/contratos/auditoria";
import { tienePermiso } from "../../shared/permisos";
import {
  whereDeFiltros,
  type CursorAuditoria,
  type FiltrosNormalizados,
} from "../repositories/auditoria-consulta";
import { registrarEvento } from "../repositories/auditoria";
import {
  aCsv,
  aJson,
  nombreArchivo,
} from "../services/auditoria-consulta-exportacion";
import {
  decodificarCursor,
  exportarEventos,
  listarEventos,
  obtenerDetalle,
  obtenerOperacion,
} from "../services/auditoria-consulta";
import { ErrorConsulta } from "../services/filtros-consultas";
import {
  actorDemo,
  ErrorPermiso,
  errorPermiso,
  usuarioDeSolicitud,
} from "./permisos-demo";

const FILTROS_COMUNES = [
  "accion",
  "entidad",
  "recursoId",
  "sujetoId",
  "actorId",
  "correlacionId",
  "solicitudId",
  "q",
  "resultado",
  "origen",
  "consultas",
  "desde",
  "hasta",
];
const CODIGOS = [
  ["recursoId", 64],
  ["sujetoId", 64],
  ["actorId", 64],
  ["correlacionId", 64],
  ["solicitudId", 36],
  ["q", 64],
] as const;
const RESULTADOS = ["EXITO", "FALLO", "DENEGADO"] as const;
const ORIGENES = ["WEB", "CLI", "SISTEMA"] as const;
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const rechazo = (mensaje: string) => new ErrorConsulta(400, mensaje);

/** A code typed or linked by a person: 1 to `maximo` characters, no control characters. */
function codigo(valor: string, maximo: number) {
  if (!valor.trim() || valor.length > maximo || /[\u0000-\u001f\u007f]/.test(valor))
    throw rechazo(
      `El código debe tener entre 1 y ${maximo} caracteres, sin caracteres de control.`,
    );
  return valor;
}

function instante(texto: string) {
  const fecha = new Date(texto);
  if (
    !ISO_MS.test(texto) ||
    !Number.isFinite(fecha.getTime()) ||
    fecha.toISOString() !== texto
  )
    throw rechazo(
      "Las fechas deben estar en UTC, en formato ISO 8601 con milisegundos.",
    );
  return texto;
}

/**
 * Validates the query string of a read. `lista` takes a cursor and a page size; `exportacion`
 * takes the file format instead. Anything else, or any repeated key, is refused.
 */
export function filtrosAuditoria(
  request: Request,
  modo: "lista" | "exportacion" = "lista",
) {
  const params = new URL(request.url).searchParams;
  const permitidos = new Set([
    ...FILTROS_COMUNES,
    ...(modo === "lista" ? ["cursor", "pageSize"] : ["formato"]),
  ]);
  for (const key of params.keys())
    if (!permitidos.has(key) || params.getAll(key).length !== 1)
      throw rechazo("Filtros desconocidos o repetidos.");

  const filtros: FiltrosNormalizados = { consultas: false };
  for (const [key, maximo] of CODIGOS)
    if (params.has(key)) filtros[key] = codigo(params.get(key)!, maximo);
  if (params.has("accion")) {
    const accion = params.get("accion")!;
    if (!(ACCIONES_AUDITORIA as readonly string[]).includes(accion))
      throw rechazo("La acción indicada no figura en el catálogo de auditoría.");
    filtros.accion = accion;
  }
  if (params.has("entidad")) {
    const entidad = params.get("entidad")!;
    if (!Object.hasOwn(ENTIDADES_AUDITORIA, entidad))
      throw rechazo(
        "El tipo de elemento indicado no figura en el catálogo de auditoría.",
      );
    filtros.entidad = entidad;
  }
  if (params.has("resultado")) {
    const resultado = params.get("resultado")!;
    if (!(RESULTADOS as readonly string[]).includes(resultado))
      throw rechazo("El resultado debe ser EXITO, FALLO o DENEGADO.");
    filtros.resultado = resultado as (typeof RESULTADOS)[number];
  }
  if (params.has("origen")) {
    const origen = params.get("origen")!;
    if (!(ORIGENES as readonly string[]).includes(origen))
      throw rechazo("El origen debe ser WEB, CLI o SISTEMA.");
    filtros.origen = origen as (typeof ORIGENES)[number];
  }
  if (params.has("consultas")) {
    const consultas = params.get("consultas");
    if (consultas !== "0" && consultas !== "1")
      throw rechazo("El parámetro consultas debe ser 0 o 1.");
    filtros.consultas = consultas === "1";
  }
  if (params.has("desde")) filtros.desde = instante(params.get("desde")!);
  if (params.has("hasta")) filtros.hasta = instante(params.get("hasta")!);
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta)
    throw rechazo("La fecha de inicio debe ser anterior o igual a la fecha de fin.");

  let pageSize: number = API_DEFAULTS.pageSize;
  let cursor: CursorAuditoria | null = null;
  let formato: FormatoExportacion | undefined;
  if (modo === "lista") {
    if (params.has("pageSize")) {
      const texto = params.get("pageSize")!;
      pageSize = Number(texto);
      if (
        !/^[1-9]\d*$/.test(texto) ||
        !Number.isSafeInteger(pageSize) ||
        pageSize > API_DEFAULTS.maxPageSize
      )
        throw rechazo(
          `El tamaño de página debe ser un entero de 1 a ${API_DEFAULTS.maxPageSize}.`,
        );
    }
    if (params.has("cursor")) cursor = decodificarCursor(params.get("cursor")!);
  } else {
    const texto = params.get("formato");
    if (texto !== "csv" && texto !== "json")
      throw rechazo("El formato debe ser csv o json.");
    formato = texto;
  }
  return { filtros, where: whereDeFiltros(filtros), pageSize, cursor, formato };
}

const SIN_CACHE = { "Cache-Control": "no-store" };

function respuestaError(error: unknown, falla: string) {
  const status = error instanceof ErrorConsulta ? error.status : 500;
  if (status === 500) console.error(error);
  return Response.json(
    {
      error: {
        codigo:
          status === 400
            ? "PETICION_INVALIDA"
            : status === 404
              ? "NO_ENCONTRADO"
              : "ERROR_INTERNO",
        mensaje: status === 500 ? falla : (error as Error).message,
        detalles: [],
      },
    },
    { status, headers: SIN_CACHE },
  );
}

async function leer(accion: () => Promise<unknown>, falla: string) {
  try {
    return Response.json(await accion(), { headers: SIN_CACHE });
  } catch (error) {
    return respuestaError(error, falla);
  }
}

const FALLA_CONSULTA = "No se pudo consultar la auditoría.";

/** GET /api/auditoria: one page of events, newest first. */
export function crearHttpAuditoria(db: PrismaClient) {
  return (request: Request) =>
    leer(async () => {
      const { filtros, cursor, pageSize } = filtrosAuditoria(request);
      return listarEventos(db, {
        filtros,
        cursor,
        pageSize,
        actor: actorDemo(request),
      });
    }, FALLA_CONSULTA);
}

/** GET /api/auditoria/{eventoId}: every column of one event, with its diff. */
export function crearHttpAuditoriaDetalle(db: PrismaClient) {
  return (request: Request, eventoId: string) =>
    leer(async () => {
      if (new URL(request.url).search)
        throw rechazo("El detalle no admite filtros.");
      return obtenerDetalle(db, codigo(eventoId, 36), actorDemo(request));
    }, FALLA_CONSULTA);
}

/** GET /api/auditoria/operaciones/{correlacionId}: the events of one operation, oldest first. */
export function crearHttpAuditoriaOperacion(db: PrismaClient) {
  return (request: Request, correlacionId: string) =>
    leer(async () => {
      if (new URL(request.url).search)
        throw rechazo("La operación no admite filtros.");
      return obtenerOperacion(db, codigo(correlacionId, 64), actorDemo(request));
    }, FALLA_CONSULTA);
}

/** The export leaves the application, so it needs the audit permission on top of EXPORTAR. */
async function exigirAuditoria(db: PrismaClient, request: Request) {
  const usuario = usuarioDeSolicitud(request);
  if (tienePermiso(usuario.rol, "AUDITORIA")) return;
  try {
    await registrarEvento(db, {
      accion: "ACCESO_DENEGADO",
      recursoId: new URL(request.url).pathname.slice(0, 64),
      actor: actorDemo(request),
      resultado: "DENEGADO",
      motivo: "SIN_PERMISO",
      detalles: { metodo: request.method, permiso: "AUDITORIA" },
    });
  } catch (error) {
    console.error("Audit event ACCESO_DENEGADO not recorded", error);
  }
  throw new ErrorPermiso(403, "No tiene permiso para consultar la auditoría.");
}

/** GET /api/auditoria/exportacion?formato=csv|json: the filtered events as a file. */
export function crearHttpAuditoriaExportacion(db: PrismaClient) {
  return async (request: Request) => {
    try {
      await exigirAuditoria(db, request);
      const { filtros, formato } = filtrosAuditoria(request, "exportacion");
      if (!formato) throw rechazo("El formato debe ser csv o json.");
      const actor = actorDemo(request);
      const { eventos, truncado, limite, generadoEn } = await exportarEventos(db, {
        filtros,
        formato,
        actor,
        solicitudId: actor.solicitudId,
      });
      const cuerpo =
        formato === "csv"
          ? aCsv(eventos)
          : JSON.stringify(
              aJson({
                eventos,
                filtros: Object.fromEntries(
                  Object.entries(filtros).filter(([, v]) => v !== undefined),
                ) as Record<string, string | boolean>,
                truncado,
                limite,
                generadoEn,
              }),
            );
      return new Response(cuerpo, {
        headers: {
          ...SIN_CACHE,
          "Content-Type":
            formato === "csv"
              ? "text/csv; charset=utf-8"
              : "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nombreArchivo(filtros, formato, generadoEn)}"`,
          "X-Content-Type-Options": "nosniff",
          "X-Exportacion-Filas": String(eventos.length),
          "X-Exportacion-Truncada": String(truncado),
        },
      });
    } catch (error) {
      return error instanceof ErrorPermiso
        ? errorPermiso(error)
        : respuestaError(error, "No se pudo exportar la auditoría.");
    }
  };
}
