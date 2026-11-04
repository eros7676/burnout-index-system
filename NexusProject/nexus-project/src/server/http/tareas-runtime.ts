import { prisma } from "../../lib/db";
import type { SesionTareas } from "../services/tareas-consulta";
import { actorDemo, proteger, usuarioDeSolicitud } from "./permisos-demo";
import { crearHttpTareas } from "./tareas";
const tareas = crearHttpTareas(prisma);
function sesion(request: Request): SesionTareas {
  return {
    usuario: usuarioDeSolicitud(request),
    actor: actorDemo(request),
  };
}
// LEER with the default narrowing: a Team Lead's `employeeId` must belong to their team.
export const httpTareas = {
  semana: proteger(prisma, "LEER", (request) =>
    tareas.semana(request, sesion(request)),
  ),
  semanas: proteger(prisma, "LEER", (request) =>
    tareas.semanas(request, sesion(request)),
  ),
  historial: proteger(prisma, "LEER", (request) =>
    tareas.historial(request, sesion(request)),
  ),
  // The person is the session's own; PROPIOS is not narrowed by team.
  misTareas: proteger(prisma, "PROPIOS", (request) =>
    tareas.misTareas(request, sesion(request)),
  ),
};
