import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { construirInforme } from "../src/server/services/informes";
import type {
  ResultadoImportacion,
  VistaPrevia,
} from "../src/shared/contracts";

/** Prueba optativa del build real: npm run build && npm run db:test:http.
 * No usa DATABASE_URL como fallback ni forma parte de db:test (que no requiere build).
 */
async function comprobarNext() {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, "Configure TEST_DATABASE_URL.");
  const destino = new URL(url);
  assert.equal(destino.protocol, "mysql:");
  assert.match(destino.pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  const imports: string[] = [];
  let detener: (() => Promise<void>) | undefined;
  try {
    await db.$transaction((tx) => sembrarBase(tx));
    assert.equal(
      await db.periodoEmpleado.count({
        where: {
          employeeId: "EMP-001",
          periodStart: { in: [new Date("2026-10-05"), new Date("2026-10-12")] },
        },
      }),
      0,
      "El ejemplo exige semanas vacías; use una base de pruebas aislada.",
    );
    const reserva = createServer();
    reserva.listen(0, "127.0.0.1");
    await once(reserva, "listening");
    const address = reserva.address();
    assert.ok(address && typeof address !== "string");
    await new Promise<void>((resolve, reject) =>
      reserva.close((e) => (e ? reject(e) : resolve())),
    );
    const proceso = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(address.port),
      ],
      {
        env: { ...process.env, DATABASE_URL: url },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    detener = async () => {
      if (proceso.exitCode === null && proceso.signalCode === null) {
        const salida = once(proceso, "exit");
        proceso.kill();
        await salida;
      }
    };
    await new Promise<void>((resolve, reject) => {
      let salida = "";
      const timer = setTimeout(
        () => reject(new Error("Next.js no inició en 30 segundos.")),
        30_000,
      );
      const listo = (chunk: Buffer) => {
        salida += chunk.toString();
        if (/Ready in/.test(salida)) {
          clearTimeout(timer);
          resolve();
        }
      };
      proceso.stdout.on("data", listo);
      proceso.stderr.on("data", () => {});
      proceso.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      proceso.once("exit", (code) => {
        clearTimeout(timer);
        reject(
          new Error(
            `Next.js terminó (${code}); ejecute npm run build antes de esta prueba.`,
          ),
        );
      });
    });
    const base = `http://127.0.0.1:${address.port}`;
    const csv = readFileSync("templates/ejemplo-dos-semanas.csv", "utf8");
    async function validar() {
      const form = new FormData();
      form.append(
        "file",
        new File([csv], "ejemplo-dos-semanas.csv", { type: "text/csv" }),
      );
      const response = await fetch(`${base}/api/importaciones/validar`, {
        method: "POST",
        body: form,
      });
      assert.equal(response.status, 200);
      const vista: VistaPrevia = await response.json();
      imports.push(vista.importId);
      return vista;
    }
    async function confirmar(id: string): Promise<ResultadoImportacion> {
      const response = await fetch(
        `${base}/api/importaciones/${id}/confirmar`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      assert.equal(response.status, 200);
      return response.json();
    }
    const previa = await validar();
    assert.equal(previa.nuevas, 2);
    const carga = await confirmar(previa.importId);
    assert.equal(carga.procesamiento?.estado, "COMPLETADO");
    assert.equal(carga.insertados, 2);
    assert.deepEqual(await confirmar(previa.importId), carga);
    const job = await fetch(
      `${base}/api/procesamientos/${carga.procesamiento.jobId}`,
    );
    assert.equal(job.status, 200);
    assert.equal((await job.json()).completados, 2);
    const retry = await fetch(
      `${base}/api/procesamientos/${carga.procesamiento.jobId}/reintentar`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).estado, "COMPLETADO");
    const evaluaciones = await db.evaluacion.findMany({
      where: { employeeId: "EMP-001" },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(
      evaluaciones.map((e) => [Number(e.indice), e.nivel]),
      [
        [83.71, "INCOMPLETO"],
        [91.21, "ALTO"],
      ],
    );
    const informe = await construirInforme(db, evaluaciones[1].evaluationId);
    assert.equal(informe.alerta?.destinatarioId, "TL-01");
    assert.equal(informe.alerta.canal, "INTERNO");
    assert.equal(informe.alerta.estadoEnvio, "NO_APLICA");
    async function consultar(ruta: string) {
      const respuesta = await fetch(`${base}/api/${ruta}`);
      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.headers.get("cache-control"), "no-store");
      return respuesta.json();
    }
    const lista = await consultar("evaluaciones?employeeId=EMP-001&pageSize=1");
    assert.equal(lista.total, 2);
    assert.equal(lista.items[0].indice, 91.21);
    assert.equal(lista.items[0].actualizado, true);
    const detalleHttp = await consultar(
      `evaluaciones/${lista.items[0].evaluationId}`,
    );
    assert.equal(detalleHttp.alerta.alertId, informe.alerta.alertId);
    const resumen = await consultar(
      "resumen?employeeId=EMP-001&periodStart=2026-10-12",
    );
    assert.equal(resumen.totalEvaluaciones, 1);
    assert.equal(resumen.promedioIndice, 91.21);
    const alertas = await consultar("alertas?employeeId=EMP-001");
    assert.equal(alertas.total, 1);
    assert.equal(alertas.items[0].vigencia, "ACTIVA");
    assert.equal((await fetch(`${base}/api/evaluaciones?page=0`)).status, 400);
    assert.equal(
      (await fetch(`${base}/api/evaluaciones/inexistente`)).status,
      404,
    );
    console.log(
      "T13: cuatro rutas GET del build real verificadas con MySQL, filtros, informe, resumen y alerta.",
    );
    const rutaCorreo = `alertas/${informe.alerta.alertId}/notificaciones`;
    assert.deepEqual(await consultar(rutaCorreo), []);
    const peticionCorreo = { requestId: randomUUID(), resultado: "FALLO" };
    async function prepararCorreo(body: object) {
      const r = await fetch(`${base}/api/${rutaCorreo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, 200);
      return r.json();
    }
    async function procesarCorreo(id: string) {
      const r = await fetch(`${base}/api/${rutaCorreo}/${id}/procesar`, {
        method: "POST",
      });
      assert.equal(r.status, 200);
      return r.json();
    }
    const pendiente = await prepararCorreo(peticionCorreo);
    assert.equal(pendiente.estado, "PENDIENTE");
    assert.equal(
      (await prepararCorreo(peticionCorreo)).intentoId,
      pendiente.intentoId,
    );
    assert.equal((await procesarCorreo(pendiente.intentoId)).estado, "FALLIDO");
    const reintento = await prepararCorreo({
      requestId: randomUUID(),
      resultado: "EXITO",
    });
    assert.equal((await procesarCorreo(reintento.intentoId)).estado, "ENVIADO");
    assert.equal((await procesarCorreo(reintento.intentoId)).estado, "ENVIADO");
    assert.equal((await consultar(rutaCorreo)).length, 2);
    assert.equal(
      (await consultar(`evaluaciones/${informe.evaluacion.evaluationId}`))
        .alerta.estadoEnvio,
      "ENVIADO",
    );
    assert.equal(await db.alerta.count(), 1);
    console.log(
      "T12: historial, pendiente, fallo, reintento e idempotencia verificados por HTTP real.",
    );
    const repetida = await validar();
    const auditoria = await consultar(
      `auditoria?entidad=IMPORTACION&recursoId=${imports[0]}`,
    );
    assert.ok(
      auditoria.items.some(
        (e: { accion: string }) => e.accion === "IMPORTACION_VALIDADA",
      ),
    );
    assert.ok(
      auditoria.items.some(
        (e: { accion: string }) => e.accion === "IMPORTACION_CONFIRMADA",
      ),
    );
    assert.equal(
      (await fetch(`${base}/api/auditoria?pageSize=101`)).status,
      400,
    );
    console.log("T15b: consulta HTTP de auditoría de importación verificada.");
    assert.equal(repetida.omitidas, 2);
    const sinTrabajo = await confirmar(repetida.importId);
    assert.equal(sinTrabajo.insertados, 0);
    assert.equal(sinTrabajo.procesamiento, null);
    const cancelable = await validar();
    for (let i = 0; i < 2; i++) {
      const response = await fetch(
        `${base}/api/importaciones/${cancelable.importId}`,
        { method: "DELETE" },
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, "CANCELADA");
    }
    console.log(
      "T04: cinco rutas del build Next.js verificadas por HTTP; ejemplo, informe/alerta, idempotencia y cancelación correctos.",
    );
  } finally {
    await detener?.();
    const importId = { in: imports };
    const periodos = await db.periodoEmpleado.findMany({
      where: { registros: { some: { sourceImportId: importId } } },
    });
    const periodoId = { in: periodos.map((p) => p.periodoId) };
    await db.$transaction(async (tx) => {
      await tx.processingJobPar.deleteMany({ where: { job: { importId } } });
      await tx.processingJob.deleteMany({ where: { importId } });
      await tx.intentoNotificacion.deleteMany({
        where: { alerta: { evaluacion: { periodoId } } },
      });
      await tx.alerta.deleteMany({ where: { evaluacion: { periodoId } } });
      await tx.periodoEmpleado.updateMany({
        where: { periodoId },
        data: { registroVigenteId: null, evaluacionVigenteId: null },
      });
      await tx.evaluacion.updateMany({
        where: { periodoId },
        data: { supersedesEvaluationId: null },
      });
      await tx.evaluacion.deleteMany({ where: { periodoId } });
      await tx.registroLaboral.deleteMany({ where: { periodoId } });
      await tx.periodoEmpleado.deleteMany({ where: { periodoId } });
      await tx.importacionTemporal.deleteMany({ where: { importId } });
      await tx.importacion.deleteMany({ where: { importId } });
    });
    await db.$disconnect();
  }
}

comprobarNext().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
