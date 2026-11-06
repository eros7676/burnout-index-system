// Every value a person reads goes through here: system codes become words,
// dates and numbers follow es-AR. Period dates are YYYY-MM-DD strings and are
// formatted from their parts, never through the browser's time zone (D p2).
import type {
  Alerta,
  AusenciasSemana,
  EstadoJob,
  Factor,
  Nivel,
  UsuarioDemoDTO,
} from "./contracts";
import type { TipoDia } from "./contratos/importaciones";

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

const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "lun 5 oct": a day of a week, named from its date parts (no time zone involved). */
export function diaConNombre(fecha: string) {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return `${DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()]} ${diaCorto(fecha)}`;
}

/** "5 oct 2026": the same month names as the week labels, whatever the runtime's ICU data says. */
export function diaCompleto(fecha: string) {
  const { dia, mes, anio } = partes(fecha);
  return `${dia} ${mes} ${anio}`;
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

const RELOJ_CON_ANIO = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Argentina/Buenos_Aires",
});

/** "4 nov 2026, 03:22" (with `segundos`, "4 nov 2026, 03:22:47"): an instant with its year, for records people keep. */
export function momentoConAnio(iso: string, segundos = false) {
  const p = Object.fromEntries(
    RELOJ_CON_ANIO.formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  const hora = `${p.hour}:${p.minute}${segundos ? `:${p.second}` : ""}`;
  return `${Number(p.day)} ${MESES[Number(p.month) - 1]} ${p.year}, ${hora}`;
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
const HASTA_DOS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
/** "9,5 h", "8 h": hours as recorded, never rounded to the hour. */
export function horas(valor: number) {
  return `${HASTA_DOS.format(valor)} h`;
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
  MEDIO: "Índice de 40 o más, sin cumplir la condición de Alto.",
  ALTO: "Índice de 70 o más durante dos semanas consecutivas, con factores en común.",
  INCOMPLETO: "Sin semana anterior para confirmar si la carga se sostiene.",
};

/** What a day of the week was (jornadas-v1). Leave carries no reason. */
export const TIPO_DIA: Record<TipoDia, string> = {
  TRABAJO: "Trabajo",
  DESCANSO: "Descanso",
  VACACIONES: "Vacaciones",
  LICENCIA: "Licencia",
};

/**
 * "Licencia, 2 de 7 días", "Vacaciones, 5 de 7 días", "Vacaciones y licencia, 4 de 7 días"; null
 * when the person was not away or the week has no day detail.
 */
export function textoAusencias(a: AusenciasSemana | null) {
  if (!a || a.vacaciones + a.licencias === 0) return null;
  const que = a.vacaciones && a.licencias ? "Vacaciones y licencia" : a.vacaciones ? "Vacaciones" : "Licencia";
  return `${que}, ${a.vacaciones + a.licencias} de 7 días`;
}

export const FACTOR: Record<Factor, string> = {
  HE: "Horas extra",
  DS: "Días consecutivos sin descanso",
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
  PROCESANDO: "En proceso",
  COMPLETADO: "Completado",
  FALLIDO: "Con error",
};

export const ESTADO_ENVIO: Record<Alerta["estadoEnvio"], string> = {
  NO_APLICA: "Solo aviso interno",
  PENDIENTE: "Envío pendiente",
  ENVIADO: "Enviado (simulado)",
  FALLIDO: "Envío fallido",
  SIN_DESTINATARIO: "Sin destinatario",
};
/** The delivery state in words, naming the channel of a delivered notice. */
export function textoEnvio(alerta: Pick<Alerta, "estadoEnvio" | "canal">) {
  if (alerta.estadoEnvio === "ENVIADO" && alerta.canal === "CORREO") return "Enviado por correo";
  return ESTADO_ENVIO[alerta.estadoEnvio];
}
export const VIGENCIA: Record<Alerta["vigencia"], string> = {
  ACTIVA: "Activa",
  SUPERADA: "Superada",
};

export const ROL: Record<UsuarioDemoDTO["rol"], string> = {
  RRHH: "RR. HH.",
  GERENCIA: "Gerencia",
  TEAM_LEAD: "Team Lead",
  EMPLEADO: "Empleado",
};
export const TIPO: Record<"TECNICO" | "TEAM_LEAD" | "GERENCIA", string> = {
  TECNICO: "Técnico",
  TEAM_LEAD: "Team Lead",
  GERENCIA: "Gerencia",
};
