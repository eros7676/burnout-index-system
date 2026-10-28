import assert from "node:assert/strict";
import { test } from "node:test";
import {
  empleadosSemilla,
  equiposSemilla,
  reglasSemilla,
} from "../prisma/seed-data";
import { fechaDesdeDb, fechaParaDb } from "../src/server/repositories/fechas";

test("seed: cobertura de Operaciones y cadena de responsables del ejemplo contractual", () => {
  assert.equal(equiposSemilla.length, 4);
  assert.equal(empleadosSemilla.length, 50);
  assert.equal(empleadosSemilla.filter((e) => e.tipo === "TECNICO").length, 45);
  assert.equal(
    empleadosSemilla.filter((e) => e.tipo === "TEAM_LEAD").length,
    4,
  );
  assert.equal(empleadosSemilla.filter((e) => e.enCobertura).length, 49);
  const empleados = new Map(empleadosSemilla.map((e) => [e.employeeId, e]));
  assert.equal(empleados.size, empleadosSemilla.length);
  assert.equal(empleados.get("EMP-001")?.teamId, "EQ-01");
  assert.equal(empleados.get("EMP-001")?.responsableId, "TL-01");
  assert.equal(empleados.get("TL-01")?.responsableId, "GER-01");
  assert.equal(empleados.get("GER-01")?.enCobertura, false);
  for (const empleado of empleados.values()) {
    if (empleado.tipo === "GERENCIA") continue;
    const responsable = empleados.get(empleado.responsableId!);
    assert.ok(
      responsable,
      `${empleado.employeeId} debe tener un responsable existente`,
    );
    assert.ok(
      equiposSemilla.some((equipo) => equipo.teamId === empleado.teamId),
    );
    assert.equal(
      responsable.tipo,
      empleado.tipo === "TECNICO" ? "TEAM_LEAD" : "GERENCIA",
    );
    if (empleado.tipo === "TECNICO")
      assert.equal(responsable.teamId, empleado.teamId);
  }
});

test("seed: v1 coincide con los parámetros acordados y su vigencia es lunes", () => {
  assert.equal(fechaParaDb(reglasSemilla.effectiveFrom).getUTCDay(), 1);
  assert.deepEqual(reglasSemilla.weights, {
    HE: 0.3,
    DS: 0.3,
    CT: 0.25,
    VP: 0.15,
  });
  assert.deepEqual(reglasSemilla.thresholds, {
    HE: 8,
    DS: 6,
    CT: 0.35,
    VP: 10,
  });
  assert.equal(reglasSemilla.mediumLimit, 40);
  assert.equal(reglasSemilla.highLimit, 70);
  assert.equal(reglasSemilla.minExceededFactors, 2);
  assert.equal(reglasSemilla.windowDays, 7);
  assert.equal(reglasSemilla.persistencePeriods, 2);
});

test("DATE conserva fechas sin desplazarlas por la zona horaria del proceso", () => {
  for (const fecha of ["2026-01-05", "2026-10-12", "2024-02-29"]) {
    const db = fechaParaDb(fecha);
    assert.equal(db.toISOString(), `${fecha}T00:00:00.000Z`);
    assert.equal(fechaDesdeDb(db), fecha);
  }
});

test("DATE rechaza fechas inexistentes, formatos locales y timestamps", () => {
  for (const fecha of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "12/10/2026",
    "2026-1-5",
    "2026-10-12T00:00:00Z",
  ]) {
    assert.throws(() => fechaParaDb(fecha), TypeError);
  }
  assert.throws(() => fechaDesdeDb(new Date("invalid")), TypeError);
  assert.throws(
    () => fechaDesdeDb(new Date("2026-10-12T03:00:00Z")),
    TypeError,
  );
});
