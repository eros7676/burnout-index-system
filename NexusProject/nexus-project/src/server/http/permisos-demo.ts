import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export const USUARIOS_DEMO = [
  {
    userId: "demo-rrhh",
    nombre: "RRHH",
    rol: "RRHH",
    employeeId: null,
    teamId: null,
  },
  {
    userId: "demo-gerencia",
    nombre: "Gerencia",
    rol: "GERENCIA",
    employeeId: "GER-01",
    teamId: null,
  },
  ...[1, 2, 3, 4].map((n) => ({
    userId: `demo-tl-0${n}`,
    nombre: `Team Lead EQ-0${n}`,
    rol: "TEAM_LEAD",
    employeeId: `TL-0${n}`,
    teamId: `EQ-0${n}`,
  })),
  {
    userId: "demo-empleado",
    nombre: "Empleado",
    rol: "EMPLEADO",
    employeeId: "EMP-001",
    teamId: "EQ-01",
  },
] as const;
type Usuario = (typeof USUARIOS_DEMO)[number];
type Permiso = "LEER" | "IMPORTAR" | "AUDITORIA" | "NOTIFICAR";
const globalDemo = globalThis as typeof globalThis & { claveDemo?: Buffer };
function clave() {
  return (
    process.env.DEMO_SESSION_SECRET ??
    (globalDemo.claveDemo ??= randomBytes(32))
  );
}
const firma = (valor: string) =>
  createHmac("sha256", clave()).update(valor).digest("base64url");
const COOKIE = "nexo_demo";
const actores = new WeakMap<Request, string>();
export const actorDemo = (request: Request) =>
  actores.get(request) ?? "demo-local";
export class ErrorPermiso extends Error {
  constructor(
    public status: 401 | 403,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
export function tokenDemo(userId: string) {
  const valor = Buffer.from(
    JSON.stringify({ userId, exp: Date.now() + 8 * 60 * 60 * 1000 }),
  ).toString("base64url");
  return `${valor}.${firma(valor)}`;
}
export function usuarioDemo(request: Request): Usuario {
  const cookies = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((s) => s.trim());
  const tokens = cookies.filter((s) => s.startsWith(`${COOKIE}=`));
  try {
    if (tokens.length !== 1) throw new Error();
    const token = tokens[0].slice(COOKIE.length + 1);
    if (token.length > 1024) throw new Error();
    const partes = token.split(".");
    if (partes.length !== 2) throw new Error();
    const a = Buffer.from(partes[1]);
    const b = Buffer.from(firma(partes[0]));
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error();
    const { userId, exp } = JSON.parse(
      Buffer.from(partes[0], "base64url").toString(),
    );
    if (!Number.isFinite(exp) || exp <= Date.now()) throw new Error();
    const usuario = USUARIOS_DEMO.find((u) => u.userId === userId);
    if (!usuario) throw new Error();
    return usuario;
  } catch {
    throw new ErrorPermiso(401, "Seleccioná un usuario de demostración.");
  }
}
function origen(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const esperado = `${url.protocol}//${request.headers.get("host") ?? url.host}`;
  if (origin && origin !== esperado)
    throw new ErrorPermiso(403, "Origen no permitido.");
}
export function errorPermiso(error: unknown): Response {
  const status = error instanceof ErrorPermiso ? error.status : 500;
  return Response.json(
    {
      error: {
        codigo:
          status === 401
            ? "SIN_SESION"
            : status === 403
              ? "SIN_PERMISO"
              : "ERROR_INTERNO",
        mensaje:
          status === 500
            ? "No se pudo verificar el permiso."
            : (error as Error).message,
        detalles: [],
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export function sesionDemo(request: Request) {
  try {
    return Response.json(
      { usuario: usuarioDemo(request), usuarios: USUARIOS_DEMO },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { usuario: null, usuarios: USUARIOS_DEMO },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function seleccionarDemo(request: Request) {
  try {
    origen(request);
    const texto = await request.text();
    if (texto.length > 256) throw new ErrorPermiso(403, "Solicitud inválida.");
    let body;
    try {
      body = JSON.parse(texto);
    } catch {
      throw new ErrorPermiso(403, "Solicitud inválida.");
    }
    const usuario = USUARIOS_DEMO.find((u) => u.userId === body?.userId);
    if (!usuario || Object.keys(body).length !== 1)
      throw new ErrorPermiso(403, "Usuario demo inválido.");
    return Response.json(
      { usuario },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": `${COOKIE}=${tokenDemo(usuario.userId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
        },
      },
    );
  } catch (e) {
    return errorPermiso(e);
  }
}

/** Guard obligatorio de los adaptadores HTTP de producción. Ningún encabezado fija rol/equipo. */
export function proteger<T extends string[]>(
  db: PrismaClient,
  permiso: Permiso,
  accion: (request: Request, ...ids: T) => Promise<Response>,
  recurso?: "informe",
) {
  return async (request: Request, ...ids: T): Promise<Response> => {
    try {
      const usuario = usuarioDemo(request);
      if (request.method !== "GET") origen(request);
      if (
        usuario.rol === "EMPLEADO" ||
        ((permiso === "IMPORTAR" || permiso === "NOTIFICAR") &&
          usuario.rol !== "RRHH") ||
        (permiso === "AUDITORIA" &&
          usuario.rol !== "RRHH" &&
          usuario.rol !== "GERENCIA")
      )
        throw new ErrorPermiso(
          403,
          "Tu usuario no tiene permiso para esta operación.",
        );
      if (usuario.employeeId) {
        const empleado = await db.empleado.findUnique({
          where: { employeeId: usuario.employeeId },
        });
        if (
          !empleado?.activo ||
          empleado.tipo !== usuario.rol ||
          (usuario.rol === "TEAM_LEAD" && empleado.teamId !== usuario.teamId)
        )
          throw new ErrorPermiso(
            403,
            "El usuario demo no tiene una asignación vigente.",
          );
      }
      if (usuario.rol === "TEAM_LEAD") {
        if (recurso === "informe") {
          const fila = await db.evaluacion.findFirst({
            where: {
              evaluationId: ids[0],
              periodo: { empleado: { teamId: usuario.teamId } },
            },
            select: { evaluationId: true },
          });
          if (!fila)
            throw new ErrorPermiso(
              403,
              "No podés consultar un informe fuera de tu equipo.",
            );
        } else {
          const url = new URL(request.url);
          if (
            url.searchParams
              .getAll("teamId")
              .some((id) => id !== usuario.teamId)
          )
            throw new ErrorPermiso(403, "No podés consultar otro equipo.");
          for (const employeeId of url.searchParams.getAll("employeeId")) {
            const empleado = await db.empleado.findFirst({
              where: { employeeId, teamId: usuario.teamId },
              select: { employeeId: true },
            });
            if (!empleado)
              throw new ErrorPermiso(
                403,
                "No podés consultar empleados de otro equipo.",
              );
          }
          if (!url.searchParams.has("teamId"))
            url.searchParams.set("teamId", usuario.teamId!);
          request = new Request(url, request);
        }
      }
      // La identidad de auditoría proviene de la sesión, sin tocar el cuerpo multipart.
      actores.set(request, usuario.userId);
      return accion(request, ...ids);
    } catch (e) {
      return errorPermiso(e);
    }
  };
}
