import { httpReglas } from "@/server/http/reglas-runtime";
export async function GET(request: Request) {
  return httpReglas.listarBorradores(request);
}
export async function POST(request: Request) {
  return httpReglas.crearBorrador(request);
}
