import { httpOrganizacion } from "@/server/http/organizacion-runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ employeeId: string }> },
) {
  return httpOrganizacion.darDeBaja(request, (await context.params).employeeId);
}
