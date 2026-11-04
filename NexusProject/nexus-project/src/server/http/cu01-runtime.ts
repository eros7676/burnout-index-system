import { prisma } from "../../lib/db";
import { crearHttpCu01 } from "./cu01";

import { proteger } from "./permisos-demo";
const cu01 = crearHttpCu01(prisma);
export const httpCu01 = {
  validar: proteger(prisma, "IMPORTAR", cu01.validar),
  validarTareas: proteger(prisma, "IMPORTAR", cu01.validarTareas),
  plantilla: proteger(prisma, "IMPORTAR", cu01.plantilla),
  confirmar: proteger(prisma, "IMPORTAR", cu01.confirmar),
  cancelar: proteger(prisma, "IMPORTAR", cu01.cancelar),
  consultar: proteger(prisma, "IMPORTAR", cu01.consultar),
  reintentar: proteger(prisma, "IMPORTAR", cu01.reintentar),
};
