// Every value a person reads goes through here: system codes become words,
// dates and numbers follow es-AR. Period dates are YYYY-MM-DD strings and are
// formatted from their parts, never through the browser's time zone (D p2).
import type {
  Alerta,
  EstadoJob,
  Factor,
  Nivel,
  UsuarioDemoDTO,
} from "./contracts";

const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
const partes = (fecha: string) => {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return { anio, mes: MESES[mes - 1], dia };
};

/** "5 oct" */
export function diaCorto(fecha: string) {
  const { dia, mes } = partes(fecha);
  return `${dia} ${mes}`;
}

/** "12–18 oct 2026", "28 sep – 4 oct 2026", "28 dic 2026 – 3 ene 2027" */
export function semana(inicio: string, fin: string) {
  const a = partes(inicio);
  const b = partes(fin);
  if (a.anio !== b.anio)
    return `${a.dia} ${a.mes} ${a.anio} – ${b.dia} ${b.mes} ${b.anio}`;
  if (a.mes !== b.mes) return `${a.dia} ${a.mes} – ${b.dia} ${b.mes} ${b.anio}`;
  return `${a.dia}–${b.dia} ${b.mes} ${b.anio}`;
}

/** Date and time of an ISO UTC instant, shown in the product's fixed zone. */
export function momento(iso: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Argentina/Buenos_Aires",
  })
    .format(new Date(iso))
    .replace(".", "");
}

const DOS = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const ENTERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** Two decimals with a decimal comma, as the report states them (D p11). */
export function decimal(valor: number | null) {
  return valor === null ? "—" : DOS.format(valor);
}
export function entero(valor: number) {
  return ENTERO.format(valor);
}

/** Week-over-week change of an index: "+7,50", "−5,50", "=". */
export function variacion(actual: number, anterior: number | null) {
  if (anterior === null) return null;
  const delta = Math.round((actual - anterior) * 100) / 100;
  if (delta === 0) return "=";
  return `${delta > 0 ? "+" : "−"}${DOS.format(Math.abs(delta))}`;
}

export const NIVEL: Record<Nivel, string> = {
  BAJO: "Bajo",
  MEDIO: "Medio",
  ALTO: "Alto",
  INCOMPLETO: "Incompleto",
};
/** What each level means, in one line; shown once, where the level is explained. */
export const NIVEL_DETALLE: Record<Nivel, string> = {
  BAJO: "Índice menor a 40.",
  MEDIO: "Índice de 40 o más, sin sobrecarga sostenida.",
  ALTO: "Índice de 70 o más dos semanas seguidas, con causas en común.",
  INCOMPLETO: "Sin semana anterior para confirmar si la carga se sostiene.",
};

export const FACTOR: Record<Factor, string> = {
  HE: "Horas extra",
  DS: "Días seguidos sin descanso",
  CT: "Carga de tareas",
  VP: "Vacaciones pendientes",
};
export function valorFactor(factor: Factor, valor: number) {
  if (factor === "HE") return `${entero(valor)} h`;
  if (factor === "CT") return DOS.format(valor);
  return `${entero(valor)} ${valor === 1 ? "día" : "días"}`;
}

export const ESTADO_PROCESO: Record<EstadoJob, string> = {
  PENDIENTE: "Pendiente",
  PROCESANDO: "Procesando",
  COMPLETADO: "Al día",
  FALLIDO: "Falló el cálculo",
};

export const ESTADO_ENVIO: Record<Alerta["estadoEnvio"], string> = {
  NO_APLICA: "Solo aviso interno",
  PENDIENTE: "Envío pendiente",
  ENVIADO: "Enviado (simulado)",
  FALLIDO: "Envío fallido",
  SIN_DESTINATARIO: "Sin destinatario",
};
export const VIGENCIA: Record<Alerta["vigencia"], string> = {
  ACTIVA: "Activa",
  SUPERADA: "Superada",
};

export const ROL: Record<UsuarioDemoDTO["rol"], string> = {
  RRHH: "RRHH",
  GERENCIA: "Gerencia",
  TEAM_LEAD: "Team Lead",
  EMPLEADO: "Empleado",
};
export const TIPO: Record<"TECNICO" | "TEAM_LEAD", string> = {
  TECNICO: "Técnico",
  TEAM_LEAD: "Team Lead",
};
