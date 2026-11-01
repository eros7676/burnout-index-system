import { httpCu01 } from "../../../../../server/http/cu01-runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return httpCu01.confirmar(request, (await context.params).id);
}
