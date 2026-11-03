import assert from "node:assert/strict";
import { test } from "node:test";
import { empleadosSemilla, reglasSemilla } from "../prisma/seed-data";
import {
  ErrorFormatoImportacion,
  leerCsv,
} from "../src/server/services/csv-importacion";
import {
  COLUMNAS_TAREAS,
  derivarConteo,
  ESQUEMA_CSV_TAREAS,
  estadoAlCierre,
  huellaTareas,
  PLANTILLA_TAREAS_CSV,
  validarCsvTareas,
  type ColumnaTarea,
  type FuenteTareas,
  type RegistroSemana,
} from "../src/server/services/tareas-importacion";
import {
  MAX_ERRORES_REPORTADOS,
  MAX_FILAS_TAREAS,
} from "../src/shared/contratos/importaciones";

// Both weeks have closed at `ahora`.
const ahora = new Date("2026-10-26T12:00:00Z");
const W1 = { inicio: "2026-10-12", fin: "2026-10-18" };
const W2 = { inicio: "2026-10-05", fin: "2026-10-11" };

type FilaT = Partial<Record<ColumnaTarea, string>>;

/** A task still open at the close and not yet due: counts in A and P, not in V. */
function tarea(n: number, cambios: FilaT = {}): FilaT {
  return {
    employee_id: "EMP-001",
    period_start: W1.inicio,
    period_end: W1.fin,
    task_id: `OPS-${1000 + n}`,
    titulo: `Revisar el tablero de guardias ${n}`,
    origen: "Mesa de ayuda",
    origen_ref: "",
    asignada_fecha: "2026-10-05",
    vencimiento_fecha: "2026-10-23",
    completada_fecha: "",
    motivo_exclusion: "",
    ...cambios,
  };
}
const completada = (n: number) =>
  tarea(n, { vencimiento_fecha: "2026-10-16", completada_fecha: "2026-10-15" });
const vencida = (n: number) => tarea(n, { vencimiento_fecha: "2026-10-09" });

/** 10 tasks: 3 completed in the week, 2 open on time, 5 overdue → A 10, P 7, V 5. */
function semanaDeDiez(): FilaT[] {
  return [
    ...[1, 2, 3].map(completada),
    ...[4, 5].map((n) => tarea(n)),
    ...[6, 7, 8, 9, 10].map(vencida),
  ];
}

function csv(
  filas: FilaT[],
  columnas: readonly ColumnaTarea[] = COLUMNAS_TAREAS,
) {
  const lineas = filas.map((f) =>
    columnas
      .map((c) => {
        const v = f[c] ?? "";
        return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
      })
      .join(","),
  );
  return Buffer.from(`${columnas.join(",")}\n${lineas.join("\n")}\n`);
}

function registro(cambios: Partial<RegistroSemana> = {}): RegistroSemana {
  return {
    recordId: "rec-1",
    periodoId: "per-1",
    employeeId: "EMP-001",
    periodStart: W1.inicio,
    periodEnd: W1.fin,
    tareasActivas: 10,
    tareasPendientes: 7,
    tareasVencidas: 5,
    huellaTareas: null,
    ...cambios,
  };
}
function fuente(
  semanas: RegistroSemana[] = [registro()],
): FuenteTareas & { llamadas: { empleados: number; semanas: number } } {
  const llamadas = { empleados: 0, semanas: 0 };
  return {
    llamadas,
    empleados: async () => {
      llamadas.empleados++;
      return empleadosSemilla;
    },
    primeraVigencia: async () => reglasSemilla.effectiveFrom,
    semanas: async () => {
      llamadas.semanas++;
      return semanas;
    },
  };
}
const validar = (bytes: Uint8Array, f: FuenteTareas = fuente()) =>
  validarCsvTareas(bytes, f, ahora);

// Parser

test("tareas-v1: el encabezado exige las columnas de la plantilla y acepta las opcionales ausentes", () => {
  const sinOpcionales = COLUMNAS_TAREAS.filter(
    (c) => c !== "origen_ref" && c !== "motivo_exclusion",
  );
  const r = leerCsv(csv(semanaDeDiez(), sinOpcionales), ESQUEMA_CSV_TAREAS);
  assert.equal(r.filas.length, 10);
  assert.equal(r.filas[0].fila, 2);
  for (const faltante of [
    "task_id",
    "titulo",
    "asignada_fecha",
    "completada_fecha",
  ] as const)
    assert.throws(
      () =>
        leerCsv(
          csv(
            semanaDeDiez(),
            COLUMNAS_TAREAS.filter((c) => c !== faltante),
          ),
          ESQUEMA_CSV_TAREAS,
        ),
      (e) =>
        e instanceof ErrorFormatoImportacion &&
        e.detalles.some((d) => d.campo === faltante),
      faltante,
    );
  assert.throws(
    () =>
      leerCsv(
        Buffer.from(`${COLUMNAS_TAREAS.join(",")},estado\n`),
        ESQUEMA_CSV_TAREAS,
      ),
    ErrorFormatoImportacion,
  );
});

test("tareas-v1: la plantilla descargable se lee con el parser y los títulos admiten comas entre comillas", () => {
  const plantilla = leerCsv(
    Buffer.from(PLANTILLA_TAREAS_CSV),
    ESQUEMA_CSV_TAREAS,
  );
  assert.equal(plantilla.filas.length, 1);
  const r = leerCsv(
    csv([tarea(1, { titulo: 'Relevar el nodo "Norte", planta 2' })]),
    ESQUEMA_CSV_TAREAS,
  );
  assert.equal(r.filas[0].celdas.titulo, 'Relevar el nodo "Norte", planta 2');
});

test("tareas-v1: el tope es de 10.000 filas y se rechaza con 413", () => {
  const fila = tarea(1);
  const con = (n: number) =>
    csv(Array.from({ length: n }, (_, i) => ({ ...fila, task_id: `T-${i}` })));
  assert.equal(
    leerCsv(con(MAX_FILAS_TAREAS), ESQUEMA_CSV_TAREAS).filas.length,
    MAX_FILAS_TAREAS,
  );
  assert.throws(
    () => leerCsv(con(MAX_FILAS_TAREAS + 1), ESQUEMA_CSV_TAREAS),
    (e) => e instanceof ErrorFormatoImportacion && e.estadoHttp === 413,
  );
});

// Closing state

test("tareas-v1: estado al cierre en los límites de la semana", () => {
  const fin = W1.fin;
  const caso = (venceEl: string | null, completadaEl: string | null) =>
    estadoAlCierre({ periodEnd: fin, venceEl, completadaEl });
  // Completed on the last day of the week: closed at the close.
  assert.deepEqual(caso("2026-10-10", "2026-10-18"), {
    estadoCierre: "COMPLETADA",
    diasAtraso: null,
  });
  // Completed the next day: still open at the close, and overdue if it was due.
  assert.deepEqual(caso("2026-10-10", "2026-10-19"), {
    estadoCierre: "VENCIDA",
    diasAtraso: 8,
  });
  assert.equal(caso(null, "2026-10-19").estadoCierre, "PENDIENTE");
  // Due on the closing Sunday and open: overdue, zero days late (D5: due <= period_end).
  assert.deepEqual(caso("2026-10-18", null), {
    estadoCierre: "VENCIDA",
    diasAtraso: 0,
  });
  // Due the next Monday: not yet overdue.
  assert.deepEqual(caso("2026-10-19", null), {
    estadoCierre: "PENDIENTE",
    diasAtraso: null,
  });
  // No due date: never overdue.
  assert.deepEqual(caso(null, null), {
    estadoCierre: "PENDIENTE",
    diasAtraso: null,
  });
  assert.equal(caso("2026-10-11", null).diasAtraso, 7);
  // Completed late but inside the week: closed, not overdue.
  assert.equal(caso("2026-10-12", "2026-10-17").estadoCierre, "COMPLETADA");
});

test("tareas-v1: la fecha límite del domingo cuenta como vencida en los controles", async () => {
  const filas = [
    tarea(1, { vencimiento_fecha: W1.fin }), // due Sunday: overdue
    tarea(2, { vencimiento_fecha: "2026-10-19" }), // due Monday: on time
  ];
  const r = await validar(
    csv(filas),
    fuente([
      registro({ tareasActivas: 2, tareasPendientes: 2, tareasVencidas: 1 }),
    ]),
  );
  assert.equal(r.status, "VALIDADA");
  assert.deepEqual(r.conciliacion.filas[0].derivado, {
    activas: 2,
    pendientes: 2,
    vencidas: 1,
  });
  assert.deepEqual(
    r.grupos[0].tareas.map((t) => [t.taskId, t.estadoCierre, t.diasAtraso]),
    [
      ["OPS-1001", "VENCIDA", 0],
      ["OPS-1002", "PENDIENTE", null],
    ],
  );
  assert.deepEqual(derivarConteo(r.grupos[0].tareas), {
    activas: 2,
    pendientes: 2,
    vencidas: 1,
  });
});

// Control totals

test("tareas-v1: el detalle que reproduce el resumen se valida y queda listo para guardar", async () => {
  const r = await validar(csv(semanaDeDiez()));
  assert.equal(r.status, "VALIDADA");
  assert.deepEqual(r.errores, []);
  assert.equal(r.totalFilas, 10);
  assert.equal(r.nuevas, 10);
  assert.equal(r.omitidas, 0);
  assert.equal(r.excluidas, 0);
  assert.equal(r.semanasNuevas, 1);
  assert.deepEqual(r.conciliacion, {
    semanas: 1,
    coinciden: 1,
    diferencias: 0,
    sinResumen: 0,
    truncada: false,
    filas: [
      {
        employeeId: "EMP-001",
        periodStart: W1.inicio,
        periodEnd: W1.fin,
        tareas: 10,
        excluidas: 0,
        esperado: { activas: 10, pendientes: 7, vencidas: 5 },
        derivado: { activas: 10, pendientes: 7, vencidas: 5 },
        estado: "COINCIDE",
        yaCargada: false,
      },
    ],
  });
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].recordId, "rec-1");
  assert.equal(r.grupos[0].tareas.length, 10);
  assert.equal(r.grupos[0].huella, huellaTareas(r.grupos[0].tareas));
  assert.equal(r.muestra.length, 10);
});

test("tareas-v1: un faltante respecto del resumen rechaza todo el lote y explica a la persona", async () => {
  const filas = semanaDeDiez();
  filas.pop(); // one overdue task missing: A 9, P 6, V 4
  const r = await validar(csv(filas));
  assert.equal(r.status, "RECHAZADA");
  assert.deepEqual(r.grupos, []);
  assert.deepEqual(
    r.errores.map((e) => [e.campo, e.codigo]),
    [
      ["tareas_activas", "TAREAS_NO_COINCIDEN"],
      ["tareas_pendientes", "TAREAS_NO_COINCIDEN"],
      ["tareas_vencidas", "TAREAS_NO_COINCIDEN"],
    ],
  );
  const e = r.errores[0];
  assert.equal(e.fila, 2, "points at the first row of the employee-week");
  assert.match(e.detalle, /EMP-001/);
  assert.match(e.detalle, /12\/10\/2026/);
  assert.match(e.detalle, /10 tareas activas/);
  assert.match(e.detalle, /9/);
  assert.equal(r.conciliacion.diferencias, 1);
  assert.equal(r.conciliacion.coinciden, 0);
  assert.equal(r.conciliacion.filas[0].estado, "DIFERENCIA");
  assert.deepEqual(r.conciliacion.filas[0].derivado, {
    activas: 9,
    pendientes: 6,
    vencidas: 4,
  });
  assert.deepEqual(r.conciliacion.filas[0].esperado, {
    activas: 10,
    pendientes: 7,
    vencidas: 5,
  });
});

test("tareas-v1: una sola semana con diferencia rechaza también las semanas que coinciden", async () => {
  const dos = [
    ...semanaDeDiez(),
    ...[1, 2].map((n) =>
      tarea(100 + n, {
        employee_id: "EMP-002",
        period_start: W1.inicio,
        period_end: W1.fin,
      }),
    ),
  ];
  const r = await validar(
    csv(dos),
    fuente([
      registro(),
      registro({
        recordId: "rec-2",
        periodoId: "per-2",
        employeeId: "EMP-002",
        tareasActivas: 3,
        tareasPendientes: 3,
        tareasVencidas: 0,
      }),
    ]),
  );
  assert.equal(r.status, "RECHAZADA");
  assert.deepEqual(r.grupos, []);
  assert.equal(r.conciliacion.coinciden, 1);
  assert.equal(r.conciliacion.diferencias, 1);
  // The differences come first in the table.
  assert.equal(r.conciliacion.filas[0].employeeId, "EMP-002");
  assert.match(r.errores[0].detalle, /EMP-002/);
});

test("tareas-v1: una semana sin resumen importado se rechaza", async () => {
  const r = await validar(csv(semanaDeDiez()), fuente([]));
  assert.equal(r.status, "RECHAZADA");
  assert.deepEqual(
    r.errores.map((e) => [e.campo, e.codigo]),
    [["period_start", "SEMANA_SIN_RESUMEN"]],
  );
  assert.equal(r.conciliacion.sinResumen, 1);
  assert.equal(r.conciliacion.filas[0].esperado, null);
  assert.equal(r.conciliacion.filas[0].estado, "SIN_RESUMEN");
});

// Exclusions

test("tareas-v1: las tareas canceladas o reasignadas no cuentan ni se guardan", async () => {
  const filas = [
    ...semanaDeDiez(),
    tarea(20, { motivo_exclusion: "CANCELADA" }),
    vencida(21),
  ].map((f, i) => (i === 11 ? { ...f, motivo_exclusion: "REASIGNADA" } : f));
  const r = await validar(csv(filas));
  assert.equal(r.status, "VALIDADA", JSON.stringify(r.errores));
  assert.equal(r.totalFilas, 12);
  assert.equal(r.nuevas, 10);
  assert.equal(r.excluidas, 2);
  assert.equal(r.nuevas + r.omitidas + r.excluidas, r.totalFilas);
  assert.equal(r.grupos[0].tareas.length, 10);
  assert.ok(
    r.grupos[0].tareas.every(
      (t) => t.taskId !== "OPS-1020" && t.taskId !== "OPS-1021",
    ),
  );
  assert.equal(r.conciliacion.filas[0].excluidas, 2);
  assert.equal(r.conciliacion.filas[0].tareas, 10);
  // The detail without the exclusion marks would not reconcile: A would be 12.
  const sinMarcas = filas.map((f) => ({ ...f, motivo_exclusion: "" }));
  const rechazada = await validar(csv(sinMarcas));
  assert.equal(rechazada.status, "RECHAZADA");
  assert.equal(rechazada.errores[0].codigo, "TAREAS_NO_COINCIDEN");
});

test("tareas-v1: una semana sin tareas vigentes se concilia con ceros y queda con detalle", async () => {
  const r = await validar(
    csv([tarea(1, { motivo_exclusion: "CANCELADA" })]),
    fuente([
      registro({ tareasActivas: 0, tareasPendientes: 0, tareasVencidas: 0 }),
    ]),
  );
  assert.equal(r.status, "VALIDADA");
  assert.equal(r.nuevas, 0);
  assert.equal(r.excluidas, 1);
  assert.equal(r.semanasNuevas, 1);
  assert.equal(r.grupos[0].tareas.length, 0);
  assert.equal(r.grupos[0].huella, huellaTareas([]));
});

test("tareas-v1: el motivo de exclusión admite solo los valores definidos", async () => {
  const r = await validar(csv([tarea(1, { motivo_exclusion: "BORRADA" })]));
  assert.deepEqual(
    r.errores.map((e) => [e.fila, e.campo, e.codigo]),
    [[2, "motivo_exclusion", "VALOR_NO_PERMITIDO"]],
  );
});

// Idempotency

test("tareas-v1: el mismo detalle ya guardado se omite y uno distinto es un conflicto", async () => {
  const primera = await validar(csv(semanaDeDiez()));
  const huella = primera.grupos[0].huella;
  const igual = await validar(
    csv([...semanaDeDiez()].reverse()),
    fuente([registro({ huellaTareas: huella })]),
  );
  assert.equal(igual.status, "VALIDADA");
  assert.equal(igual.omitidas, 10);
  assert.equal(igual.nuevas, 0);
  assert.equal(igual.semanasOmitidas, 1);
  assert.deepEqual(igual.grupos, []);
  assert.equal(igual.conciliacion.filas[0].yaCargada, true);
  assert.deepEqual(igual.muestra, []);

  const distinto = await validar(
    csv(semanaDeDiez()),
    fuente([registro({ huellaTareas: "0".repeat(64) })]),
  );
  assert.equal(distinto.status, "RECHAZADA");
  assert.deepEqual(
    distinto.errores.map((e) => [e.campo, e.codigo]),
    [["employee_id", "CONFLICTO_HISTORICO"]],
  );
});

test("tareas-v1: la huella no depende del orden de las filas ni de las tareas excluidas", async () => {
  const a = await validar(csv(semanaDeDiez()));
  const b = await validar(csv([...semanaDeDiez()].reverse()));
  const c = await validar(
    csv([...semanaDeDiez(), tarea(30, { motivo_exclusion: "CANCELADA" })]),
  );
  assert.equal(a.grupos[0].huella, b.grupos[0].huella);
  assert.equal(a.grupos[0].huella, c.grupos[0].huella);
  const cambiada = semanaDeDiez();
  cambiada[0] = { ...cambiada[0], titulo: "Otro título" };
  assert.notEqual(
    a.grupos[0].huella,
    (await validar(csv(cambiada))).grupos[0].huella,
  );
});

// Row validation

test("tareas-v1: cada fila inválida informa fila, campo, código y detalle", async () => {
  const unico = async (cambios: FilaT, campo: string, codigo: string) => {
    const r = await validar(csv([tarea(1, cambios)]));
    assert.equal(r.status, "RECHAZADA");
    const errores = r.errores.filter((e) => e.codigo !== "TAREAS_NO_COINCIDEN");
    assert.equal(errores.length, 1, JSON.stringify(errores));
    assert.equal(errores[0].fila, 2);
    assert.equal(errores[0].campo, campo);
    assert.equal(errores[0].codigo, codigo);
    assert.ok(errores[0].detalle.length > 10);
  };
  await unico({ task_id: "" }, "task_id", "OBLIGATORIO");
  await unico({ task_id: "OPS 1432" }, "task_id", "FORMATO_INVALIDO");
  await unico({ task_id: "A".repeat(65) }, "task_id", "FORMATO_INVALIDO");
  await unico({ titulo: "" }, "titulo", "OBLIGATORIO");
  await unico({ titulo: "x".repeat(161) }, "titulo", "FORMATO_INVALIDO");
  await unico(
    { titulo: "Línea uno\nlínea dos" },
    "titulo",
    "FORMATO_INVALIDO",
  );
  await unico({ origen: "" }, "origen", "OBLIGATORIO");
  await unico({ origen: "x".repeat(41) }, "origen", "FORMATO_INVALIDO");
  await unico(
    { origen_ref: "x".repeat(256) },
    "origen_ref",
    "FORMATO_INVALIDO",
  );
  await unico({ asignada_fecha: "" }, "asignada_fecha", "OBLIGATORIO");
  await unico(
    { asignada_fecha: "2026-02-30" },
    "asignada_fecha",
    "FECHA_INVALIDA",
  );
  await unico(
    { vencimiento_fecha: "10/10/2026" },
    "vencimiento_fecha",
    "FECHA_INVALIDA",
  );
  await unico(
    { completada_fecha: "2026-13-01" },
    "completada_fecha",
    "FECHA_INVALIDA",
  );
  // Order of the dates.
  await unico(
    { asignada_fecha: "2026-10-19" },
    "asignada_fecha",
    "FECHA_INCOHERENTE",
  );
  await unico(
    { asignada_fecha: "2026-10-14", completada_fecha: "2026-10-13" },
    "completada_fecha",
    "FECHA_INCOHERENTE",
  );
  await unico(
    { asignada_fecha: "2026-10-01", completada_fecha: "2026-10-08" },
    "completada_fecha",
    "FECHA_INCOHERENTE",
  );
  // Employee and week come from the rules shared with indicadores-v1.
  await unico({ employee_id: "EMP-999" }, "employee_id", "EMPLEADO_NO_EXISTE");
  await unico({ period_end: "2026-10-17" }, "period_start", "SEMANA_INVALIDA");
  const abierta = await validar(
    csv([tarea(1, { period_start: "2026-10-26", period_end: "2026-11-01" })]),
  );
  assert.ok(abierta.errores.some((e) => e.codigo === "PERIODO_ABIERTO"));
});

test("tareas-v1: una tarea repetida en la misma semana de la misma persona es un duplicado", async () => {
  const r = await validar(csv([tarea(1), tarea(2, { task_id: "OPS-1001" })]));
  const dup = r.errores.filter((e) => e.codigo === "DUPLICADO_LOTE");
  assert.deepEqual(
    dup.map((e) => [e.fila, e.campo]),
    [[3, "task_id"]],
  );
  // The same task id in another week or for another person is not a duplicate.
  const otras = await validar(
    csv([
      tarea(1),
      tarea(1, { period_start: W2.inicio, period_end: W2.fin }),
      tarea(1, { employee_id: "EMP-002" }),
    ]),
    fuente([]),
  );
  assert.ok(!otras.errores.some((e) => e.codigo === "DUPLICADO_LOTE"));
});

test("tareas-v1: una fila con error no suma un descuadre a los controles de su semana", async () => {
  const filas = semanaDeDiez();
  filas[0] = { ...filas[0], completada_fecha: "2026-02-30" };
  const r = await validar(csv(filas));
  assert.equal(r.status, "RECHAZADA");
  assert.deepEqual(
    r.errores.map((e) => e.codigo),
    ["FECHA_INVALIDA"],
  );
  assert.equal(r.conciliacion.semanas, 0);
});

test("tareas-v1: un vencimiento anterior a la asignación es una advertencia, no un error", async () => {
  const filas = semanaDeDiez();
  filas[5] = {
    ...filas[5],
    asignada_fecha: "2026-10-10",
    vencimiento_fecha: "2026-10-09",
  };
  const r = await validar(csv(filas));
  assert.equal(r.status, "VALIDADA");
  assert.deepEqual(
    r.warnings.map((w) => [w.fila, w.campo, w.codigo]),
    [[7, "vencimiento_fecha", "VENCIMIENTO_ANTERIOR"]],
  );
});

// Scale

test("tareas-v1: 10.000 filas se validan con una sola lectura de catálogo y de resúmenes", async () => {
  // 1,000 people x 10 tasks, one week; the stored summaries match their rows.
  const personas = 1000;
  const filas: FilaT[] = [];
  const semanas: RegistroSemana[] = [];
  for (let p = 0; p < personas; p++) {
    const id = `EMP-${String(p + 1).padStart(4, "0")}`;
    for (let n = 1; n <= 10; n++)
      filas.push({
        ...(n <= 3 ? completada(n) : n <= 5 ? tarea(n) : vencida(n)),
        employee_id: id,
      });
    semanas.push(
      registro({ recordId: `r-${p}`, periodoId: `p-${p}`, employeeId: id }),
    );
  }
  const f = fuente(semanas);
  f.empleados = async () =>
    semanas.map((s) => ({
      employeeId: s.employeeId,
      activo: true,
      enCobertura: true,
      tipo: "TECNICO",
    }));
  const inicio = performance.now();
  const r = await validar(csv(filas), f);
  const ms = performance.now() - inicio;
  assert.equal(r.status, "VALIDADA");
  assert.equal(r.nuevas, 10_000);
  assert.equal(r.conciliacion.semanas, personas);
  assert.equal(r.conciliacion.filas.length, 100, "the table is capped");
  assert.equal(r.conciliacion.truncada, true);
  assert.equal(r.muestra.length, 10);
  assert.equal(f.llamadas.semanas, 1, "no query per row or per week");
  assert.ok(ms < 3000, `validation took ${Math.round(ms)} ms`);
});

test("tareas-v1: los errores informados tienen tope y el resto se resume", async () => {
  const filas = Array.from({ length: MAX_ERRORES_REPORTADOS + 100 }, (_, i) =>
    tarea(1, { task_id: `T-${i}`, asignada_fecha: "2026-02-30" }),
  );
  const r = await validar(csv(filas));
  assert.equal(r.status, "RECHAZADA");
  assert.equal(r.errores.length, MAX_ERRORES_REPORTADOS + 1);
  const ultimo = r.errores[r.errores.length - 1];
  assert.equal(ultimo.codigo, "ERRORES_OMITIDOS");
  assert.equal(ultimo.fila, null);
  assert.match(ultimo.detalle, /600/);
});
