// `tareas-v1`: the task detail behind a week's three task counts.
// One row per task per employee-week, as the task stood at the week's close (a Kimball periodic
// snapshot). Option A of work/enterprise/research/task-evidence-scale.md §3: the rows are the
// atomic source and the weekly summary acts as control totals, so a file that does not add up to
// the summary is rejected as a whole. Pure: no IO, the reads come through `FuenteTareas`.
import { createHash } from "node:crypto";
import type { ErrorCampo, FechaISO, ParPeriodo } from "../../shared/contracts";
import {
  MAX_ERRORES_REPORTADOS,
  MAX_FILAS_CONCILIACION,
  MAX_FILAS_TAREAS,
  MOTIVOS_EXCLUSION,
  type CodigoErrorTarea,
  type ConciliacionSemana,
  type ConteoTareas,
  type EstadoTareaCierre,
  type MuestraTarea,
  type ResumenConciliacion,
} from "../../shared/contratos/importaciones";
import type { CodigoErrorFila } from "../../shared/errors";
import { fechaParaDb } from "../repositories/fechas";
import {
  leerCsv,
  type EsquemaCsv,
  type FilaCsvDe,
} from "./csv-importacion";
import {
  hoyEnBuenosAires,
  validarEmpleadoYSemana,
  type EmpleadoValidacion,
} from "./validacion-comun";

export const COLUMNAS_TAREAS = [
  "employee_id",
  "period_start",
  "period_end",
  "task_id",
  "titulo",
  "origen",
  "origen_ref",
  "asignada_fecha",
  "vencimiento_fecha",
  "completada_fecha",
  "motivo_exclusion",
] as const;
export type ColumnaTarea = (typeof COLUMNAS_TAREAS)[number];
export type FilaCsvTareas = FilaCsvDe<ColumnaTarea>;
/** Only `origen_ref` and `motivo_exclusion` may be left out of the header. */
export const ESQUEMA_CSV_TAREAS: EsquemaCsv<ColumnaTarea> = {
  columnas: COLUMNAS_TAREAS,
  obligatorias: COLUMNAS_TAREAS.filter(
    (c) => c !== "origen_ref" && c !== "motivo_exclusion",
  ),
  maxFilas: MAX_FILAS_TAREAS,
};
export const leerCsvTareas = (bytes: Uint8Array) =>
  leerCsv(bytes, ESQUEMA_CSV_TAREAS);

/** Header and one example row of the downloadable template (templates/tareas.csv). */
export const PLANTILLA_TAREAS_CSV = `${COLUMNAS_TAREAS.join(",")}
EMP-001,2026-10-12,2026-10-18,OPS-1432,Conciliar la facturación de septiembre,Mesa de ayuda,https://tareas.example/ordenes/OPS-1432,2026-10-01,2026-10-09,,
`;

export type TareaNormalizada = {
  fila: number;
  employeeId: string;
  periodStart: FechaISO;
  periodEnd: FechaISO;
  taskId: string;
  titulo: string;
  origen: string;
  origenRef: string | null;
  asignadaEl: FechaISO;
  venceEl: FechaISO | null;
  completadaEl: FechaISO | null;
  estadoCierre: EstadoTareaCierre;
  diasAtraso: number | null;
};

/** A week's current summary, with the fingerprint of the task detail already stored (if any). */
export type RegistroSemana = ParPeriodo & {
  recordId: string;
  periodoId: string;
  tareasActivas: number;
  tareasPendientes: number;
  tareasVencidas: number;
  huellaTareas: string | null;
};
/** Reads by batch; the Prisma adapter takes the client or the confirmation transaction. */
export interface FuenteTareas {
  empleados(ids: string[]): Promise<EmpleadoValidacion[]>;
  /** Earliest rule-version effectiveFrom (YYYY-MM-DD); null when none is published. */
  primeraVigencia(): Promise<string | null>;
  /** The confirmed current record of each employee-week; weeks without a summary are absent. */
  semanas(pares: ParPeriodo[]): Promise<RegistroSemana[]>;
}

/** An employee-week whose detail is ready to be stored. */
export type GrupoTareas = ParPeriodo & {
  recordId: string;
  periodoId: string;
  huella: string;
  tareas: TareaNormalizada[];
};
export type ValidacionTareas = {
  status: "VALIDADA" | "RECHAZADA";
  totalFilas: number;
  /** Task rows that will be stored / that are already stored and skipped. */
  nuevas: number;
  omitidas: number;
  /** Rows left out of the week (cancelled or reassigned). */
  excluidas: number;
  semanasNuevas: number;
  semanasOmitidas: number;
  /** First rows of the weeks that reconcile and are not stored yet. */
  muestra: MuestraTarea[];
  errores: ErrorCampo[];
  warnings: ErrorCampo[];
  conciliacion: ResumenConciliacion;
  /** Empty if there is any error: a partial batch is never handed over for insertion. */
  grupos: GrupoTareas[];
};

const MS_DIA = 86_400_000;
const dias = (desde: FechaISO, hasta: FechaISO) =>
  Math.round((fechaParaDb(hasta).getTime() - fechaParaDb(desde).getTime()) / MS_DIA);

/**
 * Status of a task at the close of the week, from its dates alone (D5, Q2).
 * Completed on or before `periodEnd`: COMPLETADA. Otherwise it is open at the close, and it is
 * VENCIDA when its due date is on or before the closing Sunday; `diasAtraso` counts from the
 * due date to that Sunday (0 when it was due on it). Dates are YYYY-MM-DD, so they compare as text.
 */
export function estadoAlCierre(t: {
  periodEnd: FechaISO;
  venceEl: FechaISO | null;
  completadaEl: FechaISO | null;
}): { estadoCierre: EstadoTareaCierre; diasAtraso: number | null } {
  if (t.completadaEl !== null && t.completadaEl <= t.periodEnd)
    return { estadoCierre: "COMPLETADA", diasAtraso: null };
  if (t.venceEl !== null && t.venceEl <= t.periodEnd)
    return { estadoCierre: "VENCIDA", diasAtraso: dias(t.venceEl, t.periodEnd) };
  return { estadoCierre: "PENDIENTE", diasAtraso: null };
}

/** A = every row, P = rows open at the close, V = open rows already due (V ≤ P ≤ A). */
export function derivarConteo(
  tareas: readonly { estadoCierre: EstadoTareaCierre }[],
): ConteoTareas {
  let pendientes = 0,
    vencidas = 0;
  for (const t of tareas) {
    if (t.estadoCierre !== "COMPLETADA") pendientes++;
    if (t.estadoCierre === "VENCIDA") vencidas++;
  }
  return { activas: tareas.length, pendientes, vencidas };
}

/** SHA-256 of the stored fields of the rows, by task id: same detail, same fingerprint. */
export function huellaTareas(
  tareas: readonly Pick<
    TareaNormalizada,
    | "taskId"
    | "titulo"
    | "origen"
    | "origenRef"
    | "asignadaEl"
    | "venceEl"
    | "completadaEl"
  >[],
): string {
  const filas = tareas
    .map((t) => [
      t.taskId,
      t.titulo,
      t.origen,
      t.origenRef,
      t.asignadaEl,
      t.venceEl,
      t.completadaEl,
    ])
    .sort((a, b) => (a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(filas), "utf8").digest("hex");
}

/** Keeps the first `tope` entries and counts the rest, so a bad file cannot flood the answer. */
class Informe {
  readonly items: ErrorCampo[] = [];
  total = 0;
  constructor(
    private readonly tope: number,
    private readonly nombre: "errores" | "advertencias",
  ) {}
  add(item: ErrorCampo) {
    this.total++;
    if (this.items.length < this.tope) this.items.push(item);
  }
  resultado(): ErrorCampo[] {
    if (this.total <= this.tope) return this.items;
    return [
      ...this.items,
      {
        fila: null,
        campo: null,
        codigo: "ERRORES_OMITIDOS",
        detalle: `Se informan los primeros ${this.tope} de ${this.total} ${this.nombre}. Corrija el archivo y valídelo nuevamente para ver el resto.`,
      },
    ];
  }
}

const claveSemana = (p: ParPeriodo) =>
  JSON.stringify([p.employeeId, p.periodStart, p.periodEnd]);
const fechaCorta = (f: FechaISO) => `${f.slice(8)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const CONTROL = /[\u0000-\u001F\u007F]/;
const ID_TAREA = /^[A-Za-z0-9_.:/-]{1,64}$/;
const largo = (s: string) => [...s].length;

const CAMPOS_CONTEO = [
  ["tareas_activas", "activas", "tarea activa", "tareas activas"],
  ["tareas_pendientes", "pendientes", "tarea pendiente", "tareas pendientes"],
  ["tareas_vencidas", "vencidas", "tarea vencida", "tareas vencidas"],
] as const;
const cuenta = (n: number, uno: string, varios: string) =>
  `${n} ${n === 1 ? uno : varios}`;

type Grupo = ParPeriodo & {
  primeraFila: number;
  tareas: TareaNormalizada[];
  excluidas: number;
};

/**
 * Validates every row, then reconciles each employee-week against its stored summary.
 * Cost: O(rows) in memory and three batched reads (catalogue, rules, summaries), never one per row.
 * Reusable on confirmation to check the catalogue and the stored detail again.
 */
export async function validarFilasTareas(
  filas: FilaCsvTareas[],
  fuente: FuenteTareas,
  ahora = new Date(),
): Promise<ValidacionTareas> {
  const hoy = hoyEnBuenosAires(ahora);
  const catalogo = new Map(
    (
      await fuente.empleados([
        ...new Set(filas.map((f) => f.celdas.employee_id?.trim() ?? "")),
      ])
    ).map((e) => [e.employeeId, e]),
  );
  const vigencia = await fuente.primeraVigencia();
  const errores = new Informe(MAX_ERRORES_REPORTADOS, "errores");
  const warnings = new Informe(MAX_ERRORES_REPORTADOS, "advertencias");
  const grupos = new Map<string, Grupo>();
  const conError = new Set<string>();
  const vistas = new Set<string>();
  let excluidas = 0;

  for (const { fila, celdas } of filas) {
    let invalida = false;
    const error = (
      campo: ColumnaTarea,
      codigo: CodigoErrorFila | CodigoErrorTarea,
      detalle: string,
    ) => {
      invalida = true;
      errores.add({ fila, campo, codigo, detalle });
    };
    const texto = (c: ColumnaTarea) => celdas[c]?.trim() ?? "";
    const { employeeId, periodStart, periodEnd, fechasValidas } =
      validarEmpleadoYSemana(celdas, { catalogo, vigencia, hoy }, error);

    const taskId = texto("task_id");
    if (!taskId) error("task_id", "OBLIGATORIO", "Falta el identificador de la tarea.");
    else if (!ID_TAREA.test(taskId))
      error(
        "task_id",
        "FORMATO_INVALIDO",
        "El identificador admite hasta 64 caracteres: letras, números y . _ : / -",
      );
    if (fechasValidas && employeeId && taskId) {
      const k = JSON.stringify([employeeId, periodStart, periodEnd, taskId]);
      if (vistas.has(k))
        error(
          "task_id",
          "DUPLICADO_LOTE",
          "La tarea se repite en otra fila de la misma persona y semana.",
        );
      vistas.add(k);
    }
    const titulo = texto("titulo");
    if (!titulo) error("titulo", "OBLIGATORIO", "Falta el título de la tarea.");
    else if (largo(titulo) > 160 || CONTROL.test(titulo))
      error(
        "titulo",
        "FORMATO_INVALIDO",
        "El título admite hasta 160 caracteres, en una sola línea.",
      );
    const origen = texto("origen");
    if (!origen)
      error("origen", "OBLIGATORIO", "Falta el sistema de origen de la tarea.");
    else if (largo(origen) > 40 || CONTROL.test(origen))
      error(
        "origen",
        "FORMATO_INVALIDO",
        "El origen admite hasta 40 caracteres, en una sola línea.",
      );
    const origenRef = texto("origen_ref");
    if (largo(origenRef) > 255 || CONTROL.test(origenRef))
      error(
        "origen_ref",
        "FORMATO_INVALIDO",
        "La referencia admite hasta 255 caracteres, en una sola línea.",
      );

    const fecha = (campo: ColumnaTarea, obligatoria: boolean): FechaISO | null => {
      const v = texto(campo);
      if (!v) {
        if (obligatoria) error(campo, "OBLIGATORIO", "Falta la fecha.");
        return null;
      }
      try {
        fechaParaDb(v);
        return v;
      } catch {
        error(
          campo,
          "FECHA_INVALIDA",
          "La fecha debe existir y tener el formato AAAA-MM-DD (por ejemplo, 2026-10-05).",
        );
        return null;
      }
    };
    const asignadaEl = fecha("asignada_fecha", true);
    const venceEl = fecha("vencimiento_fecha", false);
    const completadaEl = fecha("completada_fecha", false);
    if (asignadaEl && fechasValidas && asignadaEl > periodEnd)
      error(
        "asignada_fecha",
        "FECHA_INCOHERENTE",
        "La tarea no puede asignarse después del cierre de la semana.",
      );
    if (completadaEl && asignadaEl && completadaEl < asignadaEl)
      error(
        "completada_fecha",
        "FECHA_INCOHERENTE",
        "La fecha de finalización es anterior a la de asignación.",
      );
    else if (completadaEl && fechasValidas && completadaEl < periodStart)
      error(
        "completada_fecha",
        "FECHA_INCOHERENTE",
        "La tarea se finalizó antes de la semana, por lo que no estuvo activa en ella.",
      );
    if (venceEl && asignadaEl && venceEl < asignadaEl)
      warnings.add({
        fila,
        campo: "vencimiento_fecha",
        codigo: "VENCIMIENTO_ANTERIOR",
        detalle: "La fecha límite es anterior a la fecha de asignación.",
      });
    const motivo = texto("motivo_exclusion");
    const excluida = motivo !== "";
    if (excluida && !(MOTIVOS_EXCLUSION as readonly string[]).includes(motivo))
      error(
        "motivo_exclusion",
        "VALOR_NO_PERMITIDO",
        `Los valores admitidos son ${MOTIVOS_EXCLUSION.join(" y ")}, o dejar la celda vacía.`,
      );

    const par = { employeeId, periodStart, periodEnd };
    if (invalida) {
      if (fechasValidas && employeeId) conError.add(claveSemana(par));
      continue;
    }
    const k = claveSemana(par);
    let grupo = grupos.get(k);
    if (!grupo) {
      grupo = { ...par, primeraFila: fila, tareas: [], excluidas: 0 };
      grupos.set(k, grupo);
    }
    if (excluida) {
      grupo.excluidas++;
      excluidas++;
      continue;
    }
    grupo.tareas.push({
      fila,
      ...par,
      taskId,
      titulo,
      origen,
      origenRef: origenRef || null,
      asignadaEl: asignadaEl!,
      venceEl,
      completadaEl,
      ...estadoAlCierre({ periodEnd, venceEl, completadaEl }),
    });
  }

  // A week with a faulty row cannot be reconciled: its sum would be incomplete.
  const conciliables = [...grupos].filter(([k]) => !conError.has(k));
  const registros = new Map(
    (conciliables.length
      ? await fuente.semanas(conciliables.map(([, g]) => g))
      : []
    ).map((r) => [claveSemana(r), r]),
  );
  const conciliacion: ConciliacionSemana[] = [];
  const nuevos: GrupoTareas[] = [];
  let nuevas = 0,
    omitidas = 0,
    semanasOmitidas = 0,
    coinciden = 0,
    diferencias = 0,
    sinResumen = 0;
  for (const [k, g] of conciliables) {
    const derivado = derivarConteo(g.tareas);
    const reg = registros.get(k);
    const base = {
      employeeId: g.employeeId,
      periodStart: g.periodStart,
      periodEnd: g.periodEnd,
      tareas: g.tareas.length,
      excluidas: g.excluidas,
      derivado,
    };
    if (!reg) {
      sinResumen++;
      errores.add({
        fila: g.primeraFila,
        campo: "period_start",
        codigo: "SEMANA_SIN_RESUMEN",
        detalle: `${g.employeeId}, semana del ${fechaCorta(g.periodStart)} al ${fechaCorta(g.periodEnd)}: no hay un resumen semanal cargado. Importe primero los indicadores semanales.`,
      });
      conciliacion.push({ ...base, esperado: null, estado: "SIN_RESUMEN", yaCargada: false });
      continue;
    }
    const esperado: ConteoTareas = {
      activas: reg.tareasActivas,
      pendientes: reg.tareasPendientes,
      vencidas: reg.tareasVencidas,
    };
    const distintos = CAMPOS_CONTEO.filter(
      ([, campo]) => esperado[campo] !== derivado[campo],
    );
    if (distintos.length) {
      diferencias++;
      for (const [columna, campo, uno, varios] of distintos) {
        const falta = esperado[campo] - derivado[campo];
        errores.add({
          fila: g.primeraFila,
          campo: columna,
          codigo: "TAREAS_NO_COINCIDEN",
          detalle: `${g.employeeId}, semana del ${fechaCorta(g.periodStart)} al ${fechaCorta(g.periodEnd)}: el resumen semanal informa ${cuenta(esperado[campo], uno, varios)} y el detalle del archivo suma ${derivado[campo]} (${falta > 0 ? `faltan ${falta}` : `sobran ${-falta}`}).`,
        });
      }
      conciliacion.push({ ...base, esperado, estado: "DIFERENCIA", yaCargada: false });
      continue;
    }
    coinciden++;
    const huella = huellaTareas(g.tareas);
    const yaCargada = reg.huellaTareas === huella;
    if (reg.huellaTareas !== null && !yaCargada)
      errores.add({
        fila: g.primeraFila,
        campo: "employee_id",
        codigo: "CONFLICTO_HISTORICO",
        detalle: `${g.employeeId}, semana del ${fechaCorta(g.periodStart)} al ${fechaCorta(g.periodEnd)}: ya hay un detalle de tareas cargado con contenido diferente. Un detalle cargado no se reemplaza.`,
      });
    else if (yaCargada) {
      omitidas += g.tareas.length;
      semanasOmitidas++;
    } else {
      nuevas += g.tareas.length;
      nuevos.push({
        employeeId: g.employeeId,
        periodStart: g.periodStart,
        periodEnd: g.periodEnd,
        recordId: reg.recordId,
        periodoId: reg.periodoId,
        huella,
        tareas: g.tareas,
      });
    }
    conciliacion.push({ ...base, esperado, estado: "COINCIDE", yaCargada });
  }

  const orden = { DIFERENCIA: 0, SIN_RESUMEN: 1, COINCIDE: 2 } as const;
  // Array.prototype.sort is stable: within a state the file's order is kept.
  const listadas = [...conciliacion].sort(
    (a, b) => orden[a.estado] - orden[b.estado],
  );
  const rechazada = errores.total > 0;
  return {
    status: rechazada ? "RECHAZADA" : "VALIDADA",
    totalFilas: filas.length,
    nuevas,
    omitidas,
    excluidas,
    semanasNuevas: nuevos.length,
    semanasOmitidas,
    muestra: nuevos
      .flatMap((g) => g.tareas)
      .slice(0, 10)
      .map(
        (t): MuestraTarea => ({
          employeeId: t.employeeId,
          periodStart: t.periodStart,
          taskId: t.taskId,
          titulo: t.titulo,
          origen: t.origen,
          asignadaEl: t.asignadaEl,
          venceEl: t.venceEl,
          completadaEl: t.completadaEl,
          estadoCierre: t.estadoCierre,
          diasAtraso: t.diasAtraso,
        }),
      ),
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
export async function validarCsvTareas(
  bytes: Uint8Array,
  fuente: FuenteTareas,
  ahora = new Date(),
) {
  const { sourceHash, filas } = leerCsvTareas(bytes);
  return { sourceHash, ...(await validarFilasTareas(filas, fuente, ahora)) };
}
