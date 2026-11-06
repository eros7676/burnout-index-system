// The day detail behind a person-week (jornadas-v1): what each day was and its hours.
// Merged into API_ROUTES (../api.ts) and cuerposExitoMock (../mocks.ts). Never import ../mocks here.
import type { FechaISO } from "../contracts";
import type { TipoDia } from "./importaciones";

export type DiaDTO = {
  fecha: FechaISO;
  tipo: TipoDia;
  horasTrabajadas: number;
  horasExtra: number;
};

export type JornadasSemanaDTO = {
  semana: {
    periodStart: FechaISO;
    periodEnd: FechaISO;
    recordId: string;
    /** false: a report of an earlier data version asked for this record. */
    vigente: boolean;
  };
  /** false: the role may not read this person's rows (Gerencia on technicians), as with tasks. */
  visibles: boolean;
  /** The seven days, Monday first; null when the week came as a summary alone or `visibles` is false. */
  dias: DiaDTO[] | null;
};

export type FiltrosJornadasSemana = {
  employeeId: string;
  periodStart: FechaISO;
  /** Reads the days of that data version (the report's snapshot) instead of the current one. */
  recordId?: string;
};

export const RUTAS_JORNADAS = {
  listarJornadasSemana: { method: "GET", path: "/api/jornadas" },
} as const;

export type PeticionesJornadas = {
  listarJornadasSemana: { query: FiltrosJornadasSemana; body?: undefined };
};

export type CuerposJornadas = {
  listarJornadasSemana: JornadasSemanaDTO;
};

const DIAS_MOCK: [FechaISO, TipoDia, number, number][] = [
  ["2026-10-12", "TRABAJO", 10, 2],
  ["2026-10-13", "TRABAJO", 10, 2],
  ["2026-10-14", "TRABAJO", 10, 2],
  ["2026-10-15", "TRABAJO", 10, 2],
  ["2026-10-16", "TRABAJO", 10, 2],
  ["2026-10-17", "TRABAJO", 3, 3],
  ["2026-10-18", "TRABAJO", 3, 3],
];

export const MOCKS_JORNADAS = {
  listarJornadasSemana: {
    semana: { periodStart: "2026-10-12", periodEnd: "2026-10-18", recordId: "mock-record-2", vigente: true },
    visibles: true,
    dias: DIAS_MOCK.map(([fecha, tipo, horasTrabajadas, horasExtra]) => ({
      fecha,
      tipo,
      horasTrabajadas,
      horasExtra,
    })),
  },
} satisfies CuerposJornadas;
