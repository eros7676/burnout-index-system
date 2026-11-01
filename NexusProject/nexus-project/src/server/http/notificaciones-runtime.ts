import { prisma } from "../../lib/db";
import { crearHttpNotificaciones } from "./notificaciones";
export const httpNotificaciones = crearHttpNotificaciones(prisma);
