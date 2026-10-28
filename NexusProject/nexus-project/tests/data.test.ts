import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { empleadosSemilla } from "../prisma/seed-data";

type Fila = Record<string, string>;
const leer = (ruta: string) => readFileSync(ruta, "utf8");
// Los fixtures no contienen comillas ni comas escapadas. No es el parser de T04.
function filas(ruta: string): Fila[] {
  const [cabecera, ...lineas] = leer(ruta)
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split(/\r?\n/);
  const columnas = cabecera.split(",");
  return lineas.map((linea) => {
    const celdas = linea.split(",");
    assert.equal(celdas.length, columnas.length, ruta);
    return Object.fromEntries(columnas.map((c, i) => [c, celdas[i]]));
  });
}
const datos = (nombre: string) => filas(`tests/data/${nombre}.csv`);
const plantilla = () => filas("templates/indicadores.csv");
const clave = (f: Fila) => `${f.employee_id}/${f.period_start}`;
function normalizada(f: Fila) {
  return Object.fromEntries(
    Object.entries(f).map(([k, v], i) => [
      k,
      i < 3 ? v : v === "" ? null : Number(v),
    ]),
  );
}

// Oráculo exclusivo de fixtures: fórmulas CU02 v1, sin API, Prisma ni motor T07.
function referencia(f: Fila) {
  const a = Number(f.tareas_activas);
  const ct =
    a === 0
      ? 0
      : 0.6 * (Number(f.tareas_vencidas) / a) +
        0.4 * (Number(f.tareas_pendientes) / a);
  const valores = [
    Number(f.horas_extra),
    Number(f.dias_consecutivos_sin_descanso),
    ct,
    Number(f.vacaciones_pendientes_dias),
  ];
  const umbrales = [8, 6, 0.35, 10];
  const scores = valores.map((v, i) => Math.min(100, (50 * v) / umbrales[i]));
  const i =
    0.3 * scores[0] + 0.3 * scores[1] + 0.25 * scores[2] + 0.15 * scores[3];
  return {
    indice: Math.round((i + Number.EPSILON) * 100) / 100,
    excedidos: valores.map((v, i) => v > umbrales[i]),
  };
}
function nivel(f: Fila, lote: Fila[]) {
  const fecha = new Date(`${f.period_start}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() - 7);
  const anterior = lote.find(
    (r) =>
      r.employee_id === f.employee_id &&
      r.period_start === fecha.toISOString().slice(0, 10),
  );
  if (!anterior) return "INCOMPLETO";
  const actual = referencia(f);
  const previo = referencia(anterior);
  if (actual.indice < 40) return "BAJO";
  return actual.indice >= 70 &&
    previo.indice >= 70 &&
    actual.excedidos.filter((v, i) => v && previo.excedidos[i]).length >= 2
    ? "ALTO"
    : "MEDIO";
}

test("T03: 138 filas únicas cubren exactamente el catálogo evaluable de T02", () => {
  const lote = plantilla();
  assert.equal(lote.length, 138);
  assert.equal(new Set(lote.map(clave)).size, 138);
  assert.deepEqual(
    [...new Set(lote.map((f) => f.employee_id))].sort(),
    empleadosSemilla
      .filter((e) => e.activo && e.enCobertura)
      .map((e) => e.employeeId)
      .sort(),
  );
  for (const f of lote) {
    const inicio = new Date(`${f.period_start}T00:00:00Z`);
    assert.equal(inicio.getUTCDay(), 1);
    inicio.setUTCDate(inicio.getUTCDate() + 6);
    assert.equal(inicio.toISOString().slice(0, 10), f.period_end);
    assert.ok(f.period_end < "2026-10-19");
    for (const [k, v] of Object.entries(f).slice(3)) {
      if (
        v === "" &&
        ["horas_trabajadas", "dias_desde_ultimas_vacaciones"].includes(k)
      )
        continue;
      assert.notEqual(v, "", `${clave(f)} ${k}`);
      assert.ok(
        Number.isFinite(Number(v)) && Number(v) >= 0,
        `${clave(f)} ${k}`,
      );
      if (!["horas_extra", "horas_trabajadas"].includes(k))
        assert.ok(Number.isInteger(Number(v)));
    }
    assert.ok(Number(f.tareas_vencidas) <= Number(f.tareas_pendientes));
    assert.ok(Number(f.tareas_pendientes) <= Number(f.tareas_activas));
    assert.ok(Number(f.horas_extra) <= 168);
    if (f.horas_trabajadas !== "")
      assert.ok(
        Number(f.horas_trabajadas) >= Number(f.horas_extra) &&
          Number(f.horas_trabajadas) <= 168,
      );
  }
});

test("T03: resultados de las 138 filas respetan CU02, persistencia y alertas", () => {
  const lote = plantilla();
  const esperados = datos("resultados_esperados");
  assert.equal(esperados.length, lote.length);
  assert.deepEqual(esperados.map(clave).sort(), lote.map(clave).sort());
  for (const e of esperados) {
    const f = lote.find((r) => clave(r) === clave(e))!;
    assert.equal(Number(e.indice), referencia(f).indice, clave(f));
    assert.equal(e.nivel, nivel(f, lote), clave(f));
    assert.equal(e.alerta, e.nivel === "ALTO" ? "SI" : "NO", clave(f));
  }
});

test("T03: reordenado conserva BOM, CRLF y equivalencia de contenido", () => {
  const contenido = leer("tests/data/identico_reordenado.csv");
  assert.ok(contenido.startsWith("\uFEFF"));
  assert.ok(contenido.includes("\r\n"));
  assert.ok(contenido.includes("16.0"));
  const ordenar = (lote: Fila[]) =>
    lote
      .map(normalizada)
      .sort(
        (a, b) =>
          String(a.employee_id).localeCompare(String(b.employee_id)) ||
          String(a.period_start).localeCompare(String(b.period_start)),
      );
  assert.deepEqual(ordenar(datos("identico_reordenado")), ordenar(plantilla()));
});

test("T03: la variante inválida conserva solo el error deliberado y la cobertura usa GER-01", () => {
  const original = new Map(plantilla().map((f) => [clave(f), f]));
  const invalido = datos("invalido_una_fila");
  assert.equal(invalido.length, 138);
  assert.equal(new Set(invalido.map(clave)).size, 138);
  const diferencias = invalido.filter(
    (f) =>
      JSON.stringify(normalizada(f)) !==
      JSON.stringify(normalizada(original.get(clave(f))!)),
  );
  assert.equal(diferencias.length, 1);
  assert.equal(clave(diferencias[0]), "EMP-030/2026-10-05");
  assert.ok(
    Number(diferencias[0].tareas_vencidas) >
      Number(diferencias[0].tareas_pendientes),
  );
  const fuera = datos("invalido_fuera_cobertura");
  assert.equal(fuera.length, 1);
  assert.equal(fuera[0].employee_id, "GER-01");
  assert.equal(
    empleadosSemilla.find((e) => e.employeeId === fuera[0].employee_id)
      ?.enCobertura,
    false,
  );
});

test("T03: ejemplos separados conservan ceros, contrato y llegada fuera de orden", () => {
  const ceros = datos("todo_cero");
  assert.equal(ceros.length, 2);
  assert.deepEqual(
    ceros.map((f) => f.employee_id),
    ["EMP-020", "EMP-020"],
  );
  assert.deepEqual(
    ceros.map((f) => referencia(f).indice),
    [0, 0],
  );
  assert.deepEqual(
    ceros.map((f) => nivel(f, ceros)),
    ["INCOMPLETO", "BAJO"],
  );
  const ejemplo = datos("ejemplo_contractual");
  assert.deepEqual(
    ejemplo.map((f) => referencia(f).indice),
    [83.71, 91.21],
  );
  assert.deepEqual(
    ejemplo.map((f) => nivel(f, ejemplo)),
    ["INCOMPLETO", "ALTO"],
  );
  const primera = datos("fuera_de_orden_1_semana_2026-10-12");
  const segunda = datos("fuera_de_orden_2_semana_2026-10-05");
  assert.equal(primera.length, 1);
  assert.equal(segunda.length, 1);
  assert.equal(nivel(primera[0], primera), "INCOMPLETO");
  assert.equal(nivel(primera[0], [...primera, ...segunda]), "ALTO");
  const warning = datos("con_warnings")[0];
  assert.equal(warning.horas_trabajadas, "90");
  assert.equal(warning.horas_extra, "45");
  assert.ok(!plantilla().some((f) => clave(f) === clave(warning)));
});
