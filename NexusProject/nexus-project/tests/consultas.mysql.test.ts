import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodificarJsonExacto } from "../src/server/repositories/json-exacto";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { reglasSemilla } from "../prisma/seed-data";
import {
  validarImportacion,
  confirmarImportacion,
} from "../src/server/services/importaciones";
import { publicarConfiguracion } from "../src/server/services/publicar-reglas";
import { procesarImportacion } from "../src/server/services/procesamientos";
import { crearHttpConsultas } from "../src/server/http/consultas";

test("MySQL T13: consultas persistidas, vigencia, historial y estados por par", async (t) => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const id = `T13-${randomUUID()}`;
  const imports: string[] = [];
  const http = crearHttpConsultas(db);
  const get = async (
    tipo: "evaluaciones" | "resumen" | "alertas",
    query = "",
  ) => {
    const response = await http[tipo](
      new Request(`http://localhost/api/${tipo}?employeeId=${id}${query}`),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  };
  try {
    await db.$transaction((tx) => sembrarBase(tx));
    await db.empleado.create({
      data: {
        employeeId: id,
        nombre: "Persona ficticia T13",
        tipo: "TECNICO",
        teamId: "EQ-01",
        responsableId: "TL-01",
      },
    });
    await t.test(
      "vacío, filtros sin coincidencias y resumen sin denominador",
      async () => {
        assert.equal((await get("evaluaciones")).total, 0);
        assert.deepEqual(await get("resumen"), {
          totalEvaluaciones: 0,
          conteo: { BAJO: 0, MEDIO: 0, ALTO: 0, INCOMPLETO: 0 },
          porcentajes: { BAJO: 0, MEDIO: 0, ALTO: 0, INCOMPLETO: 0 },
          noProcesados: 0,
          promedioIndice: null,
          muestraPromedio: 0,
          excedidas: { HE: 0, DS: 0, CT: 0, VP: 0 },
        });
      },
    );
    const csv =
      readFileSync("templates/ejemplo-dos-semanas.csv", "utf8")
        .trim()
        .replaceAll("EMP-001", id) +
      `\n${id},2026-10-19,2026-10-25,8,6,10,5,2,10,40,0\n${id},2026-10-26,2026-11-01,0,0,0,0,0,0,40,0\n`;
    const vista = await validarImportacion(
      db,
      new File([csv], "t13.csv"),
      "demo-local",
      { ahora: () => new Date("2026-11-10T12:00:00Z") },
    );
    imports.push(vista.importId);
    const resultado = await confirmarImportacion(
      db,
      vista.importId,
      "demo-local",
      { ahora: () => new Date("2026-11-10T12:00:00Z") },
    );
    const jobId = resultado.procesamiento!.jobId;
    assert.equal(resultado.procesamiento!.estado, "COMPLETADO");
    await t.test(
      "orden, paginación, filtros, cuatro niveles e índices numéricos",
      async () => {
        const all = await get("evaluaciones");
        assert.deepEqual(
          all.items.map((r: { nivel: string }) => r.nivel),
          ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"],
        );
        assert.equal(all.items[2].indice, 91.21);
        assert.ok(
          all.items.every((r: { actualizado: boolean }) => r.actualizado),
        );
        const page = await get("evaluaciones", "&page=2&pageSize=2");
        assert.equal(page.total, 4);
        assert.equal(page.items.length, 2);
        assert.equal(page.items[0].nivel, "ALTO");
        assert.equal(
          (await get("evaluaciones", "&page=9007199254740991")).items.length,
          0,
        );
        assert.equal((await get("evaluaciones", "&teamId=EQ-02")).total, 0);
        assert.equal((await get("evaluaciones", "&nivel=ALTO")).total, 1);
        assert.equal(
          (await get("resumen", "&periodStart=2026-10-12")).promedioIndice,
          91.21,
        );
        const resumen = await get("resumen");
        assert.deepEqual(resumen.conteo, {
          BAJO: 1,
          MEDIO: 1,
          ALTO: 1,
          INCOMPLETO: 1,
        });
        assert.equal(resumen.porcentajes.ALTO, 25);
        assert.equal(resumen.promedioIndice, 55.96);
        // Each factor counts the current results that exceed it, as each evaluation stored them.
        const vigentes = await db.periodoEmpleado.findMany({
          where: { employeeId: id },
          include: { evaluacionVigente: true },
        });
        const esperado = { HE: 0, DS: 0, CT: 0, VP: 0 };
        for (const p of vigentes)
          for (const f of (p.evaluacionVigente
            ? decodificarJsonExacto(p.evaluacionVigente.excedidas)
            : []) as (keyof typeof esperado)[])
            esperado[f]++;
        assert.deepEqual(resumen.excedidas, esperado);
        assert.ok(Object.values(esperado).some((n) => n > 0));
      },
    );
    const rows = await db.periodoEmpleado.findMany({
      where: { employeeId: id },
      orderBy: { periodStart: "asc" },
    });
    const oldId = rows[1].evaluacionVigenteId!;
    await t.test(
      "detalle/alertas son solo lectura y detalle inexistente devuelve 404",
      async () => {
        const antes = await db.alerta.count();
        const response = await http.informe(
          new Request("http://localhost/"),
          oldId,
        );
        assert.equal(response.status, 200);
        const detail = await response.json();
        assert.equal(detail.evaluacion.indice, 91.21);
        assert.equal(detail.alerta.vigencia, "ACTIVA");
        assert.equal((await get("alertas")).total, 1);
        assert.equal(
          (await get("alertas", "&pageSize=1&page=2")).items.length,
          0,
        );
        assert.equal(
          (await http.informe(new Request("http://localhost/"), "inexistente"))
            .status,
          404,
        );
        assert.equal(await db.alerta.count(), antes);
      },
    );
    await t.test(
      "fallo global no transforma un par completado en fallido",
      async () => {
        await db.processingJob.update({
          where: { jobId },
          data: { estado: "FALLIDO" },
        });
        await db.processingJobPar.update({
          where: { jobId_periodoId: { jobId, periodoId: rows[3].periodoId } },
          data: { estado: "FALLIDO" },
        });
        const all = await get("evaluaciones");
        assert.equal(all.items[0].processingState, "FALLIDO");
        assert.equal(all.items[1].processingState, "COMPLETADO");
        await db.processingJobPar.update({
          where: { jobId_periodoId: { jobId, periodoId: rows[3].periodoId } },
          data: { estado: "COMPLETADO" },
        });
      },
    );
    await t.test(
      "lease activo y vencido se leen sin modificar el job",
      async () => {
        await db.processingJob.update({
          where: { jobId },
          data: {
            estado: "PROCESANDO",
            ownerToken: "t13-owner",
            leaseUntil: new Date("2099-01-01T00:00:00Z"),
          },
        });
        await db.processingJobPar.update({
          where: { jobId_periodoId: { jobId, periodoId: rows[3].periodoId } },
          data: { estado: "PROCESANDO" },
        });
        assert.equal(
          (await get("evaluaciones")).items[0].processingState,
          "PROCESANDO",
        );
        await db.processingJob.update({
          where: { jobId },
          data: { leaseUntil: new Date("2020-01-01T00:00:00Z") },
        });
        assert.equal(
          (await get("evaluaciones")).items[0].processingState,
          "PENDIENTE",
        );
        assert.equal(
          (await db.processingJob.findUniqueOrThrow({ where: { jobId } }))
            .estado,
          "PROCESANDO",
        );
        await db.processingJobPar.update({
          where: { jobId_periodoId: { jobId, periodoId: rows[3].periodoId } },
          data: { estado: "COMPLETADO" },
        });
        await db.processingJob.update({
          where: { jobId },
          data: { estado: "COMPLETADO", ownerToken: null, leaseUntil: null },
        });
      },
    );
    await t.test(
      "motor distinto invalida el resultado sin eliminar el índice persistido",
      async () => {
        await db.evaluacion.update({
          where: { evaluationId: oldId },
          data: { engineVersion: "cu02-obsoleto" },
        });
        const fila = (await get("evaluaciones", "&periodStart=2026-10-12"))
          .items[0];
        assert.equal(fila.actualizado, false);
        assert.equal(fila.indice, 91.21);
        assert.equal((await get("alertas")).total, 0);
        await db.evaluacion.update({
          where: { evaluationId: oldId },
          data: { engineVersion: "cu02-v1" },
        });
      },
    );
    await t.test(
      "sin evaluación y cambios de datos/antecedentes no presentan niveles actualizados",
      async () => {
        await db.periodoEmpleado.update({
          where: { periodoId: rows[1].periodoId },
          data: { evaluacionVigenteId: null },
        });
        const vacia = (await get("evaluaciones", "&periodStart=2026-10-12"))
          .items[0];
        assert.equal(vacia.nivel, null);
        assert.equal(vacia.indice, null);
        assert.equal(vacia.actualizado, false);
        await db.periodoEmpleado.update({
          where: { periodoId: rows[1].periodoId },
          data: { evaluacionVigenteId: oldId },
        });
        await db.registroLaboral.update({
          where: { recordId: rows[0].registroVigenteId! },
          data: { dataVersion: { increment: 1 } },
        });
        assert.equal((await get("evaluaciones", "&nivel=ALTO")).total, 0);
        assert.equal((await get("alertas")).total, 0);
        assert.equal((await get("resumen")).noProcesados, 2);
        await db.registroLaboral.update({
          where: { recordId: rows[0].registroVigenteId! },
          data: { dataVersion: { decrement: 1 } },
        });
      },
    );
    await t.test(
      "nuevas reglas invalidan resultados, reintento conserva historia y alerta SUPERADA",
      async () => {
        const version = await publicarConfiguracion(db, {
          ...reglasSemilla,
          version: id,
          effectiveFrom: "2026-10-12",
          createdBy: "demo-local",
          createdAt: "2026-11-10T12:00:00Z",
        });
        assert.equal((await get("evaluaciones", "&nivel=ALTO")).total, 0);
        assert.equal((await get("alertas")).total, 0);
        assert.equal((await get("resumen")).noProcesados, 3);
        await procesarImportacion(db, version.jobId);
        assert.equal((await get("alertas")).total, 1);
        const detail = await (
          await http.informe(new Request("http://localhost/"), oldId)
        ).json();
        assert.equal(detail.evaluacion.vigente, false);
        assert.equal(detail.alerta.vigencia, "SUPERADA");
      },
    );
  } finally {
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
      await tx.importacionTemporal.deleteMany({
        where: { importId: { in: imports } },
      });
      await tx.importacion.deleteMany({ where: { importId: { in: imports } } });
      await tx.processingJob.deleteMany({ where: { rulesVersion: id } });
      await tx.configuracionIndice.deleteMany({ where: { version: id } });
      await tx.empleado.deleteMany({ where: { employeeId: id } });
    });
    await db.$disconnect();
  }
});
