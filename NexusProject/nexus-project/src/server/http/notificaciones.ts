import type { PrismaClient } from "@prisma/client";
import type { SolicitudNotificacion } from "../../shared/contracts";
import { ErrorConsulta, identificador } from "../services/filtros-consultas";
import {
  ErrorNotificacion,
  listarNotificaciones,
  prepararNotificacion,
  procesarNotificacion,
} from "../services/notificaciones";

export function validarSolicitud(valor: unknown): SolicitudNotificacion {
  if (!valor || typeof valor !== "object" || Array.isArray(valor))
    throw new ErrorConsulta(400, "Se esperaba un objeto JSON.");
  const data = valor as Record<string, unknown>;
  if (
    Object.keys(data).length !== 2 ||
    typeof data.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      data.requestId,
    ) ||
    (data.resultado !== "EXITO" && data.resultado !== "FALLO")
  )
    throw new ErrorConsulta(
      400,
      "Usá requestId UUID v4 y resultado EXITO o FALLO.",
    );
  return { requestId: data.requestId, resultado: data.resultado };
}

export function crearHttpNotificaciones(db: PrismaClient) {
  async function responder(
    request: Request,
    alertId: string,
    accion: () => Promise<unknown>,
  ) {
    try {
      identificador(alertId, 36);
      if (new URL(request.url).search)
        throw new ErrorConsulta(400, "La ruta no admite filtros.");
      return Response.json(await accion(), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const status =
        error instanceof ErrorConsulta || error instanceof ErrorNotificacion
          ? error.status
          : 500;
      return Response.json(
        {
          error: {
            codigo:
              status === 400
                ? "PETICION_INVALIDA"
                : status === 404
                  ? "NO_ENCONTRADO"
                  : status === 409
                    ? "ESTADO_INCOMPATIBLE"
                    : "ERROR_INTERNO",
            mensaje:
              status === 500
                ? "No se pudo completar la simulación."
                : (error as Error).message,
            detalles: [],
          },
        },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  return {
    listar: (request: Request, alertId: string) =>
      responder(request, alertId, () => listarNotificaciones(db, alertId)),
    preparar: (request: Request, alertId: string) =>
      responder(request, alertId, async () => {
        if (
          !/^application\/json(?:;|$)/i.test(
            request.headers.get("content-type") ?? "",
          )
        )
          throw new ErrorConsulta(400, "Usá application/json.");
        // El cuerpo es pequeño y no admite contenido de correo libre.
        const texto = await request.text();
        if (texto.length > 1024)
          throw new ErrorConsulta(400, "Solicitud demasiado grande.");
        let body;
        try {
          body = JSON.parse(texto);
        } catch {
          throw new ErrorConsulta(400, "JSON inválido.");
        }
        return prepararNotificacion(db, alertId, validarSolicitud(body));
      }),
    procesar: (request: Request, alertId: string, intentoId: string) =>
      responder(request, alertId, async () => {
        identificador(intentoId, 36);
        if ((await request.text()).trim())
          throw new ErrorConsulta(400, "Procesar no admite cuerpo.");
        return procesarNotificacion(db, alertId, intentoId);
      }),
  };
}
