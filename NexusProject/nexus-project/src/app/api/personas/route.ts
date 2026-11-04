import { httpOrganizacion } from "@/server/http/organizacion-runtime";
import { httpPersonas } from "@/server/http/personas-runtime";

export async function GET(request: Request) {
  return httpPersonas.personas(request);
}

export async function POST(request: Request) {
  return httpOrganizacion.crearPersona(request);
}
