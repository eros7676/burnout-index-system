import assert from "node:assert/strict";
import { test } from "node:test";
import {
  puedeAbrirOrganizacion,
  rutaHistorial,
  rutaMiEquipo,
} from "../src/components/organizacion/rutas";
import { COLUMNAS_PERSONAS } from "../src/shared/contratos/organizacion";
import {
  claveNombre,
  lunesActual,
  sugerirCodigoEquipo,
  sugerirLegajo,
  validarAlta,
  validarBaja,
  validarCambio,
  validarDatosPersona,
  validarEquipoNuevo,
  validarLegajo,
} from "../src/server/services/organizacion-validacion";
import {
  leerCsvPersonas,
  validarFilasPersonas,
} from "../src/server/services/organizacion-csv";
import {
  promedioDesdeCentesimos,
  suprimirGrupos,
} from "../src/server/services/equipos-agregados";
import { filtrosDirectorio } from "../src/server/services/organizacion-filtros";
import { ErrorOrganizacion } from "../src/server/services/organizacion-errores";

const LUNES = "2026-11-02";
const EQUIPOS = new Map([
  ["EQ-01", { activo: true }],
  ["EQ-02", { activo: true }],
  ["EQ-09", { activo: false }],
]);
const ctx = { lunesActual: LUNES, equipos: EQUIPOS };
const alta = (cambios: Record<string, unknown> = {}) => ({
  employeeId: "EMP-046",
  nombre: "Ana Pérez",
  tipo: "TECNICO",
  teamId: "EQ-01",
  desde: LUNES,
  enCobertura: true,
  ...cambios,
});
const codigos = (errores: { campo: string | null; codigo: string }[]) =>
  errores.map((e) => `${e.campo}:${e.codigo}`).sort();

test("legajo: obligatorio, recortado, de 1 a 64 caracteres y con caracteres admitidos", () => {
  assert.equal(validarLegajo(" EMP-046 ", "employeeId").valor, "EMP-046");
  for (const valido of ["1234", "a.b_c-9", "EMP-046", "x".repeat(64)])
    assert.deepEqual(validarLegajo(valido, "employeeId").errores, [], valido);
  const casos: [unknown, string][] = [
    ["", "OBLIGATORIO"],
    ["   ", "OBLIGATORIO"],
    [undefined, "OBLIGATORIO"],
    ["x".repeat(65), "LONGITUD_EXCEDIDA"],
    ["EMP 046", "FORMATO_INVALIDO"],
    ["=EMP", "FORMATO_INVALIDO"],
    ["-EMP", "FORMATO_INVALIDO"],
    ["@EMP", "FORMATO_INVALIDO"],
    [".EMP", "FORMATO_INVALIDO"],
    ["Ñandú", "FORMATO_INVALIDO"],
    ["Directorio", "LEGAJO_RESERVADO"],
    ["IMPORTACION", "LEGAJO_RESERVADO"],
    ["opciones", "LEGAJO_RESERVADO"],
    ["New", "LEGAJO_RESERVADO"],
    ["import", "LEGAJO_RESERVADO"],
  ];
  for (const [entrada, codigo] of casos) {
    const { errores } = validarLegajo(entrada, "employeeId");
    assert.equal(errores.length, 1, String(entrada));
    assert.equal(errores[0].codigo, codigo, String(entrada));
    assert.equal(errores[0].campo, "employeeId");
  }
});

test("legajo sugerido: el siguiente de la serie EMP-NNN, conservando el ancho", () => {
  assert.equal(sugerirLegajo(["EMP-001", "EMP-045", "TL-01", "GER-01"]), "EMP-046");
  assert.equal(sugerirLegajo([]), "EMP-001");
  assert.equal(sugerirLegajo(["EMP-999"]), "EMP-1000");
  assert.equal(sugerirLegajo(["EMP-0099"]), "EMP-0100");
  // Only the exact series counts: case-sensitive, digits only.
  assert.equal(sugerirLegajo(["emp-500", "EMP-12x", "EMP-", "EMP-007"]), "EMP-008");
  // Gaps are not refilled: the next number follows the highest.
  assert.equal(sugerirLegajo(["EMP-001", "EMP-010"]), "EMP-011");
});

test("código de equipo sugerido: el siguiente EQ-NN y el formato EQ- con dos o más dígitos", () => {
  assert.equal(sugerirCodigoEquipo(["EQ-01", "EQ-02", "EQ-03", "EQ-04"]), "EQ-05");
  assert.equal(sugerirCodigoEquipo(["EQ-09"]), "EQ-10");
  assert.equal(sugerirCodigoEquipo([]), "EQ-01");
  assert.equal(sugerirCodigoEquipo(["EQ-99"]), "EQ-100");
  assert.equal(sugerirCodigoEquipo(["EQ-01", "ZZ-50", "EQ-x"]), "EQ-02");
});

test("la semana actual se calcula en hora de Buenos Aires: el domingo pertenece a la semana que termina", () => {
  // Buenos Aires is UTC-3 all year: Tuesday 03:00 UTC is Tuesday 00:00 there; 02:59 UTC is still Monday.
  assert.equal(lunesActual(new Date("2026-11-03T03:00:00Z")), "2026-11-02");
  assert.equal(lunesActual(new Date("2026-11-03T02:59:00Z")), "2026-11-02");
  assert.equal(lunesActual(new Date("2026-11-02T12:00:00Z")), "2026-11-02");
  // Monday 02:00 UTC is Sunday 23:00 in Buenos Aires.
  assert.equal(lunesActual(new Date("2026-11-02T02:00:00Z")), "2026-10-26");
  assert.equal(lunesActual(new Date("2026-11-08T20:00:00Z")), "2026-11-02");
});

test("alta: una persona válida se normaliza y no devuelve errores", () => {
  const { valor, errores } = validarAlta(alta({ nombre: "  Ana   Pérez " }), ctx);
  assert.deepEqual(errores, []);
  assert.deepEqual(valor, {
    employeeId: "EMP-046",
    nombre: "Ana Pérez",
    tipo: "TECNICO",
    teamId: "EQ-01",
    desde: LUNES,
    enCobertura: true,
  });
});

test("alta: cada error queda junto a su campo y se informan todos a la vez", () => {
  const { valor, errores } = validarAlta(
    alta({ employeeId: "", nombre: "", teamId: null, desde: "2026-11-04" }),
    ctx,
  );
  assert.equal(valor, undefined);
  assert.deepEqual(codigos(errores), [
    "desde:NO_ES_LUNES",
    "employeeId:OBLIGATORIO",
    "nombre:OBLIGATORIO",
    "teamId:OBLIGATORIO",
  ]);
  for (const e of errores) {
    assert.equal(e.fila, null);
    assert.ok(e.detalle.endsWith("."), e.detalle);
    assert.ok(!/[¡!]|por favor|inválid[oa]\b/i.test(e.detalle), e.detalle);
  }
});

test("alta: equipo inexistente o inactivo, fecha futura, tipo y nombre fuera de rango", () => {
  const casos: [Record<string, unknown>, string][] = [
    [{ teamId: "EQ-77" }, "teamId:EQUIPO_INEXISTENTE"],
    [{ teamId: "EQ-09" }, "teamId:EQUIPO_INACTIVO"],
    [{ desde: "2026-11-09" }, "desde:FECHA_FUTURA"],
    [{ desde: "2026-02-30" }, "desde:FECHA_INVALIDA"],
    [{ desde: "" }, "desde:OBLIGATORIO"],
    [{ desde: "1999-12-27" }, "desde:FECHA_INVALIDA"],
    [{ tipo: "JEFE" }, "tipo:VALOR_NO_PERMITIDO"],
    [{ nombre: "x".repeat(161) }, "nombre:LONGITUD_EXCEDIDA"],
    [{ nombre: "Ana\u0000" }, "nombre:FORMATO_INVALIDO"],
    [{ enCobertura: "si" }, "enCobertura:VALOR_NO_PERMITIDO"],
  ];
  for (const [cambio, esperado] of casos) {
    const { errores } = validarAlta(alta(cambio), ctx);
    assert.deepEqual(codigos(errores), [esperado], JSON.stringify(cambio));
  }
});

test("alta: Gerencia no pertenece a un equipo ni entra en la cobertura", () => {
  const ok = validarAlta(
    alta({ tipo: "GERENCIA", teamId: null, enCobertura: false }),
    ctx,
  );
  assert.deepEqual(ok.errores, []);
  assert.equal(ok.valor?.teamId, null);
  assert.equal(ok.valor?.enCobertura, false);
  assert.deepEqual(
    codigos(validarAlta(alta({ tipo: "GERENCIA", enCobertura: true }), ctx).errores),
    ["enCobertura:NO_APLICA", "teamId:NO_APLICA"],
  );
});

test("alta de un archivo: el error nombra la columna del CSV y la fila", () => {
  const { errores } = validarAlta(alta({ teamId: "EQ-77" }), ctx, {
    fila: 7,
    campos: { teamId: "team_id", employeeId: "employee_id" },
  });
  assert.equal(errores[0].fila, 7);
  assert.equal(errores[0].campo, "team_id");
});

test("nombres repetidos se comparan sin tildes, mayúsculas ni espacios extra", () => {
  assert.equal(claveNombre("  José   PÉREZ "), "jose perez");
  assert.equal(claveNombre("Jose Perez"), claveNombre("josé pérez"));
});

const actual = {
  tipo: "TECNICO",
  teamId: "EQ-01",
  enCobertura: true,
  desde: "2026-01-05",
  fechaIngreso: "2026-01-05",
} as const;
const cambio = (c: Record<string, unknown> = {}) => ({
  motivo: "CAMBIO_EQUIPO",
  desde: LUNES,
  tipo: "TECNICO",
  teamId: "EQ-02",
  enCobertura: true,
  ...c,
});

test("cambio de equipo: exige otro equipo activo y una fecha posterior a la asignación vigente", () => {
  const ok = validarCambio(cambio(), actual, ctx);
  assert.deepEqual(ok.errores, []);
  assert.equal(ok.valor?.motivo, "CAMBIO_EQUIPO");
  assert.equal(ok.valor?.desde, LUNES);
  const casos: [Record<string, unknown>, string][] = [
    [{ teamId: "EQ-01" }, "teamId:SIN_CAMBIOS"],
    [{ teamId: "EQ-09" }, "teamId:EQUIPO_INACTIVO"],
    [{ teamId: null }, "teamId:OBLIGATORIO"],
    [{ desde: "2026-01-05" }, "desde:FECHA_ANTERIOR"],
    [{ desde: "2025-12-29" }, "desde:FECHA_ANTERIOR"],
    [{ desde: "2026-11-03" }, "desde:NO_ES_LUNES"],
    [{ desde: "2026-11-09" }, "desde:FECHA_FUTURA"],
    [{ motivo: "BAJA" }, "motivo:VALOR_NO_PERMITIDO"],
  ];
  for (const [c, esperado] of casos)
    assert.deepEqual(
      codigos(validarCambio(cambio(c), actual, ctx).errores),
      [esperado],
      JSON.stringify(c),
    );
});

test("cambio de puesto: debe cambiar el tipo; Gerencia pierde equipo y cobertura", () => {
  const puesto = (c: Record<string, unknown> = {}) =>
    cambio({ motivo: "CAMBIO_PUESTO", teamId: "EQ-01", ...c });
  assert.deepEqual(
    validarCambio(puesto({ tipo: "TEAM_LEAD" }), actual, ctx).errores,
    [],
  );
  assert.deepEqual(codigos(validarCambio(puesto(), actual, ctx).errores), [
    "tipo:SIN_CAMBIOS",
  ]);
  const gerencia = validarCambio(
    puesto({ tipo: "GERENCIA", teamId: null, enCobertura: false }),
    actual,
    ctx,
  );
  assert.deepEqual(gerencia.errores, []);
  assert.equal(gerencia.valor?.teamId, null);
});

test("corrección: exige el motivo, edita la última asignación y no usa la fecha enviada", () => {
  assert.deepEqual(
    codigos(
      validarCambio(cambio({ motivo: "CORRECCION", teamId: "EQ-02" }), actual, ctx)
        .errores,
    ),
    ["comentario:JUSTIFICACION_OBLIGATORIA"],
  );
  const ok = validarCambio(
    cambio({
      motivo: "CORRECCION",
      desde: "2030-01-01",
      comentario: " Equipo cargado por error ",
    }),
    actual,
    ctx,
  );
  assert.deepEqual(ok.errores, []);
  assert.equal(ok.valor?.desde, actual.desde);
  assert.equal(ok.valor?.comentario, "Equipo cargado por error");
  assert.deepEqual(
    codigos(
      validarCambio(
        cambio({ motivo: "CORRECCION", teamId: "EQ-01", comentario: "x" }),
        actual,
        ctx,
      ).errores,
    ),
    ["motivo:SIN_CAMBIOS"],
  );
});

test("cambio: el comentario admite hasta 280 caracteres, los de la auditoría", () => {
  const largo = validarCambio(cambio({ comentario: "x".repeat(281) }), actual, ctx);
  assert.deepEqual(codigos(largo.errores), ["comentario:LONGITUD_EXCEDIDA"]);
  assert.equal(
    validarCambio(cambio({ comentario: "x".repeat(280) }), actual, ctx).errores.length,
    0,
  );
});

test("baja: la fecha es el último día trabajado y la asignación de baja empieza el lunes siguiente", () => {
  const ctxBaja = { hoy: "2026-11-02", desdeActual: "2026-01-05" };
  const dia = (fechaBaja: string) =>
    validarBaja({ fechaBaja, justificacion: "Renuncia" }, ctxBaja).valor;
  assert.equal(dia("2026-10-28")?.desdeBaja, "2026-11-02");
  assert.equal(dia("2026-11-01")?.desdeBaja, "2026-11-02");
  assert.equal(dia("2026-11-02")?.desdeBaja, "2026-11-09");
  assert.equal(dia("2026-01-05")?.desdeBaja, "2026-01-12");
});

test("baja: exige fecha real, no futura ni anterior a la asignación vigente, y una justificación", () => {
  const ctxBaja = { hoy: "2026-11-02", desdeActual: "2026-10-26" };
  const casos: [Record<string, unknown>, string][] = [
    [{ fechaBaja: "2026-11-03", justificacion: "x" }, "fechaBaja:FECHA_FUTURA"],
    [{ fechaBaja: "2026-10-25", justificacion: "x" }, "fechaBaja:FECHA_ANTERIOR"],
    [{ fechaBaja: "", justificacion: "x" }, "fechaBaja:OBLIGATORIO"],
    [{ fechaBaja: "2026-13-01", justificacion: "x" }, "fechaBaja:FECHA_INVALIDA"],
    [{ fechaBaja: "2026-10-30", justificacion: " " }, "justificacion:JUSTIFICACION_OBLIGATORIA"],
    [{ fechaBaja: "2026-10-30", justificacion: "x".repeat(281) }, "justificacion:LONGITUD_EXCEDIDA"],
  ];
  for (const [entrada, esperado] of casos)
    assert.deepEqual(
      codigos(validarBaja(entrada, ctxBaja).errores),
      [esperado],
      JSON.stringify(entrada),
    );
});

test("datos de la persona: nombre normalizado y fecha de ingreso no posterior a la primera asignación", () => {
  const ctxDatos = { primerDesde: "2026-01-05" };
  assert.deepEqual(
    validarDatosPersona({ nombre: " Ana  Pérez " }, ctxDatos).valor,
    { nombre: "Ana Pérez" },
  );
  assert.deepEqual(
    validarDatosPersona({ fechaIngreso: "2026-01-05" }, ctxDatos).errores,
    [],
  );
  assert.deepEqual(
    codigos(validarDatosPersona({ fechaIngreso: "2026-02-02" }, ctxDatos).errores),
    ["fechaIngreso:FECHA_POSTERIOR"],
  );
  assert.deepEqual(codigos(validarDatosPersona({ nombre: "" }, ctxDatos).errores), [
    "nombre:OBLIGATORIO",
  ]);
  assert.deepEqual(codigos(validarDatosPersona({}, ctxDatos).errores), [
    "nombre:SIN_CAMBIOS",
  ]);
  assert.equal(
    validarDatosPersona({ fechaIngreso: null }, ctxDatos).valor?.fechaIngreso,
    null,
  );
});

test("equipo nuevo: código EQ- con dos o más dígitos, nombre y líder o gerente opcionales", () => {
  const ok = validarEquipoNuevo({
    teamId: "EQ-05",
    nombre: " Equipo   Norte ",
    liderId: null,
    gerenteId: "GER-01",
  });
  assert.deepEqual(ok.errores, []);
  assert.equal(ok.valor?.nombre, "Equipo Norte");
  for (const teamId of ["EQ-5", "eq-05", "EQ-", "EQ-05a", "EQ-" + "9".repeat(70), ""])
    assert.equal(
      validarEquipoNuevo({ teamId, nombre: "N", liderId: null, gerenteId: null })
        .errores[0].campo,
      "teamId",
      teamId,
    );
  assert.equal(validarEquipoNuevo({ teamId: "EQ-100", nombre: "N" }).errores.length, 0);
  assert.deepEqual(
    codigos(validarEquipoNuevo({ teamId: "EQ-06", nombre: " " }).errores),
    ["nombre:OBLIGATORIO"],
  );
});

const csv = (...lineas: string[]) =>
  new TextEncoder().encode(lineas.join("\n") + "\n");
const CABECERA = COLUMNAS_PERSONAS.join(",");
const falla = (bytes: Uint8Array) => {
  try {
    leerCsvPersonas(bytes);
  } catch (e) {
    assert.ok(e instanceof ErrorOrganizacion);
    return e;
  }
  return assert.fail("Se esperaba un rechazo del archivo");
};

test("CSV personas-v1: lee comillas, BOM, saltos de línea y omite filas vacías", () => {
  const bytes = new TextEncoder().encode(
    `﻿${CABECERA}\r\nEMP-046,"Pérez, Ana",TECNICO,EQ-01,2026-11-02,true\r\n\r\nEMP-047,"Ana ""Anita"" Gómez",TEAM_LEAD,EQ-02,,\r\n`,
  );
  const { filas, huella } = leerCsvPersonas(bytes);
  assert.equal(huella.length, 64);
  assert.equal(filas.length, 2);
  assert.equal(filas[0].fila, 2);
  assert.equal(filas[0].celdas.nombre, "Pérez, Ana");
  assert.equal(filas[1].fila, 4);
  assert.equal(filas[1].celdas.nombre, 'Ana "Anita" Gómez');
  assert.equal(filas[1].celdas.vigente_desde, "");
});

test("CSV personas-v1: columnas opcionales pueden faltar; las obligatorias no", () => {
  const minimo = leerCsvPersonas(
    csv("employee_id,nombre,tipo,team_id", "EMP-046,Ana,TECNICO,EQ-01"),
  );
  assert.equal(minimo.filas[0].celdas.vigente_desde, undefined);
  for (const [cabecera, columna] of [
    ["nombre,tipo,team_id", "employee_id"],
    ["employee_id,tipo,team_id", "nombre"],
    ["employee_id,nombre,team_id", "tipo"],
  ]) {
    const e = falla(csv(cabecera, "a,b,c"));
    assert.equal(e.status, 400);
    assert.deepEqual(
      e.detalles.map((d) => d.campo),
      [columna],
    );
  }
});

test("CSV personas-v1: columnas desconocidas o repetidas, archivo vacío y exceso de filas o tamaño", () => {
  assert.deepEqual(
    falla(csv(`${CABECERA},sueldo`, "a,b,c,d,e,f,g")).detalles.map((d) => d.codigo),
    ["COLUMNA_DESCONOCIDA"],
  );
  assert.deepEqual(
    falla(csv(`${CABECERA},nombre`, "a,b,c,d,e,f,g")).detalles.map((d) => d.codigo),
    ["COLUMNA_REPETIDA"],
  );
  assert.equal(falla(new Uint8Array()).status, 400);
  assert.equal(falla(csv(CABECERA)).status, 400);
  const muchas = [CABECERA];
  for (let i = 0; i < 1001; i++) muchas.push(`EMP-${i},N,TECNICO,EQ-01,,`);
  assert.equal(falla(csv(...muchas)).status, 413);
  assert.equal(falla(new Uint8Array(5 * 1024 * 1024 + 1)).status, 413);
  assert.equal(falla(csv(CABECERA, "EMP-1,N,TECNICO")).status, 400);
  assert.equal(
    falla(new Uint8Array([0xff, 0xfe, 0x00])).status,
    400,
    "UTF-8 estricto",
  );
});

const existentes = new Map([
  [
    "EMP-001",
    { nombre: "Persona ficticia 001", tipo: "TECNICO", teamId: "EQ-01", enCobertura: true },
  ],
]);
const validar = (...lineas: string[]) =>
  validarFilasPersonas(leerCsvPersonas(csv(CABECERA, ...lineas)).filas, {
    lunesActual: LUNES,
    equipos: EQUIPOS,
    existentes,
    nombresExistentes: new Set([claveNombre("Persona ficticia 001")]),
  });

test("filas de personas: nuevas, omitidas por idénticas y totales", () => {
  const r = validar(
    "EMP-046,Ana Pérez,TECNICO,EQ-01,2026-11-02,true",
    "EMP-047,Luis Gómez,TEAM_LEAD,EQ-02,,",
    "EMP-001,Persona ficticia 001,TECNICO,EQ-01,,",
    "GER-02,Marta Díaz,GERENCIA,,,false",
  );
  assert.deepEqual(r.errores, []);
  assert.equal(r.nuevas.length, 3);
  assert.equal(r.omitidas, 1);
  // Empty optional cells take their defaults.
  assert.equal(r.nuevas[1].desde, LUNES);
  assert.equal(r.nuevas[1].enCobertura, true);
  assert.equal(r.nuevas[2].teamId, null);
  assert.equal(r.nuevas[2].enCobertura, false);
  assert.equal(r.nuevas[0].fila, 2);
});

test("filas de personas: error por fila y campo, con la columna del archivo", () => {
  const r = validar(
    "EMP-046,,TECNICO,EQ-01,,",
    "EMP-047,Luis,JEFE,EQ-77,2026-11-03,quizá",
    "GER-02,Marta,GERENCIA,EQ-01,,",
  );
  assert.deepEqual(
    r.errores.map((e) => `${e.fila}:${e.campo}:${e.codigo}`).sort(),
    [
      "2:nombre:OBLIGATORIO",
      "3:en_cobertura:VALOR_NO_PERMITIDO",
      "3:tipo:VALOR_NO_PERMITIDO",
      "3:vigente_desde:NO_ES_LUNES",
      "4:team_id:NO_APLICA",
    ],
  );
  assert.equal(r.nuevas.length, 0, "con errores no hay nada para importar");
});

test("filas de personas: legajo repetido en el archivo y conflicto con una persona existente", () => {
  const r = validar(
    "EMP-046,Ana,TECNICO,EQ-01,,",
    "EMP-046,Ana,TECNICO,EQ-01,,",
    "EMP-001,Otro nombre,TECNICO,EQ-01,,",
  );
  assert.deepEqual(
    r.errores.map((e) => `${e.fila}:${e.codigo}`),
    ["3:DUPLICADO_LOTE", "4:CONFLICTO_EXISTENTE"],
  );
  // Same name, other team: still another person's data, so it is a conflict and not an omission.
  assert.deepEqual(
    validar("EMP-001,Persona ficticia 001,TECNICO,EQ-02,,").errores.map((e) => e.codigo),
    ["CONFLICTO_EXISTENTE"],
  );
});

test("filas de personas: un nombre ya registrado es una advertencia y no impide importar", () => {
  const r = validar("EMP-046,Persona Ficticia 001,TECNICO,EQ-01,,");
  assert.deepEqual(r.errores, []);
  assert.equal(r.nuevas.length, 1);
  assert.deepEqual(
    r.advertencias.map((a) => `${a.fila}:${a.campo}:${a.codigo}`),
    ["2:nombre:NOMBRE_REPETIDO"],
  );
  const dentro = validar("EMP-046,Ana,TECNICO,EQ-01,,", "EMP-047,ana,TECNICO,EQ-01,,");
  assert.deepEqual(
    dentro.advertencias.map((a) => a.fila),
    [3],
  );
});

test("supresión por grupos: menos de cinco personas ocultan el equipo y un único oculto arrastra al menor visible", () => {
  const equipos = (...tamanos: number[]) =>
    tamanos.map((evaluables, i) => ({
      teamId: `EQ-0${i + 1}`,
      personasEvaluables: evaluables,
    }));
  const estados = (items: ReturnType<typeof equipos>) =>
    suprimirGrupos(items).map((e) => e.suprimido);
  assert.deepEqual(estados(equipos(12, 8, 3)), [null, "COMPLEMENTARIA", "GRUPO_PEQUENO"]);
  assert.deepEqual(estados(equipos(12, 8, 5)), [null, null, null]);
  // A team nobody belongs to holds nothing to infer, so it drags no other team with it.
  assert.deepEqual(estados(equipos(12, 8, 0)), [null, null, "GRUPO_PEQUENO"]);
  assert.deepEqual(estados(equipos(12, 4)), ["COMPLEMENTARIA", "GRUPO_PEQUENO"]);
  // Two small groups hide each other already: no further hiding.
  assert.deepEqual(estados(equipos(12, 3, 2)), [null, "GRUPO_PEQUENO", "GRUPO_PEQUENO"]);
  // A single team has no peers to infer from.
  assert.deepEqual(estados(equipos(3)), ["GRUPO_PEQUENO"]);
  assert.deepEqual(estados(equipos(5)), [null]);
  // Ties go to the first team by code, so the choice is stable.
  assert.deepEqual(estados(equipos(7, 7, 2)), ["COMPLEMENTARIA", null, "GRUPO_PEQUENO"]);
  assert.deepEqual(estados([]), []);
});

test("el promedio se suma en centésimas enteras, como el resumen", () => {
  assert.equal(promedioDesdeCentesimos(8371 + 9121, 2), 87.46);
  assert.equal(promedioDesdeCentesimos(1, 2), 0.01);
  assert.equal(promedioDesdeCentesimos(0, 0), null);
  assert.equal(promedioDesdeCentesimos(4050, 1), 40.5);
});

test("filtros del directorio: valores por defecto, límites y rechazo de lo desconocido", () => {
  const f = (query: string) => filtrosDirectorio(new URLSearchParams(query));
  assert.deepEqual(f(""), {
    page: 1,
    pageSize: 50,
    estado: "ACTIVAS",
    orden: "indice",
  });
  assert.deepEqual(
    f("periodStart=2026-10-12&teamId=EQ-01&estado=BAJAS&q=%20Ana%20&nivel=ALTO&orden=nombre&page=3&pageSize=100"),
    {
      periodStart: "2026-10-12",
      teamId: "EQ-01",
      estado: "BAJAS",
      q: "Ana",
      nivel: "ALTO",
      orden: "nombre",
      page: 3,
      pageSize: 100,
    },
  );
  assert.equal(f("nivel=DESACTUALIZADO").nivel, "DESACTUALIZADO");
  for (const mala of [
    "pageSize=101",
    "page=0",
    "page=1&page=2",
    "estado=TODAS",
    "nivel=CRITICO",
    "orden=variacion",
    "periodStart=2026-10-13",
    "teamId=a%20b",
    "q=" + "x".repeat(81),
    "employeeId=EMP-001",
  ])
    assert.throws(
      () => f(mala),
      (e: unknown) => e instanceof ErrorOrganizacion && e.status === 400,
      mala,
    );
  // A blank search is no search.
  assert.equal(f("q=%20%20").q, undefined);
});

test("rutas: solo RR. HH. abre las pantallas que escriben y el Team Lead solo la página de su equipo", () => {
  const escritura = [
    "/employees/new",
    "/employees/import",
    "/employees/EMP-001/edit",
    "/employees/EMP-001/move",
    "/employees/EMP-001/deactivate",
    "/teams/new",
    "/teams/EQ-01/edit",
    "/teams/EQ-01/lead",
    "/teams/EQ-01/deactivate",
  ];
  for (const ruta of escritura) {
    assert.equal(puedeAbrirOrganizacion("RRHH", ruta), true, ruta);
    for (const rol of ["GERENCIA", "TEAM_LEAD", "EMPLEADO"] as const)
      assert.equal(puedeAbrirOrganizacion(rol, ruta, "EQ-01"), false, `${rol} ${ruta}`);
  }
  assert.equal(puedeAbrirOrganizacion("TEAM_LEAD", "/teams/EQ-01", "EQ-01"), true);
  assert.equal(puedeAbrirOrganizacion("TEAM_LEAD", "/teams/EQ-02", "EQ-01"), false);
  assert.equal(puedeAbrirOrganizacion("TEAM_LEAD", "/teams/EQ-01", null), false);
  // Everything else is left to the sidebar map.
  for (const ruta of ["/teams", "/employees", "/employees/EMP-001", "/employees/EMP-001/weeks/2026-10-12", "/teams/EQ-01"])
    assert.equal(puedeAbrirOrganizacion("GERENCIA", ruta), null, ruta);
});

test("rutas: «Mi equipo» solo existe para un Team Lead con equipo y apunta a una página que puede abrir", () => {
  assert.equal(rutaMiEquipo("TEAM_LEAD", "EQ-01"), "/teams/EQ-01");
  assert.equal(rutaMiEquipo("TEAM_LEAD", "EQ 1/x"), "/teams/EQ%201%2Fx");
  assert.equal(rutaMiEquipo("TEAM_LEAD", null), null);
  for (const rol of ["RRHH", "GERENCIA", "EMPLEADO"] as const)
    assert.equal(rutaMiEquipo(rol, "EQ-01"), null, rol);
  assert.equal(puedeAbrirOrganizacion("TEAM_LEAD", rutaMiEquipo("TEAM_LEAD", "EQ-01")!, "EQ-01"), true);
});

test("rutas: el historial de auditoría solo se ofrece a quien tiene el permiso AUDITORIA", () => {
  assert.equal(rutaHistorial("RRHH", { sujetoId: "EMP-001" }), "/audit?sujetoId=EMP-001");
  assert.equal(rutaHistorial("GERENCIA", { equipoId: "EQ-01" }), "/audit?entidad=EQUIPO&recursoId=EQ-01");
  for (const rol of ["TEAM_LEAD", "EMPLEADO"] as const)
    assert.equal(rutaHistorial(rol, { sujetoId: "EMP-001" }), null, rol);
});
