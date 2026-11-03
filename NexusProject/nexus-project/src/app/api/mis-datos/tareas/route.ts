import { httpTareas } from "@/server/http/tareas-runtime";
export async function GET(request: Request) {
  return httpTareas.misTareas(request);
}
