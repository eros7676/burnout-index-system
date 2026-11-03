// Pure logic of the rules editor screens: what each role may do with a draft,
// how the form reads and reports, and how parameters are worded.
import assert from "node:assert/strict";
import { test } from "node:test";
import { reglasSemilla } from "../prisma/seed-data";
import {
  accionesDe,
  razonesBloqueo,
  type Accion,
  type EntradaAcciones,
} from "../src/components/reglas/acciones";
import {
  CAMPOS_FORMULARIO,
  erroresDeServidor,
  formularioDe,
  leerFormulario,
  leerNumero,
  sinGuardar,
  sumaPesos,
  type Formulario,
} from "../src/components/reglas/formulario";
import {
  ESTADO_BORRADOR,
  ESTADO_VERSION,
  diferencia,
  etiquetaCampo,
  fecha,
  porcentaje,
  valorCampo,
} from "../src/components/reglas/parametros";
import { validarPropuesta } from "../src/server/services/reglas";
import { aplanar, propuestaDesde } from "../src/server/services/reglas-parametros";
import type { Rol } from "../src/shared/permisos";
import type { PropuestaReglas } from "../src/shared/contratos/reglas";

const NBSP = " ";
const propuesta = (): PropuestaReglas =>
  propuestaDesde(structuredClone(reglasSemilla), "2026-11-09");

// ── Wording of parameters ──────────────────────────────────────────────────

test("B5 UI: los porcentajes llevan espacio duro y las fechas salen del texto, no del navegador", () => {
  assert.equal(porcentaje(0.3), `30${NBSP}%`);
  assert.equal(porcentaje(0.15), `15${NBSP}%`);
  assert.equal(porcentaje(0.125), `12,5${NBSP}%`);
  assert.equal(fecha("2026-01-05"), "5 ene 2026");
});

test("B5 UI: cada parámetro que el servidor informa tiene una etiqueta y un valor legibles", () => {
  for (const campo of Object.keys(aplanar(propuesta()))) {
    const etiqueta = etiquetaCampo(campo);
    assert.notEqual(etiqueta, campo, `${campo} sin etiqueta`);
    assert.doesNotMatch(etiqueta, /[A-Z]{2}\b|\./, `${campo}: ${etiqueta}`);
  }
  assert.equal(etiquetaCampo("weights.HE"), "Peso de horas extra");
  assert.equal(etiquetaCampo("thresholds.CT"), "Umbral de carga de tareas");
  assert.equal(etiquetaCampo("mediumLimit"), "Límite de Medio");
  assert.equal(etiquetaCampo("effectiveFrom"), "Inicio de vigencia");

  assert.equal(valorCampo("weights.DS", 0.3), `30${NBSP}%`);
  assert.equal(valorCampo("thresholds.HE", 8), "8 h");
  assert.equal(valorCampo("thresholds.CT", 0.35), "0,35");
  assert.equal(valorCampo("thresholds.VP", 10), "10 días");
  assert.equal(valorCampo("highLimit", 70), "70");
  assert.equal(valorCampo("minExceededFactors", 2), "2 factores");
  assert.equal(valorCampo("effectiveFrom", "2026-11-09"), "9 nov 2026");
  assert.equal(valorCampo("estado", "EN_REVISION"), "En revisión");
  assert.equal(valorCampo("desconocido", null), "—");
});

test("B5 UI: la diferencia entre dos conteos lleva signo y usa el menos tipográfico", () => {
  assert.equal(diferencia(2, 5), "+3");
  assert.equal(diferencia(5, 2), "−3");
  assert.equal(diferencia(4, 4), "=");
  assert.equal(diferencia(0, 1200), "+1.200");
});

test("B5 UI: los estados se nombran en español y las versiones usan las tres etiquetas pedidas", () => {
  assert.deepEqual(ESTADO_BORRADOR, {
    BORRADOR: "Borrador",
    EN_REVISION: "En revisión",
    PUBLICADO: "Publicado",
    DESCARTADO: "Descartado",
  });
  assert.deepEqual(ESTADO_VERSION, {
    PROGRAMADA: "Programada",
    VIGENTE: "Vigente",
    REEMPLAZADA: "Reemplazada",
  });
});

// ── Form: reading what was typed ───────────────────────────────────────────

test("B5 UI: el formulario acepta coma o punto decimal y rechaza lo que no es un número", () => {
  assert.equal(leerNumero("8"), 8);
  assert.equal(leerNumero(" 0,35 "), 0.35);
  assert.equal(leerNumero("0.35"), 0.35);
  for (const malo of ["", " ", "abc", "1,2,3", "1e3", "-4", "8 h", "NaN", "Infinity"])
    assert.equal(leerNumero(malo), null, JSON.stringify(malo));
});

test("B5 UI: formularioDe y leerFormulario son inversos para una propuesta válida", () => {
  const casos: PropuestaReglas[] = [
    propuesta(),
    {
      ...propuesta(),
      weights: { HE: 0.125, DS: 0.325, CT: 0.3, VP: 0.25 },
      thresholds: { HE: 7.5, DS: 5, CT: 0.35, VP: 12 },
      mediumLimit: 35,
      highLimit: 65,
      minExceededFactors: 3,
    },
    {
      ...propuesta(),
      weights: { HE: 1 / 3, DS: 1 / 3, CT: 0.2, VP: 0.1333 },
    },
  ];
  for (const original of casos) {
    const formulario = formularioDe(original, "Motivo de prueba suficiente.");
    const lectura = leerFormulario(formulario);
    assert.deepEqual(lectura.errores, {});
    assert.equal(lectura.motivo, "Motivo de prueba suficiente.");
    // Weights travel as percent text with at most two decimals: compare at that precision.
    assert.deepEqual(
      lectura.propuesta && {
        ...lectura.propuesta,
        weights: Object.fromEntries(
          Object.entries(lectura.propuesta.weights).map(([f, v]) => [f, Math.round(v * 10000) / 10000]),
        ),
      },
      {
        ...original,
        weights: Object.fromEntries(
          Object.entries(original.weights).map(([f, v]) => [f, Math.round(v * 10000) / 10000]),
        ),
      },
    );
  }
});

test("B5 UI: un peso de 30 escrito en la pantalla viaja como 0,3 sin error de coma flotante", () => {
  const f = formularioDe(propuesta(), "x");
  for (const texto of ["30", "12,5", "33,33", "7", "0,05"]) {
    const lectura = leerFormulario({ ...f, "weights.HE": texto });
    const esperado = Math.round(Number(texto.replace(",", ".")) * 100) / 10000;
    assert.equal(lectura.propuesta?.weights.HE, esperado, texto);
  }
});

test("B5 UI: cada campo ilegible se señala en su lugar y no se pierde lo escrito", () => {
  const f = formularioDe(propuesta(), "Motivo suficiente");
  const lectura = leerFormulario({
    ...f,
    "weights.HE": "treinta",
    "thresholds.CT": "",
    mediumLimit: "4x",
    effectiveFrom: "9/11/2026",
    minExceededFactors: "5",
  });
  assert.equal(lectura.propuesta, null);
  assert.deepEqual(Object.keys(lectura.errores).sort(), [
    "effectiveFrom",
    "mediumLimit",
    "minExceededFactors",
    "thresholds.CT",
    "weights.HE",
  ]);
  assert.match(lectura.errores["weights.HE"]!, /número/);
  assert.match(lectura.errores.effectiveFrom!, /fecha/i);
  assert.match(lectura.errores.minExceededFactors!, /2, 3 o 4/);
});

test("B5 UI: la suma de pesos se informa en vivo y es nula si algún peso no se lee", () => {
  const f = formularioDe(propuesta(), "x");
  assert.equal(sumaPesos(f), 100);
  assert.equal(sumaPesos({ ...f, "weights.HE": "35" }), 105);
  assert.equal(sumaPesos({ ...f, "weights.HE": "12,5", "weights.DS": "32,5" }), 85);
  assert.equal(sumaPesos({ ...f, "weights.VP": "" }), null);
});

test("B5 UI: sinGuardar compara lo escrito con lo guardado, sin sensibilidad a espacios ni a la coma", () => {
  const guardado = propuesta();
  const f = formularioDe(guardado, "Motivo suficiente");
  assert.equal(sinGuardar(f, guardado, "Motivo suficiente"), false);
  assert.equal(sinGuardar({ ...f, motivo: "  Motivo suficiente " }, guardado, "Motivo suficiente"), false);
  assert.equal(sinGuardar({ ...f, "thresholds.CT": "0,350" }, guardado, "Motivo suficiente"), false);
  assert.equal(sinGuardar({ ...f, "thresholds.HE": "9" }, guardado, "Motivo suficiente"), true);
  assert.equal(sinGuardar({ ...f, motivo: "Otro motivo" }, guardado, "Motivo suficiente"), true);
  assert.equal(sinGuardar({ ...f, highLimit: "abc" }, guardado, "Motivo suficiente"), true);
});

// ── Form: errors the server reports ────────────────────────────────────────

test("B5 UI: todo problema que el servidor puede informar tiene lugar en el formulario", () => {
  const sembrado = propuesta();
  const malas: unknown[] = [
    { ...sembrado, weights: { HE: 0.4, DS: 0.3, CT: 0.25, VP: 0.15 } },
    { ...sembrado, weights: { HE: 0.01, DS: 0.3, CT: 0.29, VP: 0.4 } },
    { ...sembrado, thresholds: { HE: 0, DS: 6, CT: 1.5, VP: 10 } },
    { ...sembrado, mediumLimit: 80, highLimit: 70 },
    { ...sembrado, highLimit: 120 },
    { ...sembrado, minExceededFactors: 1 },
    { ...sembrado, effectiveFrom: "2026-11-10" },
  ];
  for (const entrada of malas) {
    const { problemas } = validarPropuesta(entrada);
    assert.ok(problemas.length > 0);
    const { porCampo, generales } = erroresDeServidor(
      problemas.map((p) => ({ fila: null, campo: p.campo, codigo: "X", detalle: p.detalle })),
    );
    assert.deepEqual(generales, [], JSON.stringify(problemas));
    for (const p of problemas) assert.ok(porCampo[p.campo], p.campo);
  }
});

test("B5 UI: el motivo y los avisos generales llegan donde corresponden", () => {
  const { porCampo, generales } = erroresDeServidor([
    { fila: null, campo: "motivo", codigo: "X", detalle: "Indique el motivo del cambio." },
    { fila: null, campo: "propuesta", codigo: "X", detalle: "Sin cambios respecto de v1." },
    { fila: null, campo: "weights", codigo: "X", detalle: "Los pesos suman 110 %." },
    { fila: null, campo: "weights", codigo: "X", detalle: "Revise los pesos." },
  ]);
  assert.equal(porCampo.motivo, "Indique el motivo del cambio.");
  assert.equal(porCampo.weights, "Los pesos suman 110 %. Revise los pesos.");
  assert.deepEqual(generales, ["Sin cambios respecto de v1."]);
  assert.ok(CAMPOS_FORMULARIO.includes("motivo"));
});

// ── Actions by role and state ──────────────────────────────────────────────

const rrhh = { userId: "demo-rrhh", nombre: "Marina", rol: "RRHH" as const };
const gerencia = { userId: "demo-gerencia", nombre: "Diego", rol: "GERENCIA" as const };

function entrada(
  rol: Rol,
  borrador: Partial<EntradaAcciones["borrador"]> = {},
  extra: Partial<Omit<EntradaAcciones, "borrador" | "rol">> = {},
): EntradaAcciones {
  return {
    rol,
    usuarioId: rol === "GERENCIA" ? gerencia.userId : rrhh.userId,
    sinGuardar: false,
    borrador: {
      estado: "BORRADOR",
      aprobadoPor: null,
      creadoPor: rrhh,
      simulado: true,
      simulacionVigente: true,
      requiereAprobacion: false,
      problemas: [],
      ...borrador,
    },
    ...extra,
  };
}
const visibles = (e: EntradaAcciones) =>
  Object.entries(accionesDe(e))
    .filter(([, d]) => d.visible)
    .map(([a]) => a as Accion)
    .sort();
const habilitadas = (e: EntradaAcciones) =>
  Object.entries(accionesDe(e))
    .filter(([, d]) => d.visible && d.habilitada)
    .map(([a]) => a as Accion)
    .sort();

test("B5 UI: RR. HH. con un borrador a futuro guarda, simula, publica o descarta; no envía a revisión", () => {
  const e = entrada("RRHH");
  assert.deepEqual(visibles(e), ["descartar", "guardar", "publicar", "simular"]);
  assert.deepEqual(habilitadas(e), ["descartar", "guardar", "publicar", "simular"]);
});

test("B5 UI: RR. HH. con un borrador retroactivo lo envía a revisión y no puede publicarlo", () => {
  const e = entrada("RRHH", { requiereAprobacion: true });
  assert.deepEqual(visibles(e), ["descartar", "enviar", "guardar", "simular"]);
  assert.deepEqual(habilitadas(e), ["descartar", "enviar", "guardar", "simular"]);
});

test("B5 UI: un borrador retroactivo en revisión espera a Gerencia; RR. HH. solo puede simular, guardar o descartar", () => {
  const e = entrada("RRHH", { estado: "EN_REVISION", requiereAprobacion: true });
  assert.deepEqual(visibles(e), ["descartar", "guardar", "simular"]);
});

test("B5 UI: aprobado, RR. HH. solo publica o descarta y el contenido queda fijo", () => {
  const e = entrada("RRHH", {
    estado: "EN_REVISION",
    requiereAprobacion: true,
    aprobadoPor: gerencia,
  });
  assert.deepEqual(visibles(e), ["descartar", "publicar"]);
  assert.deepEqual(habilitadas(e), ["descartar", "publicar"]);
});

test("B5 UI: Gerencia aprueba o rechaza solo lo que está en revisión y no ve acciones de edición", () => {
  const enRevision = entrada("GERENCIA", { estado: "EN_REVISION", requiereAprobacion: true });
  assert.deepEqual(visibles(enRevision), ["aprobar", "rechazar"]);
  assert.deepEqual(habilitadas(enRevision), ["aprobar", "rechazar"]);

  for (const estado of ["BORRADOR", "PUBLICADO", "DESCARTADO"] as const)
    assert.deepEqual(visibles(entrada("GERENCIA", { estado })), [], estado);
  assert.deepEqual(
    visibles(entrada("GERENCIA", { estado: "EN_REVISION", aprobadoPor: gerencia })),
    [],
  );
});

test("B5 UI: nadie aprueba ni rechaza su propio borrador", () => {
  const propio = entrada(
    "GERENCIA",
    { estado: "EN_REVISION", requiereAprobacion: true, creadoPor: gerencia },
  );
  const acciones = accionesDe(propio);
  for (const a of ["aprobar", "rechazar"] as const) {
    const d = acciones[a];
    assert.ok(d.visible && !d.habilitada, a);
    assert.match(d.visible && !d.habilitada ? d.razon : "", /persona distinta/);
  }
});

test("B5 UI: el Team Lead y el Colaborador no ven ninguna acción en ningún estado", () => {
  for (const rol of ["TEAM_LEAD", "EMPLEADO"] as const)
    for (const estado of ["BORRADOR", "EN_REVISION", "PUBLICADO", "DESCARTADO"] as const)
      assert.deepEqual(visibles(entrada(rol, { estado })), [], `${rol} ${estado}`);
});

test("B5 UI: un borrador cerrado no ofrece acciones a nadie", () => {
  for (const rol of ["RRHH", "GERENCIA"] as const)
    for (const estado of ["PUBLICADO", "DESCARTADO"] as const)
      assert.deepEqual(visibles(entrada(rol, { estado })), [], `${rol} ${estado}`);
});

test("B5 UI: lo que no se puede hacer todavía se muestra deshabilitado con su razón, en orden de prioridad", () => {
  const sinSimular = accionesDe(entrada("RRHH", { simulado: false }));
  assert.ok(sinSimular.publicar.visible && !sinSimular.publicar.habilitada);
  assert.match(
    sinSimular.publicar.visible && !sinSimular.publicar.habilitada ? sinSimular.publicar.razon : "",
    /Simule el impacto/,
  );

  const vencida = accionesDe(entrada("RRHH", { simulacionVigente: false }));
  assert.match(
    vencida.publicar.visible && !vencida.publicar.habilitada ? vencida.publicar.razon : "",
    /datos cambiaron/,
  );

  const conProblemas = accionesDe(
    entrada("RRHH", {
      simulado: false,
      problemas: [{ fila: null, campo: "motivo", codigo: "X", detalle: "Indique el motivo." }],
    }),
  );
  for (const a of ["simular", "publicar"] as const) {
    const d = conProblemas[a];
    assert.match(d.visible && !d.habilitada ? d.razon : "", /Corrija los datos/, a);
  }

  const pendiente = accionesDe(
    entrada("RRHH", { simulado: false, problemas: [{ fila: null, campo: "motivo", codigo: "X", detalle: "x" }] }, { sinGuardar: true }),
  );
  for (const a of ["simular", "publicar"] as const) {
    const d = pendiente[a];
    assert.match(d.visible && !d.habilitada ? d.razon : "", /Guarde los cambios/, a);
  }
  assert.ok(pendiente.guardar.visible && pendiente.guardar.habilitada);
  assert.ok(pendiente.descartar.visible && pendiente.descartar.habilitada);
});

test("B5 UI: Gerencia no puede aprobar con una simulación desactualizada y se le dice quién debe actuar", () => {
  const vencida = accionesDe(
    entrada("GERENCIA", { estado: "EN_REVISION", requiereAprobacion: true, simulacionVigente: false }),
  );
  const d = vencida.aprobar;
  assert.ok(d.visible && !d.habilitada);
  assert.match(d.visible && !d.habilitada ? d.razon : "", /RR\. HH\. debe simular nuevamente/);
  assert.ok(vencida.rechazar.visible && vencida.rechazar.habilitada);
});

test("B5 UI: las razones de bloqueo se listan una sola vez", () => {
  const e = entrada("RRHH", { simulado: false, requiereAprobacion: true });
  const razones = razonesBloqueo(accionesDe(e));
  assert.deepEqual(razones, ["Simule el impacto del borrador actual."]);
});

// ── Helpers shared by the tests above ──────────────────────────────────────

test("B5 UI: el formulario cubre exactamente los campos que el servidor edita más el motivo", () => {
  const esperado = [...Object.keys(aplanar(propuesta())), "motivo"].sort();
  assert.deepEqual([...CAMPOS_FORMULARIO].sort(), esperado);
  const f: Formulario = formularioDe(propuesta(), "m");
  assert.deepEqual(Object.keys(f).sort(), esperado);
});
