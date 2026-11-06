import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import type { ResultadoImportacionJornadas } from "../src/shared/contratos/importaciones";
import { leerSemanasPersonas } from "../src/server/repositories/personas-semanas";
import { fechaDesdeDb } from "../src/server/repositories/fechas";
import { obtenerEvaluacion } from "../src/server/services/evaluaciones";
import { construirInformePublicado } from "../src/server/services/informes";
import { consultarPersonas } from "../src/server/services/personas";
import { consultarJornadasSemana } from "../src/server/services/tareas-consulta";
import type { UsuarioDemoDTO } from "../src/shared/contracts";
import { csvJornadas, escenario, filasJornadas } from "./importacion-fixture";

const sesion = (usuario: UsuarioDemoDTO) => ({
  usuario,
  actor: {
    actorId: usuario.userId,
    actorNombre: usuario.nombre,
    actorRol: usuario.rol,
    origen: "WEB" as const,
    solicitudId: randomUUID(),
  },
});
const RRHH = sesion({ userId: "demo-rrhh", nombre: "RRHH", rol: "RRHH", employeeId: null, teamId: null });
const GERENCIA = sesion({
  userId: "demo-gerencia",
  nombre: "Gerencia",
  rol: "GERENCIA",
  employeeId: "GER-01",
  teamId: null,
});

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

    await t.test("las ausencias se cuentan por versión del registro y los días siguen la regla de las tareas", () =>
      escenario(db, async (s) => {
        await s.importarIndicadores();
        const registros = await db.registroLaboral.findMany({
          where: { employeeId: s.employeeId },
          include: { periodo: true },
          orderBy: { periodo: { periodStart: "asc" } },
        });
        const [conDias, sinDias] = registros;
        // Two days of leave in the first week; the second week came as a summary alone.
        await db.jornadaSemana.createMany({
          data: Array.from({ length: 7 }, (_, i) => ({
            jornadaSemanaId: randomUUID(),
            recordId: conDias!.recordId,
            periodoId: conDias!.periodoId,
            employeeId: s.employeeId,
            periodStart: conDias!.periodo.periodStart,
            sourceImportId: conDias!.sourceImportId,
            fecha: new Date(conDias!.periodo.periodStart.getTime() + i * 86_400_000),
            tipo: i < 2 ? ("LICENCIA" as const) : ("TRABAJO" as const),
            horasTrabajadas: i < 2 ? 0 : 8,
            horasExtra: 0,
          })),
        });
        const esperado = new Map([
          [fechaDesdeDb(conDias!.periodo.periodStart), { vacaciones: 0, licencias: 2 }],
          [fechaDesdeDb(sinDias!.periodo.periodStart), null],
        ]);

        const lista = await consultarPersonas(db, { employeeId: s.employeeId });
        const semanas = lista.items.find((p) => p.employeeId === s.employeeId)!.semanas;
        assert.deepEqual(new Map(semanas.map((w) => [w.periodStart, w.ausencias])), esperado);

        const ficha = await db.$transaction((tx) =>
          leerSemanasPersonas(tx, {
            employeeIds: [s.employeeId],
            hasta: fechaDesdeDb(sinDias!.periodo.periodStart),
            semanas: 12,
          }),
        );
        assert.deepEqual(
          new Map(ficha.get(s.employeeId)!.map((w) => [w.periodStart, w.ausencias])),
          esperado,
        );

        // The report reads its evaluated record's days.
        for (const r of [conDias!, sinDias!]) {
          const fila = await db.evaluacion.findFirstOrThrow({ where: { actualRecordId: r.recordId } });
          const informe = await construirInformePublicado(db, (await obtenerEvaluacion(db, fila.evaluationId))!);
          assert.deepEqual(informe.ausencias, esperado.get(fechaDesdeDb(r.periodo.periodStart)));
        }

        const filtro = { employeeId: s.employeeId, periodStart: fechaDesdeDb(conDias!.periodo.periodStart) };
        const deRrhh = await consultarJornadasSemana(db, filtro, RRHH);
        assert.equal(deRrhh.visibles, true);
        assert.deepEqual(
          deRrhh.dias!.map((d) => d.tipo),
          ["LICENCIA", "LICENCIA", "TRABAJO", "TRABAJO", "TRABAJO", "TRABAJO", "TRABAJO"],
        );
        assert.equal(deRrhh.dias![0]!.fecha, filtro.periodStart);
        // Gerencia reads a technician's counts, never their days.
        const deGerencia = await consultarJornadasSemana(db, filtro, GERENCIA);
        assert.equal(deGerencia.visibles, false);
        assert.equal(deGerencia.dias, null);
        // A week without day detail answers null, not an empty week.
        const sinDetalle = await consultarJornadasSemana(
          db,
          { employeeId: s.employeeId, periodStart: fechaDesdeDb(sinDias!.periodo.periodStart) },
          RRHH,
        );
        assert.equal(sinDetalle.dias, null);
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
