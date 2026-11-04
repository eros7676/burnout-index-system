import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient, type RegistroLaboral } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import type { ParPeriodo } from "../src/shared/contracts";
import { ErrorDominio } from "../src/shared/errors";
import { fechaParaDb } from "../src/server/repositories/fechas";
import {
  alPublicarAlerta,
  asegurarAlerta,
  crearAlertaSiCorresponde,
} from "../src/server/services/alertas";
import { evaluarPeriodo } from "../src/server/services/evaluaciones";
import { construirInforme } from "../src/server/services/informes";
import { consultarFicha } from "../src/server/services/organizacion-consultas";
import { recomendacionesDe } from "../src/server/services/recomendaciones";

const hash = (valor: string) =>
  createHash("sha256").update(valor).digest("hex");
const cero = {
  horasExtra: 0,
  diasConsecutivosSinDescanso: 0,
  tareasActivas: 0,
  tareasPendientes: 0,
  tareasVencidas: 0,
  vacacionesPendientesDias: 0,
};
const conAlerta = { alPublicar: alPublicarAlerta };

type OpcionesEmpleado = {
  tipo?: "TECNICO" | "TEAM_LEAD";
  responsableId?: string | null;
};

function responsableDe(opciones?: OpcionesEmpleado): string | null {
  if (opciones && "responsableId" in opciones) return opciones.responsableId ?? null;
  return opciones?.tipo === "TEAM_LEAD" ? "GER-01" : "TL-01";
}

async function escenario(
  db: PrismaClient,
  comprobar: (s: Awaited<ReturnType<typeof crear>>) => Promise<void>,
  opciones?: OpcionesEmpleado,
) {
  const s = await crear(db, opciones);
  try {
    await comprobar(s);
  } finally {
    await db.$transaction(async (tx) => {
      const periodos = { employeeId: s.employeeId };
      await tx.alerta.deleteMany({ where: periodos });
      await tx.periodoEmpleado.updateMany({
        where: periodos,
        data: { registroVigenteId: null, evaluacionVigenteId: null },
      });
      await tx.evaluacion.updateMany({
        where: periodos,
        data: { supersedesEvaluationId: null },
      });
      await tx.evaluacion.deleteMany({ where: periodos });
      await tx.registroLaboral.updateMany({
        where: periodos,
        data: { supersedesRecordId: null },
      });
      await tx.registroLaboral.deleteMany({ where: periodos });
      await tx.periodoEmpleado.deleteMany({ where: periodos });
      await tx.importacion.delete({ where: { importId: s.importId } });
      await tx.empleado.delete({ where: { employeeId: s.employeeId } });
    });
  }
}

async function crear(db: PrismaClient, opciones?: OpcionesEmpleado) {
  const prefix = `T11-${randomUUID()}`;
  const employeeId = prefix;
  const tipo = opciones?.tipo ?? "TECNICO";
  await db.empleado.create({
    data: {
      employeeId,
      nombre: "Persona T11 ficticia",
      tipo,
      teamId: "EQ-01",
      responsableId: responsableDe(opciones),
    },
  });
  const carga = await db.importacion.create({
    data: {
      sourceName: "t11.csv",
      sourceHash: hash(prefix),
      uploadedBy: "demo-local",
      status: "CONFIRMADA",
      expiresAt: new Date("2026-10-30T00:00:00Z"),
      totalFilas: 2,
      nuevas: 2,
      omitidas: 0,
      errores: [],
      warnings: [],
    },
  });
  const fechas = [
    ["2026-10-05", "2026-10-11"],
    ["2026-10-12", "2026-10-18"],
  ] as const;
  const par = (semana: number): ParPeriodo => ({
    employeeId,
    periodStart: fechas[semana][0],
    periodEnd: fechas[semana][1],
  });
  const agregar = async (
    semana: number,
    metricas: Record<string, number> = {},
  ) => {
    const p = par(semana);
    return db.$transaction(async (tx) => {
      const periodo = await tx.periodoEmpleado.create({
        data: {
          employeeId,
          periodStart: fechaParaDb(p.periodStart),
          periodEnd: fechaParaDb(p.periodEnd),
        },
      });
      const registro = await tx.registroLaboral.create({
        data: {
          periodoId: periodo.periodoId,
          employeeId,
          sourceImportId: carga.importId,
          fingerprint: hash(`${prefix}/${semana}`),
          horasExtra: 16,
          diasConsecutivosSinDescanso: semana === 0 ? 9 : 16,
          tareasActivas: 10,
          tareasPendientes: 7,
          tareasVencidas: 5,
          vacacionesPendientesDias: 14,
          ...metricas,
        },
      });
      await tx.periodoEmpleado.update({
        where: { periodoId: periodo.periodoId },
        data: { registroVigenteId: registro.recordId },
      });
      return registro;
    });
  };
  return { prefix, employeeId, importId: carga.importId, par, agregar };
}

async function cambiarMetricas(
  db: PrismaClient,
  registro: RegistroLaboral,
  metricas = cero,
) {
  await db.$transaction(async (tx) => {
    const nueva = await tx.registroLaboral.create({
      data: {
        periodoId: registro.periodoId,
        employeeId: registro.employeeId,
        sourceImportId: registro.sourceImportId,
        dataVersion: registro.dataVersion + 1,
        fingerprint: hash(`${registro.fingerprint}/${JSON.stringify(metricas)}`),
        supersedesRecordId: registro.recordId,
        ...metricas,
      },
    });
    await tx.periodoEmpleado.update({
      where: { periodoId: registro.periodoId },
      data: { registroVigenteId: nueva.recordId },
    });
  });
}

test("MySQL T11: alerta interna única para ALTO vigente", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url);
  assert.match(new URL(url).pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  await db.$transaction((tx) => sembrarBase(tx));
  try {
    await t.test("INCOMPLETO no alerta y ALTO avisa una sola vez a TL-01", () =>
      escenario(db, async (s) => {
        await s.agregar(0);
        await s.agregar(1);
        const primera = await evaluarPeriodo(db, s.par(0), conAlerta);
        assert.equal(primera.nivel, "INCOMPLETO");
        assert.equal(primera.indice, 83.71);
        assert.equal(
          await db.alerta.count({ where: { employeeId: s.employeeId } }),
          0,
        );

        const alta = await evaluarPeriodo(db, s.par(1), conAlerta);
        assert.equal(alta.nivel, "ALTO");
        assert.equal(alta.indice, 91.21);
        const informe = await construirInforme(db, alta.evaluationId);
        assert.equal(informe.alerta?.destinatarioId, "TL-01");
        assert.equal(informe.alerta?.motivoDestinatario, "OK");
        assert.equal(informe.alerta?.canal, "INTERNO");
        assert.equal(informe.alerta?.estadoEnvio, "NO_APLICA");
        assert.equal(informe.alerta?.vigencia, "ACTIVA");
        assert.deepEqual(informe.alerta?.causas, ["HE", "DS", "CT", "VP"]);
        assert.deepEqual(
          informe.alerta?.sugerencias,
          recomendacionesDe(alta),
        );
        assert.match(informe.recomendaciones[0], /^Horas extra: 16 h extra en la semana/);
        // The person page says what the report says for its newest week.
        const ficha = await consultarFicha(db, s.employeeId, 12);
        assert.equal(ficha.semanas[0].evaluationId, alta.evaluationId);
        assert.deepEqual(ficha.recomendaciones, informe.recomendaciones);

        const repetida = await crearAlertaSiCorresponde(db, alta.evaluationId);
        await evaluarPeriodo(db, s.par(1), conAlerta);
        assert.equal(repetida?.alertId, informe.alerta?.alertId);
        assert.equal(
          await db.alerta.count({ where: { employeeId: s.employeeId } }),
          1,
        );
      }),
    );

    await t.test("creaciones concurrentes devuelven la misma alerta sin fallar", () =>
      escenario(db, async (s) => {
        await s.agregar(0);
        await s.agregar(1);
        const alta = await evaluarPeriodo(db, s.par(1));
        assert.equal(alta.nivel, "ALTO");
        // Esperar a todas antes de limpiar, incluso si una rechaza por deadlock.
        const resultados = await Promise.allSettled(
          Array.from({ length: 6 }, () =>
            crearAlertaSiCorresponde(db, alta.evaluationId),
          ),
        );
        const ids = resultados.map((resultado) => {
          if (resultado.status === "rejected") throw resultado.reason;
          assert.ok(resultado.value);
          assert.equal(resultado.value.vigencia, "ACTIVA");
          return resultado.value.alertId;
        });
        assert.equal(new Set(ids).size, 1);
        assert.equal(
          await db.alerta.count({ where: { employeeId: s.employeeId } }),
          1,
        );
      }),
    );

    await t.test("la primera semana en cero y un pico aislado no crean alerta", () =>
      escenario(db, async (s) => {
        await s.agregar(0, cero);
        await s.agregar(1);
        const primera = await evaluarPeriodo(db, s.par(0), conAlerta);
        const pico = await evaluarPeriodo(db, s.par(1), conAlerta);
        assert.equal(primera.nivel, "INCOMPLETO");
        assert.equal(pico.nivel, "MEDIO");
        assert.equal(pico.indice, 91.21);
        assert.equal(
          await crearAlertaSiCorresponde(db, pico.evaluationId),
          null,
        );
        assert.equal(
          await db.alerta.count({ where: { employeeId: s.employeeId } }),
          0,
        );
      }),
    );

    await t.test("sin responsable la alerta queda como incidencia", () =>
      escenario(
        db,
        async (s) => {
          await s.agregar(0);
          await s.agregar(1);
          await evaluarPeriodo(db, s.par(0), conAlerta);
          const alta = await evaluarPeriodo(db, s.par(1), conAlerta);
          const informe = await construirInforme(db, alta.evaluationId);
          assert.equal(informe.alerta?.destinatarioId, null);
          assert.equal(informe.alerta?.motivoDestinatario, "SIN_DESTINATARIO");
          assert.equal(informe.alerta?.canal, "INTERNO");
          assert.equal(informe.alerta?.estadoEnvio, "NO_APLICA");
          assert.equal(informe.alerta?.vigencia, "ACTIVA");
        },
        { responsableId: null },
      ),
    );

    await t.test("un Team Lead ALTO avisa a Gerencia", () =>
      escenario(
        db,
        async (s) => {
          await s.agregar(0);
          await s.agregar(1);
          await evaluarPeriodo(db, s.par(0), conAlerta);
          const alta = await evaluarPeriodo(db, s.par(1), conAlerta);
          const alerta = await crearAlertaSiCorresponde(db, alta.evaluationId);
          assert.equal(alerta?.destinatarioId, "GER-01");
          assert.equal(alerta?.motivoDestinatario, "OK");
          assert.equal(
            await db.alerta.count({ where: { employeeId: s.employeeId } }),
            1,
          );
        },
        { tipo: "TEAM_LEAD" },
      ),
    );

    await t.test("una evaluación nueva que no es ALTO supera la alerta anterior", () =>
      escenario(db, async (s) => {
        await s.agregar(0);
        const registro = await s.agregar(1);
        await evaluarPeriodo(db, s.par(0), conAlerta);
        const alta = await evaluarPeriodo(db, s.par(1), conAlerta);
        await cambiarMetricas(db, registro);
        const nueva = await evaluarPeriodo(db, s.par(1), conAlerta);
        assert.equal(nueva.nivel, "BAJO");
        assert.equal(await crearAlertaSiCorresponde(db, nueva.evaluationId), null);
        const historica = await crearAlertaSiCorresponde(db, alta.evaluationId);
        assert.equal(historica?.vigencia, "SUPERADA");
        assert.equal(historica?.alertId, (
          await db.alerta.findUniqueOrThrow({
            where: { evaluationId: alta.evaluationId },
          })
        ).alertId);
        assert.equal(
          await db.alerta.count({
            where: { employeeId: s.employeeId, vigencia: "ACTIVA" },
          }),
          0,
        );
        assert.equal(
          await db.alerta.count({ where: { employeeId: s.employeeId } }),
          1,
        );
      }),
    );

    await t.test("otro ALTO supera la alerta anterior y deja una sola ACTIVA", () =>
      escenario(db, async (s) => {
        await s.agregar(0);
        const registro = await s.agregar(1);
        const anterior = await evaluarPeriodo(db, s.par(1), conAlerta);
        await cambiarMetricas(db, registro, {
          horasExtra: 17,
          diasConsecutivosSinDescanso: 16,
          tareasActivas: 10,
          tareasPendientes: 7,
          tareasVencidas: 5,
          vacacionesPendientesDias: 14,
        });
        const nueva = await evaluarPeriodo(db, s.par(1), conAlerta);
        assert.equal(anterior.nivel, "ALTO");
        assert.equal(nueva.nivel, "ALTO");
        assert.notEqual(nueva.evaluationId, anterior.evaluationId);
        const historica = await construirInforme(db, anterior.evaluationId);
        const vigente = await construirInforme(db, nueva.evaluationId);
        assert.equal(historica.alerta?.vigencia, "SUPERADA");
        assert.equal(vigente.alerta?.vigencia, "ACTIVA");
        assert.equal(
          await db.alerta.count({ where: { employeeId: s.employeeId } }),
          2,
        );
        assert.equal(
          await db.alerta.count({
            where: { employeeId: s.employeeId, vigencia: "ACTIVA" },
          }),
          1,
        );
      }),
    );

    await t.test("un ALTO histórico sin alerta no crea una alerta tardía", () =>
      escenario(db, async (s) => {
        await s.agregar(0);
        const registro = await s.agregar(1);
        const anterior = await evaluarPeriodo(db, s.par(1));
        assert.equal(anterior.nivel, "ALTO");
        await cambiarMetricas(db, registro);
        await evaluarPeriodo(db, s.par(1), conAlerta);
        assert.equal(
          await crearAlertaSiCorresponde(db, anterior.evaluationId),
          null,
        );
        assert.equal(
          await db.alerta.count({ where: { employeeId: s.employeeId } }),
          0,
        );
      }),
    );

    await t.test("publicaciones concurrentes con T08 comparten evaluación y alerta", () =>
      escenario(db, async (s) => {
        await s.agregar(0);
        await s.agregar(1);
        const resultados = await Promise.allSettled([
          evaluarPeriodo(db, s.par(1), conAlerta),
          evaluarPeriodo(db, s.par(1), conAlerta),
        ]);
        const ids = resultados.map((resultado) => {
          if (resultado.status === "rejected") throw resultado.reason;
          assert.equal(resultado.value.nivel, "ALTO");
          return resultado.value.evaluationId;
        });
        assert.equal(new Set(ids).size, 1);
        assert.equal(
          await db.alerta.count({ where: { employeeId: s.employeeId } }),
          1,
        );
      }),
    );

    await t.test("un fallo de CU03 revierte la alerta y el reintento deja una", () =>
      escenario(db, async (s) => {
        await s.agregar(0);
        await s.agregar(1);
        await evaluarPeriodo(db, s.par(0), conAlerta);
        await assert.rejects(
          evaluarPeriodo(db, s.par(1), {
            alPublicar: async (tx, evaluacion) => {
              await asegurarAlerta(tx, evaluacion);
              throw new Error("FALLO_CU03");
            },
          }),
          /FALLO_CU03/,
        );
        assert.equal(
          await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
          1,
        );
        assert.equal(
          await db.alerta.count({ where: { employeeId: s.employeeId } }),
          0,
        );
        const alta = await evaluarPeriodo(db, s.par(1), conAlerta);
        assert.equal(alta.nivel, "ALTO");
        assert.equal(
          await db.alerta.count({ where: { employeeId: s.employeeId } }),
          1,
        );
      }),
    );

    await t.test("un identificador inexistente no fabrica una alerta", async () => {
      await assert.rejects(
        crearAlertaSiCorresponde(db, randomUUID()),
        (error: unknown) =>
          error instanceof ErrorDominio && error.codigo === "NO_ENCONTRADO",
      );
    });
  } finally {
    await db.$disconnect();
  }
});
