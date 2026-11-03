import { httpOrganizacion } from "@/server/http/organizacion-runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ teamId: string }> },
) {
  return httpOrganizacion.cambiarLider(request, (await context.params).teamId);
}
