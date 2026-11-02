import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import {
  validarImportacion,
  confirmarImportacion,
} from "../src/server/services/importaciones";
import { crearHttpPersonas } from "../src/server/http/personas";
import type {
  MisDatosDTO,
  PersonasDTO,
  ReglasDTO,
} from "../src/shared/contracts";

test("MySQL Personas: semanas por persona, mis datos sin índice y reglas vigentes", async (t) => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const id = `PER-${randomUUID().slice(0, 8)}`;
  const imports: string[] = [];
  const http = crearHttpPersonas(db);
  const reloj = { ahora: () => new Date("2026-11-10T12:00:00Z") };
  try {
    await db.$transaction((tx) => sembrarBase(tx));
    await db.empleado.create({
      data: {
        employeeId: id,
        nombre: "Persona ficticia Personas",
        tipo: "TECNICO",
        teamId: "EQ-01",
        responsableId: "TL-01",
      },
    });

    await t.test("una persona sin datos figura con su equipo y sin semanas", async () => {
      const response = await http.personas(
        new Request(`http://localhost/api/personas?employeeId=${id}`),
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body: PersonasDTO = await response.json();
      assert.equal(body.items.length, 1);
      assert.equal(body.items[0].equipo, "Célula ficticia 1");
      assert.equal(body.items[0].responsable, "Team Lead ficticio 1");
      assert.deepEqual(body.items[0].semanas, []);
    });

    const csv = readFileSync("templates/ejemplo-dos-semanas.csv", "utf8")
      .trim()
      .replaceAll("EMP-001", id);
    const vista = await validarImportacion(
      db,
      new File([csv], "personas.csv"),
      "demo-local",
      reloj,
    );
    imports.push(vista.importId);
    const resultado = await confirmarImportacion(
      db,
      vista.importId,
      "demo-local",
      reloj,
    );
    assert.equal(resultado.procesamiento!.estado, "COMPLETADO");

    await t.test("semanas recientes primero, con tareas, índice y alerta", async () => {
      const body: PersonasDTO = await (
        await http.personas(
          new Request(`http://localhost/api/personas?employeeId=${id}`),
        )
      ).json();
      const [persona] = body.items;
      assert.deepEqual(
        persona.semanas.map((s) => [s.periodStart, s.nivel, s.indice]),
        [
          ["2026-10-12", "ALTO", 91.21],
          ["2026-10-05", "INCOMPLETO", 83.71],
        ],
      );
      assert.deepEqual(
        [
          persona.semanas[0].tareasActivas,
          persona.semanas[0].tareasPendientes,
          persona.semanas[0].tareasVencidas,
          persona.semanas[0].horasExtra,
          persona.semanas[0].diasConsecutivosSinDescanso,
          persona.semanas[0].vacacionesPendientesDias,
        ],
        [10, 7, 5, 16, 16, 14],
      );
      assert.ok(persona.semanas[0].actualizado);
      assert.ok(persona.semanas[0].alertId);
      assert.equal(persona.semanas[1].alertId, null);
      assert.ok(body.semanas.includes("2026-10-12"));
    });

    await t.test("el filtro de equipo excluye a quien no pertenece", async () => {
      const body: PersonasDTO = await (
        await http.personas(new Request("http://localhost/api/personas?teamId=EQ-02"))
      ).json();
      assert.ok(body.items.length > 0);
      assert.ok(body.items.every((p) => p.teamId === "EQ-02"));
    });

    await t.test("filtros desconocidos o repetidos se rechazan", async () => {
      for (const query of ["nivel=ALTO", "teamId=EQ-01&teamId=EQ-02", "teamId=a b"])
        assert.equal(
          (await http.personas(new Request(`http://localhost/api/personas?${query}`)))
            .status,
          400,
        );
    });

    await t.test("mis datos devuelve horas y tareas sin índice, nivel ni alerta", async () => {
      const response = await http.misDatos(
        new Request("http://localhost/api/mis-datos"),
        id,
      );
      assert.equal(response.status, 200);
      const body: MisDatosDTO = await response.json();
      assert.equal(body.nombre, "Persona ficticia Personas");
      assert.equal(body.semanas.length, 2);
      assert.equal(body.semanas[0].horasExtra, 16);
      const texto = JSON.stringify(body);
      for (const clave of ["indice", "nivel", "alertId", "evaluationId"])
        assert.ok(!texto.includes(`"${clave}"`), clave);
    });

    await t.test("reglas: la vigente primero y su historial de versiones", async () => {
      const body: ReglasDTO = await (
        await http.reglas(new Request("http://localhost/api/reglas"))
      ).json();
      assert.ok(body.versiones.length >= 1);
      assert.equal(body.vigente.version, body.versiones[0].version);
      const pesos = Object.values(body.vigente.weights).reduce((a, b) => a + b, 0);
      assert.equal(Math.round(pesos * 100), 100);
    });
  } finally {
    await db.$transaction(async (tx) => {
      const jobs = await tx.processingJobPar.findMany({
        where: { periodo: { employeeId: id } },
        select: { jobId: true },
      });
      const jobIds = { in: jobs.map((j) => j.jobId) };
      await tx.processingJobPar.deleteMany({ where: { jobId: jobIds } });
      await tx.processingJob.deleteMany({ where: { jobId: jobIds } });
      await tx.alerta.deleteMany({ where: { employeeId: id } });
      await tx.periodoEmpleado.updateMany({
        where: { employeeId: id },
        data: { registroVigenteId: null, evaluacionVigenteId: null },
      });
      await tx.evaluacion.updateMany({
        where: { employeeId: id },
        data: { supersedesEvaluationId: null },
      });
      await tx.evaluacion.deleteMany({ where: { employeeId: id } });
      await tx.registroLaboral.deleteMany({ where: { employeeId: id } });
      await tx.periodoEmpleado.deleteMany({ where: { employeeId: id } });
      await tx.importacionTemporal.deleteMany({
        where: { importId: { in: imports } },
      });
      await tx.importacion.deleteMany({ where: { importId: { in: imports } } });
      await tx.empleado.deleteMany({ where: { employeeId: id } });
    });
    await db.$disconnect();
  }
});
