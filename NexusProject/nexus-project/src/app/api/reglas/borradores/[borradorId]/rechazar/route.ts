import { httpReglas } from "@/server/http/reglas-runtime";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ borradorId: string }> },
) {
  return httpReglas.rechazarBorrador(request, (await params).borradorId);
}
