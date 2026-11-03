import assert from "node:assert/strict";
import { test } from "node:test";
import { reglasSemilla } from "../prisma/seed-data";
import { validarPropuesta } from "../src/server/services/reglas";
import {
  aplanar,
  cambiosEntre,
  configuracionDe,
  huellaBorrador,
  mismosParametros,
  propuestaDesde,
} from "../src/server/services/reglas-parametros";
import {
  ErrorBorrador,
  contextoVigente,
  esRetroactivo,
  estadosDeVersiones,
  exigirContextoVigente,
  exigirHuella,
  exigirOtraPersona,
  exigirPublicable,
  hoyEnArgentina,
  lunesDe,
  problemasDeMotivo,
  problemasDeVigencia,
  siguienteVersion,
} from "../src/server/services/reglas-politica";
import {
  AcumuladorSimulacion,
  protegerEquipos,
} from "../src/server/services/reglas-simulacion";
import type { RegistroLaboral } from "../src/shared/contracts";
import type { PropuestaReglas } from "../src/shared/contratos/reglas";

const base = (): PropuestaReglas => propuestaDesde(structuredClone(reglasSemilla), "2026-11-09");

function rechaza(accion: () => unknown, codigo: string) {
  assert.throws(accion, (error: unknown) => {
    assert.ok(error instanceof ErrorBorrador, String(error));
    assert.equal(error.codigo, codigo);
    return true;
  });
}

// ── Validation of the proposal ─────────────────────────────────────────────

test("B5: una propuesta completa se acepta y no se modifica la entrada", () => {
  const entrada = base();
  const copia = structuredClone(entrada);
  const resultado = validarPropuesta(entrada);
  assert.deepEqual(resultado.propuesta, copia);
  assert.deepEqual(entrada, copia);
});

test("B5: los problemas nombran el campo y están redactados para quien edita", () => {
  const campos = (entrada: unknown) =>
    Object.fromEntries(validarPropuesta(entrada).problemas.map((p) => [p.campo, p.detalle]));

  assert.match(
    campos({ ...base(), weights: { HE: 0.4, DS: 0.3, CT: 0.25, VP: 0.15 } }).weights,
    /^Los pesos suman 110 %\. Deben sumar 100 %\.$/,
  );
  assert.match(
    campos({ ...base(), weights: { HE: 0.03, DS: 0.3, CT: 0.25, VP: 0.42 } })["weights.HE"],
    /^El peso de Horas extra debe estar entre 5 % y 70 %\.$/,
  );
  assert.match(
    campos({ ...base(), thresholds: { ...base().thresholds, CT: 1.5 } })["thresholds.CT"],
    /no puede superar 1/,
  );
  assert.match(
    campos({ ...base(), mediumLimit: 70, highLimit: 70 }).mediumLimit,
    /Medio debe ser menor que el de Alto/,
  );
  assert.match(campos({ ...base(), highLimit: 101 }).highLimit, /no puede superar 100/);
  assert.match(campos({ ...base(), effectiveFrom: "2026-11-10" }).effectiveFrom, /lunes/);
  assert.ok(campos({ ...base(), minExceededFactors: 5 }).minExceededFactors);
  assert.ok(campos({ ...base(), version: "v9" }).version, "campo ajeno");
  assert.ok(campos(null).propuesta);
  // Spanish copy: no voseo, no codes where a factor name fits.
  for (const detalle of Object.values(
    campos({ ...base(), weights: { HE: "x", DS: 0.3, CT: 0.25, VP: 0.15 } }),
  ))
    assert.doesNotMatch(detalle, /\b(Usá|Ingresá|Revisá)\b|HE\b/);
});

test("B5: el motivo es obligatorio, se recorta y se acota a lo que cabe en la auditoría", () => {
  assert.equal(problemasDeMotivo("  Ajuste por convenio  ").length, 0);
  assert.equal(problemasDeMotivo("x".repeat(280)).length, 0);
  for (const motivo of [undefined, null, 3, "", "   ", "corto", "x".repeat(281)]) {
    const [problema, ...resto] = problemasDeMotivo(motivo);
    assert.equal(problema.campo, "motivo");
    assert.equal(resto.length, 0);
  }
  assert.equal(problemasDeMotivo("corto", "justificacion")[0].campo, "justificacion");
});

test("B5: el inicio de vigencia es posterior a la primera versión, único y dentro del horizonte", () => {
  const contexto = {
    primeraVigencia: "2026-01-05",
    vigencias: ["2026-01-05", "2026-10-12"],
    lunesActual: "2026-11-02",
  };
  assert.equal(problemasDeVigencia("2026-11-09", contexto).length, 0);
  assert.equal(problemasDeVigencia("2026-10-05", contexto).length, 0, "pasado: retroactivo, permitido");
  assert.match(problemasDeVigencia("2026-01-05", contexto)[0].detalle, /posterior/);
  assert.match(problemasDeVigencia("2025-12-29", contexto)[0].detalle, /posterior/);
  assert.match(problemasDeVigencia("2026-10-12", contexto)[0].detalle, /Ya existe/);
  assert.equal(problemasDeVigencia("2027-11-01", contexto).length, 0, "52 semanas exactas");
  assert.match(problemasDeVigencia("2027-11-08", contexto)[0].detalle, /52 semanas/);
});

// ── Retroactivity, four-eyes, fingerprint ──────────────────────────────────

test("B5: retroactivo es modificar al menos una semana ya evaluada", () => {
  assert.equal(esRetroactivo(0), false);
  assert.equal(esRetroactivo(1), true);
  assert.equal(esRetroactivo(26_000), true);
});

test("B5: la aprobación la da una persona distinta de quien creó el borrador", () => {
  exigirOtraPersona("demo-rrhh", "demo-gerencia");
  rechaza(() => exigirOtraPersona("demo-rrhh", "demo-rrhh"), "MISMA_PERSONA");
});

const abierto = (cambios: Partial<Parameters<typeof exigirPublicable>[0]> = {}) => ({
  estado: "BORRADOR" as const,
  huella: "a".repeat(64),
  simulacionHuella: "a".repeat(64),
  creadoPor: "demo-rrhh",
  aprobadoPor: null,
  ...cambios,
});

test("B5: una versión con fecha futura se publica con simulación vigente, sin aprobación", () => {
  exigirPublicable(abierto(), false);
  rechaza(() => exigirPublicable(abierto({ simulacionHuella: null }), false), "SIN_SIMULACION");
  rechaza(
    () => exigirPublicable(abierto({ simulacionHuella: "b".repeat(64) }), false),
    "SIN_SIMULACION",
  );
  for (const estado of ["PUBLICADO", "DESCARTADO"] as const)
    rechaza(() => exigirPublicable(abierto({ estado }), false), "ESTADO_INCOMPATIBLE");
});

test("B5: una versión retroactiva exige la aprobación de otra persona antes de publicar", () => {
  // Sin aprobar, aunque la haya simulado quien la creó.
  rechaza(() => exigirPublicable(abierto(), true), "APROBACION_REQUERIDA");
  rechaza(
    () => exigirPublicable(abierto({ estado: "EN_REVISION" }), true),
    "APROBACION_REQUERIDA",
  );
  // Aprobada por quien la creó: la separación de funciones no se cumple.
  rechaza(
    () =>
      exigirPublicable(
        abierto({ estado: "EN_REVISION", aprobadoPor: "demo-rrhh" }),
        true,
      ),
    "MISMA_PERSONA",
  );
  // Aprobada por otra persona sobre la simulación vigente.
  exigirPublicable(abierto({ estado: "EN_REVISION", aprobadoPor: "demo-gerencia" }), true);
  // La aprobación no reemplaza a una simulación vigente.
  rechaza(
    () =>
      exigirPublicable(
        abierto({
          estado: "EN_REVISION",
          aprobadoPor: "demo-gerencia",
          simulacionHuella: "c".repeat(64),
        }),
        true,
      ),
    "SIN_SIMULACION",
  );
});

test("B5: la huella del borrador cubre el contenido y no depende del orden de las claves", () => {
  const propuesta = base();
  const alReves = {
    effectiveFrom: propuesta.effectiveFrom,
    minExceededFactors: propuesta.minExceededFactors,
    highLimit: propuesta.highLimit,
    mediumLimit: propuesta.mediumLimit,
    thresholds: { VP: 10, CT: 0.35, DS: 6, HE: 8 },
    weights: { VP: 0.15, CT: 0.25, DS: 0.3, HE: 0.3 },
  } as PropuestaReglas;
  const huella = huellaBorrador(propuesta, "Motivo del cambio");
  assert.match(huella, /^[0-9a-f]{64}$/);
  assert.equal(huellaBorrador(alReves, "Motivo del cambio"), huella);
  assert.notEqual(huellaBorrador(propuesta, "Otro motivo"), huella);
  assert.notEqual(
    huellaBorrador({ ...propuesta, thresholds: { ...propuesta.thresholds, HE: 9 } }, "Motivo del cambio"),
    huella,
  );
  assert.notEqual(
    huellaBorrador({ ...propuesta, effectiveFrom: "2026-11-16" }, "Motivo del cambio"),
    huella,
  );
});

test("B5: una solicitud con otra huella, o sin ella, no modifica el borrador", () => {
  const actual = "a".repeat(64);
  exigirHuella(actual, actual);
  rechaza(() => exigirHuella(actual, "b".repeat(64)), "CONFLICTO_EDICION");
  for (const invalida of [undefined, null, 5, "", "ABC", "a".repeat(63), "A".repeat(64)])
    rechaza(() => exigirHuella(actual, invalida), "PETICION_INVALIDA");
});

test("B5: la simulación solo vale para los datos que leyó", () => {
  const contexto = {
    versionEnVigor: "v1",
    versionSiguiente: null,
    ultimaSemana: "2026-10-26",
    semanas: 40,
  };
  assert.equal(contextoVigente(contexto, { ...contexto }), true);
  for (const distinto of [
    { versionEnVigor: "v2" },
    { versionSiguiente: "v3" },
    { ultimaSemana: "2026-11-02" },
    { semanas: 41 },
  ])
    assert.equal(contextoVigente(contexto, { ...contexto, ...distinto }), false);
  assert.equal(contextoVigente(undefined, contexto), false);
  rechaza(() => exigirContextoVigente(contexto, { ...contexto, semanas: 41 }), "SIMULACION_DESACTUALIZADA");
});

// ── Versions ───────────────────────────────────────────────────────────────

test("B5: la versión nueva la nombra el servidor a partir de la más alta", () => {
  assert.equal(siguienteVersion([]), "v1");
  assert.equal(siguienteVersion(["v1"]), "v2");
  assert.equal(siguienteVersion(["v1", "v3", "v2"]), "v4");
  assert.equal(siguienteVersion(["v1", "T09-abc", "v10x", "v2"]), "v3");
});

test("B5: Programada, Vigente y Reemplazada según la semana en curso", () => {
  const estados = estadosDeVersiones(
    ["2026-01-05", "2026-10-12", "2026-11-02", "2026-11-16"],
    "2026-11-02",
  );
  assert.equal(estados.get("2026-01-05"), "REEMPLAZADA");
  assert.equal(estados.get("2026-10-12"), "REEMPLAZADA");
  assert.equal(estados.get("2026-11-02"), "VIGENTE", "empieza hoy: ya rige");
  assert.equal(estados.get("2026-11-16"), "PROGRAMADA");
  const unica = estadosDeVersiones(["2026-01-05"], "2026-03-02");
  assert.equal(unica.get("2026-01-05"), "VIGENTE");
});

test("B5: el lunes y el día se calculan en la zona del producto", () => {
  assert.equal(lunesDe(new Date("2026-11-04T12:00:00Z")), "2026-11-02");
  assert.equal(lunesDe(new Date("2026-11-08T23:59:59Z")), "2026-11-02");
  assert.equal(lunesDe(new Date("2026-11-09T00:00:00Z")), "2026-11-09");
  // Lunes 2:00 UTC todavía es domingo 23:00 en Buenos Aires.
  assert.equal(lunesDe(hoyEnArgentina(new Date("2026-11-09T02:00:00Z"))), "2026-11-02");
  assert.equal(lunesDe(hoyEnArgentina(new Date("2026-11-09T03:00:00Z"))), "2026-11-09");
});

// ── Parameters ─────────────────────────────────────────────────────────────

test("B5: los cambios son solo los parámetros modificados y la fecha sola no cuenta", () => {
  const antes = base();
  const despues: PropuestaReglas = {
    ...antes,
    weights: { HE: 0.35, DS: 0.25, CT: 0.25, VP: 0.15 },
    thresholds: { ...antes.thresholds, HE: 10 },
    effectiveFrom: "2026-11-16",
  };
  assert.deepEqual(
    cambiosEntre(antes, despues).map((c) => [c.campo, c.antes, c.despues]),
    [
      ["weights.HE", 0.3, 0.35],
      ["weights.DS", 0.3, 0.25],
      ["thresholds.HE", 8, 10],
      ["effectiveFrom", "2026-11-09", "2026-11-16"],
    ],
  );
  assert.equal(mismosParametros(antes, { ...antes, effectiveFrom: "2026-11-16" }), true);
  assert.equal(mismosParametros(antes, despues), false);
  assert.deepEqual(Object.keys(aplanar(antes)).sort(), [
    "effectiveFrom",
    "highLimit",
    "mediumLimit",
    "minExceededFactors",
    "thresholds.CT",
    "thresholds.DS",
    "thresholds.HE",
    "thresholds.VP",
    "weights.CT",
    "weights.DS",
    "weights.HE",
    "weights.VP",
  ]);
});

test("B5: la versión publicada es válida y el servidor fija autor y creación", () => {
  const reglas = configuracionDe(base(), {
    version: "v2",
    createdBy: "demo-rrhh",
    createdAt: "2026-11-03T12:00:00.000Z",
  });
  assert.equal(reglas.windowDays, 7);
  assert.equal(reglas.persistencePeriods, 2);
  assert.equal(reglas.createdBy, "demo-rrhh");
  assert.deepEqual(propuestaDesde(reglas), base());
});

// ── Simulation ─────────────────────────────────────────────────────────────

let n = 0;
function registro(
  employeeId: string,
  periodStart: string,
  datos: Partial<RegistroLaboral> = {},
): RegistroLaboral {
  const fin = new Date(new Date(`${periodStart}T00:00:00Z`).getTime() + 6 * 86_400_000);
  return {
    employeeId,
    periodStart,
    periodEnd: fin.toISOString().slice(0, 10),
    // The week of the example CSV: index 83,71 under the seed rules.
    horasExtra: 16,
    diasConsecutivosSinDescanso: 9,
    tareasActivas: 10,
    tareasPendientes: 7,
    tareasVencidas: 5,
    vacacionesPendientesDias: 14,
    horasTrabajadas: 56,
    diasDesdeUltimasVacaciones: 120,
    recordId: `r-${++n}`,
    sourceImportId: "i-1",
    dataVersion: 1,
    fingerprint: "f".repeat(64),
    ...datos,
  };
}
const semillaBase = () => structuredClone(reglasSemilla);
/** Looser thresholds: the same weeks that were Alto stay far below the limits. */
const candidata = (desde = "2026-10-12") =>
  configuracionDe(
    {
      ...propuestaDesde(semillaBase(), desde),
      thresholds: { HE: 20, DS: 12, CT: 1, VP: 30 },
    },
    { version: "borrador", createdBy: "borrador", createdAt: "2026-11-03T12:00:00.000Z" },
  );
const semana = (personas: string[]) =>
  personas.flatMap((id) => [registro(id, "2026-10-05"), registro(id, "2026-10-12")]);

test("B5: la simulación compara cada semana con y sin el borrador, usando la semana previa como antecedente", () => {
  const acumulador = new AcumuladorSimulacion(
    semillaBase(),
    candidata(),
    "2026-10-12",
    null,
  );
  acumulador.agregarPersona("EMP-1", "EQ-01", semana(["EMP-1"]));
  const resumen = acumulador.resumen(new Map([["EQ-01", "Célula ficticia 1"]]));
  // Only 12 oct counts (05 oct is before the start): Alto → Bajo.
  assert.equal(resumen.semanas, 1);
  assert.equal(resumen.personas, 1);
  assert.equal(resumen.antes.ALTO, 1);
  assert.equal(resumen.despues.BAJO, 1);
  assert.deepEqual(resumen.transiciones, [{ de: "ALTO", a: "BAJO", semanas: 1 }]);
  assert.equal(resumen.semanasConCambio, 1);
  assert.equal(resumen.personasConCambio, 1);
  assert.deepEqual(resumen.alertas, { nuevas: 0, superadas: 1 });
});

test("B5: sin antecedente la semana queda Incompleta con ambas reglas y no cuenta como cambio", () => {
  const acumulador = new AcumuladorSimulacion(semillaBase(), candidata("2026-10-05"), "2026-10-05", null);
  acumulador.agregarPersona("EMP-1", "EQ-01", semana(["EMP-1"]));
  const resumen = acumulador.resumen(new Map());
  assert.equal(resumen.semanas, 2);
  assert.equal(resumen.antes.INCOMPLETO, 1);
  assert.equal(resumen.despues.INCOMPLETO, 1);
  assert.equal(resumen.semanasConCambio, 1);
});

test("B5: el rango termina donde empieza la versión siguiente y un hueco corta el antecedente", () => {
  const acotado = new AcumuladorSimulacion(semillaBase(), candidata("2026-10-05"), "2026-10-05", "2026-10-12");
  acotado.agregarPersona("EMP-1", null, semana(["EMP-1"]));
  assert.equal(acotado.resumen(new Map()).semanas, 1, "12 oct ya es de la versión siguiente");

  const conHueco = new AcumuladorSimulacion(semillaBase(), candidata("2026-10-05"), "2026-10-05", null);
  conHueco.agregarPersona("EMP-2", null, [registro("EMP-2", "2026-09-21"), registro("EMP-2", "2026-10-05")]);
  assert.equal(conHueco.resumen(new Map()).antes.INCOMPLETO, 1, "falta 28 sep: no hay persistencia");
});

test("B5: una semana que el motor no puede evaluar se informa como omitida y no se cuenta", () => {
  const acumulador = new AcumuladorSimulacion(semillaBase(), candidata(), "2026-10-12", null);
  acumulador.agregarPersona("EMP-1", "EQ-01", [
    registro("EMP-1", "2026-10-12", { horasExtra: -1 }),
  ]);
  const resumen = acumulador.resumen(new Map());
  assert.equal(resumen.omitidas, 1);
  assert.equal(resumen.semanas, 0);
});

function equiposCon(tamanos: Record<string, number>) {
  const acumulador = new AcumuladorSimulacion(semillaBase(), candidata(), "2026-10-12", null);
  for (const [equipo, cantidad] of Object.entries(tamanos))
    for (let i = 0; i < cantidad; i++) {
      const id = `${equipo}-P${i}`;
      acumulador.agregarPersona(id, equipo, semana([id]));
    }
  return protegerEquipos(
    acumulador.equipos,
    new Map(Object.keys(tamanos).map((e) => [e, `Equipo ${e}`])),
  );
}

test("B5: los equipos de menos de cinco personas no se muestran", () => {
  const equipos = equiposCon({ A: 6, B: 3, C: 5, D: 2 });
  const suprimido = Object.fromEntries(equipos.map((e) => [e.teamId, e.suprimido]));
  assert.deepEqual(suprimido, { A: false, B: true, C: false, D: true });
  const visible = equipos.find((e) => e.teamId === "A")!;
  assert.ok(!visible.suprimido && visible.personas === 6 && visible.semanasConCambio === 6);
  // A withheld team exposes no figure at all.
  assert.deepEqual(Object.keys(equipos.find((e) => e.teamId === "B")!).sort(), [
    "nombre",
    "suprimido",
    "teamId",
  ]);
});

test("B5: si solo un equipo se oculta, el visible más chico también, para que el total no lo revele", () => {
  const equipos = equiposCon({ A: 8, B: 3, C: 5, D: 9 });
  const suprimido = Object.fromEntries(equipos.map((e) => [e.teamId, e.suprimido]));
  assert.deepEqual(suprimido, { A: false, B: true, C: true, D: false });
  // Nothing extra when none, or two or more, are withheld.
  assert.ok(equiposCon({ A: 8, B: 5 }).every((e) => !e.suprimido));
  assert.deepEqual(
    equiposCon({ A: 8, B: 3, C: 2, D: 5 }).map((e) => e.suprimido),
    [false, true, true, false],
  );
});
