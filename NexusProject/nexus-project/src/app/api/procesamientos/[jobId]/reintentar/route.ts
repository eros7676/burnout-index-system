import { httpCu01 } from "../../../../../server/http/cu01-runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  return httpCu01.reintentar(request, (await context.params).jobId);
}
