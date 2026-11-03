// HTTP adapter of the CSV exports: validates the list and its filters, then streams the file.
// The same `proteger` guard as the screens applies (permission EXPORTAR); a Team Lead's request already
// carries their team, so an export never reaches beyond what the screen shows.
import type { PrismaClient } from "@prisma/client";
import {
  FORMATO_CSV,
  TIPOS_EXPORTACION,
  type FiltrosExportacion,
  type TipoExportacion,
} from "../../shared/contratos/exportaciones";
import { exportar } from "../services/exportaciones";
import { ErrorExportacion, flujoCsv } from "../services/exportaciones-csv";
import { ErrorConsulta, filtrosConsulta } from "../services/filtros-consultas";
import { filtrosSeguimiento } from "../services/seguimiento-filtros";
import {
  actorDemo,
  ErrorPermiso,
  errorPermiso,
  usuarioDeSolicitud,
  usuariosDemo,
} from "./permisos-demo";

const PROPIOS_ALERTAS = ["seguimiento", "asignadoA", "vencido"];

/** The filters the screen of that list has; anything else is a mistake, not a wider file. */
export function filtrosExportacion(
  request: Request,
  tipo: TipoExportacion,
): FiltrosExportacion {
  const url = new URL(request.url);
  const permitidos = new Set([
    "teamId",
    "periodStart",
    ...(tipo !== "equipos" ? ["employeeId"] : []),
    ...(tipo === "alertas" ? PROPIOS_ALERTAS : []),
  ]);
  for (const clave of url.searchParams.keys())
    if (!permitidos.has(clave))
      throw new ErrorConsulta(400, "Filtros desconocidos o repetidos.");
  const comunes = new URL(url);
  for (const clave of PROPIOS_ALERTAS) comunes.searchParams.delete(clave);
  // A file has no pages: the paging defaults of the board's parser are not filters.
  const basicos = filtrosConsulta(new Request(comunes, { method: "GET" }), "resumen");
  return {
    employeeId: basicos.employeeId,
    teamId: basicos.teamId,
    periodStart: basicos.periodStart,
    ...(tipo === "alertas" ? filtrosSeguimiento(url.searchParams) : {}),
  };
}

function fallo(status: number, codigo: string, mensaje: string) {
  return Response.json(
    { error: { codigo, mensaje, detalles: [] } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function crearHttpExportaciones(db: PrismaClient) {
  return {
    descargar: async (request: Request, tipo: string) => {
      try {
        if (!TIPOS_EXPORTACION.includes(tipo as TipoExportacion))
          return fallo(404, "NO_ENCONTRADO", "No existe esa exportación.");
        const filtros = filtrosExportacion(request, tipo as TipoExportacion);
        const exportacion = await exportar(
          db,
          tipo as TipoExportacion,
          filtros,
          {
            usuario: usuarioDeSolicitud(request),
            usuarios: await usuariosDemo(db),
          },
          actorDemo(request),
        );
        return new Response(flujoCsv(exportacion.fragmentos), {
          headers: {
            "Content-Type": FORMATO_CSV.contentType,
            "Content-Disposition": `attachment; filename="${exportacion.nombreArchivo}"`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Total-Filas": String(exportacion.filas),
          },
        });
      } catch (error) {
        if (error instanceof ErrorPermiso) return errorPermiso(error);
        if (error instanceof ErrorConsulta)
          return fallo(error.status, "PETICION_INVALIDA", error.message);
        if (error instanceof ErrorExportacion)
          return fallo(error.status, "EXPORTACION_EXCEDIDA", error.message);
        console.error(error);
        return fallo(500, "ERROR_INTERNO", "No se pudo generar el archivo.");
      }
    },
  };
}
