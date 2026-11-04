// Who may do what. The server enforces it in `proteger`; screens read it to show or hide actions.
// Research: work/enterprise/research/workforce-admin.md §2.0 (permission matrix).
import type { UsuarioDemoDTO } from "./contracts";

export type Rol = UsuarioDemoDTO["rol"];

/** PROPIOS is the signed-in person's own work data (RF10): every role with an employee record, so all but RR. HH. */
export type Permiso =
  | "LEER"
  | "PROPIOS"
  | "IMPORTAR"
  | "NOTIFICAR"
  | "AUDITORIA"
  | "ADMINISTRAR_PERSONAS"
  | "EDITAR_REGLAS"
  | "APROBAR_REGLAS"
  | "SEGUIMIENTO"
  | "EXPORTAR";

/** A Team Lead's grants are always narrowed to their own team by the server. */
export const MATRIZ_PERMISOS: Record<Exclude<Permiso, "PROPIOS">, readonly Rol[]> = {
  LEER: ["RRHH", "GERENCIA", "TEAM_LEAD"],
  IMPORTAR: ["RRHH"],
  NOTIFICAR: ["RRHH"],
  AUDITORIA: ["RRHH", "GERENCIA"],
  ADMINISTRAR_PERSONAS: ["RRHH"],
  EDITAR_REGLAS: ["RRHH"],
  APROBAR_REGLAS: ["GERENCIA"],
  SEGUIMIENTO: ["RRHH", "GERENCIA", "TEAM_LEAD"],
  EXPORTAR: ["RRHH", "GERENCIA", "TEAM_LEAD"],
};

export function tienePermiso(rol: Rol, permiso: Permiso) {
  return permiso === "PROPIOS"
    ? rol !== "RRHH"
    : MATRIZ_PERMISOS[permiso].includes(rol);
}
