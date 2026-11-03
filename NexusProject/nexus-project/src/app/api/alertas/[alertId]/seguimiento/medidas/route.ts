import { httpSeguimiento } from "@/server/http/seguimiento-runtime";
type Contexto = { params: Promise<{ alertId: string }> };
export async function POST(request: Request, context: Contexto) {
  return httpSeguimiento.medida(request, (await context.params).alertId);
}
export async function PATCH(request: Request, context: Contexto) {
  return httpSeguimiento.marcarMedida(request, (await context.params).alertId);
}
