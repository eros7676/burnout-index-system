import assert from "node:assert/strict";
import { test } from "node:test";
import type { UsuarioDemoDTO } from "../src/shared/contracts";
import {
  asignablesDe,
  asignadoPorDefecto,
  casoDeAlerta,
  esVencido,
  hoyEnBuenosAires,
  puedeAnotar,
  puedeReasignar,
  puedeSeguir,
  puedeVer,
  validarActualizacion,
  validarCierre,
  validarMedida,
  validarNota,
  type AlertaSeguimiento,
} from "../src/server/services/seguimiento-reglas";

const rrhh: UsuarioDemoDTO = {
  userId: "demo-rrhh",
  nombre: "RRHH",
  rol: "RRHH",
  employeeId: null,
  teamId: null,
};
const gerencia: UsuarioDemoDTO = {
  userId: "demo-gerencia",
  nombre: "Gerencia",
  rol: "GERENCIA",
  employeeId: "GER-01",
  teamId: null,
};
const tl = (n: number): UsuarioDemoDTO => ({
  userId: `demo-tl-0${n}`,
  nombre: `Team Lead, Célula ficticia ${n}`,
  rol: "TEAM_LEAD",
  employeeId: `TL-0${n}`,
  teamId: `EQ-0${n}`,
});
const empleado: UsuarioDemoDTO = {
  userId: "demo-empleado",
  nombre: "Empleado",
  rol: "EMPLEADO",
  employeeId: "EMP-001",
  teamId: "EQ-01",
};
const usuarios = [rrhh, gerencia, tl(1), tl(2), empleado];

// A technician's alert goes to the Team Lead of their team; a Team Lead's goes to Gerencia.
const deTecnico: AlertaSeguimiento = {
  alertId: "a-tec",
  employeeId: "EMP-001",
  createdAt: new Date("2026-10-19T12:00:00Z"),
  vigencia: "ACTIVA",
  personaTeamId: "EQ-01",
  destinatarioTipo: "TEAM_LEAD",
};
const deTeamLead: AlertaSeguimiento = {
  ...deTecnico,
  alertId: "a-tl",
  employeeId: "TL-01",
  destinatarioTipo: "GERENCIA",
};
const sinDestinatario: AlertaSeguimiento = {
  ...deTecnico,
  alertId: "a-sin",
  destinatarioTipo: null,
};

test("permisos: RR. HH. todo; Team Lead solo técnicos de su equipo; Gerencia solo alertas dirigidas a Gerencia; Empleado nunca", () => {
  // Writing
  assert.equal(puedeSeguir(rrhh, deTecnico), true);
  assert.equal(puedeSeguir(rrhh, deTeamLead), true);
  assert.equal(puedeSeguir(rrhh, sinDestinatario), true);
  assert.equal(puedeSeguir(tl(1), deTecnico), true);
  assert.equal(puedeSeguir(tl(2), deTecnico), false, "otro equipo");
  assert.equal(puedeSeguir(tl(1), deTeamLead), false, "su propia alerta va a Gerencia");
  assert.equal(puedeSeguir(tl(1), sinDestinatario), false);
  assert.equal(puedeSeguir(gerencia, deTeamLead), true);
  assert.equal(puedeSeguir(gerencia, deTecnico), false);
  assert.equal(puedeSeguir(gerencia, sinDestinatario), false);
  assert.equal(puedeSeguir(empleado, deTecnico), false);
  // Reading the follow-up status keeps the alert's own scope (Gerencia reads all, D11).
  assert.equal(puedeVer(rrhh, deTecnico), true);
  assert.equal(puedeVer(gerencia, deTecnico), true);
  assert.equal(puedeVer(tl(1), deTecnico), true);
  assert.equal(puedeVer(tl(2), deTecnico), false);
  assert.equal(puedeVer(empleado, deTecnico), false);
});

test("las notas internas las leen y escriben RR. HH. y el responsable del caso, nadie más", () => {
  const caso = { asignadoA: "demo-tl-01" };
  assert.equal(puedeAnotar(rrhh, caso, deTecnico), true);
  assert.equal(puedeAnotar(tl(1), caso, deTecnico), true);
  assert.equal(puedeAnotar(tl(1), { asignadoA: "demo-rrhh" }, deTecnico), false);
  assert.equal(puedeAnotar(tl(2), caso, deTecnico), false);
  assert.equal(puedeAnotar(gerencia, { asignadoA: "demo-gerencia" }, deTecnico), false);
  assert.equal(puedeAnotar(gerencia, { asignadoA: "demo-gerencia" }, deTeamLead), true);
  assert.equal(puedeAnotar(empleado, { asignadoA: "demo-empleado" }, deTecnico), false);
  assert.equal(puedeReasignar(rrhh), true);
  for (const u of [gerencia, tl(1), empleado]) assert.equal(puedeReasignar(u), false);
});

test("responsables posibles: RR. HH. siempre, más el Team Lead del equipo o Gerencia según el destinatario", () => {
  const ids = (a: AlertaSeguimiento) =>
    asignablesDe(a, usuarios).map((u) => u.userId);
  assert.deepEqual(ids(deTecnico), ["demo-rrhh", "demo-tl-01"]);
  assert.deepEqual(ids(deTeamLead), ["demo-rrhh", "demo-gerencia"]);
  assert.deepEqual(ids(sinDestinatario), ["demo-rrhh"]);
  assert.equal(asignadoPorDefecto(deTecnico, usuarios), "demo-tl-01");
  assert.equal(asignadoPorDefecto(deTeamLead, usuarios), "demo-gerencia");
  assert.equal(asignadoPorDefecto(sinDestinatario, usuarios), "demo-rrhh");
  // A team without a login falls back to the RR. HH. queue.
  assert.equal(
    asignadoPorDefecto({ ...deTecnico, personaTeamId: "EQ-09" }, usuarios),
    "demo-rrhh",
  );
});

test("un caso por persona: la alerta se une al primer caso que seguía abierto cuando nació; después del último cierre no pertenece a ninguno", () => {
  const abierto = {
    casoId: "c-abierto",
    alertaOrigenId: "a-origen",
    estado: "EN_CURSO" as const,
    asignadoA: "demo-tl-01",
    vence: "2026-11-30",
    createdAt: new Date("2026-10-19T12:00:00Z"),
    cerradoAt: null,
  };
  const cerrado = {
    casoId: "c-cerrado",
    alertaOrigenId: "a-vieja",
    estado: "CERRADO" as const,
    asignadoA: "demo-tl-01",
    vence: null,
    createdAt: new Date("2026-09-01T12:00:00Z"),
    cerradoAt: new Date("2026-09-30T12:00:00Z"),
  };
  const alerta = (id: string, cuando: string): AlertaSeguimiento => ({
    ...deTecnico,
    alertId: id,
    createdAt: new Date(cuando),
  });
  const casos = [abierto, cerrado];
  // The alert it was opened from.
  assert.deepEqual(
    casoDeAlerta(casos, alerta("a-origen", "2026-10-19T12:00:00Z")),
    { caso: abierto, relacion: "ORIGEN" },
  );
  // A newer alert joins the open case.
  assert.deepEqual(
    casoDeAlerta(casos, alerta("a-nueva", "2026-10-26T12:00:00Z")),
    { caso: abierto, relacion: "ADJUNTA" },
  );
  // An older alert of the same person, with no case of its own, joins the open one (one case per person).
  assert.deepEqual(
    casoDeAlerta([abierto], alerta("a-previa", "2026-10-05T12:00:00Z")),
    { caso: abierto, relacion: "ADJUNTA" },
  );
  // A closed case keeps the alerts created up to its closure and does not take later ones.
  assert.equal(
    casoDeAlerta([cerrado], alerta("a-en-ventana", "2026-09-15T12:00:00Z"))
      ?.caso.casoId,
    "c-cerrado",
  );
  assert.equal(
    casoDeAlerta([cerrado], alerta("a-posterior", "2026-10-26T12:00:00Z")),
    null,
  );
  // The closure that covers the alert beats the open case.
  assert.equal(
    casoDeAlerta(casos, alerta("a-en-ventana", "2026-09-15T12:00:00Z"))?.caso
      .casoId,
    "c-cerrado",
  );
  // A closure covers every alert of the person up to that moment, also those older than the case.
  assert.equal(
    casoDeAlerta([cerrado], alerta("a-anterior", "2026-08-15T12:00:00Z"))?.caso
      .casoId,
    "c-cerrado",
  );
  // Later cases take what no earlier closure covered.
  const segundo = { ...cerrado, casoId: "c-segundo", alertaOrigenId: "a-seg", createdAt: new Date("2026-10-01T12:00:00Z"), cerradoAt: new Date("2026-10-10T12:00:00Z") };
  assert.equal(
    casoDeAlerta([cerrado, segundo], alerta("a-oct", "2026-10-05T12:00:00Z"))?.caso.casoId,
    "c-segundo",
  );
  assert.equal(casoDeAlerta([], deTecnico), null);
});

test("vencido: pasó la fecha en un caso nuevo o en curso; en espera pausa el plazo y cerrado no vence", () => {
  const hoy = "2026-11-02";
  assert.equal(esVencido({ estado: "EN_CURSO", vence: "2026-11-01" }, hoy), true);
  assert.equal(esVencido({ estado: "NUEVO", vence: "2026-10-01" }, hoy), true);
  assert.equal(esVencido({ estado: "EN_CURSO", vence: "2026-11-02" }, hoy), false);
  assert.equal(esVencido({ estado: "EN_CURSO", vence: null }, hoy), false);
  assert.equal(esVencido({ estado: "EN_ESPERA", vence: "2026-10-01" }, hoy), false);
  assert.equal(esVencido({ estado: "CERRADO", vence: "2026-10-01" }, hoy), false);
});

test("hoy se mide en Buenos Aires, no en UTC", () => {
  assert.equal(hoyEnBuenosAires(new Date("2026-11-03T01:30:00Z")), "2026-11-02");
  assert.equal(hoyEnBuenosAires(new Date("2026-11-03T03:00:00Z")), "2026-11-03");
});

const HOY = "2026-11-02";
const codigos = (errores: { codigo: string }[]) => errores.map((e) => e.codigo);

test("transiciones: NUEVO → EN_CURSO ⇄ EN_ESPERA, sin volver a NUEVO ni salir de CERRADO", () => {
  const caso = (estado: "NUEVO" | "EN_CURSO" | "EN_ESPERA" | "CERRADO") => ({
    estado,
    asignadoA: "demo-rrhh",
    vence: "2026-11-10" as string | null,
  });
  assert.deepEqual(validarActualizacion(caso("NUEVO"), { estado: "EN_CURSO" }, HOY), []);
  assert.deepEqual(validarActualizacion(caso("EN_CURSO"), { estado: "EN_ESPERA" }, HOY), []);
  assert.deepEqual(validarActualizacion(caso("EN_ESPERA"), { estado: "EN_CURSO" }, HOY), []);
  // NUEVO cannot be paused before anyone worked on it.
  assert.deepEqual(
    codigos(validarActualizacion(caso("NUEVO"), { estado: "EN_ESPERA" }, HOY)),
    ["TRANSICION_INVALIDA"],
  );
  assert.deepEqual(
    codigos(
      validarActualizacion(caso("EN_CURSO"), { estado: "NUEVO" as never }, HOY),
    ),
    ["TRANSICION_INVALIDA"],
  );
  // Closed is final: no reopening, and nothing else changes either.
  assert.deepEqual(
    codigos(validarActualizacion(caso("CERRADO"), { estado: "EN_CURSO" }, HOY)),
    ["CASO_CERRADO"],
  );
  assert.deepEqual(
    codigos(validarActualizacion(caso("CERRADO"), { vence: "2026-12-01" }, HOY)),
    ["CASO_CERRADO"],
  );
  // The closure has its own operation.
  assert.deepEqual(
    codigos(validarActualizacion(caso("EN_CURSO"), { estado: "CERRADO" as never }, HOY)),
    ["TRANSICION_INVALIDA"],
  );
});

test("EN_CURSO exige responsable y fecha de vencimiento desde hoy", () => {
  const nuevo = { estado: "NUEVO" as const, asignadoA: "demo-rrhh", vence: null };
  assert.deepEqual(
    codigos(validarActualizacion(nuevo, { estado: "EN_CURSO" }, HOY)),
    ["VENCE_OBLIGATORIO"],
  );
  assert.deepEqual(
    validarActualizacion(nuevo, { estado: "EN_CURSO", vence: HOY }, HOY),
    [],
    "vencer hoy es válido",
  );
  assert.deepEqual(
    codigos(validarActualizacion(nuevo, { estado: "EN_CURSO", vence: "2026-11-01" }, HOY)),
    ["VENCE_PASADO"],
  );
  assert.deepEqual(
    codigos(validarActualizacion(nuevo, { vence: "2026-02-30" }, HOY)),
    ["VENCE_INVALIDO"],
  );
  // The wait pauses the due date; resuming with a lapsed one needs a new date.
  const enEspera = { estado: "EN_ESPERA" as const, asignadoA: "demo-rrhh", vence: "2026-10-20" };
  assert.deepEqual(
    codigos(validarActualizacion(enEspera, { estado: "EN_CURSO" }, HOY)),
    ["VENCE_PASADO"],
  );
  assert.deepEqual(
    validarActualizacion(enEspera, { estado: "EN_CURSO", vence: "2026-11-20" }, HOY),
    [],
  );
  // Changing only the owner of a case that is already late is not blocked by its old date.
  const tarde = { estado: "EN_CURSO" as const, asignadoA: "demo-rrhh", vence: "2026-10-20" };
  assert.deepEqual(validarActualizacion(tarde, { asignadoA: "demo-tl-01" }, HOY), []);
  // A new due date may be cleared only outside EN_CURSO.
  assert.deepEqual(
    codigos(validarActualizacion(tarde, { vence: null }, HOY)),
    ["VENCE_OBLIGATORIO"],
  );
  assert.deepEqual(validarActualizacion(nuevo, { vence: null }, HOY), []);
});

test("notas: de 1 a 1.000 caracteres, sin contar espacios de los bordes", () => {
  assert.deepEqual(validarNota("Se habló con el equipo."), []);
  assert.deepEqual(codigos(validarNota("")), ["NOTA_INVALIDA"]);
  assert.deepEqual(codigos(validarNota("   \n ")), ["NOTA_INVALIDA"]);
  assert.deepEqual(validarNota("x".repeat(1000)), []);
  assert.deepEqual(codigos(validarNota("x".repeat(1001))), ["NOTA_INVALIDA"]);
  assert.deepEqual(codigos(validarNota(42 as never)), ["NOTA_INVALIDA"]);
});

test("medidas: tipo de la lista cerrada, factor opcional y responsable que pueda actuar en el caso", () => {
  const permitidos = ["demo-rrhh", "demo-tl-01"];
  const ok = {
    tipo: "REDISTRIBUIR_TAREAS",
    factor: "CT",
    responsableId: "demo-tl-01",
    vence: "2026-11-10",
  };
  assert.deepEqual(validarMedida(ok, permitidos, HOY), []);
  assert.deepEqual(validarMedida({ ...ok, factor: null, vence: null }, permitidos, HOY), []);
  assert.deepEqual(
    codigos(validarMedida({ ...ok, tipo: "HABLAR_CON_LA_PERSONA" }, permitidos, HOY)),
    ["TIPO_INVALIDO"],
  );
  assert.deepEqual(
    codigos(validarMedida({ ...ok, factor: "XX" }, permitidos, HOY)),
    ["FACTOR_INVALIDO"],
  );
  assert.deepEqual(
    codigos(validarMedida({ ...ok, responsableId: "demo-gerencia" }, permitidos, HOY)),
    ["RESPONSABLE_INVALIDO"],
  );
  assert.deepEqual(
    codigos(validarMedida({ ...ok, vence: "2026-10-01" }, permitidos, HOY)),
    ["VENCE_PASADO"],
  );
});

test("cierre: motivo de la lista, justificación de 10 a 280 caracteres y coherencia con el estado del caso", () => {
  const contexto = {
    medidas: [{ hecha: true }],
    alertaOrigenVigencia: "ACTIVA" as const,
    personaActiva: true,
  };
  const ok = {
    motivoCierre: "MEDIDAS_IMPLEMENTADAS",
    justificacion: "Se redistribuyeron las tareas y bajó la carga.",
  };
  assert.deepEqual(validarCierre(ok, contexto), []);
  assert.deepEqual(
    codigos(validarCierre({ ...ok, motivoCierre: "OTRO" }, contexto)),
    ["MOTIVO_INVALIDO"],
  );
  assert.deepEqual(codigos(validarCierre({ ...ok, justificacion: "corto" }, contexto)), [
    "JUSTIFICACION_INVALIDA",
  ]);
  assert.deepEqual(
    codigos(validarCierre({ ...ok, justificacion: "x".repeat(281) }, contexto)),
    ["JUSTIFICACION_INVALIDA"],
  );
  assert.deepEqual(
    codigos(validarCierre({ ...ok, justificacion: undefined as never }, contexto)),
    ["JUSTIFICACION_INVALIDA"],
  );
  // «Medidas implementadas» needs measures, and all of them done.
  assert.deepEqual(
    codigos(validarCierre(ok, { ...contexto, medidas: [] })),
    ["MEDIDAS_PENDIENTES"],
  );
  assert.deepEqual(
    codigos(validarCierre(ok, { ...contexto, medidas: [{ hecha: true }, { hecha: false }] })),
    ["MEDIDAS_PENDIENTES"],
  );
  // The other reasons need the fact they name.
  const sin = { ...ok, motivoCierre: "SIN_ACCION_NECESARIA" };
  assert.deepEqual(validarCierre(sin, { ...contexto, medidas: [] }), []);
  const superada = { ...ok, motivoCierre: "SUPERADA_POR_RECALCULO" };
  assert.deepEqual(codigos(validarCierre(superada, contexto)), ["ALERTA_VIGENTE"]);
  assert.deepEqual(
    validarCierre(superada, { ...contexto, alertaOrigenVigencia: "SUPERADA" }),
    [],
  );
  const baja = { ...ok, motivoCierre: "BAJA_PERSONA" };
  assert.deepEqual(codigos(validarCierre(baja, contexto)), ["PERSONA_ACTIVA"]);
  assert.deepEqual(validarCierre(baja, { ...contexto, personaActiva: false }), []);
});
