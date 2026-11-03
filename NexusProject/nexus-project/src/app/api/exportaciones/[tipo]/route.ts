import { httpExportaciones } from "@/server/http/exportaciones-runtime";
type Contexto = { params: Promise<{ tipo: string }> };
export async function GET(request: Request, context: Contexto) {
  return httpExportaciones.descargar(request, (await context.params).tipo);
}
