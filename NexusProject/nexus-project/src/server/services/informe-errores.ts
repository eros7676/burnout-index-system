// The capped list of errors or warnings a file validation reports (tareas-v1, jornadas-v1).
import type { ErrorCampo } from "../../shared/contracts";

/** Keeps the first `tope` entries and counts the rest, so a bad file cannot flood the answer. */
export class Informe {
  readonly items: ErrorCampo[] = [];
  total = 0;
  constructor(
    private readonly tope: number,
    private readonly nombre: "errores" | "advertencias",
  ) {}
  add(item: ErrorCampo) {
    this.total++;
    if (this.items.length < this.tope) this.items.push(item);
  }
  resultado(): ErrorCampo[] {
    if (this.total <= this.tope) return this.items;
    return [
      ...this.items,
      {
        fila: null,
        campo: null,
        codigo: "ERRORES_OMITIDOS",
        detalle: `Se informan los primeros ${this.tope} de ${this.total} ${this.nombre}. Corrija el archivo y valídelo nuevamente para ver el resto.`,
      },
    ];
  }
}
