// Import codes in words (DESIGN.md › Words, not codes). Row codes come from
// src/shared/errors.ts; file-level codes from src/server/http/cu01.ts and
// src/server/services/importaciones.ts. An unknown code is humanized, never hidden.

const PROBLEMA: Record<string, string> = {
  OBLIGATORIO: "Falta el dato",
  NUMERO_INVALIDO: "No es un número válido",
  RANGO_INVALIDO: "Valor fuera de rango",
  FECHA_INVALIDA: "Fecha inválida",
  SEMANA_INVALIDA: "No es una semana de lunes a domingo",
  PERIODO_ABIERTO: "La semana todavía no terminó",
  EMPLEADO_NO_EXISTE: "Legajo inexistente",
  EMPLEADO_FUERA_COBERTURA: "Persona fuera de la cobertura",
  DUPLICADO_LOTE: "Fila repetida en el archivo",
  CONFLICTO_HISTORICO: "Distinto de lo ya cargado",
  HORAS_EXTREMAS: "Horas fuera de lo habitual",
  COLUMNAS_CSV: "Columnas del archivo",
  CONTRATO_INVALIDO: "Formato del archivo",
  ARCHIVO_EXCESIVO: "Archivo demasiado grande",
  FORMATO_NO_CSV: "No es un archivo CSV",
};

/** The CSV's own headers (the template's), in words. */
const COLUMNA: Record<string, string> = {
  employee_id: "Legajo",
  period_start: "Inicio de semana",
  period_end: "Fin de semana",
  horas_extra: "Horas extra",
  dias_consecutivos_sin_descanso: "Días seguidos sin descanso",
  tareas_activas: "Tareas activas",
  tareas_pendientes: "Tareas pendientes",
  tareas_vencidas: "Tareas vencidas",
  vacaciones_pendientes_dias: "Vacaciones pendientes",
  horas_trabajadas: "Horas trabajadas",
  dias_desde_ultimas_vacaciones: "Días desde las últimas vacaciones",
};

/** "IMPORTACION_ALGO" → "Importacion algo"; "fooBar" → "Foo bar". */
export function humanizar(codigo: string) {
  const texto = codigo
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export const problema = (codigo: string) =>
  PROBLEMA[codigo] ?? humanizar(codigo);

/** A field as the file names it ("horas_extra", "period_start/period_end"), in words. */
export function columna(campo: string) {
  return campo
    .split("/")
    .map((c) => COLUMNA[c.trim()] ?? c.trim())
    .join(" y ");
}
