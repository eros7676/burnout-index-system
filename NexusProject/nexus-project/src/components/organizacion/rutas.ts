// Who opens the people and teams screens that the sidebar map does not cover. Pure, so it is
// tested without a browser; `puedeAbrir` in the shell calls it first.
import { tienePermiso, type Rol } from "../../shared/permisos";

/** Screens that write on people and teams: only whoever holds ADMINISTRAR_PERSONAS opens them. */
const ADMINISTRACION = [
  /^\/employees\/(new|import)$/,
  /^\/employees\/[^/]+\/(edit|move|deactivate)$/,
  /^\/teams\/new$/,
  /^\/teams\/[^/]+\/(edit|lead|deactivate)$/,
];

/**
 * `true` or `false` when the route is one of these screens, `null` when it is not. A Team Lead
 * opens only the page of their own team, so the shell passes their `teamId`; without it that
 * page stays closed.
 */
export function puedeAbrirOrganizacion(
  rol: Rol,
  ruta: string,
  teamId?: string | null,
): boolean | null {
  if (ADMINISTRACION.some((patron) => patron.test(ruta)))
    return tienePermiso(rol, "ADMINISTRAR_PERSONAS");
  if (rol === "TEAM_LEAD" && ruta.startsWith("/teams/"))
    return !!teamId && ruta === `/teams/${teamId}`;
  return null;
}

/** The sidebar's «Mi equipo» target: the page of the Team Lead's own team, `null` for anyone else. */
export function rutaMiEquipo(rol: Rol, teamId?: string | null): string | null {
  return rol === "TEAM_LEAD" && teamId ? `/teams/${encodeURIComponent(teamId)}` : null;
}

/**
 * The audit screen filtered to a person (`sujetoId`) or a team (`equipoId`), `null` when the role
 * cannot read the audit trail so the link is not offered.
 */
export function rutaHistorial(
  rol: Rol,
  alcance: { sujetoId: string } | { equipoId: string },
): string | null {
  if (!tienePermiso(rol, "AUDITORIA")) return null;
  const params = new URLSearchParams(
    "sujetoId" in alcance
      ? { sujetoId: alcance.sujetoId }
      : { entidad: "EQUIPO", recursoId: alcance.equipoId },
  );
  return `/audit?${params}`;
}
