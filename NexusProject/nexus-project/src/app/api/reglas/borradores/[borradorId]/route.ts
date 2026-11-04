import { httpReglas } from "@/server/http/reglas-runtime";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ borradorId: string }> },
) {
  return httpReglas.obtenerBorrador(request, (await params).borradorId);
}
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ borradorId: string }> },
) {
  return httpReglas.actualizarBorrador(request, (await params).borradorId);
}
