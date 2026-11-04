import type { PrismaClient } from "@prisma/client";
import {
  consultarHistorialTarea,
  consultarMisTareas,
  consultarSemanasConTareas,
  consultarTareasEquipo,
  consultarTareasSemana,
  ErrorSinPermisoTareas,
  type SesionTareas,
} from "../services/tareas-consulta";
import {
  filtrosEquipo,
  filtrosHistorial,
  filtrosMisTareas,
  filtrosSemana,
  filtrosSemanas,
} from "../services/tareas-consulta-filtros";
import { respuesta } from "./consultas";

/** Same error bodies as the other reads, plus the 403 of a role that may not read the rows. */
async function responder(accion: () => Promise<unknown>) {
  let denegado: ErrorSinPermisoTareas | undefined;
  const resultado = await respuesta(async () => {
    try {
      return await accion();
    } catch (error) {
      if (!(error instanceof ErrorSinPermisoTareas)) throw error;
      denegado = error;
      return null;
    }
  });
  return denegado
    ? Response.json(
        {
          error: { codigo: "SIN_PERMISO", mensaje: denegado.message, detalles: [] },
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      )
    : resultado;
}

/**
 * Task evidence reads. `sesion` is the guarded request's user and audit context: the runtime module
 * passes it from `proteger`, tests pass their own, so no handler reads a role from the request.
 */
export function crearHttpTareas(db: PrismaClient) {
  return {
    semana: (request: Request, sesion: SesionTareas) =>
      responder(() => consultarTareasSemana(db, filtrosSemana(request), sesion)),
    semanas: (request: Request, sesion: SesionTareas) =>
      responder(() =>
        consultarSemanasConTareas(db, filtrosSemanas(request), sesion),
      ),
    equipo: (request: Request, sesion: SesionTareas) =>
      responder(() => consultarTareasEquipo(db, filtrosEquipo(request), sesion)),
    historial: (request: Request, sesion: SesionTareas) =>
      responder(() =>
        consultarHistorialTarea(db, filtrosHistorial(request), sesion),
      ),
    misTareas: (request: Request, sesion: SesionTareas) =>
      responder(() => consultarMisTareas(db, filtrosMisTareas(request), sesion)),
  };
}
