import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { reglasSemilla } from "../prisma/seed-data";
import {
  validarImportacion,
  confirmarImportacion,
  cancelarImportacion,
} from "../src/server/services/importaciones";
import { publicarConfiguracion } from "../src/server/services/publicar-reglas";
import { crearHttpAuditoria } from "../src/server/http/auditoria";

test("T15b MySQL: trazabilidad atómica, rechazos, reintentos y consultas", async (t) => {
  assert.match(
    new URL(process.env.TEST_DATABASE_URL!).pathname,
    /^\/[A-Za-z0-9_]+_test$/,
  );
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const actorId = `audit-${randomUUID()}`;
  const employeeId = `AUD-${randomUUID()}`;
  const imports: string[] = [];
  const version = `audit-${randomUUID()}`;
  const csv =
    "employee_id,period_start,period_end,horas_extra,dias_consecutivos_sin_descanso,tareas_activas,tareas_pendientes,tareas_vencidas,vacaciones_pendientes_dias\n" +
    `${employeeId},2026-10-05,2026-10-11,0,0,0,0,0,0\n`;
  const file = (contenido = csv) =>
    new File([contenido], "privado.csv", { type: "text/csv" });
  const validar = async (contenido = csv) => {
    const r = await validarImportacion(db, file(contenido), actorId);
    imports.push(r.importId);
    return r;
  };
  const eventos = () =>
    db.eventoAuditoria.findMany({
      where: { actorId },
      orderBy: [{ createdAt: "asc" }, { eventoId: "asc" }],
    });
  try {
    await db.$transaction((tx) => sembrarBase(tx));
    await db.empleado.create({
      data: {
        employeeId,
        nombre: "Persona ficticia auditoría",
        tipo: "TECNICO",
        teamId: "EQ-01",
        responsableId: "TL-01",
      },
    });
    await t.test(
      "validación rechazada y cancelación repetida conservan sus eventos",
      async () => {
        const rechazada = await validar(
          csv.replace(",0,0,0,0,0,0", ",-1,0,0,0,0,0"),
        );
        assert.equal(rechazada.status, "RECHAZADA");
        await cancelarImportacion(db, rechazada.importId, actorId);
        await cancelarImportacion(db, rechazada.importId, actorId);
        const filas = (await eventos()).filter(
          (e) => e.recursoId === rechazada.importId,
        );
        assert.deepEqual(
          filas.map((e) => e.accion),
          ["IMPORTACION_RECHAZADA", "IMPORTACION_CANCELADA"],
        );
        assert.ok(filas.every((e) => e.actorId === actorId));
      },
    );
    await t.test(
      "CSV mal formado deja solo código, sin guardar el contenido sensible",
      async () => {
        await assert.rejects(
          validarImportacion(
            db,
            file("clave,secreto\npassword,NO_GUARDAR"),
            actorId,
          ),
        );
        const texto = JSON.stringify(await eventos());
        assert.doesNotMatch(texto, /NO_GUARDAR|privado.csv|password/);
        assert.ok(
          (await eventos()).some(
            (e) => (e.detalles as { etapa?: string }).etapa === "FORMATO",
          ),
        );
      },
    );
    await t.test(
      "confirmaciones concurrentes conservan un evento y los metadatos previos",
      async () => {
        const previa = await validar();
        await Promise.all([
          confirmarImportacion(db, previa.importId, actorId),
          confirmarImportacion(db, previa.importId, actorId),
        ]);
        const filas = (await eventos()).filter(
          (e) => e.recursoId === previa.importId,
        );
        assert.deepEqual(
          filas.map((e) => e.accion),
          ["IMPORTACION_VALIDADA", "IMPORTACION_CONFIRMADA"],
        );
        assert.equal(
          (filas[1].detalles as { insertados: number }).insertados,
          1,
        );
        assert.equal(
          (filas[0].detalles as { schemaVersion: string }).schemaVersion,
          "indicadores-v1",
        );
      },
    );
    await t.test(
      "publicar reglas registra versión, parámetros, autor y job en el mismo commit",
      async () => {
        const reglas = {
          ...reglasSemilla,
          version,
          effectiveFrom: "2026-11-02",
          createdBy: actorId,
        };
        const r = await db.$transaction((tx) =>
          publicarConfiguracion(tx, reglas),
        );
        await assert.rejects(
          db.$transaction((tx) => publicarConfiguracion(tx, reglas)),
        );
        const filas = (await eventos()).filter(
          (e) => e.accion === "REGLAS_PUBLICADAS",
        );
        assert.equal(filas.length, 1);
        assert.equal((filas[0].detalles as { jobId: string }).jobId, r.jobId);
        assert.equal(
          (filas[0].detalles as { versionAnterior: string }).versionAnterior,
          "v1",
        );
      },
    );
    await t.test(
      "fallo de auditoría revierte la validación y la publicación",
      async () => {
        const conFallo = db.$extends({
          query: {
            eventoAuditoria: {
              async create() {
                throw new Error("FALLO_AUDITORIA");
              },
            },
          },
        }) as unknown as PrismaClient;
        const antes = await db.importacion.count({
          where: { uploadedBy: actorId },
        });
        await assert.rejects(
          validarImportacion(conFallo, file(), actorId),
          /FALLO_AUDITORIA/,
        );
        assert.equal(
          await db.importacion.count({ where: { uploadedBy: actorId } }),
          antes,
        );
        await assert.rejects(
          conFallo.$transaction((tx) =>
            publicarConfiguracion(tx, {
              ...reglasSemilla,
              version: `${version}-r`,
              effectiveFrom: "2026-11-09",
              createdBy: actorId,
            }),
          ),
          /FALLO_AUDITORIA/,
        );
        assert.equal(
          await db.configuracionIndice.count({
            where: { version: `${version}-r` },
          }),
          0,
        );
      },
    );
    await t.test(
      "consulta filtra, pagina y persiste entre conexiones sin mutar el historial",
      async () => {
        const http = crearHttpAuditoria(db);
        const response = await http(
          new Request(
            `http://local/api/auditoria?actorId=${actorId}&pageSize=1`,
          ),
        );
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.items.length, 1);
        assert.equal(body.total, (await eventos()).length);
        assert.equal(body.items[0].clave, undefined);
        const otra = new PrismaClient({
          datasourceUrl: process.env.TEST_DATABASE_URL,
        });
        try {
          assert.equal(
            await otra.eventoAuditoria.count({ where: { actorId } }),
            body.total,
          );
        } finally {
          await otra.$disconnect();
        }
      },
    );
  } finally {
    await db.$transaction(async (tx) => {
      await tx.processingJobPar.deleteMany({
        where: {
          job: {
            OR: [{ importId: { in: imports } }, { rulesVersion: version }],
          },
        },
      });
      await tx.processingJob.deleteMany({
        where: {
          OR: [{ importId: { in: imports } }, { rulesVersion: version }],
        },
      });
      await tx.periodoEmpleado.updateMany({
        where: { employeeId },
        data: { registroVigenteId: null, evaluacionVigenteId: null },
      });
      await tx.evaluacion.deleteMany({ where: { employeeId } });
      await tx.registroLaboral.deleteMany({ where: { employeeId } });
      await tx.periodoEmpleado.deleteMany({ where: { employeeId } });
      await tx.importacionTemporal.deleteMany({
        where: { importId: { in: imports } },
      });
      await tx.importacion.deleteMany({ where: { importId: { in: imports } } });
      await tx.configuracionIndice.deleteMany({ where: { version } });
      await tx.empleado.deleteMany({ where: { employeeId } });
    });
    await db.$disconnect();
  }
});
