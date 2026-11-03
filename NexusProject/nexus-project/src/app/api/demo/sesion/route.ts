import { prisma } from "@/lib/db";
import { seleccionarDemo, sesionDemo } from "@/server/http/permisos-demo";

export const GET = (request: Request) => sesionDemo(prisma, request);
export const POST = (request: Request) => seleccionarDemo(prisma, request);
