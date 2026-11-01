import { httpNotificaciones } from "@/server/http/notificaciones-runtime";
export async function POST(
  request: Request,
  context: { params: Promise<{ alertId: string; intentoId: string }> },
) {
  const { alertId, intentoId } = await context.params;
  return httpNotificaciones.procesar(request, alertId, intentoId);
}
