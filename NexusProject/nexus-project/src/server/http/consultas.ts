import { Prisma, type PrismaClient } from "@prisma/client";
import { ErrorDominio } from "../../shared/errors";
import { consultarResultados } from "../services/consultas";
import { construirInforme } from "../services/informes";
import {
  ErrorConsulta,
  filtrosConsulta,
  identificador,
} from "../services/filtros-consultas";
import { listarAlertas } from "../services/seguimiento-alertas";
import { filtrosAlertas } from "../services/seguimiento-filtros";
import { solicitanteDe } from "./seguimiento";

export async function respuesta(accion: () => Promise<unknown>) {
  let status = 200;
  let body;
  try {
    body = await accion();
  } catch (error) {
    status =
      error instanceof ErrorConsulta
        ? error.status
        : error instanceof ErrorDominio && error.codigo === "NO_ENCONTRADO"
          ? 404
          : 500;
    // The client gets a generic body; the cause stays in the server log.
    if (status === 500) console.error(error);
    body = {
      error: {
        codigo:
          status === 400
            ? "PETICION_INVALIDA"
            : status === 404
              ? "NO_ENCONTRADO"
              : "ERROR_INTERNO",
        mensaje:
          status === 500
            ? "No se pudo completar la consulta."
            : (error as Error).message,
        detalles: [],
      },
    };
  }
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function crearHttpConsultas(db: PrismaClient) {
  const listar =
    (tipo: "evaluaciones" | "resumen") => (request: Request) =>
      respuesta(() =>
        consultarResultados(db, filtrosConsulta(request, tipo), tipo),
      );
  return {
    evaluaciones: listar("evaluaciones"),
    // Alerts carry their names, weeks and follow-up status, and take the follow-up filters.
    alertas: (request: Request) =>
      respuesta(async () =>
        listarAlertas(db, filtrosAlertas(request), await solicitanteDe(db, request)),
      ),
    resumen: listar("resumen"),
    informe: (request: Request, id: string) =>
      respuesta(async () => {
        if (new URL(request.url).search)
          throw new ErrorConsulta(400, "El detalle no admite filtros.");
        const evaluationId = identificador(id, 36);
        return db.$transaction((tx) => construirInforme(tx, evaluationId), {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        });
      }),
  };
}
