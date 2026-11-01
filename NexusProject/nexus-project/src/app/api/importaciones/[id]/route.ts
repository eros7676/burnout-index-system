import { httpCu01 } from "../../../../server/http/cu01-runtime";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return httpCu01.cancelar(request, (await context.params).id);
}
