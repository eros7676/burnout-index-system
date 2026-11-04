import type { Factor } from "../../shared/contracts";
import { recomendacionesDe, type EntradaRecomendaciones } from "./recomendaciones";

type TipoPersona = "TECNICO" | "TEAM_LEAD" | "GERENCIA";

export type PersonaAlerta = {
  tipo: TipoPersona;
  responsableId: string | null;
};

export type ResponsableAlerta = {
  employeeId: string;
  tipo: TipoPersona;
  activo: boolean;
};

const RESPONSABLE_ESPERADO = {
  TECNICO: "TEAM_LEAD",
  TEAM_LEAD: "GERENCIA",
} as const;

/**
 * Técnico avisa a su Team Lead y Team Lead avisa a Gerencia.
 * Sin ese responsable, la alerta se guarda igual y deja la incidencia visible.
 */
export function resolverDestinatario(
  empleado: PersonaAlerta,
  responsable: ResponsableAlerta | null,
): {
  destinatarioId: string | null;
  motivoDestinatario: "OK" | "SIN_DESTINATARIO";
} {
  const esperado =
    empleado.tipo === "TECNICO" || empleado.tipo === "TEAM_LEAD"
      ? RESPONSABLE_ESPERADO[empleado.tipo]
      : null;
  if (
    !esperado ||
    !empleado.responsableId ||
    !responsable ||
    responsable.employeeId !== empleado.responsableId ||
    !responsable.activo ||
    responsable.tipo !== esperado
  ) {
    return { destinatarioId: null, motivoDestinatario: "SIN_DESTINATARIO" };
  }
  return {
    destinatarioId: responsable.employeeId,
    motivoDestinatario: "OK",
  };
}

/** Factores excedidos en el orden del ranking. No recalcula el índice. */
export function causasDe(
  ranking: readonly Factor[],
  excedidas: readonly Factor[],
): Factor[] {
  const excedido = new Set(excedidas);
  return ranking.filter((codigo) => excedido.has(codigo));
}

export function contenidoAlerta(evaluacion: EntradaRecomendaciones): {
  causas: Factor[];
  sugerencias: string[];
} {
  return {
    causas: causasDe(evaluacion.ranking, evaluacion.excedidas),
    sugerencias: recomendacionesDe(evaluacion),
  };
}
