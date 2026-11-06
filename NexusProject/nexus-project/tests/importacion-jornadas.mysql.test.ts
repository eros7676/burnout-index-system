import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import type { ResultadoImportacionJornadas } from "../src/shared/contratos/importaciones";
import { csvJornadas, escenario, filasJornadas } from "./importacion-fixture";

test("MySQL jornadas-v1: confirmación atómica, idempotente y con eventos", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url);
  assert.match(new URL(url).pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  await db.$transaction((tx) => sembrarBase(tx));
  try {
    await t.test("confirma los días de dos semanas sin mover el índice ni crear procesamientos", () =>
      escenario(db, async (s) => {
        await s.importarIndicadores();
        const antes = {
          evaluaciones: await db.evaluacion.findMany({
            where: { employeeId: s.employeeId },
            orderBy: { createdAt: "asc" },
          }),
          trabajos: await db.processingJob.count(),
          alertas: await db.alerta.count({ where: { employeeId: s.employeeId } }),
        };

        const v = await s.validarJornadas();
        assert.equal(v.status, 200, JSON.stringify(v.body));
        assert.equal(v.body.esquema, "jornadas-v1");
        assert.equal(v.body.nuevas, 14);
        assert.equal(v.body.conciliacion.coinciden, 2);
        assert.equal(v.body.muestraJornadas.length, 14);
        // Validating writes the preview only.
        assert.equal(await db.jornadaSemana.count({ where: { employeeId: s.employeeId } }), 0);

        const c = await s.confirmar(v.body.importId);
        assert.equal(c.status, 200, JSON.stringify(c.body));
        const resultado = c.body as ResultadoImportacionJornadas;
        assert.equal(resultado.esquema, "jornadas-v1");
        assert.equal(resultado.insertados, 14);
        assert.equal(resultado.semanas, 2);
        assert.equal(resultado.procesamiento, null);

        const periodos = await db.periodoEmpleado.findMany({ where: { employeeId: s.employeeId } });
        for (const p of periodos) {
          const registro = await db.registroLaboral.findUniqueOrThrow({ where: { recordId: p.registroVigenteId! } });
          const dias = await db.jornadaSemana.findMany({ where: { recordId: registro.recordId }, orderBy: { fecha: "asc" } });
          assert.equal(dias.length, 7);
          assert.equal(dias[0]!.fecha.getTime(), p.periodStart.getTime());
          assert.equal(dias.reduce((t, d) => t + d.horasExtra, 0), registro.horasExtra);
          assert.equal(dias.reduce((t, d) => t + d.horasTrabajadas, 0), registro.horasTrabajadas);
          assert.equal(registro.huellaJornadas?.length, 64);
          assert.equal(registro.huellaTareas, null, "the task fingerprint is a separate column");
        }

        // Attaching evidence must not move the index: same evaluations, no job, no alert.
        assert.deepEqual(
          (await db.evaluacion.findMany({ where: { employeeId: s.employeeId }, orderBy: { createdAt: "asc" } })).map(
            (e) => [e.evaluationId, Number(e.indice), e.nivel],
          ),
          antes.evaluaciones.map((e) => [e.evaluationId, Number(e.indice), e.nivel]),
        );
        assert.equal(await db.processingJob.count(), antes.trabajos);
        assert.equal(await db.alerta.count({ where: { employeeId: s.employeeId } }), antes.alertas);

        // The same confirmation again answers the same and stores nothing more.
        assert.deepEqual((await s.confirmar(v.body.importId)).body, resultado);
        assert.equal(await db.jornadaSemana.count({ where: { employeeId: s.employeeId } }), 14);

        // The same file again is skipped; different days for a stored week are a conflict.
        const otra = await s.validarJornadas();
        assert.equal(otra.status, 200);
        assert.equal(otra.body.nuevas, 0);
        assert.equal(otra.body.omitidas, 14);
        const distintas = filasJornadas(s.employeeId).map((f, i) =>
          i === 0 ? [...f.slice(0, 5), "9", "1"] : i === 1 ? [...f.slice(0, 5), "11", "3"] : f,
        );
        const conflicto = await s.validarJornadas(csvJornadas(distintas));
        assert.equal(conflicto.status, 422);
        assert.deepEqual(
          conflicto.body.vistaPrevia!.errores.map((e) => e.codigo),
          ["CONFLICTO_HISTORICO"],
        );

        const [validada] = await s.eventos("IMPORTACION_VALIDADA");
        const [confirmada] = await s
          .eventos("IMPORTACION_CONFIRMADA")
          .then((e) => e.filter((x) => x.recursoId === v.body.importId));
        assert.equal((validada!.detalles as { schemaVersion: string }).schemaVersion, "indicadores-v1");
        assert.equal((confirmada!.detalles as { schemaVersion: string }).schemaVersion, "jornadas-v1");
        assert.equal((confirmada!.detalles as { insertados: number }).insertados, 14);
      }),
    );

    await t.test("la confirmación en varios lotes guarda todos los días", () =>
      escenario(
        db,
        async (s) => {
          await s.importarIndicadores();
          const v = await s.validarJornadas();
          assert.equal(v.status, 200, JSON.stringify(v.body));
          const c = await s.confirmar(v.body.importId);
          assert.equal(c.status, 200, JSON.stringify(c.body));
          assert.equal((c.body as ResultadoImportacionJornadas).insertados, 14);
          assert.equal(await db.jornadaSemana.count({ where: { employeeId: s.employeeId } }), 14);
        },
        { tamanoLoteJornadas: 3 },
      ),
    );

    await t.test("un día sin resumen semanal rechaza el archivo y no guarda nada", () =>
      escenario(db, async (s) => {
        const v = await s.validarJornadas();
        assert.equal(v.status, 422);
        assert.deepEqual(
          [...new Set(v.body.vistaPrevia!.errores.map((e) => e.codigo))],
          ["SEMANA_SIN_RESUMEN"],
        );
        assert.equal(await db.jornadaSemana.count({ where: { employeeId: s.employeeId } }), 0);
      }),
    );

    await t.test("la base rechaza un día de descanso con horas aunque se escriba directo", () =>
      escenario(db, async (s) => {
        await s.importarIndicadores();
        const registro = await db.registroLaboral.findFirstOrThrow({
          where: { employeeId: s.employeeId },
          include: { periodo: true },
        });
        await assert.rejects(
          db.jornadaSemana.create({
            data: {
              jornadaSemanaId: randomUUID(),
              recordId: registro.recordId,
              periodoId: registro.periodoId,
              employeeId: s.employeeId,
              periodStart: registro.periodo.periodStart,
              sourceImportId: registro.sourceImportId,
              fecha: registro.periodo.periodStart,
              tipo: "DESCANSO",
              horasTrabajadas: 4,
              horasExtra: 0,
            },
          }),
          /jornada_horas_chk/,
        );
      }),
    );
  } finally {
    await db.$disconnect();
  }
});
