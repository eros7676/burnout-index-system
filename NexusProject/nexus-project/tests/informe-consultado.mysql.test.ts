import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { crearHttpConsultas } from "../src/server/http/consultas";
import { proteger, tokenDemo } from "../src/server/http/permisos-demo";
import {
  confirmarImportacion,
  validarImportacion,
} from "../src/server/services/importaciones";

// Reading one person's report is a consultation of personal data (audit-trail §1.4): the read leaves
// an INFORME_CONSULTADO event about that person, written in the same transaction as the read.
test("B6 MySQL: la lectura de un informe individual deja INFORME_CONSULTADO y falla cerrada", async (t) => {
  assert.match(
    new URL(process.env.TEST_DATABASE_URL!).pathname,
    /^\/[A-Za-z0-9_]+_test$/,
  );
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const id = `B6I-${randomUUID().slice(0, 8)}`;
  const imports: string[] = [];
  const solicitudes: string[] = [];
  try {
    await db.$transaction((tx) => sembrarBase(tx));
    await db.empleado.create({
      data: {
        employeeId: id,
        nombre: "Persona ficticia B6",
        tipo: "TECNICO",
        teamId: "EQ-01",
        responsableId: "TL-01",
      },
    });
    const csv = readFileSync("templates/ejemplo-dos-semanas.csv", "utf8")
      .trim()
      .replaceAll("EMP-001", id);
    const ahora = () => new Date("2026-11-10T12:00:00Z");
    const vista = await validarImportacion(db, new File([csv], "b6.csv"), "demo-local", { ahora });
    imports.push(vista.importId);
    await confirmarImportacion(db, vista.importId, "demo-local", { ahora });
    const periodo = await db.periodoEmpleado.findFirstOrThrow({
      where: { employeeId: id },
      orderBy: { periodStart: "asc" },
    });
    const evaluationId = periodo.evaluacionVigenteId!;
    assert.ok(evaluationId);

    const informe = proteger<[string]>(db, "LEER", crearHttpConsultas(db).informe, "informe");
    const pedir = (usuario: string, ruta = "/") =>
      new Request(`http://local${ruta}`, {
        headers: { Cookie: `nexo_demo=${tokenDemo(usuario)}` },
      });
    const consultas = () =>
      db.eventoAuditoria.findMany({
        where: { accion: "INFORME_CONSULTADO", sujetoId: id },
        orderBy: { createdAt: "asc" },
      });

    await t.test("RR. HH. lee el informe y queda un evento sobre la persona con el id de la solicitud", async () => {
      const respuesta = await informe(pedir("demo-rrhh"), evaluationId);
      assert.equal(respuesta.status, 200);
      const solicitud = respuesta.headers.get("x-request-id")!;
      solicitudes.push(solicitud);
      const cuerpo = await respuesta.json();
      assert.equal(cuerpo.evaluacion.evaluationId, evaluationId);
      const eventos = await consultas();
      assert.equal(eventos.length, 1);
      const [evento] = eventos;
      assert.equal(evento.entidad, "INFORME");
      assert.equal(evento.recursoId, evaluationId);
      assert.equal(evento.sujetoId, id);
      assert.equal(evento.actorId, "demo-rrhh");
      assert.equal(evento.actorRol, "RRHH");
      assert.equal(evento.origen, "WEB");
      assert.equal(evento.resultado, "EXITO");
      assert.equal(evento.solicitudId, solicitud);
      // The only detail is the week: no index value, name or score is copied into the trail.
      assert.deepEqual(evento.detalles, { semana: cuerpo.evaluacion.periodStart });
    });

    await t.test("el Team Lead del equipo lee y queda constancia a su nombre", async () => {
      const respuesta = await informe(pedir("demo-tl-01"), evaluationId);
      assert.equal(respuesta.status, 200);
      solicitudes.push(respuesta.headers.get("x-request-id")!);
      const eventos = await consultas();
      assert.equal(eventos.length, 2);
      assert.deepEqual(
        [eventos[1].actorId, eventos[1].actorRol],
        ["demo-tl-01", "TEAM_LEAD"],
      );
    });

    await t.test("un Team Lead de otro equipo no lee: 403, ACCESO_DENEGADO y ninguna consulta", async () => {
      const antes = (await consultas()).length;
      const respuesta = await informe(pedir("demo-tl-02"), evaluationId);
      assert.equal(respuesta.status, 403);
      const solicitud = respuesta.headers.get("x-request-id")!;
      solicitudes.push(solicitud);
      assert.equal((await consultas()).length, antes);
      const denegado = await db.eventoAuditoria.findFirstOrThrow({
        where: { solicitudId: solicitud },
      });
      assert.deepEqual(
        [denegado.accion, denegado.resultado, denegado.actorId],
        ["ACCESO_DENEGADO", "DENEGADO", "demo-tl-02"],
      );
    });

    await t.test("un informe inexistente o una consulta con filtros no dejan consulta registrada", async () => {
      const antes = (await consultas()).length;
      assert.equal((await informe(pedir("demo-rrhh"), "inexistente")).status, 404);
      assert.equal(
        (await informe(pedir("demo-rrhh", "/?nivel=ALTO"), evaluationId)).status,
        400,
      );
      assert.equal((await consultas()).length, antes);
    });

    await t.test("si no se puede registrar la consulta, no se entrega el informe (falla cerrada)", async () => {
      const sinRegistro = db.$extends({
        query: {
          eventoAuditoria: {
            async create() {
              throw new Error("FALLO_AUDITORIA");
            },
          },
        },
      }) as unknown as PrismaClient;
      const cerrado = proteger<[string]>(
        sinRegistro,
        "LEER",
        crearHttpConsultas(sinRegistro).informe,
        "informe",
      );
      const antes = (await consultas()).length;
      mock.method(console, "error", () => {});
      try {
        const respuesta = await cerrado(pedir("demo-rrhh"), evaluationId);
        solicitudes.push(respuesta.headers.get("x-request-id")!);
        assert.equal(respuesta.status, 500);
        const texto = await respuesta.text();
        assert.doesNotMatch(texto, /FALLO_AUDITORIA|evaluacion|indice/);
      } finally {
        mock.restoreAll();
      }
      assert.equal((await consultas()).length, antes);
    });
  } finally {
    await db.eventoAuditoria.deleteMany({
      where: {
        OR: [
          { sujetoId: id },
          { solicitudId: { in: solicitudes } },
          { recursoId: { in: imports } },
        ],
      },
    });
    await db.$transaction(async (tx) => {
      const jobs = await tx.processingJobPar.findMany({
        where: { periodo: { employeeId: id } },
        select: { jobId: true },
      });
      const jobIds = { in: jobs.map((j) => j.jobId) };
      await tx.processingJobPar.deleteMany({ where: { jobId: jobIds } });
      await tx.processingJob.deleteMany({ where: { jobId: jobIds } });
      await tx.alerta.deleteMany({ where: { employeeId: id } });
      await tx.periodoEmpleado.updateMany({
        where: { employeeId: id },
        data: { registroVigenteId: null, evaluacionVigenteId: null },
      });
      await tx.evaluacion.updateMany({
        where: { employeeId: id },
        data: { supersedesEvaluationId: null },
      });
      await tx.evaluacion.deleteMany({ where: { employeeId: id } });
      await tx.registroLaboral.deleteMany({ where: { employeeId: id } });
      await tx.periodoEmpleado.deleteMany({ where: { employeeId: id } });
      await tx.importacionTemporal.deleteMany({ where: { importId: { in: imports } } });
      await tx.importacion.deleteMany({ where: { importId: { in: imports } } });
      await tx.empleado.deleteMany({ where: { employeeId: id } });
    });
    await db.$disconnect();
  }
});
