import { httpOrganizacion } from "@/server/http/organizacion-runtime";

export async function GET(request: Request) {
  return httpOrganizacion.opcionesEquipo(request);
}
