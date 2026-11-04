import assert from "node:assert/strict";
import { test } from "node:test";
import {
  desactivacionEquipoBloqueada,
  movimientoBloqueado,
} from "../src/components/organizacion/bloqueos";

const lider = { lidera: { nombre: "Equipo 1" }, tipo: "TEAM_LEAD", teamId: "EQ-01" } as const;

test("mover: quien lidera un equipo no puede cambiar de equipo ni de puesto", () => {
  assert.equal(movimientoBloqueado(lider, { tipo: "TEAM_LEAD", teamId: "EQ-02" }), true);
  assert.equal(movimientoBloqueado(lider, { tipo: "TECNICO", teamId: "EQ-01" }), true);
});

test("mover: sin cambio de equipo ni de puesto, o sin liderazgo, el envío sigue disponible", () => {
  assert.equal(movimientoBloqueado(lider, { tipo: "TEAM_LEAD", teamId: "EQ-01" }), false);
  const tecnico = { lidera: null, tipo: "TECNICO", teamId: "EQ-01" } as const;
  assert.equal(movimientoBloqueado(tecnico, { tipo: "TECNICO", teamId: "EQ-02" }), false);
});

test("desactivar equipo: se bloquea mientras queden personas activas además del líder", () => {
  assert.equal(desactivacionEquipoBloqueada({ personasActivas: 11, lider: {} }), true);
  assert.equal(desactivacionEquipoBloqueada({ personasActivas: 1, lider: {} }), false);
  assert.equal(desactivacionEquipoBloqueada({ personasActivas: 0, lider: null }), false);
  assert.equal(desactivacionEquipoBloqueada({ personasActivas: 1, lider: null }), true);
});
