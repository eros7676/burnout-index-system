// Deterministic pseudo-random numbers for the demo generators (mulberry32): the same seed always
// gives the same files, so a re-import is skipped as identical and `--check` can compare outputs.

/** A generator seeded with `semilla`, with the helpers every demo script uses. */
export function crearAzar(semilla) {
  let estado = semilla;
  function azar() {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const entre = (min, max) => min + Math.floor(azar() * (max - min + 1));
  const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
  return { azar, entre, elegir };
}

/** `iso` plus `dias` days, as an ISO date (UTC, so no time zone moves the day). */
export const sumar = (iso, dias) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
};
