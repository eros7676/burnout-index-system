import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { reglasSemilla } from "../prisma/seed-data";
import { fechaDesdeDb, fechaParaDb } from "../src/server/repositories/fechas";
import {
  evaluacionAltaMock,
  registroActualMock,
  registroAnteriorMock,
} from "../src/shared/mocks";
import type { RegistroLaboral } from "../src/shared/contracts";

// Fixtures de persistencia: no ejecutan el motor ni implementan CU01/CU02/CU03.
const json = (valor: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(valor));
const hash = (valor: unknown) =>
  createHash("sha256").update(JSON.stringify(valor)).digest("hex");
const rollback = new Error("ROLLBACK_DE_PRUEBA");

async function sinPersistir(
  db: PrismaClient,
  comprobar: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  try {
    await db.$transaction(
      async (tx) => {
        await comprobar(tx);
        throw rollback;
      },
      { timeout: 30_000 },
    );
    assert.fail("La transacción de prueba debió revertirse.");
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

function errorPrisma(codigo: string) {
  return (error: unknown) =>
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === codigo;
}

async function crearEscenario(tx: Prisma.TransactionClient) {
  const teamId = `TEST-${randomUUID()}`;
  const employeeId = `TEST-${randomUUID()}`;
  const destinatarioId = `TEST-${randomUUID()}`;
  await tx.equipo.create({ data: { teamId, nombre: "Equipo de prueba" } });
  await tx.empleado.create({
    data: {
      employeeId: destinatarioId,
      nombre: "Lead de prueba",
      tipo: "TEAM_LEAD",
      teamId,
    },
  });
  await tx.empleado.create({
    data: {
      employeeId,
      nombre: "Persona de prueba",
      tipo: "TECNICO",
      teamId,
      responsableId: destinatarioId,
    },
  });
  const importacion = await tx.importacion.create({
    data: {
      sourceName: "prueba.csv",
      sourceHash: hash(employeeId),
      uploadedBy: "demo-local",
      status: "CONFIRMADA",
      expiresAt: new Date("2026-10-19T12:30:00Z"),
      confirmedAt: new Date("2026-10-19T12:00:00Z"),
      confirmedBy: "demo-local",
      totalFilas: 2,
      nuevas: 2,
      omitidas: 0,
      errores: [],
      warnings: [],
    },
  });
  const periodos = [];
  const registros = [];
  const datos: RegistroLaboral[] = [];
  for (const mock of [registroAnteriorMock, registroActualMock]) {
    const periodo = await tx.periodoEmpleado.create({
      data: {
        employeeId,
        periodStart: fechaParaDb(mock.periodStart),
        periodEnd: fechaParaDb(mock.periodEnd),
      },
    });
    const {
      recordId: _recordId,
      sourceImportId: _importId,
      fingerprint: _hash,
      periodStart: _inicio,
      periodEnd: _fin,
      ...metricas
    } = mock;
    void [_recordId, _importId, _hash, _inicio, _fin];
    const registro = await tx.registroLaboral.create({
      data: {
        ...metricas,
        employeeId,
        periodoId: periodo.periodoId,
        sourceImportId: importacion.importId,
        fingerprint: hash({ ...metricas, employeeId }),
      },
    });
    await tx.periodoEmpleado.update({
      where: { periodoId: periodo.periodoId },
      data: { registroVigenteId: registro.recordId },
    });
    periodos.push(periodo);
    registros.push(registro);
    datos.push({
      ...mock,
      employeeId,
      recordId: registro.recordId,
      sourceImportId: registro.sourceImportId,
      dataVersion: registro.dataVersion,
      fingerprint: registro.fingerprint,
    });
  }
  const reglas = await tx.configuracionIndice.create({
    data: {
      ...reglasSemilla,
      version: `test-${randomUUID()}`,
      // Fecha exclusiva para cada transacción, que se revierte al terminar.
      effectiveFrom: fechaParaDb("2025-01-06"),
      createdAt: new Date(reglasSemilla.createdAt),
    },
  });
  const snapshotReglas = {
    ...reglasSemilla,
    version: reglas.version,
    effectiveFrom: "2025-01-06",
  };
  const evaluacionData = {
    periodoId: periodos[1].periodoId,
    employeeId,
    actualRecordId: registros[1].recordId,
    rulesVersion: reglas.version,
    processingFingerprint: hash({
      actual: datos[1].fingerprint,
      anterior: "AUSENTE",
      reglas: snapshotReglas,
      engineVersion: "cu02-v1",
    }),
    indice: 91.21,
    nivel: "INCOMPLETO" as const,
    indicadores: json(evaluacionAltaMock.indicadores),
    scores: json(evaluacionAltaMock.scores),
    contribuciones: json(evaluacionAltaMock.contribuciones),
    ranking: json(evaluacionAltaMock.ranking),
    excedidas: json(evaluacionAltaMock.excedidas),
    persistencia: json({
      anterior: null,
      comunesExcedidas: [],
      cumple: false,
      motivo: "HISTORIAL_INSUFICIENTE",
    }),
    snapshot: json({
      actual: datos[1],
      anterior: null,
      reglas: snapshotReglas,
    }),
  } satisfies Prisma.EvaluacionUncheckedCreateInput;
  const historica = await tx.evaluacion.create({ data: evaluacionData });
  const vigente = await tx.evaluacion.create({
    data: {
      ...evaluacionData,
      nivel: "ALTO",
      anteriorRecordId: registros[0].recordId,
      processingFingerprint: hash({
        actual: datos[1].fingerprint,
        anterior: datos[0].fingerprint,
        reglas: snapshotReglas,
        engineVersion: "cu02-v1",
      }),
      supersedesEvaluationId: historica.evaluationId,
      persistencia: json({
        ...evaluacionAltaMock.persistencia,
        anterior: {
          ...evaluacionAltaMock.persistencia.anterior,
          periodo: {
            employeeId,
            periodStart: datos[0].periodStart,
            periodEnd: datos[0].periodEnd,
          },
          dataFingerprint: registros[0].fingerprint,
        },
      }),
      snapshot: json({
        actual: datos[1],
        anterior: datos[0],
        reglas: snapshotReglas,
      }),
    },
  });
  await tx.periodoEmpleado.update({
    where: { periodoId: periodos[1].periodoId },
    data: { evaluacionVigenteId: vigente.evaluationId },
  });
  const alertaData = {
    evaluationId: vigente.evaluationId,
    employeeId,
    destinatarioId,
    motivoDestinatario: "OK" as const,
    causas: ["HE", "DS", "CT", "VP"],
    sugerencias: ["Revisar carga de trabajo."],
  } satisfies Prisma.AlertaUncheckedCreateInput;
  const alerta = await tx.alerta.create({ data: alertaData });
  const job = await tx.processingJob.create({
    data: {
      origen: "IMPORTACION",
      importId: importacion.importId,
      createdBy: "demo-local",
      pares: {
        create: periodos.map((p, orden) => ({ periodoId: p.periodoId, orden })),
      },
    },
  });
  return {
    teamId,
    employeeId,
    destinatarioId,
    importacion,
    periodos,
    registros,
    historica,
    vigente,
    evaluacionData,
    alertaData,
    alerta,
    job,
    reglas,
  };
}

test("MySQL: integridad, historial, atomicidad y persistencia", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, "Ejecutar con npm run db:test y TEST_DATABASE_URL.");
  const destino = new URL(url);
  assert.equal(destino.protocol, "mysql:");
  assert.match(destino.pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await t.test(
      "seed repetible sin borrar catálogo ni crear resultados",
      async () => {
        await sinPersistir(db, async (tx) => {
          const antes = await tx.registroLaboral.count();
          await sembrarBase(tx);
          const empleados = await tx.empleado.findMany({
            orderBy: { employeeId: "asc" },
          });
          const reglas = await tx.configuracionIndice.findUniqueOrThrow({
            where: { version: "v1" },
          });
          await sembrarBase(tx);
          assert.deepEqual(
            await tx.empleado.findMany({ orderBy: { employeeId: "asc" } }),
            empleados,
          );
          assert.deepEqual(
            await tx.configuracionIndice.findUniqueOrThrow({
              where: { version: "v1" },
            }),
            reglas,
          );
          assert.equal(await tx.registroLaboral.count(), antes);
          await tx.configuracionIndice.update({
            where: { version: "v1" },
            data: { highLimit: 80 },
          });
          await assert.rejects(sembrarBase(tx), /v1 existente difiere/);
        });
      },
    );

    await t.test(
      "vigentes e historial; claves únicas y referencias al mismo empleado/período",
      async () => {
        await sinPersistir(db, async (tx) => {
          const f = await crearEscenario(tx);
          const periodo = await tx.periodoEmpleado.findUniqueOrThrow({
            where: { periodoId: f.periodos[1].periodoId },
            include: { evaluacionVigente: true, evaluaciones: true },
          });
          assert.equal(
            periodo.evaluacionVigente?.evaluationId,
            f.vigente.evaluationId,
          );
          assert.equal(periodo.evaluaciones.length, 2);
          assert.equal(Number(periodo.evaluacionVigente?.indice), 91.21);
          assert.equal(fechaDesdeDb(periodo.periodStart), "2026-10-12");
          assert.equal(f.registros[0].horasTrabajadas, 56);
          assert.equal(f.registros[1].diasConsecutivosSinDescanso, 16);
          await assert.rejects(
            tx.evaluacion.create({ data: f.evaluacionData }),
            errorPrisma("P2002"),
          );
          await assert.rejects(
            tx.alerta.create({ data: f.alertaData }),
            errorPrisma("P2002"),
          );
          const { periodoId: _id, ...duplicado } = f.periodos[0];
          void _id;
          await assert.rejects(
            tx.periodoEmpleado.create({ data: duplicado }),
            errorPrisma("P2002"),
          );
          const { recordId: _record, ...registro } = f.registros[0];
          void _record;
          await assert.rejects(
            tx.registroLaboral.create({ data: registro }),
            errorPrisma("P2002"),
          );
          await assert.rejects(
            tx.periodoEmpleado.update({
              where: { periodoId: f.periodos[0].periodoId },
              data: { registroVigenteId: f.registros[1].recordId },
            }),
            errorPrisma("P2003"),
          );
          await assert.rejects(
            tx.periodoEmpleado.update({
              where: { periodoId: f.periodos[0].periodoId },
              data: { evaluacionVigenteId: f.vigente.evaluationId },
            }),
            errorPrisma("P2003"),
          );
          await assert.rejects(
            tx.alerta.create({
              data: {
                ...f.alertaData,
                evaluationId: f.historica.evaluationId,
                employeeId: f.destinatarioId,
              },
            }),
            errorPrisma("P2003"),
          );
          await assert.rejects(
            tx.importacion.delete({
              where: { importId: f.importacion.importId },
            }),
            errorPrisma("P2003"),
          );
        });
      },
    );

    await t.test(
      "CHECKs: semana, métricas, destinatario y lease; IDs sensibles a mayúsculas",
      async () => {
        await sinPersistir(db, async (tx) => {
          const f = await crearEscenario(tx);
          await assert.rejects(
            tx.periodoEmpleado.create({
              data: {
                employeeId: f.employeeId,
                periodStart: fechaParaDb("2026-10-20"),
                periodEnd: fechaParaDb("2026-10-26"),
              },
            }),
          );
          await assert.rejects(
            tx.registroLaboral.update({
              where: { recordId: f.registros[0].recordId },
              data: { tareasVencidas: 8 },
            }),
          );
          await assert.rejects(
            tx.registroLaboral.update({
              where: { recordId: f.registros[0].recordId },
              data: { horasTrabajadas: 10 },
            }),
          );
          await assert.rejects(
            tx.alerta.update({
              where: { alertId: f.alerta.alertId },
              data: { destinatarioId: null },
            }),
          );
          await assert.rejects(
            tx.processingJob.update({
              where: { jobId: f.job.jobId },
              data: { estado: "PROCESANDO" },
            }),
          );
          await tx.registroLaboral.update({
            where: { recordId: f.registros[0].recordId },
            data: {
              horasTrabajadas: null,
              diasDesdeUltimasVacaciones: null,
              horasExtra: 9.3333,
            },
          });
          const registro = await tx.registroLaboral.findUniqueOrThrow({
            where: { recordId: f.registros[0].recordId },
          });
          assert.equal(registro.horasExtra, 9.3333);
          assert.equal(registro.horasTrabajadas, null);
          await tx.empleado.create({
            data: {
              employeeId: f.employeeId.toLowerCase(),
              nombre: "Otro ID",
              tipo: "TECNICO",
              teamId: f.teamId,
            },
          });
          assert.equal(
            await tx.empleado.count({
              where: {
                employeeId: { in: [f.employeeId, f.employeeId.toLowerCase()] },
              },
            }),
            2,
          );
        });
      },
    );

    await t.test(
      "job conserva pares completados y errores independientes del nivel",
      async () => {
        await sinPersistir(db, async (tx) => {
          const f = await crearEscenario(tx);
          await tx.processingJob.update({
            where: { jobId: f.job.jobId },
            data: {
              estado: "PROCESANDO",
              ownerToken: randomUUID(),
              leaseUntil: new Date(Date.now() + 120_000),
              intentos: { increment: 1 },
            },
          });
          await tx.processingJobPar.update({
            where: {
              jobId_periodoId: {
                jobId: f.job.jobId,
                periodoId: f.periodos[0].periodoId,
              },
            },
            data: { estado: "COMPLETADO", completedAt: new Date() },
          });
          await tx.processingJobPar.update({
            where: {
              jobId_periodoId: {
                jobId: f.job.jobId,
                periodoId: f.periodos[1].periodoId,
              },
            },
            data: {
              estado: "FALLIDO",
              errorCodigo: "REQUIERE_REPROCESO",
              errorDetalle: "Cambió el antecedente.",
            },
          });
          const job = await tx.processingJob.update({
            where: { jobId: f.job.jobId },
            data: { estado: "FALLIDO", ownerToken: null, leaseUntil: null },
            include: { pares: { orderBy: { orden: "asc" } } },
          });
          assert.equal(job.pares[0].estado, "COMPLETADO");
          assert.equal(job.pares[1].errorCodigo, "REQUIERE_REPROCESO");
          assert.equal(
            (
              await tx.importacion.findUniqueOrThrow({
                where: { importId: f.importacion.importId },
              })
            ).status,
            "CONFIRMADA",
          );
        });
      },
    );

    await t.test("rollback no deja datos parciales", async () => {
      const id = `TEST-${randomUUID()}`;
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.equipo.create({ data: { teamId: id, nombre: "Rollback" } });
          throw rollback;
        }),
        (error: unknown) => error === rollback,
      );
      assert.equal(await db.equipo.findUnique({ where: { teamId: id } }), null);
    });

    await t.test(
      "una conexión nueva conserva registros, evaluaciones y alertas confirmados",
      async () => {
        const f = await db.$transaction(crearEscenario, { timeout: 30_000 });
        const lector = new PrismaClient({ datasourceUrl: url });
        try {
          const periodo = await lector.periodoEmpleado.findUniqueOrThrow({
            where: { periodoId: f.periodos[1].periodoId },
            include: {
              registroVigente: true,
              evaluacionVigente: { include: { alerta: true } },
            },
          });
          assert.equal(
            periodo.registroVigente?.recordId,
            f.registros[1].recordId,
          );
          assert.equal(
            periodo.evaluacionVigente?.alerta?.alertId,
            f.alerta.alertId,
          );
        } finally {
          await lector.$disconnect();
          // Solo eliminar los IDs creados por esta prueba, respetando el historial y FKs.
          await db.$transaction(
            async (tx) => {
              const ids = f.periodos.map((p) => p.periodoId);
              await tx.processingJobPar.deleteMany({
                where: { jobId: f.job.jobId },
              });
              await tx.processingJob.delete({ where: { jobId: f.job.jobId } });
              await tx.periodoEmpleado.updateMany({
                where: { periodoId: { in: ids } },
                data: { registroVigenteId: null, evaluacionVigenteId: null },
              });
              await tx.alerta.delete({ where: { alertId: f.alerta.alertId } });
              await tx.evaluacion.delete({
                where: { evaluationId: f.vigente.evaluationId },
              });
              await tx.evaluacion.delete({
                where: { evaluationId: f.historica.evaluationId },
              });
              await tx.registroLaboral.deleteMany({
                where: { periodoId: { in: ids } },
              });
              await tx.periodoEmpleado.deleteMany({
                where: { periodoId: { in: ids } },
              });
              await tx.importacion.delete({
                where: { importId: f.importacion.importId },
              });
              await tx.configuracionIndice.delete({
                where: { version: f.reglas.version },
              });
              await tx.empleado.delete({ where: { employeeId: f.employeeId } });
              await tx.empleado.delete({
                where: { employeeId: f.destinatarioId },
              });
              await tx.equipo.delete({ where: { teamId: f.teamId } });
            },
            { timeout: 30_000 },
          );
        }
      },
    );
  } finally {
    await db.$disconnect();
  }
});
