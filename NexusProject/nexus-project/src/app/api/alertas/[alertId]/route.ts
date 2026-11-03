import { httpSeguimiento } from "@/server/http/seguimiento-runtime";
type Contexto = { params: Promise<{ alertId: string }> };
export async function GET(request: Request, context: Contexto) {
  return httpSeguimiento.alerta(request, (await context.params).alertId);
}
