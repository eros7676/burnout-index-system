import { httpCu01 } from "../../../../server/http/cu01-runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  return httpCu01.consultar(request, (await context.params).jobId);
}
