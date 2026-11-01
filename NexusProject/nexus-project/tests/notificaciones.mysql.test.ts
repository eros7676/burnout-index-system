import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import {
  validarImportacion,
  confirmarImportacion,
} from "../src/server/services/importaciones";
import { crearAlertaSiCorresponde } from "../src/server/services/alertas";
import { construirInforme } from "../src/server/services/informes";
import {
  listarNotificaciones,
  prepararNotificacion,
  procesarNotificacion,
  ErrorNotificacion,
} from "../src/server/services/notificaciones";
import { crearHttpNotificaciones } from "../src/server/http/notificaciones";

const solicitud = (resultado: "EXITO" | "FALLO" = "EXITO") => ({
  requestId: randomUUID(),
  resultado,
});

async function escenario(
  db: PrismaClient,
  ejecutar: (alertId: string, employeeId: string) => Promise<void>,
  sinDestinatario = false,
) {
  const employeeId = `T12-${randomUUID()}`;
  let importId: string | undefined;
  try {
    await db.empleado.create({
      data: {
        employeeId,
        nombre: "Persona ficticia T12",
        teamId: "EQ-01",
        tipo: "TECNICO",
        responsableId: sinDestinatario ? null : "TL-01",
      },
    });
    const csv =
      "employee_id,period_start,period_end,horas_extra,dias_consecutivos_sin_descanso,tareas_activas,tareas_pendientes,tareas_vencidas,vacaciones_pendientes_dias\n" +
      `${employeeId},2026-10-05,2026-10-11,16,9,10,7,5,14\n${employeeId},2026-10-12,2026-10-18,16,16,10,7,5,14\n`;
    const previa = await validarImportacion(
      db,
      new File([csv], "t12.csv", { type: "text/csv" }),
      "demo-t12",
    );
    importId = previa.importId;
    assert.equal(previa.status, "VALIDADA");
    const confirmado = await confirmarImportacion(db, importId, "demo-t12");
    assert.equal(confirmado.procesamiento?.estado, "COMPLETADO");
    const alerta = await db.alerta.findFirstOrThrow({ where: { employeeId } });
    assert.equal(alerta.canal, "INTERNO");
    assert.equal(alerta.estadoEnvio, "NO_APLICA");
    await ejecutar(alerta.alertId, employeeId);
    assert.equal(await db.alerta.count({ where: { employeeId } }), 1);
    assert.equal(await db.evaluacion.count({ where: { employeeId } }), 2);
  } finally {
    await db.$transaction(async (tx) => {
      await tx.intentoNotificacion.deleteMany({
        where: { alerta: { employeeId } },
      });
      await tx.alerta.deleteMany({ where: { employeeId } });
      await tx.periodoEmpleado.updateMany({
        where: { employeeId },
        data: { registroVigenteId: null, evaluacionVigenteId: null },
      });
      await tx.evaluacion.updateMany({
        where: { employeeId },
        data: { supersedesEvaluationId: null },
      });
      await tx.evaluacion.deleteMany({ where: { employeeId } });
      if (importId) {
        await tx.processingJobPar.deleteMany({ where: { job: { importId } } });
        await tx.processingJob.deleteMany({ where: { importId } });
      }
      await tx.registroLaboral.deleteMany({ where: { employeeId } });
      await tx.periodoEmpleado.deleteMany({ where: { employeeId } });
      if (importId) {
        await tx.importacionTemporal.deleteMany({ where: { importId } });
        await tx.importacion.delete({ where: { importId } });
      }
      await tx.empleado.deleteMany({ where: { employeeId } });
    });
  }
}

test("T12 MySQL: intentos, recuperación, concurrencia y alerta única", async (t) => {
  assert.match(
    new URL(process.env.TEST_DATABASE_URL!).pathname,
    /^\/[A-Za-z0-9_]+_test$/,
  );
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    await db.$transaction((tx) => sembrarBase(tx));
    await t.test(
      "fallo y reintento exitoso conservan alerta, historial e informe",
      () =>
        escenario(db, async (alertId) => {
          assert.deepEqual(await listarNotificaciones(db, alertId), []);
          const original = await db.alerta.findUniqueOrThrow({
            where: { alertId },
          });
          const peticion = solicitud("FALLO");
          const primero = await prepararNotificacion(db, alertId, peticion);
          assert.equal(primero.estado, "PENDIENTE");
          assert.equal(
            (await db.alerta.findUniqueOrThrow({ where: { alertId } }))
              .estadoEnvio,
            "PENDIENTE",
          );
          assert.equal(
            (await procesarNotificacion(db, alertId, primero.intentoId)).estado,
            "FALLIDO",
          );
          const segundo = await prepararNotificacion(db, alertId, solicitud());
          assert.equal(segundo.numero, 2);
          assert.equal(
            (await procesarNotificacion(db, alertId, segundo.intentoId)).estado,
            "ENVIADO",
          );
          // Repetir la solicitud antigua no rebobina el estado actual.
          assert.equal(
            (await prepararNotificacion(db, alertId, peticion)).intentoId,
            primero.intentoId,
          );
          assert.equal(
            (await procesarNotificacion(db, alertId, primero.intentoId)).estado,
            "FALLIDO",
          );
          const final = await db.alerta.findUniqueOrThrow({
            where: { alertId },
          });
          assert.equal(final.estadoEnvio, "ENVIADO");
          assert.equal(final.canal, "SIMULADO");
          assert.deepEqual(final.causas, original.causas);
          assert.deepEqual(final.sugerencias, original.sugerencias);
          assert.equal(
            final.createdAt.toISOString(),
            original.createdAt.toISOString(),
          );
          assert.equal(
            (await crearAlertaSiCorresponde(db, final.evaluationId))
              ?.estadoEnvio,
            "ENVIADO",
          );
          assert.equal(
            (await construirInforme(db, final.evaluationId)).alerta
              ?.estadoEnvio,
            "ENVIADO",
          );
          assert.deepEqual(
            (await listarNotificaciones(db, alertId)).map((i) => i.estado),
            ["ENVIADO", "FALLIDO"],
          );
        }),
    );
    await t.test(
      "seis solicitudes y procesos concurrentes producen un solo envío",
      () =>
        escenario(db, async (alertId) => {
          const pendientes = await Promise.all(
            Array.from({ length: 6 }, () =>
              prepararNotificacion(db, alertId, solicitud()),
            ),
          );
          assert.equal(new Set(pendientes.map((i) => i.intentoId)).size, 1);
          const finales = await Promise.all(
            pendientes.map((i) =>
              procesarNotificacion(db, alertId, i.intentoId),
            ),
          );
          assert.ok(finales.every((i) => i.estado === "ENVIADO"));
          assert.equal(new Set(finales.map((i) => i.completedAt)).size, 1);
          assert.equal(
            (await prepararNotificacion(db, alertId, solicitud())).intentoId,
            pendientes[0].intentoId,
          );
          assert.equal((await listarNotificaciones(db, alertId)).length, 1);
        }),
    );
    await t.test(
      "sin destinatario conserva incidencia y permite reintentar tras corregir responsable",
      () =>
        escenario(
          db,
          async (alertId, employeeId) => {
            const primero = await prepararNotificacion(
              db,
              alertId,
              solicitud(),
            );
            assert.equal(
              (await procesarNotificacion(db, alertId, primero.intentoId))
                .estado,
              "SIN_DESTINATARIO",
            );
            await db.empleado.update({
              where: { employeeId },
              data: { responsableId: "TL-01" },
            });
            const segundo = await prepararNotificacion(
              db,
              alertId,
              solicitud(),
            );
            assert.equal(segundo.destinatarioId, "TL-01");
            assert.equal(
              (await procesarNotificacion(db, alertId, segundo.intentoId))
                .estado,
              "ENVIADO",
            );
            assert.equal(
              (await listarNotificaciones(db, alertId))[1].destinatarioId,
              null,
            );
          },
          true,
        ),
    );
    await t.test(
      "un pendiente persiste entre conexiones y una alerta superada no se envía",
      () =>
        escenario(db, async (alertId) => {
          const pendiente = await prepararNotificacion(
            db,
            alertId,
            solicitud(),
          );
          const otra = new PrismaClient({
            datasourceUrl: process.env.TEST_DATABASE_URL,
          });
          try {
            assert.deepEqual(await listarNotificaciones(otra, alertId), [
              pendiente,
            ]);
          } finally {
            await otra.$disconnect();
          }
          await db.alerta.update({
            where: { alertId },
            data: { vigencia: "SUPERADA" },
          });
          const final = await procesarNotificacion(
            db,
            alertId,
            pendiente.intentoId,
          );
          assert.equal(final.estado, "FALLIDO");
          assert.match(final.detalle!, /superada/);
          await assert.rejects(
            prepararNotificacion(db, alertId, solicitud()),
            (e: unknown) => e instanceof ErrorNotificacion && e.status === 409,
          );
        }),
    );
    await t.test(
      "HTTP responde 404/409 y no cambia un intento al repetir una clave con otro cuerpo",
      () =>
        escenario(db, async (alertId) => {
          const http = crearHttpNotificaciones(db);
          const req = (body?: unknown) =>
            new Request(
              "http://local/api",
              body
                ? {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  }
                : undefined,
            );
          const peticion = solicitud();
          const preparado = await http.preparar(req(peticion), alertId);
          assert.equal(preparado.status, 200);
          const intento = await preparado.json();
          assert.equal(
            (
              await http.preparar(
                req({ ...peticion, resultado: "FALLO" }),
                alertId,
              )
            ).status,
            409,
          );
          assert.equal(
            (await http.procesar(req(), alertId, "inexistente")).status,
            404,
          );
          assert.equal((await http.listar(req(), "inexistente")).status, 404);
          assert.equal(
            (await http.procesar(req(), alertId, intento.intentoId)).status,
            200,
          );
          assert.equal(
            (await http.listar(req(), alertId)).headers.get("cache-control"),
            "no-store",
          );
        }),
    );
  } finally {
    await db.$disconnect();
  }
});
