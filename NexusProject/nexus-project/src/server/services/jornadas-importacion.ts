// `jornadas-v1`: the day detail behind a week's hours, rest streak and last vacation day.
// Seven rows per employee-week, one per day, each saying what the day was (worked, rest, vacation
// or other leave) and its hours. Like `tareas-v1`, the rows are evidence and the weekly summary
// acts as control totals: a file whose days contradict the summary is rejected as a whole, and
// the index is never recalculated from the days. Pure: no IO, the reads come through `FuenteJornadas`.
import { createHash } from "node:crypto";
import type { ErrorCampo, FechaISO, ParPeriodo } from "../../shared/contracts";
import {
  MAX_ERRORES_REPORTADOS,
  MAX_FILAS_CONCILIACION,
  MAX_FILAS_JORNADAS,
  TIPOS_DIA,
  type CampoJornadas,
  type CodigoErrorJornada,
  type ConciliacionJornadasSemana,
  type ControlesJornadas,
  type MuestraJornada,
  type ResumenConciliacionJornadas,
  type ResumenJornadas,
  type TipoDia,
} from "../../shared/contratos/importaciones";
import type { CodigoErrorFila } from "../../shared/errors";
import { fechaParaDb } from "../repositories/fechas";
import { leerCsv, type EsquemaCsv, type FilaCsvDe } from "./csv-importacion";
import { Informe } from "./informe-errores";
import {
  hoyEnBuenosAires,
  validarEmpleadoYSemana,
  type EmpleadoValidacion,
} from "./validacion-comun";

export const COLUMNAS_JORNADAS = [
  "employee_id",
  "period_start",
  "period_end",
  "fecha",
  "tipo_dia",
  "horas_trabajadas",
  "horas_extra",
] as const;
export type ColumnaJornada = (typeof COLUMNAS_JORNADAS)[number];
export type FilaCsvJornadas = FilaCsvDe<ColumnaJornada>;
export const ESQUEMA_CSV_JORNADAS: EsquemaCsv<ColumnaJornada> = {
  columnas: COLUMNAS_JORNADAS,
  obligatorias: COLUMNAS_JORNADAS,
  maxFilas: MAX_FILAS_JORNADAS,
};
export const leerCsvJornadas = (bytes: Uint8Array) => leerCsv(bytes, ESQUEMA_CSV_JORNADAS);

/** Header and one example week of the downloadable template (templates/jornadas.csv). */
export const PLANTILLA_JORNADAS_CSV = `${COLUMNAS_JORNADAS.join(",")}
EMP-003,2026-10-12,2026-10-18,2026-10-12,LICENCIA,,
EMP-003,2026-10-12,2026-10-18,2026-10-13,DESCANSO,,
EMP-003,2026-10-12,2026-10-18,2026-10-14,TRABAJO,9,1
EMP-003,2026-10-12,2026-10-18,2026-10-15,TRABAJO,8,0
EMP-003,2026-10-12,2026-10-18,2026-10-16,TRABAJO,9.5,1.5
EMP-003,2026-10-12,2026-10-18,2026-10-17,TRABAJO,8,0
EMP-003,2026-10-12,2026-10-18,2026-10-18,TRABAJO,8,0
`;

export type JornadaNormalizada = {
  fila: number;
  fecha: FechaISO;
  tipo: TipoDia;
  horasTrabajadas: number;
  horasExtra: number;
};

/** A week's current summary, with the fingerprint of the day detail already stored (if any). */
export type RegistroJornadas = ParPeriodo &
  ResumenJornadas & {
    recordId: string;
    periodoId: string;
    huellaJornadas: string | null;
  };
/** Reads by batch; the Prisma adapter takes the client or the confirmation transaction. */
export interface FuenteJornadas {
  empleados(ids: string[]): Promise<EmpleadoValidacion[]>;
  /** Earliest rule-version effectiveFrom (YYYY-MM-DD); null when none is published. */
  primeraVigencia(): Promise<string | null>;
  /** The confirmed current record of each employee-week; weeks without a summary are absent. */
  semanas(pares: ParPeriodo[]): Promise<RegistroJornadas[]>;
}

/** An employee-week whose days are ready to be stored, in date order. */
export type GrupoJornadas = ParPeriodo & {
  recordId: string;
  periodoId: string;
  huella: string;
  dias: JornadaNormalizada[];
};
export type ValidacionJornadas = {
  status: "VALIDADA" | "RECHAZADA";
  totalFilas: number;
  /** Day rows that will be stored / that are already stored and skipped. */
  nuevas: number;
  omitidas: number;
  semanasNuevas: number;
  semanasOmitidas: number;
  /** The first days of the weeks that reconcile and are not stored yet. */
  muestra: MuestraJornada[];
  errores: ErrorCampo[];
  warnings: ErrorCampo[];
  conciliacion: ResumenConciliacionJornadas;
  /** Empty if there is any error: a partial batch is never handed over for insertion. */
  grupos: GrupoJornadas[];
};

const MS_DIA = 86_400_000;
const dias = (desde: FechaISO, hasta: FechaISO) =>
  Math.round((fechaParaDb(hasta).getTime() - fechaParaDb(desde).getTime()) / MS_DIA);
const sumar = (iso: FechaISO, n: number) =>
  new Date(fechaParaDb(iso).getTime() + n * MS_DIA).toISOString().slice(0, 10);
/** Sums of decimal hours, without binary noise (7.1 + 0.2 is 7.3, not 7.300000000000001). */
const redondear = (n: number) => Math.round(n * 100) / 100;
const iguales = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * What the seven days add up to (D2, D3 of Docs/detalle-jornadas.md). The streak counts the
 * worked days that end on Sunday: vacation, leave and rest days all break it. The last
 * vacation day sets the days since vacation (0 when Sunday itself was a vacation day).
 */
export function controlesDe(
  periodEnd: FechaISO,
  semana: readonly Pick<JornadaNormalizada, "fecha" | "tipo" | "horasTrabajadas" | "horasExtra">[],
): ControlesJornadas {
  const orden = [...semana].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  let diasSeguidos = 0;
  for (let i = orden.length - 1; i >= 0 && orden[i]!.tipo === "TRABAJO"; i--) diasSeguidos++;
  const ultimaVacacion = orden.findLast((d) => d.tipo === "VACACIONES");
  return {
    horasExtra: redondear(orden.reduce((t, d) => t + d.horasExtra, 0)),
    horasTrabajadas: redondear(orden.reduce((t, d) => t + d.horasTrabajadas, 0)),
    diasSeguidos,
    diasDesdeVacaciones: ultimaVacacion ? dias(ultimaVacacion.fecha, periodEnd) : null,
    vacaciones: orden.filter((d) => d.tipo === "VACACIONES").length,
    licencias: orden.filter((d) => d.tipo === "LICENCIA").length,
  };
}

/**
 * The summary values the days contradict. Hours must add up exactly. A streak shorter than
 * the week must equal the summary's days without rest; seven worked days only say the summary
 * has at least seven, since the streak may have begun the week before. Without a vacation day
 * in the week, the last vacation was at least seven days before Sunday.
 */
export function diferenciasDe(esperado: ResumenJornadas, d: ControlesJornadas): CampoJornadas[] {
  const campos: CampoJornadas[] = [];
  if (!iguales(esperado.horasExtra, d.horasExtra)) campos.push("horasExtra");
  if (esperado.horasTrabajadas !== null && !iguales(esperado.horasTrabajadas, d.horasTrabajadas))
    campos.push("horasTrabajadas");
  if (
    d.diasSeguidos < 7
      ? esperado.diasConsecutivosSinDescanso !== d.diasSeguidos
      : esperado.diasConsecutivosSinDescanso < 7
  )
    campos.push("diasConsecutivosSinDescanso");
  const desde = esperado.diasDesdeUltimasVacaciones;
  if (desde !== null && (d.diasDesdeVacaciones !== null ? desde !== d.diasDesdeVacaciones : desde < 7))
    campos.push("diasDesdeUltimasVacaciones");
  return campos;
}

/** SHA-256 of the stored fields of the days, by date: same detail, same fingerprint. */
export function huellaJornadas(
  semana: readonly Pick<JornadaNormalizada, "fecha" | "tipo" | "horasTrabajadas" | "horasExtra">[],
): string {
  const filas = semana
    .map((d) => [d.fecha, d.tipo, d.horasTrabajadas, d.horasExtra] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(filas), "utf8").digest("hex");
}

const claveSemana = (p: ParPeriodo) => JSON.stringify([p.employeeId, p.periodStart, p.periodEnd]);
const fechaCorta = (f: FechaISO) => `${f.slice(8)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const diaMes = (f: FechaISO) => `${f.slice(8)}/${f.slice(5, 7)}`;
const HORAS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const h = (n: number) => `${HORAS.format(n)} h`;
const cuantos = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
const lista = (xs: string[]) =>
  xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
const NUMERO = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

const COLUMNA: Record<CampoJornadas, ColumnaJornada | "dias_consecutivos_sin_descanso" | "dias_desde_ultimas_vacaciones"> = {
  horasExtra: "horas_extra",
  horasTrabajadas: "horas_trabajadas",
  diasConsecutivosSinDescanso: "dias_consecutivos_sin_descanso",
  diasDesdeUltimasVacaciones: "dias_desde_ultimas_vacaciones",
};

/** The difference in words, for the person who fixes the file. */
function explicar(campo: CampoJornadas, e: ResumenJornadas, d: ControlesJornadas, ultimaVacacion: FechaISO | null) {
  const falta = (esperado: number, derivado: number) => {
    const n = redondear(esperado - derivado);
    return n > 0 ? `faltan ${h(n)}` : `sobran ${h(-n)}`;
  };
  switch (campo) {
    case "horasExtra":
      return `el resumen semanal informa ${h(e.horasExtra)} extra y los días del archivo suman ${h(d.horasExtra)} (${falta(e.horasExtra, d.horasExtra)}).`;
    case "horasTrabajadas":
      return `el resumen semanal informa ${h(e.horasTrabajadas!)} trabajadas y los días del archivo suman ${h(d.horasTrabajadas)} (${falta(e.horasTrabajadas!, d.horasTrabajadas)}).`;
    case "diasConsecutivosSinDescanso":
      return d.diasSeguidos < 7
        ? `el resumen semanal informa ${cuantos(e.diasConsecutivosSinDescanso)} seguidos sin descanso y en el archivo la racha que llega al domingo es de ${cuantos(d.diasSeguidos)}.`
        : `el resumen semanal informa ${cuantos(e.diasConsecutivosSinDescanso)} seguidos sin descanso, pero en el archivo la persona trabajó los siete días de la semana.`;
    case "diasDesdeUltimasVacaciones":
      return ultimaVacacion
        ? `el resumen semanal informa que las últimas vacaciones fueron hace ${cuantos(e.diasDesdeUltimasVacaciones!)} y en el archivo el último día de vacaciones es el ${diaMes(ultimaVacacion)} (hace ${cuantos(d.diasDesdeVacaciones!)}).`
        : `el resumen semanal informa que las últimas vacaciones fueron hace ${cuantos(e.diasDesdeUltimasVacaciones!)}, pero el archivo no tiene días de vacaciones en la semana.`;
  }
}

type Grupo = ParPeriodo & { primeraFila: number; dias: JornadaNormalizada[] };

/**
 * Validates every row, then checks that each employee-week has its seven days and reconciles
 * them against the stored summary. Cost: O(rows) in memory and three batched reads (catalogue,
 * rules, summaries), never one per row. Reusable on confirmation to check everything again.
 */
export async function validarFilasJornadas(
  filas: FilaCsvJornadas[],
  fuente: FuenteJornadas,
  ahora = new Date(),
): Promise<ValidacionJornadas> {
  const hoy = hoyEnBuenosAires(ahora);
  const catalogo = new Map(
    (await fuente.empleados([...new Set(filas.map((f) => f.celdas.employee_id?.trim() ?? ""))])).map(
      (e) => [e.employeeId, e],
    ),
  );
  const vigencia = await fuente.primeraVigencia();
  const errores = new Informe(MAX_ERRORES_REPORTADOS, "errores");
  const warnings = new Informe(MAX_ERRORES_REPORTADOS, "advertencias");
  const grupos = new Map<string, Grupo>();
  const conError = new Set<string>();
  const vistas = new Set<string>();

  for (const { fila, celdas } of filas) {
    let invalida = false;
    const error = (campo: ColumnaJornada, codigo: CodigoErrorFila | CodigoErrorJornada, detalle: string) => {
      invalida = true;
      errores.add({ fila, campo, codigo, detalle });
    };
    const texto = (c: ColumnaJornada) => celdas[c]?.trim() ?? "";
    const { employeeId, periodStart, periodEnd, fechasValidas } = validarEmpleadoYSemana(
      celdas,
      { catalogo, vigencia, hoy },
      error,
    );

    let fecha: FechaISO | null = null;
    const valorFecha = texto("fecha");
    if (!valorFecha) error("fecha", "OBLIGATORIO", "Falta la fecha del día.");
    else
      try {
        fechaParaDb(valorFecha);
        fecha = valorFecha;
      } catch {
        error("fecha", "FECHA_INVALIDA", "La fecha debe existir y tener el formato AAAA-MM-DD (por ejemplo, 2026-10-05).");
      }
    if (fecha && fechasValidas && (fecha < periodStart || fecha > periodEnd))
      error(
        "fecha",
        "FECHA_INCOHERENTE",
        `El día no pertenece a la semana del ${fechaCorta(periodStart)} al ${fechaCorta(periodEnd)}.`,
      );
    else if (fecha && fechasValidas && employeeId) {
      const k = JSON.stringify([employeeId, periodStart, periodEnd, fecha]);
      if (vistas.has(k)) error("fecha", "DUPLICADO_LOTE", "El día se repite en otra fila de la misma persona y semana.");
      vistas.add(k);
    }

    const valorTipo = texto("tipo_dia");
    const tipo = TIPOS_DIA.find((t) => t === valorTipo) ?? null;
    if (!valorTipo) error("tipo_dia", "OBLIGATORIO", "Falta el tipo de día.");
    else if (!tipo)
      error("tipo_dia", "VALOR_NO_PERMITIDO", `Los valores admitidos son ${lista([...TIPOS_DIA])}.`);

    const horas = (campo: "horas_trabajadas" | "horas_extra"): number | null => {
      const v = texto(campo);
      if (!v) {
        if (tipo === "TRABAJO") {
          error(campo, "OBLIGATORIO", "Un día de trabajo lleva sus horas; escriba 0 si no hubo horas extra.");
          return null;
        }
        return 0;
      }
      if (!NUMERO.test(v) || !Number.isFinite(Number(v))) {
        error(campo, "NUMERO_INVALIDO", "Se requiere un número decimal finito, sin fórmulas ni separadores de miles.");
        return null;
      }
      const n = Number(v) || 0;
      if (n < 0 || n > 24) {
        error(campo, "RANGO_INVALIDO", "Las horas de un día deben estar entre 0 y 24.");
        return null;
      }
      return n;
    };
    const horasTrabajadas = horas("horas_trabajadas");
    const horasExtra = horas("horas_extra");
    if (tipo && tipo !== "TRABAJO" && (horasTrabajadas || horasExtra))
      error(
        horasTrabajadas ? "horas_trabajadas" : "horas_extra",
        "VALOR_NO_PERMITIDO",
        "Un día de descanso, vacaciones o licencia no lleva horas. Si la persona trabajó ese día, use TRABAJO.",
      );
    else if (tipo === "TRABAJO" && horasTrabajadas === 0)
      error("horas_trabajadas", "RANGO_INVALIDO", "Un día de trabajo tiene más de 0 horas trabajadas. Si no trabajó, use DESCANSO.");
    else if (horasTrabajadas !== null && horasExtra !== null && horasExtra > horasTrabajadas)
      error("horas_extra", "RANGO_INVALIDO", "Las horas extra son parte de las horas trabajadas del día y no pueden superarlas.");

    const par = { employeeId, periodStart, periodEnd };
    if (invalida) {
      if (fechasValidas && employeeId) conError.add(claveSemana(par));
      continue;
    }
    const k = claveSemana(par);
    let grupo = grupos.get(k);
    if (!grupo) {
      grupo = { ...par, primeraFila: fila, dias: [] };
      grupos.set(k, grupo);
    }
    grupo.dias.push({ fila, fecha: fecha!, tipo: tipo!, horasTrabajadas: horasTrabajadas!, horasExtra: horasExtra! });
  }

  // A week with a faulty row cannot be reconciled: its sums would be incomplete. Nor can one
  // that lacks days, which is reported here once, naming the days.
  const conciliables = [...grupos].filter(([k, g]) => {
    if (conError.has(k)) return false;
    if (g.dias.length === 7) return true;
    const presentes = new Set(g.dias.map((d) => d.fecha));
    const faltan = Array.from({ length: 7 }, (_, i) => sumar(g.periodStart, i)).filter((f) => !presentes.has(f));
    errores.add({
      fila: g.primeraFila,
      campo: "fecha",
      codigo: "SEMANA_INCOMPLETA",
      detalle: `${g.employeeId}, semana del ${fechaCorta(g.periodStart)} al ${fechaCorta(g.periodEnd)}: ${faltan.length === 1 ? "falta el día" : "faltan los días"} ${lista(faltan.map(diaMes))}. El detalle lleva los siete días de la semana.`,
    });
    return false;
  });
  const registros = new Map(
    (conciliables.length ? await fuente.semanas(conciliables.map(([, g]) => g)) : []).map((r) => [
      claveSemana(r),
      r,
    ]),
  );
  const conciliacion: ConciliacionJornadasSemana[] = [];
  const nuevos: GrupoJornadas[] = [];
  let nuevas = 0,
    omitidas = 0,
    semanasOmitidas = 0,
    coinciden = 0,
    diferencias = 0,
    sinResumen = 0;
  for (const [k, g] of conciliables) {
    g.dias.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    const derivado = controlesDe(g.periodEnd, g.dias);
    const reg = registros.get(k);
    const semana = `${g.employeeId}, semana del ${fechaCorta(g.periodStart)} al ${fechaCorta(g.periodEnd)}`;
    const base = { employeeId: g.employeeId, periodStart: g.periodStart, periodEnd: g.periodEnd, derivado };
    if (!reg) {
      sinResumen++;
      errores.add({
        fila: g.primeraFila,
        campo: "period_start",
        codigo: "SEMANA_SIN_RESUMEN",
        detalle: `${semana}: no hay un resumen semanal cargado. Importe primero los indicadores semanales.`,
      });
      conciliacion.push({ ...base, esperado: null, diferencias: [], estado: "SIN_RESUMEN", yaCargada: false });
      continue;
    }
    const esperado: ResumenJornadas = {
      horasExtra: reg.horasExtra,
      horasTrabajadas: reg.horasTrabajadas,
      diasConsecutivosSinDescanso: reg.diasConsecutivosSinDescanso,
      diasDesdeUltimasVacaciones: reg.diasDesdeUltimasVacaciones,
    };
    const distintos = diferenciasDe(esperado, derivado);
    if (distintos.length) {
      diferencias++;
      const ultimaVacacion = g.dias.findLast((d) => d.tipo === "VACACIONES")?.fecha ?? null;
      for (const campo of distintos)
        errores.add({
          fila: g.primeraFila,
          campo: COLUMNA[campo],
          codigo: "JORNADAS_NO_COINCIDEN",
          detalle: `${semana}: ${explicar(campo, esperado, derivado, ultimaVacacion)}`,
        });
      conciliacion.push({ ...base, esperado, diferencias: distintos, estado: "DIFERENCIA", yaCargada: false });
      continue;
    }
    coinciden++;
    const huella = huellaJornadas(g.dias);
    const yaCargada = reg.huellaJornadas === huella;
    if (reg.huellaJornadas !== null && !yaCargada)
      errores.add({
        fila: g.primeraFila,
        campo: "employee_id",
        codigo: "CONFLICTO_HISTORICO",
        detalle: `${semana}: ya hay un detalle de días cargado con contenido diferente. Un detalle cargado no se reemplaza.`,
      });
    else if (yaCargada) {
      omitidas += g.dias.length;
      semanasOmitidas++;
    } else {
      nuevas += g.dias.length;
      nuevos.push({
        employeeId: g.employeeId,
        periodStart: g.periodStart,
        periodEnd: g.periodEnd,
        recordId: reg.recordId,
        periodoId: reg.periodoId,
        huella,
        dias: g.dias,
      });
    }
    conciliacion.push({ ...base, esperado, diferencias: [], estado: "COINCIDE", yaCargada });
  }

  const orden = { DIFERENCIA: 0, SIN_RESUMEN: 1, COINCIDE: 2 } as const;
  // Array.prototype.sort is stable: within a state the file's order is kept.
  const listadas = [...conciliacion].sort((a, b) => orden[a.estado] - orden[b.estado]);
  const rechazada = errores.total > 0;
  return {
    status: rechazada ? "RECHAZADA" : "VALIDADA",
    totalFilas: filas.length,
    nuevas,
    omitidas,
    semanasNuevas: nuevos.length,
    semanasOmitidas,
    muestra: nuevos
      .flatMap((g) =>
        g.dias.map(
          (d): MuestraJornada => ({
            employeeId: g.employeeId,
            periodStart: g.periodStart,
            fecha: d.fecha,
            tipo: d.tipo,
            horasTrabajadas: d.horasTrabajadas,
            horasExtra: d.horasExtra,
          }),
        ),
      )
      .slice(0, 14),
    errores: errores.resultado(),
    warnings: warnings.resultado(),
    conciliacion: {
      semanas: conciliacion.length,
      coinciden,
      diferencias,
      sinResumen,
      filas: listadas.slice(0, MAX_FILAS_CONCILIACION),
      truncada: listadas.length > MAX_FILAS_CONCILIACION,
    },
    grupos: rechazada ? [] : nuevos,
  };
}

/** Parses and validates in one step (unit tests and offline checks). */
export async function validarCsvJornadas(bytes: Uint8Array, fuente: FuenteJornadas, ahora = new Date()) {
  const { sourceHash, filas } = leerCsvJornadas(bytes);
  return { sourceHash, ...(await validarFilasJornadas(filas, fuente, ahora)) };
}
