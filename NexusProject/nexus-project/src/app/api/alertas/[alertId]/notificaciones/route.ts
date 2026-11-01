import { httpNotificaciones } from "@/server/http/notificaciones-runtime";
type Contexto = { params: Promise<{ alertId: string }> };
export async function GET(request: Request, context: Contexto) {
  return httpNotificaciones.listar(request, (await context.params).alertId);
}
export async function POST(request: Request, context: Contexto) {
  return httpNotificaciones.preparar(request, (await context.params).alertId);
}
