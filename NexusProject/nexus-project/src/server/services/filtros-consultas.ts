import type { FiltrosEvaluaciones } from "../../shared/contracts";
import { fechaParaDb } from "../repositories/fechas";

export class ErrorConsulta extends Error {
  constructor(
    public status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
export type Consulta = FiltrosEvaluaciones & { page: number; pageSize: number };
export function identificador(valor: string, maximo = 64): string {
  if (!/^[A-Za-z0-9_-]+$/.test(valor) || valor.length > maximo)
    throw new ErrorConsulta(400, "Identificador inválido.");
  return valor;
}
export function filtrosConsulta(
  request: Request,
  tipo: "evaluaciones" | "alertas" | "resumen",
): Consulta {
  const params = new URL(request.url).searchParams;
  const permitidos = new Set([
    "employeeId",
    "teamId",
    "periodStart",
    ...(tipo !== "resumen" ? ["page", "pageSize"] : []),
    ...(tipo === "evaluaciones" ? ["nivel"] : []),
  ]);
  for (const key of params.keys())
    if (!permitidos.has(key) || params.getAll(key).length !== 1)
      throw new ErrorConsulta(400, "Filtros desconocidos o repetidos.");
  const entero = (key: string, defecto: number, maximo: number) => {
    const value = params.get(key);
    if (value === null) return defecto;
    const numero = Number(value);
    if (
      !/^[1-9]\d*$/.test(value) ||
      !Number.isSafeInteger(numero) ||
      numero > maximo
    )
      throw new ErrorConsulta(400, `Parámetro ${key} inválido.`);
    return numero;
  };
  const result: Consulta = {
    page: entero("page", 1, Number.MAX_SAFE_INTEGER),
    pageSize: entero("pageSize", 50, 100),
  };
  for (const key of ["employeeId", "teamId"] as const)
    if (params.has(key)) result[key] = identificador(params.get(key)!);
  if (params.has("periodStart")) {
    const fecha = params.get("periodStart")!;
    try {
      if (fechaParaDb(fecha).getUTCDay() !== 1) throw new Error();
    } catch {
      throw new ErrorConsulta(
        400,
        "periodStart debe ser un lunes real en formato YYYY-MM-DD.",
      );
    }
    result.periodStart = fecha;
  }
  if (params.has("nivel")) {
    const nivel = params.get("nivel")!;
    if (!["BAJO", "MEDIO", "ALTO", "INCOMPLETO"].includes(nivel))
      throw new ErrorConsulta(400, "Nivel inválido.");
    result.nivel = nivel as Consulta["nivel"];
  }
  return result;
}
