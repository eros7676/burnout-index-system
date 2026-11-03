import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITE_FILAS_EXPORTACION } from "../src/shared/contratos/exportaciones";
import {
  aplicarTope,
  celdaCsv,
  filaCsv,
  flujoCsv,
  fragmentosCsv,
  protegerFormula,
  ErrorExportacion,
} from "../src/server/services/exportaciones-csv";

async function leer(flujo: ReadableStream<Uint8Array>) {
  const partes: Uint8Array[] = [];
  const lector = flujo.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value);
  }
  return Buffer.concat(partes);
}

test("CSV: el texto que empieza con =, +, -, @, tabulación o retorno de carro se neutraliza (OWASP)", () => {
  for (const peligroso of [
    "=1+1",
    "+1",
    "-1+2",
    "@SUM(A1)",
    "\t=1",
    "\r=1",
    ' =HYPERLINK("http://x")',
    "=cmd|' /C calc'!A0",
  ])
    assert.equal(protegerFormula(peligroso), `'${peligroso}`, peligroso);
  for (const seguro of ["Persona ficticia 001", "EMP-001", "2026-10-12", "", "'=ya", "a=b", "1+1"])
    assert.equal(protegerFormula(seguro), seguro, seguro);
});

test("CSV: las celdas con separador, comillas o saltos de línea se entrecomillan y las comillas se duplican (RFC 4180)", () => {
  assert.equal(celdaCsv("a;b"), '"a;b"');
  assert.equal(celdaCsv('dijo "hola"'), '"dijo ""hola"""');
  assert.equal(celdaCsv("línea 1\nlínea 2"), '"línea 1\nlínea 2"');
  assert.equal(celdaCsv("a\r\nb"), '"a\r\nb"');
  // The comma is not a separator here, so it needs no quotes.
  assert.equal(celdaCsv("Horas extras, Carga de tareas"), "Horas extras, Carga de tareas");
  // The guard and the quoting compose.
  assert.equal(celdaCsv("=a;b"), `"'=a;b"`);
});

test("CSV: los números salen con coma decimal y sin separador de miles, y no se protegen aunque sean negativos", () => {
  assert.equal(celdaCsv(91.21), "91,21");
  assert.equal(celdaCsv(0), "0");
  assert.equal(celdaCsv(1234567.5), "1234567,5");
  assert.equal(celdaCsv(-5.5), "-5,5");
  assert.equal(celdaCsv(1e-7), "0,0000001");
  assert.equal(celdaCsv(Number.NaN), "");
  assert.equal(celdaCsv(Number.POSITIVE_INFINITY), "");
});

test("CSV: vacíos y booleanos", () => {
  assert.equal(celdaCsv(null), "");
  assert.equal(celdaCsv(undefined), "");
  assert.equal(celdaCsv(true), "Sí");
  assert.equal(celdaCsv(false), "No");
  assert.equal(filaCsv(["a", 1.5, null, "b;c"]), 'a;1,5;;"b;c"');
});

test("CSV: el archivo lleva BOM, vista previa de alcance, encabezado y líneas CRLF con punto y coma", () => {
  const texto = [
    ...fragmentosCsv({
      preambulo: ["Alertas con seguimiento", "Filtros: ninguno"],
      encabezados: ["Legajo", "Persona", "Factores"],
      filas: [
        ["EMP-001", "Persona ficticia 001", "Horas extras, Carga de tareas"],
        ["EMP-002", "=EVIL()", 7.5],
      ],
    }),
  ].join("");
  assert.equal(
    texto,
    "﻿Alertas con seguimiento\r\nFiltros: ninguno\r\n\r\n" +
      "Legajo;Persona;Factores\r\n" +
      "EMP-001;Persona ficticia 001;Horas extras, Carga de tareas\r\n" +
      "EMP-002;'=EVIL();7,5\r\n",
  );
});

test("CSV: sin vista previa el encabezado queda en la primera línea, y sin filas solo hay encabezado", () => {
  const texto = [
    ...fragmentosCsv({ encabezados: ["A", "B"], filas: [] }),
  ].join("");
  assert.equal(texto, "﻿A;B\r\n");
});

test("CSV: las filas se entregan por fragmentos acotados, sin armar un único texto", () => {
  const filas = Array.from({ length: 2500 }, (_, i) => [`EMP-${i}`, i]);
  const fragmentos = [
    ...fragmentosCsv({ encabezados: ["Legajo", "N"], filas, filasPorFragmento: 1000 }),
  ];
  // BOM + header, then 1000 + 1000 + 500 rows.
  assert.equal(fragmentos.length, 4);
  assert.ok(fragmentos[0].startsWith("﻿"));
  assert.equal(fragmentos[1].split("\r\n").length - 1, 1000);
  assert.equal(fragmentos[3].split("\r\n").length - 1, 500);
});

test("CSV: el flujo de bytes empieza con el BOM UTF-8 y conserva los acentos", async () => {
  const bytes = await leer(
    flujoCsv(
      fragmentosCsv({
        encabezados: ["Persona", "Dotación"],
        filas: [["Núñez", "Revisión"]],
      }),
    ),
  );
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(
    bytes.subarray(3).toString("utf8"),
    "Persona;Dotación\r\nNúñez;Revisión\r\n",
  );
});

test("CSV: más filas que el tope se rechazan completas, no se cortan", () => {
  assert.equal(aplicarTope(Array(LIMITE_FILAS_EXPORTACION).fill(1)).length, LIMITE_FILAS_EXPORTACION);
  assert.throws(
    () => aplicarTope(Array(LIMITE_FILAS_EXPORTACION + 1).fill(1)),
    (e) =>
      e instanceof ErrorExportacion &&
      e.status === 422 &&
      /10\.000 filas/.test(e.message) &&
      /Acote los filtros/.test(e.message),
  );
});
