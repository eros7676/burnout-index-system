import { prisma } from "../../lib/db";
import { crearHttpExportaciones } from "./exportaciones";
import { proteger } from "./permisos-demo";
const exportaciones = crearHttpExportaciones(prisma);
// EXPORTAR is separate from reading (Workday: «Export to PDF and Excel» is its own domain); a Team Lead's
// request is narrowed to their team by the default guard.
export const httpExportaciones = {
  descargar: proteger(prisma, "EXPORTAR", exportaciones.descargar),
};
