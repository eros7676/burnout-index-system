import { httpAuditoria } from "@/server/http/auditoria-runtime";
export async function GET(
  request: Request,
  context: { params: Promise<{ correlacionId: string }> },
) {
  return httpAuditoria.operacion(
    request,
    (await context.params).correlacionId,
  );
}
