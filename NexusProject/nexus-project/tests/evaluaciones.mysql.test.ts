import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { reglasSemilla } from "../prisma/seed-data";
import type { ParPeriodo } from "../src/shared/contracts";
import { ErrorDominio } from "../src/shared/errors";
import { decodificarJsonExacto } from "../src/server/repositories/json-exacto";
import { calcularEvaluacion } from "../src/server/services/calculo";
import { fechaParaDb } from "../src/server/repositories/fechas";
import { publicarConfiguracion } from "../src/server/services/publicar-reglas";
import {
  evaluarPeriodo,
  evaluarAfectados,
  obtenerEvaluacion,
  evaluacionActualizada,
  prepararEvaluacion,
  publicarEvaluacion,
  obtenerParesAfectados,
} from "../src/server/services/evaluaciones";

const hash = (valor: string) =>
  createHash("sha256").update(valor).digest("hex");
const reprocesar = (e: unknown) =>
  e instanceof ErrorDominio && e.codigo === "REQUIERE_REPROCESO";

async function escenario(
  db: PrismaClient,
  comprobar: (s: Awaited<ReturnType<typeof crear>>) => Promise<void>,
) {
  const s = await crear(db);
  try {
    await comprobar(s);
  } finally {
    // Solo fixtures con IDs de este escenario, sin borrar catálogo ni otras pruebas.
    await db.$transaction(async (tx) => {
      const periodos = { employeeId: s.employeeId };
      const jobs = await tx.processingJobPar.findMany({
        where: { periodo: periodos },
        select: { jobId: true },
      });
      const jobIds = [...new Set(jobs.map((j) => j.jobId))];
      await tx.processingJobPar.deleteMany({
        where: { jobId: { in: jobIds } },
      });
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
  const prefix = `T08-${randomUUID()}`;
  const employeeId = prefix;
  await db.empleado.create({
    data: {
      employeeId,
      nombre: "Persona T08 ficticia",
      tipo: "TECNICO",
      teamId: "EQ-01",
    },
  });
  const carga = await db.importacion.create({
    data: {
      sourceName: "t08.csv",
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
  const par = (semana = 1): ParPeriodo => ({
    employeeId,
    periodStart: ["2026-10-05", "2026-10-12", "2026-10-19"][semana],
    periodEnd: ["2026-10-11", "2026-10-18", "2026-10-25"][semana],
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
      return { periodo, registro };
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
      sugerencias: [],
    },
  });

test("MySQL T08: motor, persistencia, historial y concurrencia reales", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url);
  assert.match(new URL(url).pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  await db.$transaction((tx) => sembrarBase(tx));
  try {
    await t.test(
      "snapshots completos, Decimal numérico e idempotencia tras otra conexión",
      () =>
        escenario(db, async (s) => {
          await s.agregar(0);
          await s.agregar(1);
          const primera = await evaluarPeriodo(db, s.par(0));
          assert.equal(primera.nivel, "INCOMPLETO");
          assert.equal(primera.indice, 83.71);
          const segunda = await evaluarPeriodo(db, s.par());
          assert.equal(segunda.indice, 91.21);
          assert.equal(segunda.nivel, "ALTO");
          assert.equal(
            segunda.snapshot.anterior?.recordId,
            primera.snapshot.actual.recordId,
          );
          assert.equal(segunda.snapshot.reglas.version, "v1");
          assert.equal(segunda.snapshot.actual.horasTrabajadas, null);
          assert.equal(
            (await evaluarPeriodo(db, s.par())).evaluationId,
            segunda.evaluationId,
          );
          assert.equal(
            await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
            2,
          );
          const otra = new PrismaClient({ datasourceUrl: url });
          try {
            assert.deepEqual(
              await obtenerEvaluacion(otra, segunda.evaluationId),
              segunda,
            );
          } finally {
            await otra.$disconnect();
          }
          assert.equal(
            await evaluacionActualizada(db, segunda.evaluationId),
            true,
          );
        }),
    );

    await t.test(
      "BAJO/MEDIO/INCOMPLETO se guardan y un error no inventa evaluación",
      () =>
        escenario(db, async (s) => {
          const cero = {
            horasExtra: 0,
            diasConsecutivosSinDescanso: 0,
            tareasActivas: 0,
            tareasPendientes: 0,
            tareasVencidas: 0,
            vacacionesPendientesDias: 0,
          };
          await s.agregar(0, cero);
          await s.agregar(1, cero);
          await s.agregar(2);
          assert.equal(
            (await evaluarPeriodo(db, s.par(0))).nivel,
            "INCOMPLETO",
          );
          assert.equal((await evaluarPeriodo(db, s.par(1))).nivel, "BAJO");
          assert.equal((await evaluarPeriodo(db, s.par(2))).nivel, "MEDIO");
          await assert.rejects(
            evaluarPeriodo(db, { ...s.par(), employeeId: "INEXISTENTE" }),
            ErrorDominio,
          );
          assert.equal(
            await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
            3,
          );
        }),
    );

    await t.test(
      "llegada tardía cambia huella, conserva historia y recalcula solo sucesor",
      () =>
        escenario(db, async (s) => {
          await s.agregar(1);
          await s.agregar(2);
          const inicial = await evaluarPeriodo(db, s.par());
          const posterior = await evaluarPeriodo(db, s.par(2));
          assert.equal(inicial.nivel, "INCOMPLETO");
          await s.agregar(0);
          assert.equal(
            await evaluacionActualizada(db, inicial.evaluationId),
            false,
          );
          const afectados = await db.$transaction((tx) =>
            obtenerParesAfectados(tx, [s.par(0), s.par(0)]),
          );
          assert.deepEqual(afectados, [s.par(0), s.par(1)]);
          const resultados = await evaluarAfectados(db, [s.par(0)]);
          const nueva = resultados[1];
          assert.equal(nueva.nivel, "ALTO");
          assert.notEqual(
            nueva.processingFingerprint,
            inicial.processingFingerprint,
          );
          assert.equal(nueva.supersedesEvaluationId, inicial.evaluationId);
          const historica = await obtenerEvaluacion(db, inicial.evaluationId);
          assert.equal(historica?.vigente, false);
          assert.equal(historica?.snapshot.anterior, null);
          assert.equal(
            (await obtenerEvaluacion(db, posterior.evaluationId))?.vigente,
            true,
          );
          assert.equal(
            await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
            4,
          );
        }),
    );

    await t.test(
      "regla nueva selecciona mayor fecha aplicable, conserva historial y supera alerta",
      () =>
        escenario(db, async (s) => {
          await s.agregar(0);
          await s.agregar(1);
          const anterior = await evaluarPeriodo(db, s.par(0));
          const alta = await evaluarPeriodo(db, s.par());
          await alerta(db, alta.evaluationId, s.employeeId);
          const regla = {
            ...structuredClone(reglasSemilla),
            version: `${s.prefix}-v2`,
            effectiveFrom: "2026-10-12",
            thresholds: { HE: 80, DS: 60, CT: 1, VP: 100 },
          };
          await db.$transaction((tx) => publicarConfiguracion(tx, regla));
          assert.equal(
            await evaluacionActualizada(db, alta.evaluationId),
            false,
          );
          await assert.rejects(
            evaluarPeriodo(db, s.par(), {
              alPublicar: async () => {
                throw new Error("FALLO_PUBLICACION");
              },
            }),
            /FALLO_PUBLICACION/,
          );
          assert.equal(
            (await obtenerEvaluacion(db, alta.evaluationId))?.vigente,
            true,
          );
          assert.equal(
            (
              await db.alerta.findUniqueOrThrow({
                where: { evaluationId: alta.evaluationId },
              })
            ).vigencia,
            "ACTIVA",
          );
          const nueva = await evaluarPeriodo(db, s.par());
          const motor = calcularEvaluacion(
            nueva.snapshot.actual,
            nueva.snapshot.anterior,
            nueva.snapshot.reglas,
          );
          const persistida = await db.evaluacion.findUniqueOrThrow({
            where: { evaluationId: nueva.evaluationId },
          });
          assert.deepEqual(
            decodificarJsonExacto(persistida.scores),
            motor.scores,
          );
          assert.deepEqual(
            decodificarJsonExacto(persistida.contribuciones),
            motor.contribuciones,
          );
          assert.equal(nueva.rulesVersion, regla.version);
          assert.equal(nueva.nivel, "BAJO");
          assert.equal(nueva.supersedesEvaluationId, alta.evaluationId);
          assert.notEqual(nueva.persistencia.anterior?.indice, anterior.indice);
          assert.equal(
            (
              await db.alerta.findUniqueOrThrow({
                where: { evaluationId: alta.evaluationId },
              })
            ).vigencia,
            "SUPERADA",
          );
          assert.equal(
            (await obtenerEvaluacion(db, alta.evaluationId))?.rulesVersion,
            "v1",
          );
          assert.equal(
            (await obtenerEvaluacion(db, anterior.evaluationId))?.vigente,
            true,
          );
          assert.equal(
            (await evaluarPeriodo(db, s.par(0))).evaluationId,
            anterior.evaluationId,
          );
        }),
    );

    await t.test(
      "snapshot obsoleto por antecedente o reglas no publica ni mueve puntero",
      () =>
        escenario(db, async (s) => {
          await s.agregar(1);
          const preparada = await prepararEvaluacion(db, s.par());
          await s.agregar(0);
          await assert.rejects(publicarEvaluacion(db, preparada), reprocesar);
          assert.equal(
            await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
            0,
          );
          const antes = await prepararEvaluacion(db, s.par());
          const v2 = {
            ...structuredClone(reglasSemilla),
            version: `${s.prefix}-v2`,
            effectiveFrom: "2026-10-12",
          };
          await db.$transaction((tx) => publicarConfiguracion(tx, v2));
          const vigente = await evaluarPeriodo(db, s.par());
          await assert.rejects(publicarEvaluacion(db, antes), reprocesar);
          assert.equal(
            (await obtenerEvaluacion(db, vigente.evaluationId))?.vigente,
            true,
          );
          assert.equal(
            await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
            1,
          );
        }),
    );

    await t.test(
      "publicaciones concurrentes reutilizan una sola evaluación",
      () =>
        escenario(db, async (s) => {
          await s.agregar(0);
          await s.agregar(1);
          const preparada = await prepararEvaluacion(db, s.par());
          const [a, b] = await Promise.all([
            publicarEvaluacion(db, preparada),
            publicarEvaluacion(db, preparada),
          ]);
          assert.equal(a.evaluationId, b.evaluationId);
          assert.equal(
            await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
            1,
          );
        }),
    );

    await t.test(
      "fallo de CU03 revierte evaluación/puntero/alerta; reintento idempotente",
      () =>
        escenario(db, async (s) => {
          await s.agregar(0);
          await s.agregar(1);
          const fallo = new Error("FALLO_CU03_SIMULADO");
          await assert.rejects(
            evaluarPeriodo(db, s.par(), {
              alPublicar: async () => {
                throw fallo;
              },
            }),
            (e) => e === fallo,
          );
          assert.equal(
            await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
            0,
          );
          const opciones = {
            alPublicar: async (
              tx: Prisma.TransactionClient,
              e: { evaluationId: string; employeeId: string },
            ) => {
              if (
                !(await tx.alerta.findUnique({
                  where: { evaluationId: e.evaluationId },
                }))
              )
                await alerta(tx, e.evaluationId, e.employeeId);
            },
          };
          const nueva = await evaluarPeriodo(db, s.par(), opciones);
          assert.equal(
            (await evaluarPeriodo(db, s.par(), opciones)).evaluationId,
            nueva.evaluationId,
          );
          assert.equal(
            await db.alerta.count({ where: { employeeId: s.employeeId } }),
            1,
          );
        }),
    );

    await t.test("un dueño perdido o lease vencido no puede publicar", () =>
      escenario(db, async (s) => {
        const { periodo } = await s.agregar(1);
        const job = await db.processingJob.create({
          data: {
            origen: "IMPORTACION",
            importId: s.importId,
            createdBy: "demo-local",
            estado: "PROCESANDO",
            ownerToken: "dueno-actual",
            leaseUntil: new Date(Date.now() + 120_000),
            pares: { create: { periodoId: periodo.periodoId, orden: 0 } },
          },
        });
        const preparada = await prepararEvaluacion(db, s.par());
        await assert.rejects(
          publicarEvaluacion(db, preparada, {
            propietario: { jobId: job.jobId, ownerToken: "dueno-viejo" },
          }),
          reprocesar,
        );
        await db.processingJob.update({
          where: { jobId: job.jobId },
          data: { leaseUntil: new Date(0) },
        });
        await assert.rejects(
          publicarEvaluacion(db, preparada, {
            propietario: { jobId: job.jobId, ownerToken: "dueno-actual" },
          }),
          reprocesar,
        );
        assert.equal(
          await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
          0,
        );
        await db.processingJob.update({
          where: { jobId: job.jobId },
          data: { leaseUntil: new Date(Date.now() + 120_000) },
        });
        assert.equal(
          (
            await publicarEvaluacion(db, preparada, {
              propietario: { jobId: job.jobId, ownerToken: "dueno-actual" },
            })
          ).nivel,
          "INCOMPLETO",
        );
      }),
    );
    await t.test(
      "cambio de versión de datos rechaza cálculo viejo y preserva precisión del snapshot",
      () =>
        escenario(db, async (s) => {
          const { periodo, registro } = await s.agregar(1, {
            horasExtra: 9.333300000012345,
          });
          const preparada = await prepararEvaluacion(db, s.par());
          const vigente = await evaluarPeriodo(db, s.par());
          assert.equal(vigente.snapshot.actual.horasExtra, 9.333300000012345);
          assert.deepEqual(
            (await obtenerEvaluacion(db, vigente.evaluationId))?.snapshot,
            vigente.snapshot,
          );
          // Fixture de versión futura: T08 no ofrece una API para sustituir importaciones.
          await db.$transaction(async (tx) => {
            const datos = {
              ...registro,
              recordId: undefined,
              createdAt: undefined,
            };
            const nueva = await tx.registroLaboral.create({
              data: {
                ...datos,
                dataVersion: 2,
                supersedesRecordId: registro.recordId,
                horasExtra: 8,
                fingerprint: hash(`${s.prefix}/v2`),
              },
            });
            await tx.periodoEmpleado.update({
              where: { periodoId: periodo.periodoId },
              data: { registroVigenteId: nueva.recordId },
            });
          });
          assert.equal(
            await evaluacionActualizada(db, vigente.evaluationId),
            false,
          );
          await assert.rejects(publicarEvaluacion(db, preparada), reprocesar);
          assert.equal(
            (await obtenerEvaluacion(db, vigente.evaluationId))?.vigente,
            true,
          );
          const nueva = await evaluarPeriodo(db, s.par());
          assert.equal(nueva.snapshot.actual.dataVersion, 2);
          assert.equal(nueva.supersedesEvaluationId, vigente.evaluationId);
          assert.equal(
            (await obtenerEvaluacion(db, vigente.evaluationId))?.snapshot.actual
              .dataVersion,
            1,
          );
        }),
    );

    await t.test(
      "lease que vence durante CU03 revierte toda la publicación",
      () =>
        escenario(db, async (s) => {
          const { periodo } = await s.agregar(1);
          const job = await db.processingJob.create({
            data: {
              origen: "IMPORTACION",
              importId: s.importId,
              createdBy: "demo-local",
              estado: "PROCESANDO",
              ownerToken: "dueno",
              leaseUntil: new Date(Date.now() + 120_000),
              pares: { create: { periodoId: periodo.periodoId, orden: 0 } },
            },
          });
          await assert.rejects(
            evaluarPeriodo(db, s.par(), {
              propietario: { jobId: job.jobId, ownerToken: "dueno" },
              alPublicar: async (tx, e) => {
                await alerta(tx, e.evaluationId, e.employeeId);
                await tx.processingJob.update({
                  where: { jobId: job.jobId },
                  data: { leaseUntil: new Date(0) },
                });
              },
            }),
            reprocesar,
          );
          assert.equal(
            await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
            0,
          );
          assert.equal(
            await db.alerta.count({ where: { employeeId: s.employeeId } }),
            0,
          );
        }),
    );
  } finally {
    await db.$disconnect();
  }
});
