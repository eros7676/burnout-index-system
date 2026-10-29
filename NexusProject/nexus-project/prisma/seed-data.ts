import type { ConfiguracionIndice } from "../src/shared/contracts";
import type { Prisma } from "@prisma/client";

export const equiposSemilla = [1, 2, 3, 4].map((numero) => ({
  teamId: `EQ-${String(numero).padStart(2, "0")}`,
  nombre: `Célula ficticia ${numero}`,
  activo: true,
})) satisfies Prisma.EquipoCreateManyInput[];

// Orden de inserción: superior, Team Leads, técnicos (respeta todas las FKs).
export const empleadosSemilla = [
  {
    employeeId: "GER-01",
    nombre: "Gerente ficticio de Operaciones",
    tipo: "GERENCIA",
    activo: true,
    enCobertura: false,
    teamId: null,
    responsableId: null,
  },
  ...equiposSemilla.map((equipo, indice) => ({
    employeeId: `TL-${String(indice + 1).padStart(2, "0")}`,
    nombre: `Team Lead ficticio ${indice + 1}`,
    tipo: "TEAM_LEAD" as const,
    activo: true,
    enCobertura: true,
    teamId: equipo.teamId,
    responsableId: "GER-01",
  })),
  ...Array.from({ length: 45 }, (_, indice) => {
    const equipo = indice % 4;
    return {
      employeeId: `EMP-${String(indice + 1).padStart(3, "0")}`,
      nombre: `Persona ficticia ${String(indice + 1).padStart(3, "0")}`,
      tipo: "TECNICO" as const,
      activo: true,
      enCobertura: true,
      teamId: equiposSemilla[equipo].teamId,
      responsableId: `TL-${String(equipo + 1).padStart(2, "0")}`,
    };
  }),
] satisfies Prisma.EmpleadoCreateManyInput[];

// Bootstrap de v1. Las versiones siguientes se publican con npm run rules:publish.
// No importar mocks: sus identificadores y huellas no son datos persistibles.
export const reglasSemilla = {
  version: "v1",
  effectiveFrom: "2026-01-05",
  windowDays: 7,
  persistencePeriods: 2,
  weights: { HE: 0.3, DS: 0.3, CT: 0.25, VP: 0.15 },
  thresholds: { HE: 8, DS: 6, CT: 0.35, VP: 10 },
  mediumLimit: 40,
  highLimit: 70,
  minExceededFactors: 2,
  createdBy: "demo-local",
  createdAt: "2026-01-05T00:00:00.000Z",
} satisfies ConfiguracionIndice;
