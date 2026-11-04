import { httpOrganizacion } from "@/server/http/organizacion-runtime";

export async function GET(request: Request) {
  return httpOrganizacion.equipos(request);
}

export async function POST(request: Request) {
  return httpOrganizacion.crearEquipo(request);
}
