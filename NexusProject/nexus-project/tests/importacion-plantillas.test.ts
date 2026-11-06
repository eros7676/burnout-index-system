import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { empleadosSemilla, reglasSemilla } from "../prisma/seed-data";
import { crearHttpCu01 } from "../src/server/http/cu01";
import {
  PLANTILLA_INDICADORES_CSV,
  leerCsvImportacion,
} from "../src/server/services/csv-importacion";
import {
  PLANTILLA_TAREAS_CSV,
  leerCsvTareas,
  validarCsvTareas,
} from "../src/server/services/tareas-importacion";
import {
  PLANTILLA_JORNADAS_CSV,
  leerCsvJornadas,
  validarCsvJornadas,
} from "../src/server/services/jornadas-importacion";
import { validarCsvImportacion } from "../src/server/services/validacion-importacion";
import { PLANTILLAS_IMPORTACION } from "../src/shared/contratos/importaciones";

const ahora = new Date("2026-10-26T12:00:00Z");
const fuente = {
  empleados: async () => empleadosSemilla,
  primeraVigencia: async () => reglasSemilla.effectiveFrom,
};

test("plantillas: cada archivo de templates/ es el que ofrece la pantalla", () => {
  assert.equal(
    readFileSync("templates/tareas.csv", "utf8").replaceAll("\r\n", "\n"),
    PLANTILLA_TAREAS_CSV,
  );
  assert.equal(
    readFileSync("templates/jornadas.csv", "utf8").replaceAll("\r\n", "\n"),
    PLANTILLA_JORNADAS_CSV,
  );
});

test("plantillas: la fila de ejemplo de cada conjunto de datos es válida", async () => {
  const indicadores = await validarCsvImportacion(
    Buffer.from(PLANTILLA_INDICADORES_CSV),
    { ...fuente, registros: async () => [] },
    ahora,
  );
  assert.equal(indicadores.status, "VALIDADA", JSON.stringify(indicadores.errores));
  assert.equal(leerCsvImportacion(Buffer.from(PLANTILLA_INDICADORES_CSV)).filas.length, 1);
  // The task example is one open task due on 2026-10-09: A 1, P 1, V 1 once the week closed.
  const tareas = await validarCsvTareas(
    Buffer.from(PLANTILLA_TAREAS_CSV),
    {
      ...fuente,
      semanas: async () => [
        {
          employeeId: "EMP-001",
          periodStart: "2026-10-12",
          periodEnd: "2026-10-18",
          recordId: "r",
          periodoId: "p",
          tareasActivas: 1,
          tareasPendientes: 1,
          tareasVencidas: 1,
          huellaTareas: null,
        },
      ],
    },
    ahora,
  );
  assert.equal(tareas.status, "VALIDADA", JSON.stringify(tareas.errores));
  assert.equal(tareas.grupos[0].tareas[0].estadoCierre, "VENCIDA");
  // The day example is a week with one leave day and a rest day, then five worked days.
  const jornadas = await validarCsvJornadas(
    Buffer.from(PLANTILLA_JORNADAS_CSV),
    {
      ...fuente,
      semanas: async () => [
        {
          employeeId: "EMP-003",
          periodStart: "2026-10-12",
          periodEnd: "2026-10-18",
          recordId: "r",
          periodoId: "p",
          horasExtra: 2.5,
          horasTrabajadas: 42.5,
          diasConsecutivosSinDescanso: 5,
          diasDesdeUltimasVacaciones: 40,
          huellaJornadas: null,
        },
      ],
    },
    ahora,
  );
  assert.equal(jornadas.status, "VALIDADA", JSON.stringify(jornadas.errores));
  assert.equal(jornadas.conciliacion.filas[0].derivado.licencias, 1);
});

test("plantillas: la descarga es un CSV UTF-8 con BOM y saltos CRLF, y no abre la base", async () => {
  const db = new PrismaClient(); // No abre conexión: la descarga no consulta.
  const http = crearHttpCu01(db);
  for (const tipo of PLANTILLAS_IMPORTACION) {
    const r = await http.plantilla(new Request("http://localhost/"), tipo);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /^text\/csv; charset=utf-8/);
    assert.match(
      r.headers.get("content-disposition") ?? "",
      /^attachment; filename="plantilla-[a-z-]+\.csv"$/,
    );
    assert.equal(r.headers.get("cache-control"), "no-store");
    const bytes = new Uint8Array(await r.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "BOM for Excel");
    const texto = new TextDecoder().decode(bytes.slice(3));
    assert.ok(texto.includes("\r\n") && !/[^\r]\n/.test(texto));
    // The downloaded bytes, BOM and CRLF included, are accepted by the real parser.
    const leer =
      tipo === "tareas" ? leerCsvTareas : tipo === "jornadas" ? leerCsvJornadas : leerCsvImportacion;
    assert.equal(leer(bytes).filas.length, tipo === "jornadas" ? 7 : 1);
  }
  for (const tipo of ["desconocida", "__proto__", "constructor", ""]) {
    const r = await http.plantilla(new Request("http://localhost/"), tipo);
    assert.equal(r.status, 404, tipo);
    assert.equal((await r.json()).error.codigo, "NO_ENCONTRADO");
  }
  await db.$disconnect();
});
