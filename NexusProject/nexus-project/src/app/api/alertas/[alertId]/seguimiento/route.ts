import { httpSeguimiento } from "@/server/http/seguimiento-runtime";
type Contexto = { params: Promise<{ alertId: string }> };
export async function GET(request: Request, context: Contexto) {
  return httpSeguimiento.obtener(request, (await context.params).alertId);
}
export async function POST(request: Request, context: Contexto) {
  return httpSeguimiento.abrir(request, (await context.params).alertId);
}
export async function PATCH(request: Request, context: Contexto) {
  return httpSeguimiento.actualizar(request, (await context.params).alertId);
}
