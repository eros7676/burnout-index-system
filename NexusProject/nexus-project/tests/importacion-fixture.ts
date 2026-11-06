// Shared scaffolding for the MySQL tests of the task and day imports and the processing events:
// one throwaway employee, the example's two weekly summaries, and the task and day detail that
// reproduce them. Not a test file (no .test suffix): scripts/test.mjs does not run it.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { crearHttpCu01 } from "../src/server/http/cu01";
import type { OpcionesImportacion } from "../src/server/services/importaciones";
import {
  COLUMNAS_TAREAS,
  type ColumnaTarea,
} from "../src/server/services/tareas-importacion";
import { COLUMNAS_JORNADAS } from "../src/server/services/jornadas-importacion";
import type {
  ResultadoImportacion,
  VistaPrevia,
} from "../src/shared/contracts";
import type {
  VistaPreviaJornadas,
  VistaPreviaTareas,
} from "../src/shared/contratos/importaciones";

const ejemplo = readFileSync("templates/ejemplo-dos-semanas.csv", "utf8");
const SEMANAS = [
  {
    inicio: "2026-10-05",
    fin: "2026-10-11",
    vence: "2026-10-09",
    tarde: "2026-10-02",
    plazo: "2026-10-15",
    hecha: "2026-10-08",
  },
  {
    inicio: "2026-10-12",
    fin: "2026-10-18",
    vence: "2026-10-16",
    tarde: "2026-10-09",
    plazo: "2026-10-23",
    hecha: "2026-10-15",
  },
];

export type FilaT = Partial<Record<ColumnaTarea, string>>;
export const csvDe = (filas: FilaT[]) =>
  `${COLUMNAS_TAREAS.join(",")}\n${filas
    .map((f) =>
      COLUMNAS_TAREAS.map((c) => {
        const v = f[c] ?? "";
        return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
      }).join(","),
    )
    .join("\n")}\n`;

/** Per week: 3 completed, 2 open on time, 5 overdue → A 10, P 7, V 5 (the example's counts). */
export function filasTareas(employeeId: string): FilaT[] {
  return SEMANAS.flatMap((w, i) =>
    Array.from({ length: 10 }, (_, n): FilaT => {
      const base: FilaT = {
        employee_id: employeeId,
        period_start: w.inicio,
        period_end: w.fin,
        task_id: `OPS-${i}${String(n).padStart(2, "0")}`,
        titulo:
          n === 0 ? 'Calibrar sensor, línea "A"' : `Revisar el nodo ${i}-${n}`,
        origen: "Mesa de ayuda",
        asignada_fecha: "2026-09-28",
      };
      if (n < 3)
        return { ...base, vencimiento_fecha: w.vence, completada_fecha: w.hecha };
      if (n < 5) return { ...base, vencimiento_fecha: w.plazo };
      return { ...base, vencimiento_fecha: w.tarde };
    }),
  );
}

/**
 * Both weeks of the example: 56 h worked, 16 of them overtime, and days without rest that run
 * past the week (9 and 16), so all seven days are worked. Monday to Friday 10 h with 2 extra,
 * the weekend 3 h, all of them extra.
 */
export function filasJornadas(employeeId: string): string[][] {
  return SEMANAS.flatMap((w) =>
    Array.from({ length: 7 }, (_, i) => {
      const fecha = new Date(Date.parse(`${w.inicio}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
      return [employeeId, w.inicio, w.fin, fecha, "TRABAJO", i < 5 ? "10" : "3", i < 5 ? "2" : "3"];
    }),
  );
}
export const csvJornadas = (filas: string[][]) =>
  `${COLUMNAS_JORNADAS.join(",")}\n${filas.map((f) => f.join(",")).join("\n")}\n`;

export async function peticion(
  manejador: (request: Request, ...ids: string[]) => Promise<Response>,
  texto: string,
  nombre = "tareas.csv",
) {
  const form = new FormData();
  form.append("file", new File([texto], nombre, { type: "text/csv" }));
  const respuesta = await manejador(
    new Request("http://localhost/api", { method: "POST", body: form }),
  );
  return { status: respuesta.status, body: await respuesta.json() };
}

const json = (cuerpo = "{}") =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: cuerpo,
  });

export async function crear(db: PrismaClient, opciones: OpcionesImportacion) {
  const employeeId = `T3-${randomUUID()}`;
  await db.empleado.create({
    data: {
      employeeId,
      nombre: "Persona ficticia T3",
      tipo: "TECNICO",
      teamId: "EQ-01",
      responsableId: "TL-01",
    },
  });
  const http = crearHttpCu01(db, opciones);
  const imports: string[] = [];
  const indicadores = ejemplo.replaceAll("EMP-001", employeeId);
  const tareas = csvDe(filasTareas(employeeId));
  const jornadas = csvJornadas(filasJornadas(employeeId));
  const registrar = (r: {
    body: { importId?: string; vistaPrevia?: { importId: string } };
  }) => {
    const id = r.body.vistaPrevia?.importId ?? r.body.importId;
    if (id) imports.push(id);
  };
  async function confirmar(id: string) {
    const r = await http.confirmar(json(), id);
    return { status: r.status, body: await r.json() };
  }
  /** The weekly summary comes first, as in production. */
  async function importarIndicadores(exigirCompletado = true) {
    const v = await peticion(http.validar, indicadores, "indicadores.csv");
    registrar(v);
    assert.equal(v.status, 200, JSON.stringify(v.body));
    const c = await confirmar((v.body as VistaPrevia).importId);
    assert.equal(c.status, 200, JSON.stringify(c.body));
    if (exigirCompletado)
      assert.equal(
        (c.body as ResultadoImportacion).procesamiento?.estado,
        "COMPLETADO",
      );
    return c.body as ResultadoImportacion;
  }
  async function validarTareas(texto = tareas) {
    const r = await peticion(http.validarTareas, texto);
    registrar(r);
    return r as {
      status: number;
      body: VistaPreviaTareas & {
        vistaPrevia?: VistaPreviaTareas;
        error?: { codigo: string };
      };
    };
  }
  async function validarJornadas(texto = jornadas) {
    const r = await peticion(http.validarJornadas, texto, "dias.csv");
    registrar(r);
    return r as {
      status: number;
      body: VistaPreviaJornadas & {
        vistaPrevia?: VistaPreviaJornadas;
        error?: { codigo: string; detalles?: { codigo: string }[] };
      };
    };
  }
  return {
    db,
    http,
    employeeId,
    imports,
    indicadores,
    tareas,
    jornadas,
    importarIndicadores,
    validarTareas,
    validarJornadas,
    confirmar,
    json,
    eventos: (accion: string) =>
      db.eventoAuditoria.findMany({
        where: { accion, correlacionId: { in: imports } },
        orderBy: { createdAt: "asc" },
      }),
  };
}

/** Runs a scenario and removes everything it created, in dependency order. */
export async function escenario(
  db: PrismaClient,
  comprobar: (s: Awaited<ReturnType<typeof crear>>) => Promise<void>,
  opciones: OpcionesImportacion = {},
) {
  const s = await crear(db, opciones);
  try {
    await comprobar(s);
  } finally {
    const importId = { in: s.imports };
    const periodos = await db.periodoEmpleado.findMany({
      where: { employeeId: s.employeeId },
    });
    const periodoId = { in: periodos.map((p) => p.periodoId) };
    const jobs = await db.processingJob.findMany({
      where: { importId },
      select: { jobId: true },
    });
    await db.$transaction(async (tx) => {
      await tx.tareaSemana.deleteMany({ where: { employeeId: s.employeeId } });
      await tx.jornadaSemana.deleteMany({ where: { employeeId: s.employeeId } });
      await tx.processingJobPar.deleteMany({
        where: { OR: [{ job: { importId } }, { periodoId }] },
      });
      await tx.processingJob.deleteMany({ where: { importId } });
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
      await tx.eventoAuditoria.deleteMany({
        where: {
          OR: [
            { correlacionId: importId },
            { recursoId: importId },
            { recursoId: { in: jobs.map((j) => j.jobId) } },
          ],
        },
      });
      await tx.empleado.delete({ where: { employeeId: s.employeeId } });
    });
  }
}

/** Removes what a set of imports created, found through the imports themselves (no employee of its own). */
export async function limpiarImportaciones(db: PrismaClient, ids: string[]) {
  const importId = { in: ids };
  const periodos = await db.periodoEmpleado.findMany({
    where: { registros: { some: { sourceImportId: importId } } },
    select: { periodoId: true },
  });
  const periodoId = { in: periodos.map((p) => p.periodoId) };
  const jobs = await db.processingJob.findMany({
    where: { importId },
    select: { jobId: true },
  });
  await db.$transaction(
    async (tx) => {
      await tx.tareaSemana.deleteMany({
        where: { OR: [{ sourceImportId: importId }, { periodoId }] },
      });
      await tx.jornadaSemana.deleteMany({
        where: { OR: [{ sourceImportId: importId }, { periodoId }] },
      });
      await tx.processingJobPar.deleteMany({
        where: { OR: [{ job: { importId } }, { periodoId }] },
      });
      await tx.processingJob.deleteMany({ where: { importId } });
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
      await tx.eventoAuditoria.deleteMany({
        where: {
          OR: [
            { correlacionId: importId },
            { recursoId: importId },
            { recursoId: { in: jobs.map((j) => j.jobId) } },
          ],
        },
      });
    },
    { timeout: 120_000 },
  );
}
