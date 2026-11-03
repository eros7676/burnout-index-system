import { prisma } from "../../lib/db";
import {
  crearHttpAuditoria,
  crearHttpAuditoriaDetalle,
  crearHttpAuditoriaExportacion,
  crearHttpAuditoriaOperacion,
} from "./auditoria";
import { proteger } from "./permisos-demo";
const listar = crearHttpAuditoria(prisma);
const detalle = crearHttpAuditoriaDetalle(prisma);
const operacion = crearHttpAuditoriaOperacion(prisma);
// The export also needs AUDITORIA: the handler checks it and records the denial.
const exportar = crearHttpAuditoriaExportacion(prisma);
export const httpAuditoria = {
  listar: proteger(prisma, "AUDITORIA", listar),
  detalle: proteger(prisma, "AUDITORIA", detalle),
  operacion: proteger(prisma, "AUDITORIA", operacion),
  exportar: proteger(prisma, "EXPORTAR", exportar),
};
