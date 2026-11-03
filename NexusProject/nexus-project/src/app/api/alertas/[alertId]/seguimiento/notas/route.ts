import { httpSeguimiento } from "@/server/http/seguimiento-runtime";
type Contexto = { params: Promise<{ alertId: string }> };
export async function POST(request: Request, context: Contexto) {
  return httpSeguimiento.anotar(request, (await context.params).alertId);
}
