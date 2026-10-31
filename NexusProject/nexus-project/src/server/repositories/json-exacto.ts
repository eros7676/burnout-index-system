import type { Prisma } from "@prisma/client";
import { ErrorDominio } from "../../shared/errors";

/** Formato interno de las columnas JSON de Evaluacion.
 * Guardar texto JSON dentro de un sobre evita el recorte de Prisma 6 a 15 cifras
 * y las diferencias de parseo de double de MySQL. El DTO siempre expone números.
 * No redondear ni usar este formato como respuesta HTTP.
 */
export function codificarJsonExacto(valor: unknown): Prisma.InputJsonObject {
  return { cu02JsonV1: JSON.stringify(valor) };
}

export function decodificarJsonExacto(valor: Prisma.JsonValue): unknown {
  if (
    valor &&
    typeof valor === "object" &&
    !Array.isArray(valor) &&
    "cu02JsonV1" in valor
  ) {
    if (typeof valor.cu02JsonV1 !== "string" || Object.keys(valor).length !== 1)
      throw new ErrorDominio(
        "CONTRATO_INVALIDO",
        "Formato JSON exacto inválido.",
      );
    try {
      return JSON.parse(valor.cu02JsonV1);
    } catch {
      throw new ErrorDominio(
        "CONTRATO_INVALIDO",
        "Contenido JSON exacto inválido.",
      );
    }
  }
  // Compatibilidad con objetos JSON de fixtures/consumidores previos.
  return valor;
}
