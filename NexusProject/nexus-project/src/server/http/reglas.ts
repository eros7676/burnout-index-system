import type { PrismaClient } from "@prisma/client";
import { API_DEFAULTS } from "../../shared/api";
import type { EstadoBorradorReglas } from "../../shared/contratos/reglas";
import { tienePermiso, type Rol } from "../../shared/permisos";
import { registrarEvento } from "../repositories/auditoria";
import {
  actualizarBorrador,
  aprobarBorrador,
  crearBorrador,
  descartarBorrador,
  enviarBorrador,
  listarBorradores,
  listarVersiones,
  obtenerBorrador,
  publicarBorrador,
  rechazarBorrador,
  simularBorrador,
  type OpcionesBorrador,
} from "../services/reglas-borradores";
import { ErrorBorrador } from "../services/reglas-politica";
import { procesarImportacion } from "../services/procesamientos";
import { actorDemo, ErrorPermiso, errorPermiso } from "./permisos-demo";

const ESTADOS: readonly EstadoBorradorReglas[] = [
  "BORRADOR",
  "EN_REVISION",
  "PUBLICADO",
  "DESCARTADO",
];
const CUERPO_MAX = 16_384;

export type OpcionesHttpReglas = OpcionesBorrador & {
  /** Runs work after the response is sent (Next.js `after`); absent, nothing is scheduled. */
  despues?: (tarea: () => Promise<unknown>) => void;
};

const noStore = { "Cache-Control": "no-store" };

/** Maps the refusals of the lifecycle to their status; anything else is a generic 500 and stays in the server log. */
async function responder(accion: () => Promise<unknown>) {
  try {
    return Response.json(await accion(), { headers: noStore });
  } catch (error) {
    if (error instanceof ErrorBorrador)
      return Response.json(error.toApiError(), {
        status: error.status,
        headers: noStore,
      });
    console.error(error);
    return Response.json(
      {
        error: {
          codigo: "ERROR_INTERNO",
          mensaje: "No se pudo completar la operación.",
          detalles: [],
        },
      },
      { status: 500, headers: noStore },
    );
  }
}

async function leerJson(request: Request): Promise<unknown> {
  if (
    !(request.headers.get("content-type") ?? "")
      .toLowerCase()
      .startsWith("application/json")
  )
    throw new ErrorBorrador(
      "PETICION_INVALIDA",
      "El tipo de contenido debe ser application/json.",
    );
  const texto = await request.text();
  if (texto.length > CUERPO_MAX)
    throw new ErrorBorrador("PETICION_INVALIDA", "El cuerpo supera el tamaño permitido.");
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorBorrador("PETICION_INVALIDA", "El cuerpo no es un JSON válido.");
  }
}

/** A malformed id cannot name a draft. */
function identificador(valor: string): string {
  if (!/^[A-Za-z0-9_-]{1,36}$/.test(valor))
    throw new ErrorBorrador("NO_ENCONTRADO", "No existe el borrador de reglas.");
  return valor;
}

function sinFiltros(request: Request) {
  if (new URL(request.url).search)
    throw new ErrorBorrador("PETICION_INVALIDA", "Esta consulta no admite filtros.");
}

function filtrosBorradores(request: Request) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys())
    if (!["estado", "page", "pageSize"].includes(key) || params.getAll(key).length !== 1)
      throw new ErrorBorrador("PETICION_INVALIDA", "Filtros desconocidos o repetidos.");
  const entero = (key: string, defecto: number, maximo: number) => {
    const texto = params.get(key);
    if (texto === null) return defecto;
    const n = Number(texto);
    if (!/^[1-9]\d*$/.test(texto) || !Number.isSafeInteger(n) || n > maximo)
      throw new ErrorBorrador("PETICION_INVALIDA", `Parámetro ${key} inválido.`);
    return n;
  };
  const estado = params.get("estado");
  if (estado !== null && !ESTADOS.includes(estado as EstadoBorradorReglas))
    throw new ErrorBorrador("PETICION_INVALIDA", "Estado inválido.");
  return {
    estado: (estado as EstadoBorradorReglas | null) ?? undefined,
    page: entero("page", API_DEFAULTS.page, 1_000_000),
    pageSize: entero("pageSize", API_DEFAULTS.pageSize, API_DEFAULTS.maxPageSize),
  };
}

export function crearHttpReglas(db: PrismaClient, opciones: OpcionesHttpReglas = {}) {
  const { despues, ...servicio } = opciones;

  /**
   * Drafts and their simulations are for whoever edits or approves rules. Every role
   * may read the versions (LEER), but a Team Lead gets no draft, and the refusal is audited.
   */
  async function soloGestion(request: Request, accion: () => Promise<Response>) {
    const actor = actorDemo(request);
    const rol = actor.actorRol as Rol | undefined;
    if (
      rol &&
      (tienePermiso(rol, "EDITAR_REGLAS") || tienePermiso(rol, "APROBAR_REGLAS"))
    )
      return accion();
    try {
      await registrarEvento(db, {
        accion: "ACCESO_DENEGADO",
        recursoId: new URL(request.url).pathname.slice(0, 64),
        actor,
        resultado: "DENEGADO",
        motivo: "SIN_PERMISO",
        detalles: { metodo: request.method, permiso: "EDITAR_REGLAS|APROBAR_REGLAS" },
      });
    } catch (error) {
      console.error("Audit event ACCESO_DENEGADO not recorded", error);
    }
    return errorPermiso(
      new ErrorPermiso(403, "Su usuario no tiene permiso para realizar esta operación."),
    );
  }

  /** A step on one draft: the id from the route, the JSON body, the signed-in actor. */
  const paso =
    <T>(
      ejecutar: (
        id: string,
        cuerpo: unknown,
        actor: ReturnType<typeof actorDemo>,
      ) => Promise<T>,
    ) =>
    (request: Request, borradorId: string) =>
      responder(async () =>
        ejecutar(identificador(borradorId), await leerJson(request), actorDemo(request)),
      );

  return {
    versiones: (request: Request) =>
      responder(() => {
        sinFiltros(request);
        return listarVersiones(db, servicio);
      }),
    listarBorradores: (request: Request) =>
      soloGestion(request, () =>
        responder(() => listarBorradores(db, filtrosBorradores(request))),
      ),
    obtenerBorrador: (request: Request, borradorId: string) =>
      soloGestion(request, () =>
        responder(() => {
          sinFiltros(request);
          return obtenerBorrador(db, identificador(borradorId), servicio);
        }),
      ),
    crearBorrador: (request: Request) =>
      responder(async () => {
        const cuerpo = await leerJson(request);
        if (
          typeof cuerpo !== "object" ||
          cuerpo === null ||
          Array.isArray(cuerpo) ||
          Object.keys(cuerpo).length > 0
        )
          throw new ErrorBorrador("PETICION_INVALIDA", "El cuerpo debe ser un objeto vacío.");
        return crearBorrador(db, actorDemo(request), servicio);
      }),
    actualizarBorrador: paso((id, cuerpo, actor) =>
      actualizarBorrador(db, id, cuerpo, actor, servicio),
    ),
    simularBorrador: paso((id, cuerpo, actor) =>
      simularBorrador(db, id, cuerpo, actor, servicio),
    ),
    enviarBorrador: paso((id, cuerpo, actor) =>
      enviarBorrador(db, id, cuerpo, actor, servicio),
    ),
    aprobarBorrador: paso((id, cuerpo, actor) =>
      aprobarBorrador(db, id, cuerpo, actor, servicio),
    ),
    rechazarBorrador: paso((id, cuerpo, actor) =>
      rechazarBorrador(db, id, cuerpo, actor, servicio),
    ),
    descartarBorrador: paso((id, cuerpo, actor) =>
      descartarBorrador(db, id, cuerpo, actor, servicio),
    ),
    /** Publishing starts the reprocessing of the affected weeks once the response is out. */
    publicarBorrador: paso(async (id, cuerpo, actor) => {
      const publicacion = await publicarBorrador(db, id, cuerpo, actor, servicio);
      if (publicacion.version.estado === "PENDIENTE")
        despues?.(() =>
          procesarImportacion(db, publicacion.version.jobId).catch((error) =>
            console.error(
              `Reprocessing of ${publicacion.version.version} did not finish`,
              error,
            ),
          ),
        );
      return publicacion;
    }),
  };
}
