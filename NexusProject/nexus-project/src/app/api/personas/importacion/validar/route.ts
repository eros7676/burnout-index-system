import { httpOrganizacion } from "@/server/http/organizacion-runtime";

export async function POST(request: Request) {
  return httpOrganizacion.validarImportacion(request);
}
