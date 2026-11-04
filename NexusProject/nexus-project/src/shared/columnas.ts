/**
 * Columns for `n` items in a strip that holds at most `maximo` per row: the fewest rows that fit,
 * then the fewest columns that keep them there, so the last row is not left with one orphan item
 * (6 items with room for 5 become 3 + 3, not 5 + 1).
 */
export function columnasBalanceadas(n: number, maximo = 5) {
  if (n <= 1) return 1;
  const filas = Math.ceil(n / maximo);
  return Math.ceil(n / filas);
}
