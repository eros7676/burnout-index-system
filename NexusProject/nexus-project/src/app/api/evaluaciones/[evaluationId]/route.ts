import { httpConsultas } from "@/server/http/consultas-runtime";
export async function GET(
  request: Request,
  context: { params: Promise<{ evaluationId: string }> },
) {
  return httpConsultas.informe(request, (await context.params).evaluationId);
}
