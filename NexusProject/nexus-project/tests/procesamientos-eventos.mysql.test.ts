import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { alPublicarAlerta } from "../src/server/services/alertas";
import {
  confirmarImportacion,
  validarImportacion,
} from "../src/server/services/importaciones";
import type { ContextoAuditoria } from "../src/server/repositories/auditoria";
import { escenario, peticion } from "./importacion-fixture";

const usuario: ContextoAuditoria = {
  actorId: "demo-rrhh",
  actorNombre: "RR. HH.",
  actorRol: "RRHH",
  origen: "WEB",
  solicitudId: "solicitud-de-prueba",
};

test("MySQL procesamientos: eventos de auditoría del cálculo", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url);
  assert.match(new URL(url).pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  await db.$transaction((tx) => sembrarBase(tx));
  const deJob = (jobId: string) =>
    db.eventoAuditoria.findMany({
      where: { entidad: "PROCESAMIENTO", recursoId: jobId },
    });
  try {
    await t.test(
      "un cálculo completado deja un evento del sistema ligado a la importación",
      () =>
        escenario(db, async (s) => {
          const vista = await validarImportacion(
            db,
            new File([s.indicadores], "indicadores.csv", { type: "text/csv" }),
            usuario,
          );
          s.imports.push(vista.importId);
          const resultado = await confirmarImportacion(
            db,
            vista.importId,
            usuario,
          );
          const jobId = resultado.procesamiento!.jobId;
          assert.equal(resultado.procesamiento!.estado, "COMPLETADO");
          const eventos = await deJob(jobId);
          assert.equal(eventos.length, 1);
          const [e] = eventos;
          assert.equal(e.accion, "PROCESAMIENTO_COMPLETADO");
          assert.equal(e.correlacionId, vista.importId);
          assert.equal(e.resultado, "EXITO");
          // The system finished the job; the request that started it is still traceable.
          assert.equal(e.actorId, "sistema");
          assert.equal(e.origen, "SISTEMA");
          assert.equal(e.solicitudId, usuario.solicitudId);
          const d = e.detalles as Record<string, unknown>;
          assert.equal(d.pares, 2);
          assert.equal(d.completados, 2);
          assert.equal(d.fallidos, 0);
          assert.equal(d.origenJob, "IMPORTACION");
          assert.equal(d.intentos, 1);
          assert.equal(e.sujetoId, null);
        }),
    );

    await t.test(
      "un cálculo fallido y su reintento dejan FALLIDO, REINTENTADO y COMPLETADO con la misma correlación",
      () => {
        let fallar = true;
        return escenario(
          db,
          async (s) => {
            const carga = await s.importarIndicadores(false);
            const jobId = carga.procesamiento!.jobId;
            assert.equal(carga.procesamiento!.estado, "FALLIDO");
            let eventos = await deJob(jobId);
            assert.deepEqual(
              eventos.map((e) => e.accion),
              ["PROCESAMIENTO_FALLIDO"],
            );
            const [fallido] = eventos;
            assert.equal(fallido.correlacionId, carga.importId);
            assert.equal(fallido.resultado, "FALLO");
            assert.equal(fallido.motivo, "ERROR_TECNICO");
            assert.equal(fallido.origen, "SISTEMA");
            const d = fallido.detalles as Record<string, unknown>;
            assert.equal(d.pares, 2);
            assert.equal(d.completados, 1);
            assert.equal(d.fallidos, 1);
            assert.equal(d.codigoError, "ERROR_PROCESAMIENTO");
            assert.ok(!JSON.stringify(d).includes("simulado"), "no raw messages");

            fallar = false;
            const reintento = await s.http.reintentar(s.json(), jobId);
            assert.equal(reintento.status, 200);
            assert.equal((await reintento.json()).estado, "COMPLETADO");
            eventos = await deJob(jobId);
            assert.deepEqual(eventos.map((e) => e.accion).sort(), [
              "PROCESAMIENTO_COMPLETADO",
              "PROCESAMIENTO_FALLIDO",
              "PROCESAMIENTO_REINTENTADO",
            ]);
            assert.ok(eventos.every((e) => e.correlacionId === carga.importId));
            const reintentado = eventos.find(
              (e) => e.accion === "PROCESAMIENTO_REINTENTADO",
            )!;
            // The person who asked for the retry, not the system.
            assert.equal(reintentado.actorId, "demo-local");
            assert.equal(reintentado.resultado, "EXITO");
            const detalles = reintentado.detalles as Record<string, unknown>;
            assert.equal(detalles.intentos, 2);
            assert.equal(detalles.estadoAnterior, "FALLIDO");
            const completado = eventos.find(
              (e) => e.accion === "PROCESAMIENTO_COMPLETADO",
            )!;
            assert.equal((completado.detalles as { intentos: number }).intentos, 2);
            assert.equal((completado.detalles as { completados: number }).completados, 2);

            // A retry on a finished job runs nothing and records nothing.
            const otra = await s.http.reintentar(s.json(), jobId);
            assert.equal(otra.status, 200);
            assert.equal((await deJob(jobId)).length, 3);
          },
          {
            alPublicar: async (tx, evaluacion) => {
              await alPublicarAlerta(tx, evaluacion);
              if (fallar && evaluacion.periodStart === "2026-10-12")
                throw new Error("fallo simulado al publicar");
            },
          },
        );
      },
    );

    await t.test(
      "la confirmación sin semanas nuevas no crea trabajo ni eventos de cálculo",
      () =>
        escenario(db, async (s) => {
          await s.importarIndicadores();
          const v = await peticion(s.http.validar, s.indicadores, "indicadores.csv");
          s.imports.push(v.body.importId);
          const c = await s.confirmar(v.body.importId);
          assert.equal(c.status, 200);
          assert.equal(c.body.procesamiento, null);
          const eventos = await db.eventoAuditoria.count({
            where: {
              entidad: "PROCESAMIENTO",
              correlacionId: { in: s.imports },
            },
          });
          assert.equal(eventos, 1, "only the first import's job");
        }),
    );
  } finally {
    await db.$disconnect();
  }
});
