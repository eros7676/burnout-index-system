import { createHash } from "node:crypto";
import type {
  DatosLaborales,
  ErrorCampo,
  ParPeriodo,
} from "../../shared/contracts";
import type { CodigoErrorFila } from "../../shared/errors";
import { fechaParaDb } from "../repositories/fechas";
import {
  leerCsvImportacion,
  type ColumnaCsv,
  type FilaCsv,
} from "./csv-importacion";

export type EmpleadoValidacion = {
  employeeId: string;
  activo: boolean;
  enCobertura: boolean;
  tipo: string;
};
export type HistoricoValidacion = ParPeriodo & { fingerprint: string };
/** Lecturas por lote; el adaptador puede usar PrismaClient o la transacción de T04. */
export interface FuenteValidacion {
  empleados(ids: string[]): Promise<EmpleadoValidacion[]>;
  registros(pares: ParPeriodo[]): Promise<HistoricoValidacion[]>;
}
export type FilaNormalizada = {
  fila: number;
  datos: DatosLaborales;
  fingerprint: string;
};
export type ValidacionImportacion = {
  status: "VALIDADA" | "RECHAZADA";
  totalFilas: number;
  nuevas: number;
  omitidas: number;
  muestra: DatosLaborales[];
  errores: ErrorCampo[];
  warnings: ErrorCampo[];
  /** Vacío si hay cualquier error: jamás entregar un lote parcial para insertar. */
  filasNuevas: FilaNormalizada[];
};
const clave = (p: ParPeriodo) =>
  JSON.stringify([p.employeeId, p.periodStart, p.periodEnd]);

/** Orden canónico contractual, independiente del orden de propiedades del llamador. */
export function fingerprintDatos(d: DatosLaborales): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        employeeId: d.employeeId,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        horasExtra: d.horasExtra,
        diasConsecutivosSinDescanso: d.diasConsecutivosSinDescanso,
        tareasActivas: d.tareasActivas,
        tareasPendientes: d.tareasPendientes,
        tareasVencidas: d.tareasVencidas,
        vacacionesPendientesDias: d.vacacionesPendientesDias,
        horasTrabajadas: d.horasTrabajadas,
        diasDesdeUltimasVacaciones: d.diasDesdeUltimasVacaciones,
      }),
      "utf8",
    )
    .digest("hex");
}

/** Reutilizable al confirmar para volver a cotejar catálogo e histórico actuales. Sin escrituras. */
export async function validarFilasImportacion(
  filas: FilaCsv[],
  fuente: FuenteValidacion,
  ahora = new Date(),
): Promise<ValidacionImportacion> {
  if (!Number.isFinite(ahora.getTime())) throw new TypeError("Reloj inválido.");
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  const hoy = `${parte("year")}-${parte("month")}-${parte("day")}`;
  const catalogo = new Map(
    (
      await fuente.empleados([
        ...new Set(filas.map((f) => f.celdas.employee_id?.trim() ?? "")),
      ])
    ).map((e) => [e.employeeId, e]),
  );
  const errores: ErrorCampo[] = [],
    warnings: ErrorCampo[] = [],
    normalizadas: FilaNormalizada[] = [];
  const vistas = new Set<string>();
  for (const { fila, celdas } of filas) {
    const antes = errores.length;
    const error = (
      campo: ColumnaCsv,
      codigo: CodigoErrorFila,
      detalle: string,
    ) => errores.push({ fila, campo, codigo, detalle });
    const texto = (c: ColumnaCsv) => celdas[c]?.trim() ?? "";
    const employeeId = texto("employee_id"),
      periodStart = texto("period_start"),
      periodEnd = texto("period_end");
    if (!employeeId)
      error("employee_id", "OBLIGATORIO", "El empleado es obligatorio.");
    else {
      const e = catalogo.get(employeeId);
      if (!e)
        error("employee_id", "EMPLEADO_NO_EXISTE", "El empleado no existe.");
      else if (
        !e.activo ||
        !e.enCobertura ||
        !["TECNICO", "TEAM_LEAD"].includes(e.tipo)
      )
        error(
          "employee_id",
          "EMPLEADO_FUERA_COBERTURA",
          "El empleado no está activo y dentro de cobertura evaluable.",
        );
    }
    const fecha = (campo: "period_start" | "period_end") => {
      if (!texto(campo)) {
        error(campo, "OBLIGATORIO", "La fecha es obligatoria.");
        return null;
      }
      try {
        return fechaParaDb(texto(campo));
      } catch {
        error(
          campo,
          "FECHA_INVALIDA",
          "Se requiere una fecha real YYYY-MM-DD.",
        );
        return null;
      }
    };
    const inicio = fecha("period_start"),
      fin = fecha("period_end");
    if (inicio && fin) {
      if (
        inicio.getUTCDay() !== 1 ||
        fin.getUTCDay() !== 0 ||
        fin.getTime() - inicio.getTime() !== 6 * 86400000
      )
        error(
          "period_start",
          "SEMANA_INVALIDA",
          "El período debe cubrir lunes a domingo, inicio + 6 días.",
        );
      if (periodEnd >= hoy)
        error(
          "period_end",
          "PERIODO_ABIERTO",
          "El domingo debe haber terminado en Buenos Aires.",
        );
      if (employeeId) {
        const k = clave({ employeeId, periodStart, periodEnd });
        if (vistas.has(k))
          error(
            "employee_id",
            "DUPLICADO_LOTE",
            "Empleado y período repetidos dentro del lote.",
          );
        vistas.add(k);
      }
    }
    const numero = (
      campo: ColumnaCsv,
      entero: boolean,
      opcional = false,
    ): number | null => {
      const v = texto(campo);
      if (!v) {
        if (!opcional) error(campo, "OBLIGATORIO", "El valor es obligatorio.");
        return null;
      }
      if (
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v) ||
        !Number.isFinite(Number(v))
      ) {
        error(
          campo,
          "NUMERO_INVALIDO",
          "Se requiere un número decimal finito, sin fórmulas ni separadores de miles.",
        );
        return null;
      }
      const n = Number(v) || 0;
      if (
        n < 0 ||
        (entero && (!Number.isSafeInteger(n) || n > 2147483647)) ||
        (!entero && n > 168)
      ) {
        error(
          campo,
          "RANGO_INVALIDO",
          entero
            ? "Se requiere un entero entre 0 y 2147483647 (capacidad de persistencia)."
            : "Las horas deben estar entre 0 y 168.",
        );
        return null;
      }
      return n;
    };
    const he = numero("horas_extra", false),
      ds = numero("dias_consecutivos_sin_descanso", true);
    const a = numero("tareas_activas", true),
      p = numero("tareas_pendientes", true),
      v = numero("tareas_vencidas", true);
    const vp = numero("vacaciones_pendientes_dias", true),
      ht = numero("horas_trabajadas", false, true);
    const dv = numero("dias_desde_ultimas_vacaciones", true, true);
    if (a !== null && p !== null && p > a)
      error(
        "tareas_pendientes",
        "RANGO_INVALIDO",
        "Pendientes no puede superar el total de tareas.",
      );
    if (p !== null && v !== null && v > p)
      error(
        "tareas_vencidas",
        "RANGO_INVALIDO",
        "Vencidas no puede superar pendientes.",
      );
    if (he !== null && ht !== null && he > ht)
      error(
        "horas_trabajadas",
        "RANGO_INVALIDO",
        "Horas trabajadas debe ser mayor o igual a horas extra.",
      );
    for (const [campo, n, limite] of [
      ["horas_extra", he, 40],
      ["horas_trabajadas", ht, 80],
    ] as const)
      if (n !== null && n > limite)
        warnings.push({
          fila,
          campo,
          codigo: "HORAS_EXTREMAS",
          detalle: `Supera ${limite} horas semanales; revisar la fuente.`,
        });
    if (errores.length === antes) {
      const datos: DatosLaborales = {
        employeeId,
        periodStart,
        periodEnd,
        horasExtra: he!,
        diasConsecutivosSinDescanso: ds!,
        tareasActivas: a!,
        tareasPendientes: p!,
        tareasVencidas: v!,
        vacacionesPendientesDias: vp!,
        horasTrabajadas: ht,
        diasDesdeUltimasVacaciones: dv,
      };
      normalizadas.push({ fila, datos, fingerprint: fingerprintDatos(datos) });
    }
  }
  const historicos = new Map(
    (await fuente.registros(normalizadas.map((f) => f.datos))).map((r) => [
      clave(r),
      r.fingerprint,
    ]),
  );
  const nuevas: FilaNormalizada[] = [];
  let omitidas = 0;
  for (const f of normalizadas) {
    const existente = historicos.get(clave(f.datos));
    if (existente === undefined) nuevas.push(f);
    else if (existente === f.fingerprint) omitidas++;
    else
      errores.push({
        fila: f.fila,
        campo: "employee_id",
        codigo: "CONFLICTO_HISTORICO",
        detalle:
          "Ya existe un registro vigente con valores diferentes para ese empleado y período.",
      });
  }
  return {
    status: errores.length ? "RECHAZADA" : "VALIDADA",
    totalFilas: filas.length,
    nuevas: nuevas.length,
    omitidas,
    muestra: normalizadas.slice(0, 10).map((f) => f.datos),
    errores,
    warnings,
    filasNuevas: errores.length ? [] : nuevas,
  };
}

export async function validarCsvImportacion(
  bytes: Uint8Array,
  fuente: FuenteValidacion,
  ahora = new Date(),
) {
  const { sourceHash, filas } = leerCsvImportacion(bytes);
  return {
    sourceHash,
    ...(await validarFilasImportacion(filas, fuente, ahora)),
  };
}
