import { prisma } from "../../lib/db";
import { crearHttpNotificaciones } from "./notificaciones";
import { proteger } from "./permisos-demo";
const notificaciones = crearHttpNotificaciones(prisma);
export const httpNotificaciones = {
  listar: proteger(prisma, "NOTIFICAR", notificaciones.listar),
  preparar: proteger(prisma, "NOTIFICAR", notificaciones.preparar),
  procesar: proteger(prisma, "NOTIFICAR", notificaciones.procesar),
};
