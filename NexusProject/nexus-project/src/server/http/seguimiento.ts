// HTTP adapters of an alert's page and its follow-up case. Every handler runs behind `proteger`
// (seguimiento-runtime.ts); the service decides who may do what on each alert.
import type { PrismaClient } from "@prisma/client";
import type { ErrorCampo, UsuarioDemoDTO } from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import {
  ESTADOS_SEGUIMIENTO,
  MOTIVOS_CIERRE,
  TIPOS_MEDIDA_CLAVES,
  type AbrirSeguimiento,
  type ActualizarSeguimiento,
  type AnotarSeguimiento,
  type CerrarSeguimiento,
  type MarcarMedida,
  type RegistrarMedida,
} from "../../shared/contratos/seguimiento";
import { registrarEvento } from "../repositories/auditoria";
import { ErrorConsulta, identificador } from "../services/filtros-consultas";
import {
  abrirSeguimiento,
  actualizarSeguimiento,
  anotarSeguimiento,
  cerrarSeguimiento,
  ErrorSeguimiento,
  marcarMedida,
  obtenerSeguimiento,
  registrarMedida,
  type SesionSeguimiento,
} from "../services/seguimiento";
import { obtenerAlerta, type Solicitante } from "../services/seguimiento-alertas";
import {
  actorDemo,
  ErrorPermiso,
  errorPermiso,
  usuarioDeSolicitud,
  usuariosDemo,
} from "./permisos-demo";

type Objeto = Record<string, unknown>;
const TEXTO_MAXIMO = 4096;

/** A strict JSON object body: JSON content type, small, only the keys listed. An empty body is `{}` where allowed. */
async function leerCuerpo(
  request: Request,
  claves: readonly string[],
  { vacioPermitido = false }: { vacioPermitido?: boolean } = {},
): Promise<Objeto> {
  const texto = await request.text();
  if (!texto.trim()) {
    if (vacioPermitido) return {};
    throw new ErrorConsulta(400, "Se esperaba un objeto JSON.");
  }
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? ""))
    throw new ErrorConsulta(400, "Use application/json.");
  if (texto.length > TEXTO_MAXIMO)
    throw new ErrorConsulta(400, "Solicitud demasiado grande.");
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    throw new ErrorConsulta(400, "JSON inválido.");
  }
  if (!valor || typeof valor !== "object" || Array.isArray(valor))
    throw new ErrorConsulta(400, "Se esperaba un objeto JSON.");
  const objeto = valor as Objeto;
  if (Object.keys(objeto).some((k) => !claves.includes(k)))
    throw new ErrorConsulta(400, "La solicitud contiene campos desconocidos.");
  return objeto;
}

const texto = (valor: unknown, campo: string) => {
  if (typeof valor !== "string")
    throw new ErrorConsulta(400, `El campo ${campo} debe ser texto.`);
  return valor;
};
const textoOpcional = (valor: unknown, campo: string) =>
  valor === undefined || valor === null ? valor : texto(valor, campo);

export const leerAbrir = async (r: Request): Promise<AbrirSeguimiento> => {
  const c = await leerCuerpo(r, ["asignadoA"], { vacioPermitido: true });
  return c.asignadoA === undefined
    ? {}
    : { asignadoA: identificador(texto(c.asignadoA, "asignadoA")) };
};

export const leerActualizar = async (r: Request): Promise<ActualizarSeguimiento> => {
  const c = await leerCuerpo(r, ["estado", "asignadoA", "vence"]);
  if (!Object.keys(c).length)
    throw new ErrorConsulta(400, "Indique al menos un campo para actualizar.");
  const datos: ActualizarSeguimiento = {};
  if (c.estado !== undefined) {
    if (!ESTADOS_SEGUIMIENTO.includes(c.estado as never))
      throw new ErrorConsulta(400, "Estado de seguimiento inválido.");
    // CERRADO and NUEVO are refused by the rules (422); closing has its own operation.
    datos.estado = c.estado as ActualizarSeguimiento["estado"];
  }
  if (c.asignadoA !== undefined)
    datos.asignadoA = identificador(texto(c.asignadoA, "asignadoA"));
  if (c.vence !== undefined)
    datos.vence = textoOpcional(c.vence, "vence") as string | null;
  return datos;
};

export const leerNota = async (r: Request): Promise<AnotarSeguimiento> => {
  const c = await leerCuerpo(r, ["texto"]);
  return { texto: texto(c.texto, "texto") };
};

export const leerMedida = async (r: Request): Promise<RegistrarMedida> => {
  const c = await leerCuerpo(r, ["tipo", "factor", "responsableId", "vence"]);
  const tipo = texto(c.tipo, "tipo");
  if (!TIPOS_MEDIDA_CLAVES.includes(tipo as never))
    throw new ErrorConsulta(400, "Tipo de medida inválido.");
  return {
    tipo: tipo as RegistrarMedida["tipo"],
    factor: textoOpcional(c.factor, "factor") as RegistrarMedida["factor"],
    responsableId: identificador(texto(c.responsableId, "responsableId")),
    vence: textoOpcional(c.vence, "vence") as string | null | undefined,
  };
};

export const leerMarca = async (r: Request): Promise<MarcarMedida> => {
  const c = await leerCuerpo(r, ["medidaId", "hecha"]);
  if (typeof c.hecha !== "boolean")
    throw new ErrorConsulta(400, "El campo hecha debe ser verdadero o falso.");
  return { medidaId: identificador(texto(c.medidaId, "medidaId"), 36), hecha: c.hecha };
};

export const leerCierre = async (r: Request): Promise<CerrarSeguimiento> => {
  const c = await leerCuerpo(r, ["motivoCierre", "justificacion"]);
  const motivo = texto(c.motivoCierre, "motivoCierre");
  if (!MOTIVOS_CIERRE.includes(motivo as never))
    throw new ErrorConsulta(400, "Motivo de cierre inválido.");
  return {
    motivoCierre: motivo as CerrarSeguimiento["motivoCierre"],
    justificacion: texto(c.justificacion, "justificacion"),
  };
};

/** The signed-in user (if the request went through `proteger`) and the logins that exist. */
export async function solicitanteDe(
  db: PrismaClient,
  request: Request,
): Promise<Solicitante> {
  let usuario: UsuarioDemoDTO | null = null;
  try {
    usuario = usuarioDeSolicitud(request);
  } catch {
    // Internal adapters call without a session and see everything.
  }
  return { usuario, usuarios: await usuariosDemo(db) };
}

const CODIGOS: Record<number, string> = {
  400: "PETICION_INVALIDA",
  403: "SIN_PERMISO",
  404: "NO_ENCONTRADO",
  409: "ESTADO_INCOMPATIBLE",
  422: "VALIDACION_INVALIDA",
  500: "ERROR_INTERNO",
};

function fallo(status: number, mensaje: string, detalles: ErrorCampo[] = []) {
  return Response.json(
    {
      error: {
        codigo: CODIGOS[status] ?? "ERROR_INTERNO",
        mensaje: status === 500 ? "No se pudo completar la operación." : mensaje,
        detalles,
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function crearHttpSeguimiento(db: PrismaClient) {
  async function sesionDe(request: Request): Promise<SesionSeguimiento> {
    return {
      usuario: usuarioDeSolicitud(request),
      actor: actorDemo(request),
      usuarios: await usuariosDemo(db),
    };
  }

  /** A refusal inside the service is recorded like the guard's: who tried what on which alert. */
  async function registrarDenegacion(request: Request, alertId: string, error: ErrorSeguimiento) {
    try {
      await registrarEvento(db, {
        accion: "ACCESO_DENEGADO",
        recursoId: alertId,
        actor: actorDemo(request),
        resultado: "DENEGADO",
        motivo: error.motivo,
        detalles: { metodo: request.method, permiso: "SEGUIMIENTO", recurso: "alerta" },
      });
    } catch (e) {
      console.error("Audit event ACCESO_DENEGADO not recorded", e);
    }
  }

  async function responder(
    request: Request,
    alertId: string,
    accion: (sesion: SesionSeguimiento) => Promise<unknown>,
    { admiteConsulta = false }: { admiteConsulta?: boolean } = {},
  ) {
    try {
      identificador(alertId, 36);
      if (!admiteConsulta && new URL(request.url).search)
        throw new ErrorConsulta(400, "La ruta no admite filtros.");
      const cuerpo = await accion(await sesionDe(request));
      return Response.json(cuerpo, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof ErrorPermiso) return errorPermiso(error);
      if (error instanceof ErrorConsulta) return fallo(error.status, error.message);
      if (error instanceof ErrorSeguimiento) {
        if (error.status === 403) await registrarDenegacion(request, alertId, error);
        return fallo(error.status, error.message, error.detalles);
      }
      if (error instanceof ErrorDominio && error.codigo === "NO_ENCONTRADO")
        return fallo(404, error.message);
      console.error(error);
      return fallo(500, "");
    }
  }

  return {
    alerta: (request: Request, alertId: string) =>
      responder(request, alertId, async () =>
        obtenerAlerta(db, alertId, await solicitanteDe(db, request)),
      ),
    obtener: (request: Request, alertId: string) =>
      responder(request, alertId, (s) => obtenerSeguimiento(db, alertId, s)),
    abrir: (request: Request, alertId: string) =>
      responder(request, alertId, async (s) =>
        abrirSeguimiento(db, alertId, await leerAbrir(request), s),
      ),
    actualizar: (request: Request, alertId: string) =>
      responder(request, alertId, async (s) =>
        actualizarSeguimiento(db, alertId, await leerActualizar(request), s),
      ),
    anotar: (request: Request, alertId: string) =>
      responder(request, alertId, async (s) =>
        anotarSeguimiento(db, alertId, await leerNota(request), s),
      ),
    medida: (request: Request, alertId: string) =>
      responder(request, alertId, async (s) =>
        registrarMedida(db, alertId, await leerMedida(request), s),
      ),
    marcarMedida: (request: Request, alertId: string) =>
      responder(request, alertId, async (s) =>
        marcarMedida(db, alertId, await leerMarca(request), s),
      ),
    cerrar: (request: Request, alertId: string) =>
      responder(request, alertId, async (s) =>
        cerrarSeguimiento(db, alertId, await leerCierre(request), s),
      ),
  };
}
