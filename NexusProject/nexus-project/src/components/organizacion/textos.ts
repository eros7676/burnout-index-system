// Words of the people and teams screens: codes become labels, dates read as dates (D1, D2).
import { diaCorto } from "@/shared/formato";
import type {
  EquipoOpcion,
  MotivoAsignacion,
  TipoPuesto,
} from "@/shared/contratos/organizacion";

export const PUESTO: Record<TipoPuesto, string> = {
  TECNICO: "Técnico",
  TEAM_LEAD: "Team Lead",
  GERENCIA: "Gerencia",
};

export const MOTIVO: Record<MotivoAsignacion, string> = {
  ALTA: "Alta",
  CAMBIO_EQUIPO: "Cambio de equipo",
  CAMBIO_PUESTO: "Cambio de puesto",
  CAMBIO_LIDER: "Cambio de líder",
  BAJA: "Baja",
  CORRECCION: "Corrección de datos",
};

/** "2 nov 2026" */
export const fechaCorta = (fecha: string) =>
  `${diaCorto(fecha)} ${fecha.slice(0, 4)}`;

export const contar = (n: number, una: string, varias: string) =>
  `${n.toLocaleString("es-AR")} ${n === 1 ? una : varias}`;

/** The people file a user fills in: header and one example row (personas-v1). */
export const PLANTILLA_PERSONAS =
  "employee_id,nombre,tipo,team_id,vigente_desde,en_cobertura\n" +
  "EMP-046,Nombre Apellido,TECNICO,EQ-01,2026-11-02,true\n";

/** Whom a position in a team reports to: technicians to the lead, a Team Lead to the manager. */
export function responsableSegun(
  equipos: readonly EquipoOpcion[],
  tipo: TipoPuesto,
  teamId: string,
) {
  if (tipo === "GERENCIA") return "No aplica";
  const equipo = equipos.find((e) => e.teamId === teamId);
  if (!equipo) return "Se determina al elegir el equipo";
  return (tipo === "TEAM_LEAD" ? equipo.gerente : equipo.lider) ?? "Sin asignar";
}
