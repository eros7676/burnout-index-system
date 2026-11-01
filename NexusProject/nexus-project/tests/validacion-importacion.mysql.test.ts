import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { fuenteValidacionPrisma } from "../src/server/repositories/validacion-importacion";
import { COLUMNAS_CSV } from "../src/server/services/csv-importacion";
import { validarCsvImportacion } from "../src/server/services/validacion-importacion";

test("MySQL T05: catálogo y puntero vigente, omisión y conflicto sin escrituras", async () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, "Se requiere TEST_DATABASE_URL.");
  assert.equal(new URL(url).protocol, "mysql:");
  assert.match(new URL(url).pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  const rollback = new Error("ROLLBACK_T05");
  try {
    await assert.rejects(
      db.$transaction(
        async (tx) => {
          const employeeId = `T05-${randomUUID()}`;
          const teamId = `T05-EQ-${randomUUID()}`;
          await tx.equipo.create({
            data: { teamId, nombre: "Equipo ficticio T05" },
          });
          await tx.empleado.create({
            data: {
              employeeId,
              teamId,
              nombre: "Persona ficticia T05",
              tipo: "TECNICO",
            },
          });
          const bytes = Buffer.from(
            `${COLUMNAS_CSV.join(",")}\n${employeeId},2026-10-05,2026-10-11,16,9,10,7,5,14,56,120\n`,
          );
          const fuente = fuenteValidacionPrisma(tx);
          const ahora = new Date("2026-10-19T12:00:00Z");
          const validar = () => validarCsvImportacion(bytes, fuente, ahora);
          const primera = await validar();
          assert.equal(primera.nuevas, 1);
          const carga = await tx.importacion.create({
            data: {
              sourceName: "t05.csv",
              sourceHash: primera.sourceHash,
              uploadedBy: "demo-local",
              status: "CONFIRMADA",
              expiresAt: ahora,
              totalFilas: 1,
              nuevas: 1,
              omitidas: 0,
              errores: [],
              warnings: [],
            },
          });
          const periodo = await tx.periodoEmpleado.create({
            data: {
              employeeId,
              periodStart: new Date("2026-10-05T00:00:00Z"),
              periodEnd: new Date("2026-10-11T00:00:00Z"),
            },
          });
          const { datos, fingerprint } = primera.filasNuevas[0];
          const { periodStart: _inicio, periodEnd: _fin, ...metricas } = datos;
          void _inicio;
          void _fin;
          const registro = await tx.registroLaboral.create({
            data: {
              ...metricas,
              periodoId: periodo.periodoId,
              sourceImportId: carga.importId,
              fingerprint,
            },
          });
          // Las versiones sin puntero no se confunden con el registro vigente.
          assert.equal((await validar()).nuevas, 1);
          await tx.periodoEmpleado.update({
            where: { periodoId: periodo.periodoId },
            data: { registroVigenteId: registro.recordId },
          });
          const conteos = [
            await tx.importacion.count(),
            await tx.registroLaboral.count(),
            await tx.evaluacion.count(),
            await tx.processingJob.count(),
          ];
          assert.equal((await validar()).omitidas, 1);
          const conflicto = await validarCsvImportacion(
            Buffer.from(bytes.toString().replace(",16,9,", ",17,9,")),
            fuente,
            ahora,
          );
          assert.equal(conflicto.errores[0].codigo, "CONFLICTO_HISTORICO");
          assert.deepEqual(conflicto.filasNuevas, []);
          assert.deepEqual(
            [
              await tx.importacion.count(),
              await tx.registroLaboral.count(),
              await tx.evaluacion.count(),
              await tx.processingJob.count(),
            ],
            conteos,
          );
          await tx.empleado.update({
            where: { employeeId },
            data: { activo: false },
          });
          assert.equal(
            (await validar()).errores[0].codigo,
            "EMPLEADO_FUERA_COBERTURA",
          );
          throw rollback;
        },
        { timeout: 30_000 },
      ),
      (e) => {
        if (e !== rollback) throw e;
        return true;
      },
    );
  } finally {
    await db.$disconnect();
  }
});
