import { httpOrganizacion } from "@/server/http/organizacion-runtime";

type Contexto = { params: Promise<{ employeeId: string }> };

export async function GET(request: Request, context: Contexto) {
  return httpOrganizacion.ficha(request, (await context.params).employeeId);
}

export async function PATCH(request: Request, context: Contexto) {
  return httpOrganizacion.editarPersona(request, (await context.params).employeeId);
}
