import { httpOrganizacion } from "@/server/http/organizacion-runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ employeeId: string }> },
) {
  return httpOrganizacion.cambiarAsignacion(request, (await context.params).employeeId);
}
