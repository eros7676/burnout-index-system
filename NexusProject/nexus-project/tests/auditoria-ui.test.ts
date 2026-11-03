import assert from "node:assert/strict";
import { test } from "node:test";
import {
  etiquetaCampo,
  filasDeCambios,
  textoDato,
} from "../src/components/auditoria/cambios";
import {
  consultaDe,
  nombreDeDescarga,
} from "../src/components/auditoria/cliente";
import {
  cantidadEventos,
  chipsDeCodigos,
  detalles,
  elemento,
  enlacePersona,
  enlaceRecurso,
  etiquetaAccion,
  etiquetaMotivo,
  etiquetaOrigen,
  fechaHora,
  gruposDeAcciones,
  nombreActor,
  nombrePersona,
  resumen,
  rolActor,
} from "../src/components/auditoria/eventos";
import {
  FILTROS_INICIALES,
  conCambio,
  enlaceDetalle,
  enlaceOperacion,
  filtrosDeUrl,
  filtrosParaApi,
  hayFiltros,
  rangoInvertido,
  rutaDeRetorno,
  rutaLista,
  urlDeFiltros,
} from "../src/components/auditoria/filtros-url";
import { CATALOGO_AUDITORIA } from "../src/shared/auditoria-catalogo";
import { ROL } from "../src/shared/formato";
import type { EventoAuditoria } from "../src/shared/contracts";

const evento = (cambios: Partial<EventoAuditoria> = {}): EventoAuditoria => ({
  eventoId: "e1",
  accion: "EMPLEADO_ACTUALIZADO",
  etiqueta: "Modificó los datos laborales de una persona",
  entidad: "EMPLEADO",
  recursoId: "EMP-001",
  sujetoId: "EMP-001",
  actorId: "demo-rrhh",
  actorNombre: "Analista",
  actorRol: "RRHH",
  origen: "WEB",
  resultado: "EXITO",
  motivo: null,
  solicitudId: "req-1",
  correlacionId: null,
  cambios: null,
  justificacion: null,
  detalles: {},
  createdAt: "2026-11-02T17:05:09.123Z",
  recursoNombre: "Persona ficticia 001",
  sujetoNombre: "Persona ficticia 001",
  ...cambios,
});
const usuarios = [
  { userId: "demo-rrhh", nombre: "Usuario del directorio", rol: "RRHH" as const },
];

test("B6: la fecha se lee con año y segundos en la zona de Buenos Aires", () => {
  assert.equal(fechaHora("2026-11-02T17:05:09.123Z"), "2 nov 2026, 14:05:09");
  // Midnight UTC is still the evening before in Buenos Aires.
  assert.equal(fechaHora("2026-11-03T01:00:00.000Z"), "2 nov 2026, 22:00:00");
});

test("B6: el usuario sale del registro del evento y, si falta, del directorio", () => {
  assert.equal(nombreActor(evento(), usuarios), "Analista");
  const antiguo = evento({ actorNombre: null, actorRol: null });
  assert.equal(nombreActor(antiguo, usuarios), "Usuario del directorio");
  assert.equal(rolActor(antiguo, usuarios), ROL.RRHH);
  const sistema = evento({ actorId: "rules-publish", actorNombre: null, actorRol: null });
  assert.equal(nombreActor(sistema, usuarios), "Sistema");
  assert.equal(rolActor(sistema, usuarios), null);
  assert.equal(rolActor(evento(), usuarios), ROL.RRHH);
});

test("B6: origen y motivo se muestran con palabras, sin códigos", () => {
  assert.equal(etiquetaOrigen("WEB"), "Aplicación web");
  assert.equal(etiquetaOrigen("CLI"), "Línea de comandos");
  assert.equal(etiquetaOrigen("SISTEMA"), "Sistema");
  assert.equal(etiquetaOrigen(null), "No registrado");
  assert.equal(etiquetaMotivo("SIN_PERMISO"), "Sin permiso para la operación");
  assert.equal(etiquetaMotivo(null), null);
  // A reason the catalog does not know is humanized, never dropped.
  assert.equal(etiquetaMotivo("NUEVO_MOTIVO"), "Nuevo motivo");
});

test("B6: el elemento y la persona enlazan solo a pantallas que existen", () => {
  assert.equal(enlaceRecurso(evento()), "/employees/EMP-001");
  assert.equal(
    enlaceRecurso(evento({ entidad: "INFORME", recursoId: "ev-1" })),
    "/reports/ev-1",
  );
  assert.equal(
    enlaceRecurso(evento({ entidad: "EQUIPO", recursoId: "EQ-01" })),
    "/teams/EQ-01",
  );
  for (const entidad of ["IMPORTACION", "REGLAS", "ACCESO", "SESION"])
    assert.equal(enlaceRecurso(evento({ entidad })), null, entidad);
  assert.equal(enlacePersona(evento()), "/employees/EMP-001");
  assert.equal(enlacePersona(evento({ sujetoId: null })), null);
  // Codes are encoded, never trusted.
  assert.equal(
    enlaceRecurso(evento({ recursoId: "a/b?c" })),
    "/employees/a%2Fb%3Fc",
  );
});

test("B6: el elemento muestra el tipo, el nombre cuando se conoce y siempre el código", () => {
  assert.deepEqual(elemento(evento()), {
    tipo: "Persona",
    nombre: "Persona ficticia 001",
    codigo: "EMP-001",
  });
  assert.deepEqual(
    elemento(
      evento({ entidad: "REGLAS", recursoId: "v2", recursoNombre: null }),
    ),
    { tipo: "Reglas del índice", nombre: "Versión v2", codigo: "v2" },
  );
  assert.deepEqual(
    elemento(evento({ entidad: "IMPORTACION", recursoId: "imp-1", recursoNombre: null })),
    { tipo: "Importación", nombre: null, codigo: "imp-1" },
  );
});

test("B6: los cambios se leen como campo, antes y después, solo con lo modificado", () => {
  assert.deepEqual(filasDeCambios(null), []);
  assert.deepEqual(filasDeCambios([]), []);
  assert.deepEqual(
    filasDeCambios([
      { campo: "teamId", antes: "EQ-01", despues: "EQ-02" },
      { campo: "activo", antes: true, despues: false },
      { campo: "tipo", antes: "TECNICO", despues: "TEAM_LEAD" },
      { campo: "responsableId", antes: null, despues: "TL-02" },
      { campo: "weights.HE", antes: 0.3, despues: 0.25 },
      { campo: "thresholds.HE", antes: 8, despues: 10 },
      { campo: "highLimit", antes: 70, despues: 72.5 },
      { campo: "effectiveFrom", antes: "2026-01-05", despues: "2026-10-12" },
      { campo: "campoNuevo", antes: ["a", "b"], despues: { x: 1 } },
    ]),
    [
      { campo: "Equipo", antes: "EQ-01", despues: "EQ-02" },
      { campo: "Activo", antes: "Sí", despues: "No" },
      { campo: "Tipo", antes: "Técnico", despues: "Team Lead" },
      { campo: "Responsable", antes: "—", despues: "TL-02" },
      { campo: "Peso de Horas extra", antes: "30 %", despues: "25 %" },
      { campo: "Umbral de Horas extra", antes: "8 h", despues: "10 h" },
      { campo: "Límite de Alto", antes: "70", despues: "72,5" },
      { campo: "Vigente desde", antes: "5 ene 2026", despues: "12 oct 2026" },
      { campo: "Campo nuevo", antes: "a, b", despues: '{"x":1}' },
    ],
  );
  assert.equal(etiquetaCampo("weights"), "Pesos");
  assert.equal(textoDato("x", undefined), "—");
  assert.equal(textoDato("x", ""), "—");
});

test("B6: los detalles siguen leyéndose con las palabras de siempre", () => {
  assert.deepEqual(
    detalles(evento({ detalles: { insertados: 2, omitidos: 0, jobId: "job-1" } })),
    [
      { clave: "Guardadas", valor: "2" },
      { clave: "Omitidas", valor: "0" },
      { clave: "Procesamiento", valor: "job-1" },
    ],
  );
});

test("B6: la URL conserva los filtros y el período por defecto son los últimos 30 días", () => {
  const sin = filtrosDeUrl(new URLSearchParams(""));
  assert.deepEqual(sin, FILTROS_INICIALES);
  assert.equal(sin.periodo, "30d");
  assert.equal(hayFiltros(sin), false);
  assert.equal(urlDeFiltros(sin), "");
  // A link to one person's trail looks at the whole retention period.
  const persona = filtrosDeUrl(new URLSearchParams("sujetoId=EMP-001"));
  assert.equal(persona.periodo, "todo");
  assert.equal(persona.sujetoId, "EMP-001");
  assert.equal(hayFiltros(persona), true);
  assert.equal(urlDeFiltros(persona), "sujetoId=EMP-001");
  assert.equal(filtrosDeUrl(new URLSearchParams("periodo=7d")).periodo, "7d");
  assert.equal(filtrosDeUrl(new URLSearchParams("periodo=ayer")).periodo, "30d");
  const propio = filtrosDeUrl(new URLSearchParams("desde=2026-10-01&hasta=2026-10-31"));
  assert.deepEqual([propio.periodo, propio.desde, propio.hasta], ["personalizado", "2026-10-01", "2026-10-31"]);
});

test("B6: ida y vuelta entre URL y filtros sin perder ni inventar nada", () => {
  for (const consulta of [
    "",
    "periodo=hoy",
    "periodo=todo",
    "entidad=REGLAS&accion=REGLAS_PUBLICADAS&resultado=EXITO",
    "actorId=demo-rrhh&origen=CLI&consultas=1",
    "correlacionId=op-1",
    "sujetoId=EMP-001&periodo=30d",
    "q=EMP-001",
    "desde=2026-10-01&hasta=2026-10-31&resultado=DENEGADO",
  ]) {
    const f = filtrosDeUrl(new URLSearchParams(consulta));
    const otra = filtrosDeUrl(new URLSearchParams(urlDeFiltros(f)));
    assert.deepEqual(otra, f, consulta);
  }
  // Values that are not in the lists are dropped instead of sent to the API.
  const limpio = filtrosDeUrl(
    new URLSearchParams("resultado=X&origen=Y&entidad=Z&consultas=7"),
  );
  assert.deepEqual(limpio, FILTROS_INICIALES);
});

test("B6: los períodos se convierten a instantes UTC con los días de Buenos Aires", () => {
  const ahora = new Date("2026-11-02T15:00:00.000Z");
  const api = (consulta: string) =>
    filtrosParaApi(filtrosDeUrl(new URLSearchParams(consulta)), ahora);
  assert.deepEqual(api(""), { desde: "2026-10-04T03:00:00.000Z", pageSize: 25 });
  assert.equal(api("periodo=hoy").desde, "2026-11-02T03:00:00.000Z");
  assert.equal(api("periodo=7d").desde, "2026-10-27T03:00:00.000Z");
  assert.equal(api("periodo=todo").desde, undefined);
  assert.deepEqual(
    api("desde=2026-10-01&hasta=2026-10-31"),
    { desde: "2026-10-01T03:00:00.000Z", hasta: "2026-11-01T02:59:59.999Z", pageSize: 25 },
  );
  // 22:00 in Buenos Aires on the 2nd is already the 3rd in UTC.
  assert.equal(
    filtrosParaApi(FILTROS_INICIALES, new Date("2026-11-03T01:00:00.000Z")).desde,
    "2026-10-04T03:00:00.000Z",
  );
  assert.deepEqual(api("sujetoId=EMP-001&consultas=1&resultado=DENEGADO"), {
    sujetoId: "EMP-001",
    resultado: "DENEGADO",
    consultas: "1",
    pageSize: 25,
  });
  assert.equal(
    rangoInvertido(filtrosDeUrl(new URLSearchParams("desde=2026-10-31&hasta=2026-10-01"))),
    true,
  );
  assert.equal(rangoInvertido(FILTROS_INICIALES), false);
});

test("B6: un cambio de filtros se mantiene coherente: el período, los días y la acción de otro tipo", () => {
  const base = FILTROS_INICIALES;
  // A preset clears the days; a picked day makes the period custom.
  const con = conCambio(base, { desde: "2026-10-01" });
  assert.deepEqual([con.periodo, con.desde], ["personalizado", "2026-10-01"]);
  const preset = conCambio(con, { periodo: "7d" });
  assert.deepEqual([preset.periodo, preset.desde, preset.hasta], ["7d", "", ""]);
  // Clearing the last day returns to the default period (the whole history when a code narrows).
  assert.equal(conCambio(con, { desde: "" }).periodo, "30d");
  assert.equal(conCambio({ ...con, sujetoId: "EMP-001" }, { desde: "" }).periodo, "todo");
  // An action that does not belong to the chosen entity is dropped; one that does stays.
  const accion = { ...base, accion: "REGLAS_PUBLICADAS" };
  assert.equal(conCambio(accion, { entidad: "IMPORTACION" }).accion, "");
  assert.equal(conCambio(accion, { entidad: "REGLAS" }).accion, "REGLAS_PUBLICADAS");
  assert.equal(conCambio(accion, { entidad: "" }).accion, "REGLAS_PUBLICADAS");
  // Nothing else moves.
  assert.deepEqual(conCambio(base, {}), base);
});

test("B6: los enlaces de la lista, del evento y de la operación conservan los filtros y nada más", () => {
  assert.equal(rutaLista(FILTROS_INICIALES), "/audit");
  const filtros = conCambio(FILTROS_INICIALES, { resultado: "FALLO", sujetoId: "EMP-001" });
  const lista = rutaLista(filtros);
  assert.ok(lista.startsWith("/audit?"), lista);
  assert.deepEqual(filtrosDeUrl(new URL(`http://x${lista}`).searchParams), filtros);

  assert.equal(enlaceDetalle("evento 1", FILTROS_INICIALES), "/audit/evento%201");
  const detalle = enlaceDetalle("e1", filtros);
  const url = new URL(`http://x${detalle}`);
  assert.equal(url.pathname, "/audit/e1");
  // The way back is the same list.
  assert.equal(rutaDeRetorno(url.searchParams.get("lista")), lista);
  assert.equal(rutaDeRetorno(null), "/audit");

  assert.equal(enlaceOperacion("op/1"), "/audit/operations/op%2F1");
});

test("B6: el regreso desde el detalle no puede salir de la lista ni arrastrar parámetros ajenos", () => {
  for (const hostil of [
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "../../api/auditoria",
    "resultado=NADA&accion=FALSA&x=1",
  ])
    assert.equal(rutaDeRetorno(hostil), "/audit", hostil);
  assert.equal(
    rutaDeRetorno("resultado=DENEGADO&x=1&entidad=NADA"),
    "/audit?resultado=DENEGADO",
  );
});

test("B6: las acciones del selector salen del catálogo, agrupadas por tipo, sin lista propia", () => {
  const todas = gruposDeAcciones();
  assert.equal(
    todas.reduce((n, g) => n + g.acciones.length, 0),
    Object.keys(CATALOGO_AUDITORIA).length,
  );
  for (const grupo of todas)
    for (const { accion, etiqueta } of grupo.acciones) {
      const definicion = CATALOGO_AUDITORIA[accion as keyof typeof CATALOGO_AUDITORIA];
      assert.equal(etiqueta, definicion.etiqueta);
      assert.equal(definicion.entidad, grupo.entidad);
    }
  const reglas = gruposDeAcciones("REGLAS");
  assert.equal(reglas.length, 1);
  assert.equal(reglas[0].etiqueta, "Reglas del índice");
  assert.ok(reglas[0].acciones.some((a) => a.accion === "REGLAS_PUBLICADAS"));
  assert.ok(reglas[0].acciones.every((a) => a.accion.startsWith("REGLAS_")));
});

test("B6: las etiquetas de acción, el resumen y la persona resisten datos incompletos", () => {
  assert.equal(etiquetaAccion(evento()), "Modificó los datos laborales de una persona");
  assert.equal(etiquetaAccion(evento({ etiqueta: null, accion: "ACCION_NUEVA" })), "Accion nueva");
  assert.equal(
    resumen(evento({ etiqueta: "Confirmó una importación" }), usuarios),
    "Analista confirmó una importación",
  );
  assert.equal(
    resumen(evento({ actorNombre: null, actorId: "otro" }), usuarios),
    "Sistema modificó los datos laborales de una persona",
  );
  assert.equal(nombrePersona(evento()), "Persona ficticia 001");
  assert.equal(nombrePersona(evento({ sujetoNombre: null })), "Persona no disponible");
});

test("B6: la cantidad de eventos dice cuándo el conteo llegó a su tope", () => {
  assert.equal(cantidadEventos(1, false), "1 evento");
  assert.equal(cantidadEventos(0, false), "0 eventos");
  assert.equal(cantidadEventos(1234, false), "1.234 eventos");
  assert.equal(cantidadEventos(10_000, true), "Más de 10.000 eventos");
});

test("B6: los filtros que llegan por código se muestran por nombre, sin códigos a la vista", () => {
  const codigos = { sujetoId: "EMP-001", recursoId: "", correlacionId: "op-1", solicitudId: "" };
  assert.deepEqual(chipsDeCodigos(codigos, [evento()]), [
    { clave: "sujetoId", texto: "Persona: Persona ficticia 001" },
    { clave: "correlacionId", texto: "Operación seleccionada" },
  ]);
  // Without a loaded event that knows the name, the chip still hides the code.
  assert.deepEqual(chipsDeCodigos(codigos, []).map((c) => c.texto), [
    "Persona seleccionada",
    "Operación seleccionada",
  ]);
  const todos = { sujetoId: "", recursoId: "v2", correlacionId: "", solicitudId: "req-1" };
  assert.deepEqual(chipsDeCodigos(todos, []).map((c) => c.texto), [
    "Recurso seleccionado",
    "Solicitud seleccionada",
  ]);
  assert.deepEqual(
    chipsDeCodigos({ sujetoId: "", recursoId: "", correlacionId: "", solicitudId: "" }, [evento()]),
    [],
  );
});

test("B6: la consulta al servidor lleva solo los filtros con valor, y el archivo conserva el nombre propuesto", () => {
  assert.equal(consultaDe({}), "");
  assert.equal(consultaDe({ a: "", b: undefined }), "");
  assert.equal(
    consultaDe({ resultado: "FALLO", pageSize: 25, cursor: undefined, q: "a b&c" }),
    "?resultado=FALLO&pageSize=25&q=a+b%26c",
  );
  assert.equal(
    nombreDeDescarga('attachment; filename="auditoria_inicio_20261019T150000Z.csv"'),
    "auditoria_inicio_20261019T150000Z.csv",
  );
  // A path in the name is never trusted; the caller falls back to its own.
  assert.equal(nombreDeDescarga('attachment; filename="../../etc/passwd"'), null);
  assert.equal(nombreDeDescarga("attachment"), null);
  assert.equal(nombreDeDescarga(null), null);
});
