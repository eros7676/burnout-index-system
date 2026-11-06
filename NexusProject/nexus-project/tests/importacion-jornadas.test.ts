import assert from "node:assert/strict";
import { test } from "node:test";
import { empleadosSemilla, reglasSemilla } from "../prisma/seed-data";
import { ErrorFormatoImportacion, leerCsv } from "../src/server/services/csv-importacion";
import {
  COLUMNAS_JORNADAS,
  ESQUEMA_CSV_JORNADAS,
  PLANTILLA_JORNADAS_CSV,
  controlesDe,
  huellaJornadas,
  validarCsvJornadas,
  type ColumnaJornada,
  type FuenteJornadas,
  type RegistroJornadas,
} from "../src/server/services/jornadas-importacion";

// The week has closed at `ahora`.
const ahora = new Date("2026-10-26T12:00:00Z");
const W = { inicio: "2026-10-12", fin: "2026-10-18" };
const FECHAS = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];

type FilaJ = Partial<Record<ColumnaJornada, string>>;
type Dia = [tipo: string, horasTrabajadas: string, horasExtra: string];

/** EMP-001's week of the seed: 56 h worked, 16 of them overtime, seven days in a row. */
const SEMANA_LARGA: Dia[] = [
  ["TRABAJO", "10", "2"],
  ["TRABAJO", "10", "2"],
  ["TRABAJO", "10", "2"],
  ["TRABAJO", "10", "2"],
  ["TRABAJO", "10", "2"],
  ["TRABAJO", "3", "3"],
  ["TRABAJO", "3", "3"],
];

function semana(dias: Dia[], cambios: FilaJ = {}): FilaJ[] {
  return dias.map(([tipo_dia, horas_trabajadas, horas_extra], i) => ({
    employee_id: "EMP-001",
    period_start: W.inicio,
    period_end: W.fin,
    fecha: FECHAS[i],
    tipo_dia,
    horas_trabajadas,
    horas_extra,
    ...cambios,
  }));
}

function csv(filas: FilaJ[], columnas: readonly ColumnaJornada[] = COLUMNAS_JORNADAS) {
  const lineas = filas.map((f) => columnas.map((c) => f[c] ?? "").join(","));
  return Buffer.from(`${columnas.join(",")}\n${lineas.join("\n")}\n`);
}

function registro(cambios: Partial<RegistroJornadas> = {}): RegistroJornadas {
  return {
    recordId: "rec-1",
    periodoId: "per-1",
    employeeId: "EMP-001",
    periodStart: W.inicio,
    periodEnd: W.fin,
    horasExtra: 16,
    horasTrabajadas: 56,
    diasConsecutivosSinDescanso: 16,
    diasDesdeUltimasVacaciones: 127,
    huellaJornadas: null,
    ...cambios,
  };
}
function fuente(
  semanas: RegistroJornadas[] = [registro()],
): FuenteJornadas & { llamadas: { empleados: number; semanas: number } } {
  const llamadas = { empleados: 0, semanas: 0 };
  return {
    llamadas,
    empleados: async () => {
      llamadas.empleados++;
      return empleadosSemilla;
    },
    primeraVigencia: async () => reglasSemilla.effectiveFrom,
    semanas: async () => {
      llamadas.semanas++;
      return semanas;
    },
  };
}
const validar = (filas: FilaJ[], f: FuenteJornadas = fuente()) => validarCsvJornadas(csv(filas), f, ahora);
const codigos = (r: { errores: { codigo: string }[] }) => r.errores.map((e) => e.codigo);

test("jornadas-v1: el encabezado exige las siete columnas de la plantilla", () => {
  assert.doesNotThrow(() => leerCsv(csv(semana(SEMANA_LARGA)), ESQUEMA_CSV_JORNADAS));
  assert.throws(
    () => leerCsv(csv(semana(SEMANA_LARGA), COLUMNAS_JORNADAS.filter((c) => c !== "tipo_dia")), ESQUEMA_CSV_JORNADAS),
    ErrorFormatoImportacion,
  );
});

test("jornadas-v1: la plantilla descargable se lee y su semana es coherente", () => {
  const { filas } = leerCsv(Buffer.from(PLANTILLA_JORNADAS_CSV), ESQUEMA_CSV_JORNADAS);
  assert.equal(filas.length, 7);
  const dias = filas.map(({ celdas: c }) => ({
    fecha: c.fecha!,
    tipo: c.tipo_dia as "TRABAJO",
    horasTrabajadas: Number(c.horas_trabajadas || 0),
    horasExtra: Number(c.horas_extra || 0),
  }));
  assert.deepEqual(controlesDe("2026-10-18", dias), {
    horasExtra: 2.5,
    horasTrabajadas: 42.5,
    diasSeguidos: 5,
    diasDesdeVacaciones: null,
    vacaciones: 0,
    licencias: 1,
  });
});

test("jornadas-v1: siete días que reproducen el resumen se validan y quedan listos para guardar", async () => {
  const f = fuente();
  const r = await validar(semana(SEMANA_LARGA), f);
  assert.equal(r.status, "VALIDADA", JSON.stringify(r.errores));
  assert.equal(r.nuevas, 7);
  assert.equal(r.semanasNuevas, 1);
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0]!.recordId, "rec-1");
  assert.deepEqual(r.grupos[0]!.dias.map((d) => d.fecha), FECHAS);
  assert.equal(r.muestra.length, 7);
  const fila = r.conciliacion.filas[0]!;
  assert.equal(fila.estado, "COINCIDE");
  assert.deepEqual(fila.derivado, {
    horasExtra: 16,
    horasTrabajadas: 56,
    diasSeguidos: 7,
    diasDesdeVacaciones: null,
    vacaciones: 0,
    licencias: 0,
  });
  assert.deepEqual(f.llamadas, { empleados: 1, semanas: 1 });
});

test("jornadas-v1: las horas que no suman el resumen rechazan el archivo y dicen cuánto falta", async () => {
  const dias = SEMANA_LARGA.map((d, i): Dia => (i === 0 ? ["TRABAJO", "8", "0"] : d));
  const r = await validar(semana(dias));
  assert.equal(r.status, "RECHAZADA");
  assert.deepEqual(codigos(r), ["JORNADAS_NO_COINCIDEN", "JORNADAS_NO_COINCIDEN"]);
  assert.deepEqual(r.errores.map((e) => e.campo), ["horas_extra", "horas_trabajadas"]);
  assert.match(r.errores[0]!.detalle, /informa 16 h extra y los días del archivo suman 14 h \(faltan 2 h\)/);
  assert.match(r.errores[1]!.detalle, /informa 56 h trabajadas y los días del archivo suman 54 h \(faltan 2 h\)/);
  assert.deepEqual(r.conciliacion.filas[0]!.diferencias, ["horasExtra", "horasTrabajadas"]);
  assert.equal(r.grupos.length, 0);
});

test("jornadas-v1: las horas con decimales se suman sin error de redondeo", async () => {
  const dias: Dia[] = [
    ["TRABAJO", "8.1", "0.1"],
    ["TRABAJO", "8.2", "0.2"],
    ["TRABAJO", "8.3", "0.3"],
    ["TRABAJO", "8", "0"],
    ["TRABAJO", "8", "0"],
    ["DESCANSO", "", ""],
    ["DESCANSO", "", ""],
  ];
  const r = await validar(
    semana(dias),
    fuente([registro({ horasExtra: 0.6, horasTrabajadas: 40.6, diasConsecutivosSinDescanso: 0 })]),
  );
  assert.equal(r.status, "VALIDADA", JSON.stringify(r.errores));
});

test("jornadas-v1: un resumen sin horas trabajadas solo concilia las horas extra", async () => {
  const r = await validar(semana(SEMANA_LARGA), fuente([registro({ horasTrabajadas: null })]));
  assert.equal(r.status, "VALIDADA");
});

test("jornadas-v1: la racha que llega al domingo tiene que ser la del resumen", async () => {
  // Rest on Wednesday: Thursday to Sunday are four days in a row.
  const dias: Dia[] = SEMANA_LARGA.map((d, i): Dia => (i === 2 ? ["DESCANSO", "", ""] : d));
  const resumen = { horasExtra: 14, horasTrabajadas: 46 };
  const bien = await validar(semana(dias), fuente([registro({ ...resumen, diasConsecutivosSinDescanso: 4 })]));
  assert.equal(bien.status, "VALIDADA", JSON.stringify(bien.errores));
  assert.equal(bien.conciliacion.filas[0]!.derivado.diasSeguidos, 4);

  const mal = await validar(semana(dias), fuente([registro({ ...resumen, diasConsecutivosSinDescanso: 9 })]));
  assert.deepEqual(codigos(mal), ["JORNADAS_NO_COINCIDEN"]);
  assert.equal(mal.errores[0]!.campo, "dias_consecutivos_sin_descanso");
  assert.match(mal.errores[0]!.detalle, /informa 9 días seguidos sin descanso y en el archivo la racha que llega al domingo es de 4 días/);
});

test("jornadas-v1: siete días trabajados admiten una racha más larga, nunca una más corta", async () => {
  const largo = await validar(semana(SEMANA_LARGA), fuente([registro({ diasConsecutivosSinDescanso: 23 })]));
  assert.equal(largo.status, "VALIDADA");
  const corto = await validar(semana(SEMANA_LARGA), fuente([registro({ diasConsecutivosSinDescanso: 5 })]));
  assert.deepEqual(codigos(corto), ["JORNADAS_NO_COINCIDEN"]);
  assert.match(corto.errores[0]!.detalle, /trabajó los siete días de la semana/);
});

test("jornadas-v1: el último día de vacaciones fija los días desde las últimas vacaciones", async () => {
  // Vacation Monday to Friday, then the weekend worked: the last vacation day is Friday 16/10.
  const dias: Dia[] = [
    ["VACACIONES", "", ""],
    ["VACACIONES", "", ""],
    ["VACACIONES", "", ""],
    ["VACACIONES", "", ""],
    ["VACACIONES", "", ""],
    ["TRABAJO", "6", "0"],
    ["TRABAJO", "6", "0"],
  ];
  const resumen = { horasExtra: 0, horasTrabajadas: 12, diasConsecutivosSinDescanso: 2 };
  const bien = await validar(semana(dias), fuente([registro({ ...resumen, diasDesdeUltimasVacaciones: 2 })]));
  assert.equal(bien.status, "VALIDADA", JSON.stringify(bien.errores));
  assert.equal(bien.conciliacion.filas[0]!.derivado.vacaciones, 5);

  const mal = await validar(semana(dias), fuente([registro({ ...resumen, diasDesdeUltimasVacaciones: 127 })]));
  assert.deepEqual(codigos(mal), ["JORNADAS_NO_COINCIDEN"]);
  assert.equal(mal.errores[0]!.campo, "dias_desde_ultimas_vacaciones");
  assert.match(mal.errores[0]!.detalle, /hace 127 días y en el archivo el último día de vacaciones es el 16\/10 \(hace 2 días\)/);

  const sinDato = await validar(semana(dias), fuente([registro({ ...resumen, diasDesdeUltimasVacaciones: null })]));
  assert.equal(sinDato.status, "VALIDADA");
});

test("jornadas-v1: sin vacaciones en la semana, las últimas fueron hace siete días o más", async () => {
  const r = await validar(semana(SEMANA_LARGA), fuente([registro({ diasDesdeUltimasVacaciones: 3 })]));
  assert.deepEqual(codigos(r), ["JORNADAS_NO_COINCIDEN"]);
  assert.match(r.errores[0]!.detalle, /el archivo no tiene días de vacaciones en la semana/);
});

test("jornadas-v1: la licencia corta la racha y se cuenta, sin motivo", async () => {
  const dias: Dia[] = [
    ["LICENCIA", "", ""],
    ["LICENCIA", "", ""],
    ["TRABAJO", "11", "1"],
    ["DESCANSO", "", ""],
    ["TRABAJO", "11", "1"],
    ["TRABAJO", "11", "1"],
    ["TRABAJO", "11", "1"],
  ];
  const r = await validar(
    semana(dias),
    fuente([registro({ horasExtra: 4, horasTrabajadas: 44, diasConsecutivosSinDescanso: 3 })]),
  );
  assert.equal(r.status, "VALIDADA", JSON.stringify(r.errores));
  assert.equal(r.conciliacion.filas[0]!.derivado.licencias, 2);
});

test("jornadas-v1: una semana sin sus siete días se rechaza nombrando los que faltan", async () => {
  const r = await validar(semana(SEMANA_LARGA).filter((_, i) => i !== 2 && i !== 3));
  assert.deepEqual(codigos(r), ["SEMANA_INCOMPLETA"]);
  assert.match(r.errores[0]!.detalle, /faltan los días 14\/10 y 15\/10/);
  assert.equal(r.conciliacion.semanas, 0);
});

test("jornadas-v1: una semana sin resumen importado se rechaza", async () => {
  const r = await validar(semana(SEMANA_LARGA), fuente([]));
  assert.deepEqual(codigos(r), ["SEMANA_SIN_RESUMEN"]);
  assert.equal(r.conciliacion.sinResumen, 1);
});

test("jornadas-v1: cada fila inválida informa fila, campo y código, y no suma a los controles", async () => {
  const filas = semana(SEMANA_LARGA);
  filas[0] = { ...filas[0], tipo_dia: "FERIADO" };
  filas[1] = { ...filas[1], tipo_dia: "DESCANSO" };
  filas[2] = { ...filas[2], horas_extra: "12" };
  filas[3] = { ...filas[3], fecha: "2026-10-19" };
  filas[4] = { ...filas[4], horas_trabajadas: "25" };
  filas[5] = { ...filas[5], horas_trabajadas: "" };
  filas[6] = { ...filas[6], fecha: "2026-10-17" };
  const r = await validar(filas);
  assert.deepEqual(
    r.errores.map((e) => [e.fila, e.campo, e.codigo]),
    [
      [2, "tipo_dia", "VALOR_NO_PERMITIDO"],
      [3, "horas_trabajadas", "VALOR_NO_PERMITIDO"],
      [4, "horas_extra", "RANGO_INVALIDO"],
      [5, "fecha", "FECHA_INCOHERENTE"],
      [6, "horas_trabajadas", "RANGO_INVALIDO"],
      [7, "horas_trabajadas", "OBLIGATORIO"],
      [8, "fecha", "DUPLICADO_LOTE"],
    ],
  );
  assert.equal(r.conciliacion.semanas, 0, "a week with a faulty row is not reconciled");
});

test("jornadas-v1: un día de trabajo sin horas es un error", async () => {
  const filas = semana(SEMANA_LARGA);
  filas[0] = { ...filas[0], horas_trabajadas: "0", horas_extra: "0" };
  const r = await validar(filas);
  assert.deepEqual(r.errores.map((e) => [e.campo, e.codigo]), [["horas_trabajadas", "RANGO_INVALIDO"]]);
});

test("jornadas-v1: el mismo detalle ya guardado se omite y uno distinto es un conflicto", async () => {
  const filas = semana(SEMANA_LARGA);
  const primero = await validar(filas);
  const huella = primero.grupos[0]!.huella;
  const repetido = await validar(filas, fuente([registro({ huellaJornadas: huella })]));
  assert.equal(repetido.status, "VALIDADA");
  assert.equal(repetido.nuevas, 0);
  assert.equal(repetido.omitidas, 7);
  assert.equal(repetido.conciliacion.filas[0]!.yaCargada, true);

  const otro = await validar(filas, fuente([registro({ huellaJornadas: "f".repeat(64) })]));
  assert.deepEqual(codigos(otro), ["CONFLICTO_HISTORICO"]);
});

test("jornadas-v1: la huella no depende del orden de las filas", () => {
  const dias = SEMANA_LARGA.map(([tipo, ht, he], i) => ({
    fecha: FECHAS[i]!,
    tipo: tipo as "TRABAJO",
    horasTrabajadas: Number(ht),
    horasExtra: Number(he),
  }));
  assert.equal(huellaJornadas(dias), huellaJornadas([...dias].reverse()));
  assert.notEqual(huellaJornadas(dias), huellaJornadas(dias.map((d, i) => (i ? d : { ...d, horasExtra: 1 }))));
});

test("jornadas-v1: horas con tres decimales coinciden exactas y una milésima de diferencia rechaza", async () => {
  const dias: Dia[] = [
    ["TRABAJO", "8.125", "0.125"],
    ["TRABAJO", "8", "0"],
    ["TRABAJO", "8", "0"],
    ["TRABAJO", "8", "0"],
    ["TRABAJO", "8", "0"],
    ["DESCANSO", "", ""],
    ["DESCANSO", "", ""],
  ];
  const resumen = { horasTrabajadas: 40.125, diasConsecutivosSinDescanso: 0 };
  const bien = await validar(semana(dias), fuente([registro({ ...resumen, horasExtra: 0.125 })]));
  assert.equal(bien.status, "VALIDADA", JSON.stringify(bien.errores));

  const mal = await validar(semana(dias), fuente([registro({ ...resumen, horasExtra: 0.124 })]));
  assert.deepEqual(codigos(mal), ["JORNADAS_NO_COINCIDEN"]);
  assert.match(mal.errores[0]!.detalle, /informa 0,124 h extra y los días del archivo suman 0,125 h \(sobran 0,001 h\)/);
});

test("jornadas-v1: vacaciones el domingo son cero días desde las últimas, y descanso el domingo es racha cero", async () => {
  const conVacaciones: Dia[] = [...SEMANA_LARGA.slice(0, 6), ["VACACIONES", "", ""]];
  const r = await validar(
    semana(conVacaciones),
    fuente([registro({ horasExtra: 13, horasTrabajadas: 53, diasConsecutivosSinDescanso: 0, diasDesdeUltimasVacaciones: 0 })]),
  );
  assert.equal(r.status, "VALIDADA", JSON.stringify(r.errores));
  assert.equal(r.conciliacion.filas[0]!.derivado.diasDesdeVacaciones, 0);
  assert.equal(r.conciliacion.filas[0]!.derivado.diasSeguidos, 0);

  const conDescanso: Dia[] = [...SEMANA_LARGA.slice(0, 6), ["DESCANSO", "", ""]];
  const d = await validar(
    semana(conDescanso),
    fuente([registro({ horasExtra: 13, horasTrabajadas: 53, diasConsecutivosSinDescanso: 6 })]),
  );
  assert.deepEqual(codigos(d), ["JORNADAS_NO_COINCIDEN"]);
  assert.match(d.errores[0]!.detalle, /la racha que llega al domingo es de 0 días/);
});
