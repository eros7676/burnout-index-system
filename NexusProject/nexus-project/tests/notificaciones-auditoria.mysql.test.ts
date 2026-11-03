import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { crearHttpNotificaciones } from "../src/server/http/notificaciones";
import { proteger, tokenDemo } from "../src/server/http/permisos-demo";
import {
  prepararNotificacion,
  procesarNotificacion,
} from "../src/server/services/notificaciones";
import { conAlerta, sesion } from "./alerta-fixture";

const solicitud = (resultado: "EXITO" | "FALLO" = "EXITO") => ({
  requestId: randomUUID(),
  resultado,
});
const actor = sesion("demo-rrhh").actor;

test("MySQL notificaciones: cada paso deja su evento en la misma transacción", async (t) => {
  assert.match(
    new URL(process.env.TEST_DATABASE_URL!).pathname,
    /^\/[A-Za-z0-9_]+_test$/,
  );
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const eventos = (alertId: string) =>
    db.eventoAuditoria.findMany({
      where: { entidad: "NOTIFICACION", correlacionId: alertId },
      orderBy: [{ createdAt: "asc" }, { eventoId: "asc" }],
    });
  try {
    await db.$transaction((tx) => sembrarBase(tx));

    await t.test("preparar y procesar con éxito: dos eventos con quién, qué cambió y sin datos de contenido", async () => {
      await conAlerta(db, {}, async (p) => {
        const [{ alertId }] = await p.alertas();
        const pedido = solicitud("EXITO");
        const intento = await prepararNotificacion(db, alertId, pedido, actor);
        // Repeating the same request neither creates a second attempt nor a second event.
        await prepararNotificacion(db, alertId, pedido, actor);
        assert.equal((await eventos(alertId)).length, 1);

        const [preparada] = await eventos(alertId);
        assert.equal(preparada.accion, "NOTIFICACION_PREPARADA");
        assert.equal(preparada.recursoId, intento.intentoId);
        assert.equal(preparada.sujetoId, p.employeeId);
        assert.equal(preparada.actorId, "demo-rrhh");
        assert.equal(preparada.actorRol, "RRHH");
        assert.equal(preparada.solicitudId, actor.solicitudId);
        assert.equal(preparada.resultado, "EXITO");
        assert.deepEqual(preparada.cambios, [
          { campo: "estadoEnvio", antes: "NO_APLICA", despues: "PENDIENTE" },
        ]);
        assert.deepEqual(preparada.detalles, {
          numero: 1,
          canal: "SIMULADO",
          resultadoSolicitado: "EXITO",
        });

        const final = await procesarNotificacion(db, alertId, intento.intentoId, actor);
        assert.equal(final.estado, "ENVIADO");
        await procesarNotificacion(db, alertId, intento.intentoId, actor);
        const todos = await eventos(alertId);
        assert.deepEqual(
          todos.map((e) => e.accion),
          ["NOTIFICACION_PREPARADA", "NOTIFICACION_PROCESADA"],
        );
        const procesada = todos[1];
        assert.equal(procesada.recursoId, intento.intentoId);
        assert.equal(procesada.resultado, "EXITO");
        assert.equal(procesada.motivo, null);
        assert.deepEqual(procesada.cambios, [
          { campo: "estadoEnvio", antes: "PENDIENTE", despues: "ENVIADO" },
        ]);
        assert.deepEqual(procesada.detalles, {
          numero: 1,
          canal: "SIMULADO",
          estado: "ENVIADO",
        });
      });
    });

    await t.test("un fallo simulado es un evento FALLO con su motivo; reintentar abre otro intento", async () => {
      await conAlerta(db, {}, async (p) => {
        const [{ alertId }] = await p.alertas();
        const primero = await prepararNotificacion(db, alertId, solicitud("FALLO"), actor);
        const fallido = await procesarNotificacion(db, alertId, primero.intentoId, actor);
        assert.equal(fallido.estado, "FALLIDO");
        const segundo = await prepararNotificacion(db, alertId, solicitud("EXITO"), actor);
        assert.equal(segundo.numero, 2);
        await procesarNotificacion(db, alertId, segundo.intentoId, actor);
        const todos = await eventos(alertId);
        assert.deepEqual(
          todos.map((e) => [e.accion, e.resultado, e.motivo]),
          [
            ["NOTIFICACION_PREPARADA", "EXITO", null],
            ["NOTIFICACION_PROCESADA", "FALLO", "SIMULADO_FALLO"],
            ["NOTIFICACION_PREPARADA", "EXITO", null],
            ["NOTIFICACION_PROCESADA", "EXITO", null],
          ],
        );
        assert.deepEqual(todos[2].cambios, [
          { campo: "estadoEnvio", antes: "FALLIDO", despues: "PENDIENTE" },
        ]);
        assert.equal((todos[2].detalles as { numero: number }).numero, 2);
      });
    });

    await t.test("sin destinatario y alerta superada: el motivo lo dice", async () => {
      await conAlerta(db, { sinResponsable: true }, async (p) => {
        const [{ alertId }] = await p.alertas();
        const intento = await prepararNotificacion(db, alertId, solicitud(), actor);
        const procesado = await procesarNotificacion(db, alertId, intento.intentoId, actor);
        assert.equal(procesado.estado, "SIN_DESTINATARIO");
        const [, procesada] = await eventos(alertId);
        assert.equal(procesada.resultado, "FALLO");
        assert.equal(procesada.motivo, "SIN_DESTINATARIO");
        assert.deepEqual(procesada.detalles, {
          numero: 1,
          canal: "SIMULADO",
          estado: "SIN_DESTINATARIO",
        });
      });
      await conAlerta(db, {}, async (p) => {
        const [{ alertId }] = await p.alertas();
        const intento = await prepararNotificacion(db, alertId, solicitud(), actor);
        await db.alerta.update({ where: { alertId }, data: { vigencia: "SUPERADA" } });
        const procesado = await procesarNotificacion(db, alertId, intento.intentoId, actor);
        assert.equal(procesado.estado, "FALLIDO");
        const [, procesada] = await eventos(alertId);
        assert.equal(procesada.resultado, "FALLO");
        assert.equal(procesada.motivo, "ESTADO_INCOMPATIBLE");
      });
    });

    await t.test("si el evento no se puede guardar, el intento y el estado de envío no cambian", async () => {
      await conAlerta(db, {}, async (p) => {
        const [{ alertId }] = await p.alertas();
        const roto = { ...actor, solicitudId: "x".repeat(40) };
        await assert.rejects(prepararNotificacion(db, alertId, solicitud(), roto));
        assert.equal(await db.intentoNotificacion.count({ where: { alertId } }), 0);
        assert.equal(
          (await db.alerta.findUniqueOrThrow({ where: { alertId } })).estadoEnvio,
          "NO_APLICA",
        );
        const intento = await prepararNotificacion(db, alertId, solicitud(), actor);
        await assert.rejects(procesarNotificacion(db, alertId, intento.intentoId, roto));
        const intacto = await db.intentoNotificacion.findUniqueOrThrow({
          where: { intentoId: intento.intentoId },
        });
        assert.equal(intacto.estado, "PENDIENTE");
        assert.equal(intacto.completedAt, null);
        assert.equal(
          (await db.alerta.findUniqueOrThrow({ where: { alertId } })).estadoEnvio,
          "PENDIENTE",
        );
        assert.equal((await eventos(alertId)).length, 1);
      });
    });

    await t.test("por HTTP el evento lleva a quien actuó y el identificador de la solicitud", async () => {
      await conAlerta(db, {}, async (p) => {
        const [{ alertId }] = await p.alertas();
        const http = crearHttpNotificaciones(db);
        const preparar = proteger(db, "NOTIFICAR", http.preparar);
        const procesar = proteger(db, "NOTIFICAR", http.procesar);
        const como = (userId: string, ruta: string, cuerpo?: unknown) =>
          new Request(`http://localhost${ruta}`, {
            method: "POST",
            headers: {
              Cookie: `nexo_demo=${tokenDemo(userId)}`,
              "Content-Type": "application/json",
            },
            body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
          });
        // Only RR. HH. prepares; a refusal leaves no notification event.
        const rechazo = await preparar(
          como("demo-tl-01", `/api/alertas/${alertId}/notificaciones`, solicitud()),
          alertId,
        );
        assert.equal(rechazo.status, 403);
        assert.equal((await eventos(alertId)).length, 0);

        const creada = await preparar(
          como("demo-rrhh", `/api/alertas/${alertId}/notificaciones`, solicitud()),
          alertId,
        );
        assert.equal(creada.status, 200);
        const intento = await creada.json();
        const pedido = creada.headers.get("x-request-id")!;
        const hecha = await procesar(
          como("demo-rrhh", `/api/alertas/${alertId}/notificaciones/${intento.intentoId}`),
          alertId,
          intento.intentoId,
        );
        assert.equal(hecha.status, 200);
        const todos = await eventos(alertId);
        assert.equal(todos.length, 2);
        assert.equal(todos[0].solicitudId, pedido);
        assert.equal(todos[1].solicitudId, hecha.headers.get("x-request-id"));
        assert.ok(todos.every((e) => e.actorId === "demo-rrhh" && e.origen === "WEB"));
      });
    });

    await t.test("sin contexto de solicitud, un adaptador interno actúa como demo-local", async () => {
      await conAlerta(db, {}, async (p) => {
        const [{ alertId }] = await p.alertas();
        await prepararNotificacion(db, alertId, solicitud());
        const [preparada] = await eventos(alertId);
        assert.equal(preparada.actorId, "demo-local");
      });
    });
  } finally {
    await db.$disconnect();
  }
});
