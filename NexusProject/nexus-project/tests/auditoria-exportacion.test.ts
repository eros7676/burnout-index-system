import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLUMNAS_CSV,
  aCsv,
  aJson,
  nombreArchivo,
  neutralizar,
  recortar,
} from "../src/server/services/auditoria-consulta-exportacion";
import type { EventoExportado } from "../src/shared/contratos/auditoria";

const evento = (cambios: Partial<EventoExportado> = {}): EventoExportado => ({
  eventoId: "e1",
  accion: "EMPLEADO_ACTUALIZADO",
  etiqueta: "Modificó los datos laborales de una persona",
  entidad: "EMPLEADO",
  recursoId: "EMP-001",
  sujetoId: "EMP-001",
  actorId: "demo-rrhh",
  actorNombre: "RR. HH.",
  actorRol: "RRHH",
  origen: "WEB",
  resultado: "EXITO",
  motivo: null,
  solicitudId: "req-1",
  correlacionId: "op-1",
  cambios: [{ campo: "teamId", antes: "EQ-01", despues: "EQ-02" }],
  justificacion: null,
  detalles: { a: 1 },
  createdAt: "2026-11-02T17:05:09.123Z",
  ...cambios,
});

/** A minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF records. */
function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entrecomillado = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entrecomillado) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') entrecomillado = false;
      else campo += c;
    } else if (c === '"') entrecomillado = true;
    else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\r" && texto[i + 1] === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
      i++;
    } else campo += c;
  }
  assert.equal(campo, "", "el archivo termina en un salto de registro");
  assert.equal(fila.length, 0);
  return filas;
}

test("B6: las celdas que Excel evaluaría como fórmulas se neutralizan", () => {
  for (const peligrosa of [
    "=1+1",
    "+SUM(A1)",
    "-2+3",
    "@SUM(1)",
    "\tcmd",
    "\rcmd",
    "\ncmd",
    "＝1+1",
    "＋1",
    "－1",
    "＠SUM(1)",
    "  =1+1",
    '=cmd|\' /C calc\'!A0',
    '=HYPERLINK("http://x","clic")',
  ])
    assert.equal(neutralizar(peligrosa), `'${peligrosa}`, JSON.stringify(peligrosa));
  for (const segura of [
    "",
    "EMP-001",
    "2026-11-02T17:05:09.123Z",
    "a=b",
    "RR. HH.",
    'x"y',
    '[{"campo":"=1"}]',
    "'=ya neutralizada",
  ])
    assert.equal(neutralizar(segura), segura, JSON.stringify(segura));
});

test("B6: el CSV es RFC 4180 con BOM, encabezado fijo y todas las celdas entrecomilladas", () => {
  const csv = aCsv([evento(), evento({ eventoId: "e2" })]);
  assert.equal(csv.charCodeAt(0), 0xfeff, "BOM para que Excel lea UTF-8");
  const filas = leerCsv(csv.slice(1));
  assert.deepEqual(filas[0], [...COLUMNAS_CSV]);
  assert.equal(filas.length, 3);
  assert.ok(filas.every((f) => f.length === COLUMNAS_CSV.length));
  assert.ok(csv.endsWith("\r\n"));
  assert.equal(csv.split("\r\n").length, 4);
  const [fila] = filas.slice(1).map((f) => Object.fromEntries(f.map((v, i) => [COLUMNAS_CSV[i], v])));
  assert.equal(fila.evento_id, "e1");
  assert.equal(fila.fecha_hora_utc, "2026-11-02T17:05:09.123Z");
  assert.equal(fila.accion, "EMPLEADO_ACTUALIZADO");
  assert.equal(fila.persona_id, "EMP-001");
  assert.equal(fila.usuario_nombre, "RR. HH.");
  assert.equal(fila.resultado, "EXITO");
  assert.equal(fila.motivo, "");
  assert.equal(fila.operacion_id, "op-1");
  assert.deepEqual(JSON.parse(fila.cambios), [
    { campo: "teamId", antes: "EQ-01", despues: "EQ-02" },
  ]);
  assert.deepEqual(JSON.parse(fila.detalles), { a: 1 });
  assert.ok(!COLUMNAS_CSV.some((c) => /nombre_(persona|recurso)/.test(c)));
});

test("B6: ninguna celda del archivo empieza con un carácter de fórmula, venga de donde venga", () => {
  const hostil = '=HYPERLINK("http://malo.example","clic")';
  const csv = aCsv([
    evento({
      actorNombre: hostil,
      justificacion: "+1",
      recursoId: "@cmd",
      actorId: "-9",
      solicitudId: "\tx",
      motivo: "=1",
      cambios: [{ campo: "nombre", antes: hostil, despues: "=2" }],
      detalles: { texto: hostil },
    }),
  ]);
  for (const fila of leerCsv(csv.slice(1)))
    for (const celda of fila)
      assert.doesNotMatch(celda, /^[=+\-@\t\r\n＝＋－＠]/, celda);
  const [, datos] = leerCsv(csv.slice(1));
  assert.equal(datos[COLUMNAS_CSV.indexOf("usuario_nombre")], `'${hostil}`);
  // Inside the JSON columns the text stays what it is: the cell starts with "[".
  assert.ok(datos[COLUMNAS_CSV.indexOf("cambios")].startsWith("["));
});

test("B6: comas, comillas y saltos de línea en los datos no rompen los registros", () => {
  const csv = aCsv([
    evento({ justificacion: 'Cierre "definitivo", sin\r\nmás casos' }),
  ]);
  const filas = leerCsv(csv.slice(1));
  assert.equal(filas.length, 2);
  assert.equal(
    filas[1][COLUMNAS_CSV.indexOf("justificacion")],
    'Cierre "definitivo", sin\r\nmás casos',
  );
});

test("B6: un archivo sin eventos conserva el encabezado", () => {
  assert.deepEqual(leerCsv(aCsv([]).slice(1)), [[...COLUMNAS_CSV]]);
});

test("B6: el tope de filas conserva las más recientes y avisa que hubo más", () => {
  const filas = [1, 2, 3, 4, 5];
  assert.deepEqual(recortar(filas, 5), { filas, truncado: false });
  assert.deepEqual(recortar(filas, 3), { filas: [1, 2, 3], truncado: true });
  assert.deepEqual(recortar([], 3), { filas: [], truncado: false });
});

test("B6: el JSON declara filtros, cantidad, tope y si quedó incompleto", () => {
  const cuerpo = aJson({
    eventos: [evento()],
    filtros: { sujetoId: "EMP-001", consultas: false },
    truncado: true,
    limite: 1,
    generadoEn: "2026-11-02T18:00:00.000Z",
  });
  assert.deepEqual(Object.keys(cuerpo), [
    "generadoEn",
    "filtros",
    "filas",
    "truncado",
    "limite",
    "eventos",
  ]);
  assert.equal(cuerpo.filas, 1);
  assert.equal(cuerpo.truncado, true);
  assert.deepEqual(cuerpo.eventos[0].cambios, [
    { campo: "teamId", antes: "EQ-01", despues: "EQ-02" },
  ]);
});

test("B6: el nombre del archivo lleva el período en UTC y solo caracteres seguros", () => {
  assert.equal(
    nombreArchivo(
      { desde: "2026-11-01T03:00:00.000Z", hasta: "2026-11-02T02:59:59.999Z" },
      "csv",
      "2026-11-02T18:00:00.000Z",
    ),
    "auditoria_20261101T030000Z_20261102T025959Z.csv",
  );
  assert.equal(
    nombreArchivo({}, "json", "2026-11-02T18:00:00.000Z"),
    "auditoria_inicio_20261102T180000Z.json",
  );
  assert.match(
    nombreArchivo({ desde: "2026-11-01T03:00:00.000Z" }, "csv", "2026-11-02T18:00:00.000Z"),
    /^[A-Za-z0-9_.-]+$/,
  );
});
