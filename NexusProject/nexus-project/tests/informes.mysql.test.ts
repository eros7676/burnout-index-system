import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { reglasSemilla } from "../prisma/seed-data";
import type { ParPeriodo } from "../src/shared/contracts";
import { ErrorDominio } from "../src/shared/errors";
import { fechaParaDb } from "../src/server/repositories/fechas";
import { evaluarPeriodo } from "../src/server/services/evaluaciones";
import { construirInforme } from "../src/server/services/informes";
import { publicarConfiguracion } from "../src/server/services/publicar-reglas";

const hash = (valor: string) =>
  createHash("sha256").update(valor).digest("hex");
const cero = {
  horasExtra: 0,
  diasConsecutivosSinDescanso: 0,
  tareasActivas: 0,
  tareasPendientes: 0,
  tareasVencidas: 0,
  vacacionesPendientesDias: 0,
};

async function escenario(
  db: PrismaClient,
  comprobar: (s: Awaited<ReturnType<typeof crear>>) => Promise<void>,
) {
  const s = await crear(db);
  try {
    await comprobar(s);
  } finally {
    await db.$transaction(async (tx) => {
      const periodos = { employeeId: s.employeeId };
      const jobs = await tx.processingJobPar.findMany({
        where: { periodo: periodos },
        select: { jobId: true },
      });
      const jobIds = [...new Set(jobs.map((j) => j.jobId))];
      await tx.processingJobPar.deleteMany({ where: { jobId: { in: jobIds } } });
      await tx.processingJob.deleteMany({ where: { jobId: { in: jobIds } } });
      await tx.alerta.deleteMany({ where: { employeeId: s.employeeId } });
      await tx.periodoEmpleado.updateMany({
        where: periodos,
        data: { registroVigenteId: null, evaluacionVigenteId: null },
      });
      await tx.evaluacion.updateMany({
        where: periodos,
        data: { supersedesEvaluationId: null },
      });
      await tx.evaluacion.deleteMany({ where: periodos });
      await tx.registroLaboral.updateMany({
        where: periodos,
        data: { supersedesRecordId: null },
      });
      await tx.registroLaboral.deleteMany({ where: periodos });
      await tx.periodoEmpleado.deleteMany({ where: periodos });
      await tx.processingJob.deleteMany({
        where: { rulesVersion: { startsWith: s.prefix } },
      });
      await tx.configuracionIndice.deleteMany({
        where: { version: { startsWith: s.prefix } },
      });
      await tx.importacion.delete({ where: { importId: s.importId } });
      await tx.empleado.delete({ where: { employeeId: s.employeeId } });
    });
  }
}

async function crear(db: PrismaClient) {
  const prefix = `T10-${randomUUID()}`;
  const employeeId = prefix;
  await db.empleado.create({
    data: {
      employeeId,
      nombre: "Persona T10 ficticia",
      tipo: "TECNICO",
      teamId: "EQ-01",
    },
  });
  const carga = await db.importacion.create({
    data: {
      sourceName: "t10.csv",
      sourceHash: hash(prefix),
      uploadedBy: "demo-local",
      status: "CONFIRMADA",
      expiresAt: new Date("2026-10-30T00:00:00Z"),
      totalFilas: 3,
      nuevas: 3,
      omitidas: 0,
      errores: [],
      warnings: [],
    },
  });
  const fechas = [
    ["2026-10-05", "2026-10-11"],
    ["2026-10-12", "2026-10-18"],
    ["2026-10-19", "2026-10-25"],
  ] as const;
  const par = (semana: number): ParPeriodo => ({
    employeeId,
    periodStart: fechas[semana][0],
    periodEnd: fechas[semana][1],
  });
  const agregar = async (
    semana: number,
    metricas: Record<string, number> = {},
  ) => {
    const p = par(semana);
    return db.$transaction(async (tx) => {
      const periodo = await tx.periodoEmpleado.create({
        data: {
          employeeId,
          periodStart: fechaParaDb(p.periodStart),
          periodEnd: fechaParaDb(p.periodEnd),
        },
      });
      const registro = await tx.registroLaboral.create({
        data: {
          periodoId: periodo.periodoId,
          employeeId,
          sourceImportId: carga.importId,
          fingerprint: hash(`${prefix}/${semana}`),
          horasExtra: 16,
          diasConsecutivosSinDescanso: semana === 0 ? 9 : 16,
          tareasActivas: 10,
          tareasPendientes: 7,
          tareasVencidas: 5,
          vacacionesPendientesDias: 14,
          ...metricas,
        },
      });
      await tx.periodoEmpleado.update({
        where: { periodoId: periodo.periodoId },
        data: { registroVigenteId: registro.recordId },
      });
      return registro;
    });
  };
  return { prefix, employeeId, importId: carga.importId, par, agregar };
}

const alerta = (
  tx: Prisma.TransactionClient,
  evaluationId: string,
  employeeId: string,
) =>
  tx.alerta.create({
    data: {
      evaluationId,
      employeeId,
      destinatarioId: null,
      motivoDestinatario: "SIN_DESTINATARIO",
      causas: ["HE", "DS"],
      sugerencias: ["Revisión humana de prueba."],
    },
  });

async function conteos(db: PrismaClient, employeeId: string) {
  return {
    evaluaciones: await db.evaluacion.count({ where: { employeeId } }),
    alertas: await db.alerta.count({ where: { employeeId } }),
    registros: await db.registroLaboral.count({ where: { employeeId } }),
  };
}

test("MySQL T10: informe desde evaluaciones persistidas", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url);
  assert.match(new URL(url).pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  await db.$transaction((tx) => sembrarBase(tx));
  try {
    await t.test("INCOMPLETO, BAJO y pico aislado MEDIO salen de lo guardado", () =>
      escenario(db, async (s) => {
        await s.agregar(0);
        await s.agregar(1, cero);
        await s.agregar(2);
        const incompleto = await evaluarPeriodo(db, s.par(0));
        const bajo = await evaluarPeriodo(db, s.par(1));
        const medio = await evaluarPeriodo(db, s.par(2));
        const antes = await conteos(db, s.employeeId);

        const informeIncompleto = await construirInforme(db, incompleto.evaluationId);
        assert.equal(informeIncompleto.evaluacion.nivel, "INCOMPLETO");
        assert.equal(informeIncompleto.evaluacion.indice, 83.71);
        assert.match(informeIncompleto.explicacion, /83,71 puntos, nivel INCOMPLETO/);
        assert.equal(informeIncompleto.alerta, null);
        assert.equal(informeIncompleto.empleado.nombre, "Persona T10 ficticia");
        assert.equal(informeIncompleto.empleado.teamId, "EQ-01");
        assert.equal(informeIncompleto.empleado.tipo, "TECNICO");

        const informeBajo = await construirInforme(db, bajo.evaluationId);
        assert.equal(informeBajo.evaluacion.nivel, "BAJO");
        assert.match(informeBajo.explicacion, /nivel BAJO/);

        const informeMedio = await construirInforme(db, medio.evaluationId);
        assert.equal(informeMedio.evaluacion.nivel, "MEDIO");
        assert.equal(informeMedio.evaluacion.indice, 91.21);
        assert.match(informeMedio.explicacion, /nivel MEDIO/);
        assert.doesNotMatch(informeMedio.explicacion, /nivel ALTO/);
        assert.deepEqual(await conteos(db, s.employeeId), antes);
      }),
    );

    await t.test(
      "ALTO, historial, snapshot y alertas se leen sin escribir",
      () =>
        escenario(db, async (s) => {
          await s.agregar(0);
          await s.agregar(1);
          const primera = await evaluarPeriodo(db, s.par(0));
          const alta = await evaluarPeriodo(db, s.par(1));
          await db.$transaction((tx) =>
            alerta(tx, alta.evaluationId, s.employeeId),
          );
          const activa = await construirInforme(db, alta.evaluationId);
          assert.equal(activa.evaluacion.nivel, "ALTO");
          assert.equal(activa.evaluacion.rulesVersion, "v1");
          assert.equal(activa.alerta?.vigencia, "ACTIVA");
          assert.deepEqual(
            activa.factores.map((factor) => factor.codigo),
            alta.ranking,
          );
          assert.equal(
            activa.factores.find((factor) => factor.codigo === "HE")?.umbral,
            8,
          );
          assert.equal(
            activa.factores.find((factor) => factor.codigo === "HE")?.valor,
            alta.indicadores.HE,
          );

          const regla = {
            ...structuredClone(reglasSemilla),
            version: `${s.prefix}-v2`,
            effectiveFrom: "2026-10-12",
            thresholds: { HE: 80, DS: 60, CT: 1, VP: 100 },
          };
          await db.$transaction((tx) => publicarConfiguracion(tx, regla));
          const nueva = await evaluarPeriodo(db, s.par(1));
          const antes = await conteos(db, s.employeeId);

          const historica = await construirInforme(db, alta.evaluationId);
          const otra = await construirInforme(db, alta.evaluationId);
          assert.equal(historica.evaluacion.vigente, false);
          assert.equal(historica.evaluacion.rulesVersion, "v1");
          assert.equal(
            historica.factores.find((factor) => factor.codigo === "HE")?.umbral,
            8,
          );
          assert.equal(historica.alerta?.vigencia, "SUPERADA");
          assert.deepEqual(otra, historica);

          const vigente = await construirInforme(db, nueva.evaluationId);
          assert.equal(vigente.evaluacion.vigente, true);
          assert.equal(vigente.evaluacion.rulesVersion, regla.version);
          assert.equal(
            vigente.factores.find((factor) => factor.codigo === "HE")?.umbral,
            80,
          );
          assert.equal(vigente.alerta, null);
          assert.equal(primera.nivel, "INCOMPLETO");
          assert.deepEqual(await conteos(db, s.employeeId), antes);
        }),
    );

    await t.test("una evaluación inexistente no fabrica un informe", async () => {
      await assert.rejects(
        construirInforme(db, `ausente-${randomUUID()}`),
        (error: unknown) =>
          error instanceof ErrorDominio && error.codigo === "NO_ENCONTRADO",
      );
    });
  } finally {
    await db.$disconnect();
  }
});
