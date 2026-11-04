import { prisma } from "../../lib/db";
import { proteger } from "./permisos-demo";
import { crearHttpSeguimiento } from "./seguimiento";
const seguimiento = crearHttpSeguimiento(prisma);
// "alerta" narrows a Team Lead to alerts of their team; the service then checks who the alert is addressed to.
export const httpSeguimiento = {
  alerta: proteger(prisma, "LEER", seguimiento.alerta, "alerta"),
  obtener: proteger(prisma, "SEGUIMIENTO", seguimiento.obtener, "alerta"),
  abrir: proteger(prisma, "SEGUIMIENTO", seguimiento.abrir, "alerta"),
  actualizar: proteger(prisma, "SEGUIMIENTO", seguimiento.actualizar, "alerta"),
  anotar: proteger(prisma, "SEGUIMIENTO", seguimiento.anotar, "alerta"),
  medida: proteger(prisma, "SEGUIMIENTO", seguimiento.medida, "alerta"),
  marcarMedida: proteger(prisma, "SEGUIMIENTO", seguimiento.marcarMedida, "alerta"),
  cerrar: proteger(prisma, "SEGUIMIENTO", seguimiento.cerrar, "alerta"),
};
