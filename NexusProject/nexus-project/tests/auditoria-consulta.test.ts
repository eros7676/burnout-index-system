import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filtrosAuditoria } from "../src/server/http/auditoria";
import {
  aEvento,
  calcularCambiosReglas,
  codificarCursor,
  decodificarCursor,
  idOperacion,
} from "../src/server/services/auditoria-consulta";
import {
  ACCIONES_AUDITORIA,
  definicionAccion,
} from "../src/shared/auditoria-catalogo";
import { AUDITORIA_LIMITES } from "../src/shared/contratos/auditoria";

const filtros = (query: string, modo?: "lista" | "exportacion") =>
  filtrosAuditoria(new Request(`http://local/api/auditoria?${query}`), modo);
const LECTURAS = ACCIONES_AUDITORIA.filter(
  (a) => definicionAccion(a)?.esLectura,
);

test("B6: las consultas se ocultan por defecto y se muestran con consultas=1 o con una acción explícita", () => {
  assert.ok(LECTURAS.length >= 4, "el catálogo marca las lecturas");
  const base = filtros("");
  assert.equal(base.filtros.consultas, false);
  assert.deepEqual(base.where.accion, { notIn: LECTURAS });
  assert.equal(base.pageSize, 50);
  assert.equal(base.cursor, null);
  assert.equal(filtros("consultas=1").where.accion, undefined);
  assert.equal(filtros("consultas=0").filtros.consultas, false);
  // Asking for a consultation by name must not come back empty.
  assert.equal(
    filtros("accion=INFORME_CONSULTADO").where.accion,
    "INFORME_CONSULTADO",
  );
});

test("B6: cada filtro del §4 llega al where con su columna", () => {
  const { where } = filtros(
    "entidad=EMPLEADO&accion=EMPLEADO_ACTUALIZADO&recursoId=EMP-001&sujetoId=EMP-001" +
      "&actorId=demo-rrhh&correlacionId=op-1&solicitudId=req-1&resultado=DENEGADO&origen=CLI",
  );
  assert.deepEqual(where, {
    entidad: "EMPLEADO",
    accion: "EMPLEADO_ACTUALIZADO",
    recursoId: "EMP-001",
    sujetoId: "EMP-001",
    actorId: "demo-rrhh",
    correlacionId: "op-1",
    solicitudId: "req-1",
    resultado: "DENEGADO",
    origen: "CLI",
  });
});

test("B6: el código exacto busca en las cuatro columnas indexadas", () => {
  const { where } = filtros("q=EMP-001&consultas=1");
  assert.deepEqual(where.OR, [
    { recursoId: "EMP-001" },
    { sujetoId: "EMP-001" },
    { correlacionId: "EMP-001" },
    { solicitudId: "EMP-001" },
  ]);
});

test("B6: el período usa extremos inclusivos en UTC", () => {
  const { where, filtros: f } = filtros(
    "desde=2026-11-01T03:00:00.000Z&hasta=2026-11-02T02:59:59.999Z&consultas=1",
  );
  assert.deepEqual(where.createdAt, {
    gte: new Date("2026-11-01T03:00:00.000Z"),
    lte: new Date("2026-11-02T02:59:59.999Z"),
  });
  assert.equal(f.desde, "2026-11-01T03:00:00.000Z");
});

test("B6: rechaza filtros desconocidos, repetidos, fuera de catálogo o mal formados", () => {
  for (const q of [
    "page=1",
    "resultado=OTRO",
    "origen=TELEFONO",
    "consultas=2",
    "consultas=1&consultas=0",
    "pageSize=0",
    "pageSize=101",
    "cursor=no-es-un-cursor",
    "solicitudId=" + "x".repeat(37),
    "q=" + "x".repeat(65),
    "q=a%00b",
    "sujetoId=",
    "accion=BORRAR_TODO",
    "entidad=USUARIO",
    "desde=2026-02-30T00:00:00.000Z",
    "desde=2026-11-02T00:00:00.000Z&hasta=2026-11-01T00:00:00.000Z",
  ])
    assert.throws(() => filtros(q), /./, q);
});

test("B6: los mensajes de error están en registro formal, sin voseo", () => {
  const mensajes: string[] = [];
  for (const q of [
    "desde=hoy",
    "cursor=x",
    "pageSize=500",
    "sujetoId=",
    "resultado=OTRO",
    "x=1",
  ])
    try {
      filtros(q);
    } catch (error) {
      mensajes.push((error as Error).message);
    }
  assert.equal(mensajes.length, 6);
  for (const m of mensajes)
    assert.doesNotMatch(m, /\b(usá|elegí|probá|volvé|revisá|podés)\b/i, m);
  assert.match(
    mensajes[0],
    /^Las fechas deben estar en UTC, en formato ISO 8601 con milisegundos\.$/,
  );
});

test("B6: la exportación pide formato y no admite cursor ni tamaño de página", () => {
  const e = filtros("formato=csv&sujetoId=EMP-001", "exportacion");
  assert.equal(e.formato, "csv");
  assert.equal(e.filtros.sujetoId, "EMP-001");
  assert.equal(filtros("formato=json", "exportacion").formato, "json");
  for (const q of ["", "formato=xml", "formato=csv&cursor=x", "formato=csv&pageSize=10"])
    assert.throws(() => filtros(q, "exportacion"), /./, q);
  assert.throws(() => filtros("formato=csv"), /./, "la lista no admite formato");
});

test("B6: el cursor conserva la posición y rechaza lo manipulado", () => {
  const cursor = {
    createdAt: new Date("2026-11-02T17:05:09.123Z"),
    eventoId: "cmv-abc_123",
  };
  const texto = codificarCursor(cursor);
  assert.match(texto, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodificarCursor(texto), cursor);
  const via = filtros(`cursor=${texto}&consultas=1`);
  assert.deepEqual(via.cursor, cursor);
  for (const malo of [
    "",
    "abc",
    Buffer.from("no-fecha|id").toString("base64url"),
    Buffer.from("2026-02-30T00:00:00.000Z|id").toString("base64url"),
    Buffer.from("2026-11-02T17:05:09.123Z|id con espacios").toString("base64url"),
    Buffer.from("2026-11-02T17:05:09.123Z|").toString("base64url"),
  ])
    assert.throws(() => decodificarCursor(malo), /Cursor/, malo);
});

test("B6: el evento lleva la etiqueta del catálogo y los nombres resueltos", () => {
  const fila = {
    eventoId: "e1",
    clave: "interna",
    accion: "EMPLEADO_ACTUALIZADO",
    entidad: "EMPLEADO",
    recursoId: "EMP-001",
    sujetoId: "EMP-001",
    actorId: "demo-rrhh",
    actorNombre: "RR. HH.",
    actorRol: "RRHH",
    origen: "WEB" as const,
    resultado: "EXITO" as const,
    motivo: null,
    solicitudId: "req-1",
    correlacionId: null,
    cambios: [{ campo: "teamId", antes: "EQ-01", despues: "EQ-02" }],
    justificacion: null,
    detalles: { a: 1 },
    createdAt: new Date("2026-11-02T17:05:09.123Z"),
  };
  const evento = aEvento(fila, {
    personas: new Map([["EMP-001", "Persona ficticia 001"]]),
    equipos: new Map(),
  });
  assert.equal(evento.etiqueta, definicionAccion("EMPLEADO_ACTUALIZADO")!.etiqueta);
  assert.equal(evento.createdAt, "2026-11-02T17:05:09.123Z");
  assert.equal(evento.sujetoNombre, "Persona ficticia 001");
  assert.equal(evento.recursoNombre, "Persona ficticia 001");
  assert.ok(!("clave" in evento), "la clave de deduplicación no se expone");
  // A code the catalog no longer knows is shown, not hidden.
  assert.equal(aEvento({ ...fila, accion: "ANTIGUA" }).etiqueta, null);
  // Equipos resolve their own name.
  assert.equal(
    aEvento(
      { ...fila, entidad: "EQUIPO", recursoId: "EQ-01", sujetoId: null },
      { personas: new Map(), equipos: new Map([["EQ-01", "Célula ficticia 1"]]) },
    ).recursoNombre,
    "Célula ficticia 1",
  );
});

test("B6: los eventos sin operación de importaciones y reglas toman su recurso como operación", () => {
  const base = { correlacionId: null, recursoId: "imp-1" };
  assert.equal(idOperacion({ ...base, entidad: "IMPORTACION" }), "imp-1");
  assert.equal(idOperacion({ ...base, entidad: "REGLAS" }), "imp-1");
  assert.equal(idOperacion({ ...base, entidad: "EMPLEADO" }), null);
  assert.equal(
    idOperacion({ ...base, entidad: "IMPORTACION", correlacionId: "op" }),
    "op",
  );
});

test("B6: la diferencia de dos versiones de reglas lista solo los campos distintos", () => {
  const v1 = {
    effectiveFrom: "2026-01-05",
    weights: { HE: 0.3, DS: 0.3, CT: 0.25, VP: 0.15 },
    thresholds: { HE: 8, DS: 6, CT: 0.35, VP: 10 },
    mediumLimit: 40,
    highLimit: 70,
    minExceededFactors: 2,
    windowDays: 7,
    persistencePeriods: 2,
  };
  const v2 = {
    ...v1,
    effectiveFrom: "2026-10-12",
    weights: { HE: 0.25, DS: 0.3, CT: 0.3, VP: 0.15 },
    highLimit: 72,
  };
  assert.deepEqual(calcularCambiosReglas(v1, v2), [
    { campo: "effectiveFrom", antes: "2026-01-05", despues: "2026-10-12" },
    { campo: "weights.HE", antes: 0.3, despues: 0.25 },
    { campo: "weights.CT", antes: 0.25, despues: 0.3 },
    { campo: "highLimit", antes: 70, despues: 72 },
  ]);
  assert.deepEqual(calcularCambiosReglas(v1, v1), []);
});

test("B6: cada manejador del runtime exige el permiso que le corresponde", () => {
  const codigo = readFileSync("src/server/http/auditoria-runtime.ts", "utf8");
  assert.match(codigo, /^ {2}listar: proteger\(prisma, "AUDITORIA"/m);
  assert.match(codigo, /^ {2}detalle: proteger\(prisma, "AUDITORIA"/m);
  assert.match(codigo, /^ {2}operacion: proteger\(prisma, "AUDITORIA"/m);
  assert.match(codigo, /^ {2}exportar: proteger\(prisma, "EXPORTAR"/m);
});

test("B6: los límites de lectura son los de la investigación", () => {
  assert.equal(AUDITORIA_LIMITES.exportacionMaxFilas, 10_000);
});
