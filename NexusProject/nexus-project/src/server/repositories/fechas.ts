import type { FechaISO } from "../../shared/contracts";

/** Prisma representa MySQL DATE con Date. El período se convierte siempre en UTC. */
export function fechaParaDb(fecha: FechaISO): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new TypeError("Se requiere una fecha YYYY-MM-DD sin hora.");
  }
  const valor = new Date(`${fecha}T00:00:00.000Z`);
  if (
    !Number.isFinite(valor.getTime()) ||
    valor.toISOString().slice(0, 10) !== fecha
  ) {
    throw new TypeError("La fecha no existe en el calendario.");
  }
  return valor;
}

export function fechaDesdeDb(fecha: Date): FechaISO {
  if (
    !Number.isFinite(fecha.getTime()) ||
    fecha.toISOString().slice(11) !== "00:00:00.000Z"
  ) {
    throw new TypeError("Se esperaba una fecha de período a medianoche UTC.");
  }
  return fecha.toISOString().slice(0, 10);
}
