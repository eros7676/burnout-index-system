import { httpAuditoria } from "@/server/http/auditoria-runtime";
export async function GET(
  request: Request,
  context: { params: Promise<{ eventoId: string }> },
) {
  return httpAuditoria.detalle(request, (await context.params).eventoId);
}
