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
