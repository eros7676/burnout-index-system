import { prisma } from "../../lib/db";
import { crearHttpConsultas } from "./consultas";
import { proteger } from "./permisos-demo";
const consultas = crearHttpConsultas(prisma);
export const httpConsultas = {
  evaluaciones: proteger(prisma, "LEER", consultas.evaluaciones),
  alertas: proteger(prisma, "LEER", consultas.alertas),
  resumen: proteger(prisma, "LEER", consultas.resumen),
  informe: proteger(prisma, "LEER", consultas.informe, "informe"),
};
