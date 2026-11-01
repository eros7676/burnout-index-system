import { httpConsultas } from "@/server/http/consultas-runtime";
export async function GET(request: Request) {
  return httpConsultas.alertas(request);
}
