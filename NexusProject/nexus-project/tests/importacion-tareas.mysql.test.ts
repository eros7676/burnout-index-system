import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { fuenteTareasPrisma } from "../src/server/repositories/tareas-importacion";
import { huellaTareas } from "../src/server/services/tareas-importacion";
import type { ResultadoImportacionTareas } from "../src/shared/contratos/importaciones";
import { readFileSync } from "node:fs";
import {
  confirmarImportacion,
  validarImportacion,
} from "../src/server/services/importaciones";
import { validarImportacionTareas } from "../src/server/services/tareas-importacion-flujo";
import {
  csvDe,
  escenario,
  filasTareas,
  limpiarImportaciones,
} from "./importacion-fixture";

test("MySQL tareas-v1: confirmación atómica, idempotente y con eventos", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url);
  assert.match(new URL(url).pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  await db.$transaction((tx) => sembrarBase(tx));
  try {
    await t.test(
      "confirma el detalle de dos semanas sin mover el índice ni crear procesamientos",
      () =>
        escenario(db, async (s) => {
          await s.importarIndicadores();
          const antes = {
            evaluaciones: await db.evaluacion.findMany({
              where: { employeeId: s.employeeId },
              orderBy: { createdAt: "asc" },
            }),
            periodos: await db.periodoEmpleado.findMany({
              where: { employeeId: s.employeeId },
              orderBy: { periodStart: "asc" },
            }),
            trabajos: await db.processingJob.count(),
            alertas: await db.alerta.count({ where: { employeeId: s.employeeId } }),
          };
          assert.equal(antes.evaluaciones.length, 2);

          const v = await s.validarTareas();
          assert.equal(v.status, 200, JSON.stringify(v.body));
          assert.equal(v.body.esquema, "tareas-v1");
          assert.equal(v.body.status, "VALIDADA");
          assert.equal(v.body.nuevas, 20);
          assert.equal(v.body.conciliacion.coinciden, 2);
          assert.deepEqual(v.body.muestra, []);
          assert.equal(v.body.muestraTareas.length, 10);
          // Validating writes the preview only.
          assert.equal(await db.tareaSemana.count({ where: { employeeId: s.employeeId } }), 0);
          const carga = await db.importacion.findUniqueOrThrow({
            where: { importId: v.body.importId },
          });
          assert.equal(carga.schemaVersion, "tareas-v1");
          assert.equal(carga.status, "VALIDADA");

          const c = await s.confirmar(v.body.importId);
          assert.equal(c.status, 200, JSON.stringify(c.body));
          const resultado = c.body as ResultadoImportacionTareas;
          assert.equal(resultado.esquema, "tareas-v1");
          assert.equal(resultado.insertados, 20);
          assert.equal(resultado.omitidos, 0);
          assert.equal(resultado.semanas, 2);
          assert.deepEqual(resultado.afectados, []);
          assert.equal(resultado.procesamiento, null);

          const filas = await db.tareaSemana.findMany({
            where: { employeeId: s.employeeId },
          });
          assert.equal(filas.length, 20);
          assert.ok(filas.every((f) => f.sourceImportId === v.body.importId));
          for (const periodo of antes.periodos) {
            const registro = await db.registroLaboral.findUniqueOrThrow({
              where: { recordId: periodo.registroVigenteId! },
            });
            const deSemana = filas.filter((f) => f.recordId === registro.recordId);
            assert.equal(deSemana.length, 10);
            const cuenta = (e: string) => deSemana.filter((f) => f.estadoCierre === e).length;
            // The stored rows reproduce the week's stored counts.
            assert.equal(deSemana.length, registro.tareasActivas);
            assert.equal(cuenta("PENDIENTE") + cuenta("VENCIDA"), registro.tareasPendientes);
            assert.equal(cuenta("VENCIDA"), registro.tareasVencidas);
            assert.ok(
              deSemana
                .filter((f) => f.estadoCierre === "VENCIDA")
                .every((f) => f.diasAtraso !== null && f.diasAtraso > 0),
            );
            assert.ok(
              deSemana
                .filter((f) => f.estadoCierre !== "VENCIDA")
                .every((f) => f.diasAtraso === null),
            );
            assert.equal(registro.huellaTareas?.length, 64);
            assert.ok(
              deSemana.every(
                (f) => f.periodoId === periodo.periodoId && f.periodStart.getTime() === periodo.periodStart.getTime(),
              ),
            );
          }
          assert.ok(
            filas.some((f) => f.titulo === 'Calibrar sensor, línea "A"'),
            "commas and quotes survive the round trip",
          );

          // Attaching evidence must not move the index: same evaluations, no job, no alert.
          const despues = await db.evaluacion.findMany({
            where: { employeeId: s.employeeId },
            orderBy: { createdAt: "asc" },
          });
          assert.deepEqual(
            despues.map((e) => [e.evaluationId, Number(e.indice), e.nivel]),
            antes.evaluaciones.map((e) => [e.evaluationId, Number(e.indice), e.nivel]),
          );
          assert.deepEqual(
            (await db.periodoEmpleado.findMany({ where: { employeeId: s.employeeId }, orderBy: { periodStart: "asc" } })).map((p) => [p.registroVigenteId, p.evaluacionVigenteId]),
            antes.periodos.map((p) => [p.registroVigenteId, p.evaluacionVigenteId]),
          );
          assert.equal(await db.processingJob.count(), antes.trabajos);
          assert.equal(await db.alerta.count({ where: { employeeId: s.employeeId } }), antes.alertas);

          // The same confirmation again answers the same and stores nothing more.
          assert.deepEqual((await s.confirmar(v.body.importId)).body, resultado);
          assert.equal(await db.tareaSemana.count({ where: { employeeId: s.employeeId } }), 20);

          const [validada] = await s.eventos("IMPORTACION_VALIDADA").then((e) => e.filter((x) => x.recursoId === v.body.importId));
          const [confirmada] = await s.eventos("IMPORTACION_CONFIRMADA").then((e) => e.filter((x) => x.recursoId === v.body.importId));
          for (const evento of [validada, confirmada]) {
            assert.equal(evento.correlacionId, v.body.importId);
            assert.equal(evento.entidad, "IMPORTACION");
            assert.equal((evento.detalles as { schemaVersion: string }).schemaVersion, "tareas-v1");
          }
          assert.equal((confirmada.detalles as { insertados: number }).insertados, 20);
          assert.equal((confirmada.detalles as { semanas: number }).semanas, 2);
        }),
    );

    await t.test("la misma carga con otro orden se omite y no duplica", () =>
      escenario(db, async (s) => {
        await s.importarIndicadores();
        const primera = await s.validarTareas();
        assert.equal((await s.confirmar(primera.body.importId)).status, 200);
        const reordenada = csvDe([...filasTareas(s.employeeId)].reverse()).replaceAll("\n", "\r\n");
        const v = await s.validarTareas(reordenada);
        assert.equal(v.status, 200);
        assert.equal(v.body.nuevas, 0);
        assert.equal(v.body.omitidas, 20);
        assert.equal(v.body.semanasOmitidas, 2);
        const c = await s.confirmar(v.body.importId);
        assert.equal(c.status, 200);
        assert.equal((c.body as ResultadoImportacionTareas).insertados, 0);
        assert.equal((c.body as ResultadoImportacionTareas).omitidos, 20);
        assert.equal(await db.tareaSemana.count({ where: { employeeId: s.employeeId } }), 20);

        // The same week with different detail is a conflict: nothing is replaced.
        const distinto = filasTareas(s.employeeId);
        distinto[0] = { ...distinto[0], titulo: "Otro título" };
        const rechazada = await s.validarTareas(csvDe(distinto));
        assert.equal(rechazada.status, 422);
        assert.ok(
          rechazada.body.vistaPrevia!.errores.some((e) => e.codigo === "CONFLICTO_HISTORICO"),
        );
      }),
    );

    await t.test("un descuadre rechaza el lote entero y no escribe nada", () =>
      escenario(db, async (s) => {
        await s.importarIndicadores();
        const filas = filasTareas(s.employeeId);
        filas.pop(); // the second week now adds up to 9
        const v = await s.validarTareas(csvDe(filas));
        assert.equal(v.status, 422);
        const vista = v.body.vistaPrevia!;
        assert.equal(vista.status, "RECHAZADA");
        assert.equal(vista.conciliacion.coinciden, 1);
        assert.equal(vista.conciliacion.diferencias, 1);
        assert.ok(vista.errores.every((e) => e.codigo === "TAREAS_NO_COINCIDEN"));
        assert.match(vista.errores[0].detalle, new RegExp(s.employeeId));
        assert.equal((await s.confirmar(vista.importId)).status, 409);
        assert.equal(await db.tareaSemana.count({ where: { employeeId: s.employeeId } }), 0);
        assert.equal(
          await db.registroLaboral.count({ where: { employeeId: s.employeeId, huellaTareas: { not: null } } }),
          0,
        );
        const [rechazo] = await s.eventos("IMPORTACION_RECHAZADA");
        assert.equal(rechazo.correlacionId, vista.importId);
        const detalles = rechazo.detalles as { schemaVersion: string; codigosError: string[] };
        assert.equal(detalles.schemaVersion, "tareas-v1");
        assert.deepEqual(detalles.codigosError, ["TAREAS_NO_COINCIDEN"]);
      }),
    );

    await t.test("una semana sin resumen cargado se rechaza", () =>
      escenario(db, async (s) => {
        const v = await s.validarTareas();
        assert.equal(v.status, 422);
        assert.ok(v.body.vistaPrevia!.errores.some((e) => e.codigo === "SEMANA_SIN_RESUMEN"));
        assert.equal(v.body.vistaPrevia!.conciliacion.sinResumen, 2);
      }),
    );

    await t.test("un fallo a mitad de la inserción revierte todo el lote", () =>
      escenario(
        db,
        async (s) => {
          await s.importarIndicadores();
          const v = await s.validarTareas();
          assert.equal(v.status, 200);
          // After validating, a task of the second week appears from another source:
          // the unique key (record, task) fails once the first chunks are already in.
          const segunda = await db.registroLaboral.findFirstOrThrow({
            where: { employeeId: s.employeeId, periodo: { periodStart: new Date("2026-10-12T00:00:00Z") } },
          });
          await db.tareaSemana.create({
            data: {
              recordId: segunda.recordId,
              periodoId: segunda.periodoId,
              employeeId: s.employeeId,
              periodStart: new Date("2026-10-12T00:00:00Z"),
              sourceImportId: segunda.sourceImportId,
              taskId: "OPS-107",
              titulo: "Tarea ajena",
              origen: "Planilla",
              asignadaEl: new Date("2026-09-28T00:00:00Z"),
              estadoCierre: "PENDIENTE",
            },
          });
          const c = await s.confirmar(v.body.importId);
          assert.equal(c.status, 409);
          assert.equal(c.body.error.codigo, "CONFLICTO_CONCURRENTE");
          assert.equal(await db.tareaSemana.count({ where: { employeeId: s.employeeId } }), 1);
          assert.equal(
            await db.registroLaboral.count({ where: { employeeId: s.employeeId, huellaTareas: { not: null } } }),
            0,
          );
          assert.equal(
            (await db.importacion.findUniqueOrThrow({ where: { importId: v.body.importId } })).status,
            "VALIDADA",
          );
          assert.equal(await db.importacionTemporal.count({ where: { importId: v.body.importId } }), 1);
          assert.equal((await s.eventos("IMPORTACION_CONFIRMADA")).length, 1, "only the indicadores confirmation");
        },
        { tamanoLoteTareas: 5 },
      ),
    );

    await t.test("la lectura de resúmenes agrupa las semanas en pocas consultas", async () => {
      const pares = Array.from({ length: 2500 }, (_, i) => ({
        employeeId: `NO-EXISTE-${i}`,
        periodStart: "2026-10-12",
        periodEnd: "2026-10-18",
      }));
      assert.deepEqual(await fuenteTareasPrisma(db).semanas(pares), []);
    });

    await t.test(
      "demo de ocho semanas: 392 semanas y 3.587 tareas entran por el mismo circuito",
      async () => {
        const imports: string[] = [];
        const csv = (nombre: string) => readFileSync(`templates/${nombre}.csv`);
        const archivo = (nombre: string) =>
          new File([csv(nombre)], `${nombre}.csv`, { type: "text/csv" });
        try {
          const resumen = await validarImportacion(db, archivo("demo-ocho-semanas"), "demo-local");
          imports.push(resumen.importId);
          assert.equal(resumen.status, "VALIDADA");
          const cargado = await confirmarImportacion(db, resumen.importId, "demo-local");
          assert.equal(cargado.procesamiento?.estado, "COMPLETADO");
          assert.equal(cargado.insertados, 392);

          let inicio = performance.now();
          const vista = await validarImportacionTareas(db, archivo("tareas-demo-ocho-semanas"), "demo-local");
          imports.push(vista.importId);
          const msValidar = Math.round(performance.now() - inicio);
          assert.equal(vista.status, "VALIDADA", JSON.stringify(vista.errores.slice(0, 2)));
          assert.equal(vista.conciliacion.coinciden, 392);
          assert.equal(vista.nuevas + vista.excluidas, vista.totalFilas);

          inicio = performance.now();
          const resultado = (await confirmarImportacion(db, vista.importId, "demo-local")) as ResultadoImportacionTareas;
          const msConfirmar = Math.round(performance.now() - inicio);
          t.diagnostic(`3.587 tareas: validar ${msValidar} ms, confirmar ${msConfirmar} ms`);
          assert.equal(resultado.insertados, vista.nuevas);
          assert.equal(resultado.semanas, 392);
          assert.equal(
            await db.tareaSemana.count({ where: { sourceImportId: vista.importId } }),
            vista.nuevas,
          );
          assert.equal(
            await db.registroLaboral.count({
              where: { sourceImportId: resumen.importId, huellaTareas: { not: null } },
            }),
            392,
          );
          // The control totals hold in the database itself: stored rows add up to stored counts.
          const [{ descuadres }] = await db.$queryRaw<{ descuadres: bigint }[]>`
            SELECT COUNT(*) AS descuadres FROM RegistroLaboral r
            LEFT JOIN (
              SELECT recordId, COUNT(*) a, SUM(estadoCierre <> 'COMPLETADA') p, SUM(estadoCierre = 'VENCIDA') v
              FROM TareaSemana WHERE sourceImportId = ${vista.importId} GROUP BY recordId
            ) t ON t.recordId = r.recordId
            WHERE r.sourceImportId = ${resumen.importId}
              AND (COALESCE(t.a, 0) <> r.tareasActivas OR COALESCE(t.p, 0) <> r.tareasPendientes
                   OR COALESCE(t.v, 0) <> r.tareasVencidas)`;
          assert.equal(Number(descuadres), 0);

          // Importing the same file again stores nothing.
          const otra = await validarImportacionTareas(db, archivo("tareas-demo-ocho-semanas"), "demo-local");
          imports.push(otra.importId);
          assert.equal(otra.nuevas, 0);
          assert.equal(otra.omitidas, vista.nuevas);
        } finally {
          await limpiarImportaciones(db, imports);
        }
      },
    );

    await t.test("cancelar una vista previa de tareas no guarda nada", () =>
      escenario(db, async (s) => {
        await s.importarIndicadores();
        const v = await s.validarTareas();
        const r = await s.http.cancelar(
          new Request("http://localhost/api", { method: "DELETE" }),
          v.body.importId,
        );
        assert.equal(r.status, 200);
        assert.equal(await db.tareaSemana.count({ where: { employeeId: s.employeeId } }), 0);
        const [cancelada] = await s.eventos("IMPORTACION_CANCELADA");
        assert.equal((cancelada.detalles as { schemaVersion: string }).schemaVersion, "tareas-v1");
        assert.equal(huellaTareas([]).length, 64);
      }),
    );
  } finally {
    await db.$disconnect();
  }
});
