import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { MotivoAuditoria } from "../../shared/auditoria-catalogo";
import type { SesionDemoDTO, UsuarioDemoDTO } from "../../shared/contracts";
import { configCorreo } from "../correo";
import { tienePermiso, type Permiso, type Rol } from "../../shared/permisos";
import {
  registrarEvento,
  type ContextoAuditoria,
} from "../repositories/auditoria";

const USUARIOS_FIJOS: readonly UsuarioDemoDTO[] = [
  {
    userId: "demo-rrhh",
    nombre: "RR. HH.",
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
  {
    userId: "demo-empleado",
    nombre: "Empleado",
    rol: "EMPLEADO",
    employeeId: "EMP-001",
    teamId: "EQ-01",
  },
];

// One Team Lead login per active team with a lead: EQ-01 ↔ demo-tl-01.
const PREFIJO_TL = "demo-tl-";
export const userIdTeamLead = (teamId: string) =>
  `${PREFIJO_TL}${teamId.replace(/^EQ-/, "").toLowerCase()}`;
const teamIdDeUsuario = (userId: string) =>
  `EQ-${userId.slice(PREFIJO_TL.length).toUpperCase()}`;
const usuarioTeamLead = (equipo: {
  teamId: string;
  nombre: string;
  liderId: string;
}): UsuarioDemoDTO => ({
  userId: userIdTeamLead(equipo.teamId),
  nombre: `Team Lead, ${equipo.nombre}`,
  rol: "TEAM_LEAD",
  employeeId: equipo.liderId,
  teamId: equipo.teamId,
});

/** The seeded logins, for UI mocks and e2e fixtures. At runtime the list comes from `usuariosDemo`. */
export const USUARIOS_DEMO = [
  USUARIOS_FIJOS[0],
  USUARIOS_FIJOS[1],
  ...[1, 2, 3, 4].map((n) =>
    usuarioTeamLead({
      teamId: `EQ-0${n}`,
      nombre: `Célula ficticia ${n}`,
      liderId: `TL-0${n}`,
    }),
  ),
  USUARIOS_FIJOS[2],
] as const satisfies readonly UsuarioDemoDTO[];

const MENSAJES = {
  sinSesion: "Seleccione un usuario de demostración.",
  sinPermiso: "Su usuario no tiene permiso para realizar esta operación.",
  sinAsignacion: "El usuario de demostración no tiene una asignación vigente.",
  informeAjeno: "No tiene permiso para consultar informes de otros equipos.",
  equipoAjeno: "No tiene permiso para consultar otros equipos.",
  personaAjena: "No tiene permiso para consultar personas de otros equipos.",
  recursoAjeno: "No tiene permiso para acceder a recursos de otros equipos.",
  origen: "Origen no permitido.",
  solicitud: "Solicitud inválida.",
  usuario: "Usuario de demostración inválido.",
} as const;

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

type Sesion = { usuario: UsuarioDemoDTO; contexto: ContextoAuditoria };
const sesiones = new WeakMap<Request, Sesion>();

/** Audit identity of a guarded request. Internal adapters called without `proteger` act as demo-local. */
export const actorDemo = (request: Request): ContextoAuditoria =>
  sesiones.get(request)?.contexto ?? { actorId: "demo-local" };

/** The signed-in user of a request that went through `proteger`. */
export function usuarioDeSolicitud(request: Request): UsuarioDemoDTO {
  const sesion = sesiones.get(request);
  if (!sesion) throw new ErrorPermiso(401, MENSAJES.sinSesion);
  return sesion.usuario;
}

export class ErrorPermiso extends Error {
  constructor(
    public status: 401 | 403,
    mensaje: string,
    public motivo: MotivoAuditoria = "SIN_PERMISO",
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

/** Role is known from the signed session alone, so denials need no query. */
function rolDeUsuario(userId: string): Rol | null {
  return (
    USUARIOS_FIJOS.find((u) => u.userId === userId)?.rol ??
    (userId.startsWith(PREFIJO_TL) ? "TEAM_LEAD" : null)
  );
}

function userIdDeSesion(request: Request): string {
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
    if (typeof userId !== "string" || !rolDeUsuario(userId)) throw new Error();
    return userId;
  } catch {
    throw new ErrorPermiso(401, MENSAJES.sinSesion);
  }
}

async function resolverUsuario(
  db: PrismaClient,
  userId: string,
): Promise<UsuarioDemoDTO> {
  const fijo = USUARIOS_FIJOS.find((u) => u.userId === userId);
  if (fijo) return fijo;
  const equipo = await db.equipo.findUnique({
    where: { teamId: teamIdDeUsuario(userId) },
    select: { teamId: true, nombre: true, liderId: true, activo: true },
  });
  if (
    !equipo?.activo ||
    !equipo.liderId ||
    userIdTeamLead(equipo.teamId) !== userId
  )
    throw new ErrorPermiso(401, MENSAJES.sinSesion);
  return usuarioTeamLead({ ...equipo, liderId: equipo.liderId });
}

/** Fixed logins plus one Team Lead per active team that has a lead. */
export async function usuariosDemo(
  db: PrismaClient,
): Promise<UsuarioDemoDTO[]> {
  const equipos = await db.equipo.findMany({
    where: { activo: true, liderId: { not: null } },
    orderBy: { teamId: "asc" },
    select: { teamId: true, nombre: true, liderId: true },
  });
  const lideres = equipos
    .filter(
      (e) => teamIdDeUsuario(userIdTeamLead(e.teamId)) === e.teamId,
    )
    .map((e) => usuarioTeamLead({ ...e, liderId: e.liderId! }));
  return [USUARIOS_FIJOS[0], USUARIOS_FIJOS[1], ...lideres, USUARIOS_FIJOS[2]];
}

export async function usuarioDemo(db: PrismaClient, request: Request) {
  return resolverUsuario(db, userIdDeSesion(request));
}

function origen(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const esperado = `${url.protocol}//${request.headers.get("host") ?? url.host}`;
  if (origin && origin !== esperado)
    throw new ErrorPermiso(403, MENSAJES.origen, "ORIGEN_NO_PERMITIDO");
}

export function errorPermiso(error: unknown): Response {
  const status = error instanceof ErrorPermiso ? error.status : 500;
  if (status === 500) console.error(error);
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

/** Access events must never turn a response into a failure; a lost one is logged. */
async function registrarAcceso(
  db: PrismaClient,
  datos: Parameters<typeof registrarEvento>[1],
) {
  try {
    await registrarEvento(db, datos);
  } catch (error) {
    console.error(`Audit event ${datos.accion} not recorded`, error);
  }
}

const contextoDe = (
  usuario: Pick<UsuarioDemoDTO, "userId" | "nombre" | "rol">,
  solicitudId: string,
): ContextoAuditoria => ({
  actorId: usuario.userId,
  actorNombre: usuario.nombre,
  actorRol: usuario.rol,
  origen: "WEB",
  solicitudId,
});

const conSolicitud = (respuesta: Response, solicitudId: string) => {
  respuesta.headers.set("X-Request-Id", solicitudId);
  return respuesta;
};

export async function sesionDemo(db: PrismaClient, request: Request) {
  try {
    const usuarios = await usuariosDemo(db);
    let userId: string | null = null;
    try {
      userId = userIdDeSesion(request);
    } catch {
      // No session: the picker shows the list.
    }
    return Response.json(
      {
        usuario: usuarios.find((u) => u.userId === userId) ?? null,
        usuarios,
        correo: configCorreo() ? "REAL" : "SIMULADO",
      } satisfies SesionDemoDTO,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorPermiso(e);
  }
}

export async function seleccionarDemo(db: PrismaClient, request: Request) {
  try {
    origen(request);
    const texto = await request.text();
    if (texto.length > 256) throw new ErrorPermiso(403, MENSAJES.solicitud);
    let body;
    try {
      body = JSON.parse(texto);
    } catch {
      throw new ErrorPermiso(403, MENSAJES.solicitud);
    }
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.userId !== "string" ||
      Object.keys(body).length !== 1 ||
      !rolDeUsuario(body.userId)
    )
      throw new ErrorPermiso(403, MENSAJES.usuario);
    const usuario = (await usuariosDemo(db)).find(
      (u) => u.userId === body.userId,
    );
    if (!usuario) throw new ErrorPermiso(403, MENSAJES.usuario);
    const solicitudId = randomUUID();
    await registrarAcceso(db, {
      accion: "SESION_DEMO_INICIADA",
      recursoId: usuario.userId,
      actor: contextoDe(usuario, solicitudId),
      detalles: { rol: usuario.rol, teamId: usuario.teamId },
    });
    return Response.json(
      { usuario },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": solicitudId,
          "Set-Cookie": `${COOKIE}=${tokenDemo(usuario.userId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
        },
      },
    );
  } catch (e) {
    return errorPermiso(e);
  }
}

/**
 * How a Team Lead's request is narrowed to their team.
 * - default: `teamId`/`employeeId` query filters, `teamId` injected when absent.
 * - "informe": ids[0] is an evaluationId; "empleado": an employeeId; "equipo": a teamId; "alerta": an alertId.
 * - "global": company-wide data a Team Lead may read unscoped (rules).
 */
export type RecursoProtegido =
  | "informe"
  | "empleado"
  | "equipo"
  | "alerta"
  | "global";

async function comprobarAsignacion(db: PrismaClient, usuario: UsuarioDemoDTO) {
  if (!usuario.employeeId) return;
  const empleado = await db.empleado.findUnique({
    where: { employeeId: usuario.employeeId },
  });
  if (
    !empleado?.activo ||
    // The demo "Empleado" is a technician in the catalog.
    empleado.tipo !== (usuario.rol === "EMPLEADO" ? "TECNICO" : usuario.rol) ||
    (usuario.rol === "TEAM_LEAD" && empleado.teamId !== usuario.teamId)
  )
    throw new ErrorPermiso(403, MENSAJES.sinAsignacion, "SIN_ASIGNACION");
}

async function acotarAlEquipo(
  db: PrismaClient,
  request: Request,
  teamId: string,
  recurso: RecursoProtegido | undefined,
  id: string | undefined,
): Promise<Request> {
  const ajeno = (mensaje: string) =>
    new ErrorPermiso(403, mensaje, "FUERA_DE_EQUIPO");
  switch (recurso) {
    case "global":
      return request;
    case "informe":
      if (
        !(await db.evaluacion.findFirst({
          where: { evaluationId: id, periodo: { empleado: { teamId } } },
          select: { evaluationId: true },
        }))
      )
        throw ajeno(MENSAJES.informeAjeno);
      return request;
    case "empleado":
      if (
        !(await db.empleado.findFirst({
          where: { employeeId: id, teamId },
          select: { employeeId: true },
        }))
      )
        throw ajeno(MENSAJES.personaAjena);
      return request;
    case "equipo":
      if (id !== teamId) throw ajeno(MENSAJES.equipoAjeno);
      return request;
    case "alerta":
      if (
        !(await db.alerta.findFirst({
          where: { alertId: id, empleado: { teamId } },
          select: { alertId: true },
        }))
      )
        throw ajeno(MENSAJES.recursoAjeno);
      return request;
  }
  const url = new URL(request.url);
  if (url.searchParams.getAll("teamId").some((t) => t !== teamId))
    throw ajeno(MENSAJES.equipoAjeno);
  for (const employeeId of url.searchParams.getAll("employeeId"))
    if (
      !(await db.empleado.findFirst({
        where: { employeeId, teamId },
        select: { employeeId: true },
      }))
    )
      throw ajeno(MENSAJES.personaAjena);
  if (!url.searchParams.has("teamId")) url.searchParams.set("teamId", teamId);
  return new Request(url, request);
}

/**
 * Mandatory guard of every production HTTP adapter. No header sets role or team.
 * It answers with X-Request-Id, records denials (403) and hands the audit context to the handler.
 */
export function proteger<T extends string[]>(
  db: PrismaClient,
  permiso: Permiso,
  accion: (request: Request, ...ids: T) => Promise<Response>,
  recurso?: RecursoProtegido,
) {
  return async (request: Request, ...ids: T): Promise<Response> => {
    const solicitudId = randomUUID();
    let userId: string | null = null;
    let usuario: UsuarioDemoDTO | null = null;
    try {
      userId = userIdDeSesion(request);
      const rol = rolDeUsuario(userId)!;
      if (request.method !== "GET") origen(request);
      if (!tienePermiso(rol, permiso))
        throw new ErrorPermiso(403, MENSAJES.sinPermiso);
      usuario = await resolverUsuario(db, userId);
      await comprobarAsignacion(db, usuario);
      if (usuario.rol === "TEAM_LEAD" && permiso !== "PROPIOS")
        request = await acotarAlEquipo(
          db,
          request,
          usuario.teamId!,
          recurso,
          ids[0],
        );
    } catch (e) {
      if (e instanceof ErrorPermiso && e.status === 403 && userId)
        await registrarAcceso(db, {
          accion: "ACCESO_DENEGADO",
          recursoId: new URL(request.url).pathname.slice(0, 64),
          actor: {
            actorId: userId,
            actorNombre: usuario?.nombre,
            actorRol: rolDeUsuario(userId) ?? undefined,
            origen: "WEB",
            solicitudId,
          },
          resultado: "DENEGADO",
          motivo: e.motivo,
          detalles: {
            metodo: request.method,
            permiso,
            ...(recurso ? { recurso } : {}),
          },
        });
      return conSolicitud(errorPermiso(e), solicitudId);
    }
    sesiones.set(request, {
      usuario,
      contexto: contextoDe(usuario, solicitudId),
    });
    return conSolicitud(await accion(request, ...ids), solicitudId);
  };
}
