import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { reglasSemilla } from "../prisma/seed-data";
import { publicarConfiguracion } from "../src/server/services/publicar-reglas";
import { ErrorDominio } from "../src/shared/errors";

const nueva = (effectiveFrom = "2090-03-06") => ({
  ...structuredClone(reglasSemilla),
  version: `T09-${randomUUID()}`,
  effectiveFrom,
});
const invalida = (error: unknown) =>
  error instanceof ErrorDominio && error.codigo === "CONFIGURACION_INVALIDA";

// Cada escenario revierte incluso si falla una aserción. Nunca usa DATABASE_URL.
async function escenario(
  db: PrismaClient,
  comprobar: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  const rollback = new Error("ROLLBACK_T09");
  await assert.rejects(
    db.$transaction(
      async (tx) => {
        await sembrarBase(tx);
        await comprobar(tx);
        throw rollback;
      },
      { timeout: 30_000 },
    ),
    (error: unknown) => {
      if (error !== rollback) throw error;
      return true;
    },
  );
}

test("MySQL T09: publicación de reglas y trabajo atómicos", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, "Ejecutar con npm run db:test y TEST_DATABASE_URL.");
  const destino = new URL(url);
  assert.equal(destino.protocol, "mysql:");
  assert.match(destino.pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await t.test("regla inválida no crea configuración ni trabajo", () =>
      escenario(db, async (tx) => {
        const antes = [
          await tx.configuracionIndice.count(),
          await tx.processingJob.count(),
        ];
        await assert.rejects(
          publicarConfiguracion(tx, { ...nueva(), weights: { HE: 1 } }),
          invalida,
        );
        assert.deepEqual(
          [
            await tx.configuracionIndice.count(),
            await tx.processingJob.count(),
          ],
          antes,
        );
      }),
    );

    await t.test(
      "sin semanas completa un trabajo vacío, conserva v1 y rechaza duplicados",
      () =>
        escenario(db, async (tx) => {
          const v1 = await tx.configuracionIndice.findUniqueOrThrow({
            where: { version: "v1" },
          });
          const regla = nueva();
          const resultado = await publicarConfiguracion(tx, regla);
          assert.equal(resultado.estado, "COMPLETADO");
          assert.equal(resultado.semanas, 0);
          const job = await tx.processingJob.findUniqueOrThrow({
            where: { jobId: resultado.jobId },
            include: { pares: true },
          });
          assert.equal(job.origen, "CAMBIO_REGLAS");
          assert.equal(job.rulesVersion, regla.version);
          assert.equal(job.createdBy, regla.createdBy);
          assert.ok(job.finishedAt);
          assert.deepEqual(job.pares, []);
          assert.deepEqual(
            await tx.configuracionIndice.findUnique({
              where: { version: "v1" },
            }),
            v1,
          );
          const antes = [
            await tx.configuracionIndice.count(),
            await tx.processingJob.count(),
          ];
          await assert.rejects(
            publicarConfiguracion(tx, {
              ...regla,
              effectiveFrom: "2090-03-13",
            }),
            invalida,
          );
          await assert.rejects(
            publicarConfiguracion(tx, {
              ...regla,
              version: `T09-${randomUUID()}`,
            }),
            invalida,
          );
          assert.deepEqual(
            [
              await tx.configuracionIndice.count(),
              await tx.processingJob.count(),
            ],
            antes,
          );
        }),
    );

    await t.test(
      "incluye solo semanas confirmadas del intervalo y ordena por empleado/fecha",
      () =>
        escenario(db, async (tx) => {
          const prefijo = `T09-${randomUUID()}`;
          const imp = await tx.importacion.create({
            data: {
              sourceName: "t09.csv",
              sourceHash: "a".repeat(64),
              uploadedBy: "test",
              status: "CONFIRMADA",
              expiresAt: new Date(),
              totalFilas: 8,
              nuevas: 8,
              omitidas: 0,
              errores: [],
              warnings: [],
            },
          });
          const esperados: string[] = [];
          // Insertar en orden inverso permite detectar que la consulta realmente ordena.
          for (const sufijo of ["B", "A"]) {
            const employeeId = `${prefijo}-${sufijo}`;
            await tx.empleado.create({
              data: {
                employeeId,
                nombre: "Prueba T09",
                tipo: "TECNICO",
                teamId: "EQ-01",
              },
            });
            const porFecha = new Map<string, string>();
            for (const fecha of [
              "2090-03-20",
              "2090-03-13",
              "2090-03-06",
              "2090-02-27",
            ]) {
              const periodStart = new Date(`${fecha}T00:00:00Z`);
              const p = await tx.periodoEmpleado.create({
                data: {
                  employeeId,
                  periodStart,
                  periodEnd: new Date(+periodStart + 6 * 86400000),
                },
              });
              const r = await tx.registroLaboral.create({
                data: {
                  periodoId: p.periodoId,
                  employeeId,
                  sourceImportId: imp.importId,
                  fingerprint: "b".repeat(64),
                  horasExtra: 0,
                  diasConsecutivosSinDescanso: 0,
                  tareasActivas: 0,
                  tareasPendientes: 0,
                  tareasVencidas: 0,
                  vacacionesPendientesDias: 0,
                },
              });
              await tx.periodoEmpleado.update({
                where: { periodoId: p.periodoId },
                data: { registroVigenteId: r.recordId },
              });
              porFecha.set(fecha, p.periodoId);
            }
            const periodStart = new Date("2090-03-06T00:00:00Z");
            // Otro empleado con período sin registro confirmado debe quedar fuera.
            const sinDatos = `${prefijo}-${sufijo}-vacio`;
            await tx.empleado.create({
              data: {
                employeeId: sinDatos,
                nombre: "Sin datos",
                tipo: "TECNICO",
                teamId: "EQ-01",
              },
            });
            await tx.periodoEmpleado.create({
              data: {
                employeeId: sinDatos,
                periodStart,
                periodEnd: new Date(+periodStart + 6 * 86400000),
              },
            });
            esperados.unshift(
              porFecha.get("2090-03-06")!,
              porFecha.get("2090-03-13")!,
            );
          }
          const sinLimite = await publicarConfiguracion(
            tx,
            nueva("2090-02-27"),
          );
          assert.equal(sinLimite.semanas, 8);
          await publicarConfiguracion(tx, nueva("2090-03-20"));
          const resultado = await publicarConfiguracion(tx, nueva());
          const job = await tx.processingJob.findUniqueOrThrow({
            where: { jobId: resultado.jobId },
            include: { pares: { orderBy: { orden: "asc" } } },
          });
          assert.equal(resultado.estado, "PENDIENTE");
          assert.equal(resultado.semanas, 4);
          assert.equal(job.finishedAt, null);
          assert.deepEqual(
            job.pares.map((p) => p.periodoId),
            esperados,
          );
          assert.deepEqual(
            job.pares.map((p) => p.orden),
            [0, 1, 2, 3],
          );
          assert.ok(job.pares.every((p) => p.estado === "PENDIENTE"));
        }),
    );

    await t.test(
      "fallo al crear el trabajo revierte la versión insertada",
      async () => {
        const regla = nueva();
        const fallo = new Error("FALLO_TRABAJO_T09");
        await assert.rejects(
          db.$transaction(async (tx) => {
            const cliente = new Proxy(tx, {
              get(target, campo) {
                return campo === "processingJob"
                  ? {
                      create: async () => {
                        throw fallo;
                      },
                    }
                  : Reflect.get(target, campo);
              },
            });
            await publicarConfiguracion(cliente, regla);
          }),
          (error: unknown) => error === fallo,
        );
        assert.equal(
          await db.configuracionIndice.findUnique({
            where: { version: regla.version },
          }),
          null,
        );
        assert.equal(
          await db.processingJob.count({
            where: { rulesVersion: regla.version },
          }),
          0,
        );
      },
    );
  } finally {
    await db.$disconnect();
  }
});
