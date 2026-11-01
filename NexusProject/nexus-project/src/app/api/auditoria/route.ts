import { prisma } from "@/lib/db";
import { crearHttpAuditoria } from "@/server/http/auditoria";
import { proteger } from "@/server/http/permisos-demo";
export const GET = proteger(prisma, "AUDITORIA", crearHttpAuditoria(prisma));
