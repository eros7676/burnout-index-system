import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { empleadosSemilla, reglasSemilla } from "../prisma/seed-data";
import {
  COLUMNAS_CSV,
  ErrorFormatoImportacion,
  leerCsvImportacion,
} from "../src/server/services/csv-importacion";
import {
  fingerprintDatos,
  validarCsvImportacion,
  validarFilasImportacion,
  type FuenteValidacion,
  type HistoricoValidacion,
} from "../src/server/services/validacion-importacion";

const ahora = new Date("2026-10-19T12:00:00Z");
const archivo = (nombre: string) => readFileSync(`tests/data/${nombre}.csv`);
const plantilla = () => readFileSync("templates/indicadores.csv");
function fuente(historico: HistoricoValidacion[] = []): FuenteValidacion {
  return {
    empleados: async () => empleadosSemilla,
    registros: async () => historico,
    primeraVigencia: async () => reglasSemilla.effectiveFrom,
  };
}
const validar = (bytes: Uint8Array, f = fuente(), reloj = ahora) =>
  validarCsvImportacion(bytes, f, reloj);
function csv(cambios: Record<string, string> = {}) {
  const valores: Record<string, string> = {
    employee_id: "EMP-001",
    period_start: "2026-10-05",
    period_end: "2026-10-11",
    horas_extra: "16",
    dias_consecutivos_sin_descanso: "9",
    tareas_activas: "10",
    tareas_pendientes: "7",
    tareas_vencidas: "5",
    vacaciones_pendientes_dias: "14",
    horas_trabajadas: "56",
    dias_desde_ultimas_vacaciones: "120",
    ...cambios,
  };
  return Buffer.from(
    `${COLUMNAS_CSV.join(",")}\n${COLUMNAS_CSV.map((c) => valores[c]).join(",")}\n`,
  );
}

test("T05: plantilla completa válida y reimportación normalizada omitida", async () => {
  const base = await validar(plantilla());
  assert.equal(base.status, "VALIDADA");
  assert.equal(base.nuevas, 138);
  assert.equal(base.muestra.length, 10);
  const historico = base.filasNuevas.map((f) => ({
    ...f.datos,
    fingerprint: f.fingerprint,
  }));
  const repetida = await validar(
    archivo("identico_reordenado"),
    fuente(historico),
  );
  assert.equal(repetida.status, "VALIDADA");
  assert.equal(repetida.omitidas, 138);
  assert.equal(repetida.nuevas, 0);
  assert.deepEqual(repetida.filasNuevas, []);
  assert.notEqual(base.sourceHash, repetida.sourceHash);
  const conflicto = await validar(
    archivo("conflicto_historico"),
    fuente(historico),
  );
  assert.equal(conflicto.status, "RECHAZADA");
  assert.equal(conflicto.errores[0].codigo, "CONFLICTO_HISTORICO");
});

test("T05: un error bloquea todo el lote y los errores incluyen fila y campo", async () => {
  const r = await validar(archivo("invalido_una_fila"));
  assert.equal(r.status, "RECHAZADA");
  assert.equal(r.errores.length, 1);
  assert.equal(r.errores[0].campo, "tareas_vencidas");
  assert.ok(r.errores[0].fila! > 1);
  assert.deepEqual(r.filasNuevas, []);
  const varios = await validar(archivo("invalido_varios_errores"));
  for (const codigo of [
    "OBLIGATORIO",
    "NUMERO_INVALIDO",
    "RANGO_INVALIDO",
    "FECHA_INVALIDA",
    "SEMANA_INVALIDA",
    "PERIODO_ABIERTO",
    "EMPLEADO_NO_EXISTE",
    "DUPLICADO_LOTE",
  ])
    assert.ok(
      varios.errores.some((e) => e.codigo === codigo),
      codigo,
    );
  assert.equal(
    (await validar(archivo("invalido_fuera_cobertura"))).errores[0].codigo,
    "EMPLEADO_FUERA_COBERTURA",
  );
});

test("T05: warning no rechaza ni habilita filas inválidas; DS no se trunca", async () => {
  const r = await validar(archivo("con_warnings"));
  assert.equal(r.status, "VALIDADA");
  assert.ok(r.warnings.every((w) => w.codigo === "HORAS_EXTREMAS"));
  assert.equal(
    (await validar(csv({ dias_consecutivos_sin_descanso: "19" }))).muestra[0]
      .diasConsecutivosSinDescanso,
    19,
  );
  const invalida = await validar(
    csv({ horas_extra: "45", tareas_vencidas: "8" }),
  );
  assert.equal(invalida.status, "RECHAZADA");
  assert.ok(invalida.warnings.length);
  assert.deepEqual(invalida.filasNuevas, []);
  assert.equal(
    (await validar(csv({ horas_extra: "40", horas_trabajadas: "80" }))).warnings
      .length,
    0,
  );
});

test("T05: fechas reales y cierre exacto en Buenos Aires independiente de UTC", async () => {
  for (const period_start of [
    "2026-02-30",
    "2026-2-02",
    "2026-10-05T00:00:00Z",
  ])
    assert.ok(
      (await validar(csv({ period_start }))).errores.some(
        (e) => e.codigo === "FECHA_INVALIDA",
      ),
    );
  assert.ok(
    (await validar(csv({ period_end: "2026-10-18" }))).errores.some(
      (e) => e.codigo === "SEMANA_INVALIDA",
    ),
  );
  const bytes = csv({ period_start: "2026-10-12", period_end: "2026-10-18" });
  assert.equal(
    (await validar(bytes, fuente(), new Date("2026-10-19T02:59:59.999Z")))
      .status,
    "RECHAZADA",
  );
  assert.equal(
    (await validar(bytes, fuente(), new Date("2026-10-19T03:00:00Z"))).status,
    "VALIDADA",
  );
});

test("T05: semanas sin reglas de cálculo vigentes se rechazan al validar", async () => {
  // Accepted, such a week would fail in processing and block the whole job.
  const previa = await validar(
    csv({ period_start: "2025-12-29", period_end: "2026-01-04" }),
  );
  assert.equal(previa.status, "RECHAZADA");
  assert.deepEqual(
    previa.errores.map((e) => [e.campo, e.codigo]),
    [["period_start", "FECHA_INVALIDA"]],
  );
  const primera = csv({ period_start: "2026-01-05", period_end: "2026-01-11" });
  assert.equal((await validar(primera)).status, "VALIDADA");
  const sinReglas = { ...fuente(), primeraVigencia: async () => null };
  assert.equal((await validar(csv(), sinReglas)).status, "RECHAZADA");
});

test("T05: números estrictos, rangos y relaciones", async () => {
  for (const horas_extra of [
    "0x10",
    "1e2",
    "NaN",
    "Infinity",
    "=8+8",
    "169",
    "-1",
  ])
    assert.equal(
      (await validar(csv({ horas_extra }))).status,
      "RECHAZADA",
      horas_extra,
    );
  const inconsistentes: Record<string, string>[] = [
    { tareas_activas: "1.5" },
    { tareas_pendientes: "11" },
    { tareas_vencidas: "8" },
    { horas_trabajadas: "15" },
    { dias_desde_ultimas_vacaciones: "-1" },
    { tareas_activas: "2147483648" },
  ];
  for (const cambios of inconsistentes)
    assert.equal((await validar(csv(cambios))).status, "RECHAZADA");
  assert.equal(
    (await validar(csv({ employee_id: "emp-001" }))).status,
    "RECHAZADA",
  );
  const f = fuente();
  f.empleados = async () => [
    {
      employeeId: "EMP-001",
      activo: false,
      enCobertura: true,
      tipo: "TECNICO",
    },
  ];
  assert.equal(
    (await validar(csv(), f)).errores[0].codigo,
    "EMPLEADO_FUERA_COBERTURA",
  );
});

test("T05: normalización canónica, columnas reordenadas y auxiliares ausentes", async () => {
  const base = await validar(csv());
  const columnas = [...COLUMNAS_CSV].reverse();
  const originales = leerCsvImportacion(csv()).filas[0].celdas;
  const reordenado = Buffer.from(
    `\uFEFF${columnas.join(",")}\r\n${columnas.map((c) => `" ${c === "horas_extra" ? "16.0" : originales[c]} "`).join(",")}\r\n`,
  );
  assert.equal(
    (await validar(reordenado)).filasNuevas[0].fingerprint,
    base.filasNuevas[0].fingerprint,
  );
  const cortas = COLUMNAS_CSV.slice(0, 9);
  const sinAux = await validar(
    Buffer.from(
      `${cortas.join(",")}\n${cortas.map((c) => originales[c]).join(",")}\n`,
    ),
  );
  const vacios = await validar(
    csv({ horas_trabajadas: "", dias_desde_ultimas_vacaciones: "" }),
  );
  assert.equal(
    sinAux.filasNuevas[0].fingerprint,
    vacios.filasNuevas[0].fingerprint,
  );
  const cero = await validar(csv({ horas_extra: "-0" }));
  assert.equal(Object.is(cero.muestra[0].horasExtra, -0), false);
  assert.equal(
    fingerprintDatos(
      Object.fromEntries(
        Object.entries(base.muestra[0]).reverse(),
      ) as (typeof base.muestra)[0],
    ),
    base.filasNuevas[0].fingerprint,
  );
});

test("T05: cotejo puede repetirse con histórico/catálogo cambiados antes de confirmar", async () => {
  const filas = leerCsvImportacion(csv()).filas;
  const primera = await validarFilasImportacion(filas, fuente(), ahora);
  const datos = primera.filasNuevas[0].datos;
  const r = await validarFilasImportacion(
    filas,
    fuente([{ ...datos, fingerprint: "otro" }]),
    ahora,
  );
  assert.equal(r.errores[0].codigo, "CONFLICTO_HISTORICO");
  assert.deepEqual(r.filasNuevas, []);
  // The sample lists valid rows only; a conflicting row is not one.
  assert.deepEqual(r.muestra, []);
  const identica = await validarFilasImportacion(
    filas,
    fuente([{ ...datos, fingerprint: fingerprintDatos(datos) }]),
    ahora,
  );
  assert.equal(identica.omitidas, 1);
  assert.deepEqual(identica.muestra, [datos]);
});

test("T05: parser CSV, límites, vacíos, encabezados y codificación", () => {
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.from("\n,,\n"),
    Buffer.from("a,b\n1,2"),
    Buffer.from("a\0"),
    Buffer.from([0xff]),
    Buffer.alloc(5 * 1024 * 1024 + 1),
    archivo("invalido_columna_faltante"),
    archivo("invalido_columna_desconocida"),
    Buffer.from(`${COLUMNAS_CSV.join(",")},employee_id\n`),
    Buffer.from(`${COLUMNAS_CSV.join(",")}\n"sin cierre`),
    Buffer.from(`${COLUMNAS_CSV.join(",")}\nuno,dos`),
  ])
    assert.throws(() => leerCsvImportacion(bytes), ErrorFormatoImportacion);
  const cabecera = COLUMNAS_CSV.join(",");
  const filaValida = "EMP-001,2026-10-05,2026-10-11,0,0,0,0,0,0,,\n";
  assert.equal(
    leerCsvImportacion(Buffer.from(`${cabecera}\n${filaValida.repeat(1000)}`))
      .filas.length,
    1000,
  );
  assert.throws(
    () =>
      leerCsvImportacion(
        Buffer.from(`${cabecera}\n${filaValida.repeat(1001)}`),
      ),
    (e) => e instanceof ErrorFormatoImportacion && e.estadoHttp === 413,
  );
  assert.throws(
    () => leerCsvImportacion(Buffer.from(`${cabecera}\n${"x\n".repeat(1001)}`)),
    (e) => e instanceof ErrorFormatoImportacion && e.estadoHttp === 413,
  );
  const r = leerCsvImportacion(
    Buffer.from(
      `${cabecera}\n\n"EMP,""001""",2026-10-05,2026-10-11,0,0,0,0,0,0,,\n`,
    ),
  );
  assert.equal(r.filas[0].fila, 3);
  assert.equal(r.filas[0].celdas.employee_id, 'EMP,"001"');
  assert.equal(
    leerCsvImportacion(
      Buffer.from(
        `${cabecera}\n"EMP\n001",2026-10-05,2026-10-11,0,0,0,0,0,0,,\n`,
      ),
    ).filas.length,
    1,
  );
});

test("T05: duplicados internos idénticos o distintos siempre bloquean", async () => {
  const bytes = csv();
  const fila = bytes.toString().split("\n")[1];
  for (const segunda of [fila, fila.replace(",16,9,", ",17,9,")]) {
    const r = await validar(Buffer.from(`${bytes.toString()}${segunda}\n`));
    assert.equal(r.status, "RECHAZADA");
    assert.equal(r.errores[0].codigo, "DUPLICADO_LOTE");
    assert.equal(r.errores[0].fila, 3);
    assert.deepEqual(r.filasNuevas, []);
  }
});
