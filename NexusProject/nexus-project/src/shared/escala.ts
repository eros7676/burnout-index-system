/**
 * A chart axis with round ticks: steps of 1, 2, 2,5 or 5 × 10ⁿ, from 0 to the first tick at or
 * above the largest value. People and tasks are whole: `entero` never yields a fractional step.
 */
export function escalaLinda(
  maximo: number,
  { marcas = 4, entero = false }: { marcas?: number; entero?: boolean } = {},
): { tope: number; ticks: number[] } {
  if (!(maximo > 0)) return { tope: 1, ticks: [0, 1] };
  const crudo = maximo / marcas;
  const magnitud = 10 ** Math.floor(Math.log10(crudo));
  const multiplos = entero && magnitud < 10 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  let paso = multiplos.map((m) => m * magnitud).find((p) => p >= crudo)!;
  if (entero) paso = Math.max(1, Math.round(paso));
  const tope = Math.ceil(maximo / paso - 1e-9) * paso;
  const ticks: number[] = [];
  for (let v = 0; v <= tope + 1e-9; v += paso) ticks.push(Math.round(v * 1000) / 1000);
  return { tope, ticks };
}
