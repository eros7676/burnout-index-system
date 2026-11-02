import type { PrismaClient } from "@prisma/client";
import {
  consultarMisDatos,
  consultarPersonas,
  consultarReglas,
} from "../services/personas";
import { ErrorConsulta, identificador } from "../services/filtros-consultas";
import { respuesta } from "./consultas";

function sinFiltros(request: Request) {
  if (new URL(request.url).search)
    throw new ErrorConsulta(400, "Esta consulta no admite filtros.");
}

export function crearHttpPersonas(db: PrismaClient) {
  return {
    personas: (request: Request) =>
      respuesta(() => {
        const params = new URL(request.url).searchParams;
        const filtros: { teamId?: string; employeeId?: string } = {};
        for (const key of params.keys())
          if (
            (key !== "teamId" && key !== "employeeId") ||
            params.getAll(key).length !== 1
          )
            throw new ErrorConsulta(400, "Filtros desconocidos o repetidos.");
        for (const key of ["teamId", "employeeId"] as const)
          if (params.has(key)) filtros[key] = identificador(params.get(key)!);
        return consultarPersonas(db, filtros);
      }),
    /** employeeId comes from the session, never from the request. */
    misDatos: (request: Request, employeeId: string) =>
      respuesta(() => {
        sinFiltros(request);
        return consultarMisDatos(db, employeeId);
      }),
    reglas: (request: Request) =>
      respuesta(() => {
        sinFiltros(request);
        return consultarReglas(db);
      }),
  };
}
