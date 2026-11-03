import { httpOrganizacion } from "@/server/http/organizacion-runtime";

type Contexto = { params: Promise<{ teamId: string }> };

export async function GET(request: Request, context: Contexto) {
  return httpOrganizacion.equipo(request, (await context.params).teamId);
}

export async function PATCH(request: Request, context: Contexto) {
  return httpOrganizacion.editarEquipo(request, (await context.params).teamId);
}
