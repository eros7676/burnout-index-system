import { httpPersonas } from "@/server/http/personas-runtime";
export async function GET(request: Request) {
  return httpPersonas.reglas(request);
}
