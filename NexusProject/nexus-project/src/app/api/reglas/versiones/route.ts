import { httpReglas } from "@/server/http/reglas-runtime";
export async function GET(request: Request) {
  return httpReglas.versiones(request);
}
