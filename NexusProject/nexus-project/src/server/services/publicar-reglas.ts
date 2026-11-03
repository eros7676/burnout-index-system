import type { Prisma } from "@prisma/client";
import {
  guardarVersionNueva,
  type ContextoPublicacion,
  type VersionPublicada,
} from "../repositories/reglas";
import { validarConfiguracion } from "./reglas";

/** Valida y, solo si la regla está completa, la persiste junto con su trabajo. */
export async function publicarConfiguracion(
  tx: Prisma.TransactionClient,
  entrada: unknown,
  contexto?: ContextoPublicacion,
): Promise<VersionPublicada> {
  const reglas = validarConfiguracion(entrada);
  return guardarVersionNueva(tx, reglas, contexto);
}
