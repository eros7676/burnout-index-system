import { prisma } from "@/lib/db";
import { crearHttpAuditoria } from "@/server/http/auditoria";
export const GET = crearHttpAuditoria(prisma);
