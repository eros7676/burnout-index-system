/**
 * Columns for `n` items in a strip that holds at most `maximo` per row: the fewest rows that fit,
 * then the fewest columns that keep them there, so the last row is not left with one orphan item
 * (7 items with room for 6 become 4 + 3, not 6 + 1). Six per row divides the 12-column grid.
 */
export function columnasBalanceadas(n: number, maximo = 6) {
  if (n <= 1) return 1;
  const filas = Math.ceil(n / maximo);
  return Math.ceil(n / filas);
}
