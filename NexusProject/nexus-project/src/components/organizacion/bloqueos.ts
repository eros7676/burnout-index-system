// When a form on a person or a team cannot be submitted, and the server rule behind it, so the submit is
// disabled next to the notice that says why (organizacion-personas.ts, exigirSinResponsabilidades).

/** Whoever leads a team cannot change team or position until another lead takes over. */
export function movimientoBloqueado(
  persona: { lidera: unknown; tipo: string; teamId: string | null },
  nuevo: { tipo: string; teamId: string },
) {
  if (!persona.lidera) return false;
  return nuevo.tipo !== persona.tipo || (nuevo.teamId || null) !== persona.teamId;
}

/** A team with people besides its lead cannot be deactivated; they move first. */
export function desactivacionEquipoBloqueada(equipo: {
  personasActivas: number;
  lider: unknown;
}) {
  return equipo.personasActivas - (equipo.lider ? 1 : 0) > 0;
}
