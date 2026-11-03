import { httpAuditoria } from "@/server/http/auditoria-runtime";
export async function GET(request: Request) {
  return httpAuditoria.exportar(request);
}
