import { httpCu01 } from "../../../../../server/http/cu01-runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ tipo: string }> },
) {
  return httpCu01.plantilla(request, (await context.params).tipo);
}
