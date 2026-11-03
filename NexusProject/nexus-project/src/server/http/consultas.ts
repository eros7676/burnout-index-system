import { Prisma, type PrismaClient } from "@prisma/client";
import { ErrorDominio } from "../../shared/errors";
import { registrarEvento } from "../repositories/auditoria";
import { actorDemo } from "./permisos-demo";
import { consultarResultados } from "../services/consultas";
import { construirInforme } from "../services/informes";
import {
  ErrorConsulta,
  filtrosConsulta,
  identificador,
} from "../services/filtros-consultas";

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
    (tipo: "evaluaciones" | "alertas" | "resumen") => (request: Request) =>
      respuesta(() =>
        consultarResultados(db, filtrosConsulta(request, tipo), tipo),
      );
  return {
    evaluaciones: listar("evaluaciones"),
    alertas: listar("alertas"),
    resumen: listar("resumen"),
    informe: (request: Request, id: string) =>
      respuesta(async () => {
        if (new URL(request.url).search)
          throw new ErrorConsulta(400, "El detalle no admite filtros.");
        const evaluationId = identificador(id, 36);
        // Reading one person's report is a consultation of personal data: the trace is written
        // with the read and fails closed, so a report is never shown without it
        // (audit-trail §1.4 and §2.3: CNIL §6 "consultation", Ley 25.326 art. 9, OWASP sensitive_read).
        return db.$transaction(
          async (tx) => {
            const informe = await construirInforme(tx, evaluationId);
            await registrarEvento(tx, {
              accion: "INFORME_CONSULTADO",
              recursoId: evaluationId,
              sujetoId: informe.evaluacion.employeeId,
              actor: actorDemo(request),
              detalles: { semana: informe.evaluacion.periodStart },
            });
            return informe;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
        );
      }),
  };
}
