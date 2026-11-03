// Field rules of the organization writes (workforce-admin §4.1–4.2). Pure: facts about the database
// (does the legajo exist, is the person leading a team) are checked by the services that own the
// transaction. Every error names its field so a form can show it next to the control.
import type { ErrorCampo, FechaISO } from "../../shared/contracts";
import type {
  CambiarAsignacion,
  MotivoCambio,
  TipoPuesto,
} from "../../shared/contratos/organizacion";
import { fechaParaDb } from "../repositories/fechas";
import { errorCampo } from "./organizacion-errores";

const DIA = 86_400_000;
export const TIPOS_PUESTO: readonly TipoPuesto[] = [
  "TECNICO",
  "TEAM_LEAD",
  "GERENCIA",
];
export const MOTIVOS_CAMBIO: readonly MotivoCambio[] = [
  "CAMBIO_EQUIPO",
  "CAMBIO_PUESTO",
  "CORRECCION",
];
/** Paths that sit beside `/api/personas/[employeeId]`; a legajo with these names could not be opened. */
const LEGAJOS_RESERVADOS = ["directorio", "opciones", "importacion"];
const FECHA_MINIMA: FechaISO = "2000-01-03";
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
];

// --- Dates --------------------------------------------------------------------------------

export function esFechaReal(valor: unknown): valor is FechaISO {
  if (typeof valor !== "string") return false;
  try {
    fechaParaDb(valor);
    return true;
  } catch {
    return false;
  }
}
export const sumarDias = (fecha: FechaISO, dias: number): FechaISO =>
  new Date(fechaParaDb(fecha).getTime() + dias * DIA).toISOString().slice(0, 10);
export const esLunes = (fecha: FechaISO) => fechaParaDb(fecha).getUTCDay() === 1;
/** The Monday of the week that contains `fecha`. */
export const lunesDe = (fecha: FechaISO): FechaISO =>
  sumarDias(fecha, -((fechaParaDb(fecha).getUTCDay() + 6) % 7));
/** The first Monday strictly after `fecha`. */
export const lunesPosteriorA = (fecha: FechaISO): FechaISO =>
  sumarDias(lunesDe(fecha), 7);
/** Buenos Aires has no daylight saving: it is UTC-3 all year. */
export const hoyBuenosAires = (ahora: Date): FechaISO =>
  new Date(ahora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
export const lunesActual = (ahora: Date): FechaISO =>
  lunesDe(hoyBuenosAires(ahora));
/** "2 de noviembre de 2026" */
export function fechaLarga(fecha: FechaISO) {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

// --- Text ---------------------------------------------------------------------------------

const texto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const normalizarNombre = (valor: string) =>
  valor.normalize("NFC").replace(/\s+/g, " ").trim();
/** Case, accent and spacing insensitive key, to spot a person who is already registered. */
export const claveNombre = (valor: string) =>
  normalizarNombre(valor).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");

type Resultado<T> = { valor?: T; errores: ErrorCampo[] };

export function validarLegajo(
  valor: unknown,
  campo = "employeeId",
  fila: number | null = null,
): Resultado<string> {
  const legajo = texto(valor);
  const err = (codigo: string, detalle: string) => ({
    errores: [errorCampo(campo, codigo, detalle, fila)],
  });
  if (!legajo) return err("OBLIGATORIO", "Ingrese el legajo.");
  if (legajo.length > 64)
    return err("LONGITUD_EXCEDIDA", "El legajo admite hasta 64 caracteres.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(legajo))
    return err(
      "FORMATO_INVALIDO",
      "El legajo admite letras, números, punto, guion y guion bajo, y debe comenzar con una letra o un número (por ejemplo, EMP-046).",
    );
  if (LEGAJOS_RESERVADOS.includes(legajo.toLowerCase()))
    return err(
      "LEGAJO_RESERVADO",
      "Este legajo está reservado por el sistema. Utilice otro (por ejemplo, EMP-046).",
    );
  return { valor: legajo, errores: [] };
}

export function validarNombre(
  valor: unknown,
  campo = "nombre",
  fila: number | null = null,
  etiqueta = "nombre",
): Resultado<string> {
  const bruto = typeof valor === "string" ? valor : "";
  const err = (codigo: string, detalle: string) => ({
    errores: [errorCampo(campo, codigo, detalle, fila)],
  });
  if (CONTROL.test(bruto))
    return err("FORMATO_INVALIDO", `El ${etiqueta} contiene caracteres de control.`);
  const nombre = normalizarNombre(bruto);
  if (!nombre)
    return err(
      "OBLIGATORIO",
      etiqueta === "nombre"
        ? "Ingrese el nombre y apellido."
        : `Ingrese el ${etiqueta}.`,
    );
  if (nombre.length > 160)
    return err("LONGITUD_EXCEDIDA", `El ${etiqueta} admite hasta 160 caracteres.`);
  return { valor: nombre, errores: [] };
}

// --- Suggestions --------------------------------------------------------------------------

function siguienteEnSerie(existentes: readonly string[], prefijo: string, anchoMinimo: number) {
  const serie = new RegExp(`^${prefijo}-(\\d{1,9})$`);
  let mayor = 0;
  let ancho = anchoMinimo;
  for (const id of existentes) {
    const digitos = serie.exec(id)?.[1];
    if (digitos && Number(digitos) > mayor) {
      mayor = Number(digitos);
      ancho = Math.max(anchoMinimo, digitos.length);
    }
  }
  return `${prefijo}-${String(mayor + 1).padStart(ancho, "0")}`;
}
/** The next legajo of the EMP-NNN series (the highest number plus one; gaps are not refilled). */
export const sugerirLegajo = (existentes: readonly string[]) =>
  siguienteEnSerie(existentes, "EMP", 3);
export const sugerirCodigoEquipo = (existentes: readonly string[]) =>
  siguienteEnSerie(existentes, "EQ", 2);

// --- Dates inside forms -------------------------------------------------------------------

const FORMATO_FECHA =
  "La fecha debe existir y tener el formato AAAA-MM-DD (por ejemplo, 2026-11-02).";

/** Required date that must be a real day. Returns the error to show, if any. */
function errorFecha(
  valor: unknown,
  campo: string,
  fila: number | null,
  obligatorio: string,
): ErrorCampo | null {
  const fecha = texto(valor);
  if (!fecha) return errorCampo(campo, "OBLIGATORIO", obligatorio, fila);
  if (!esFechaReal(fecha) || fecha < FECHA_MINIMA)
    return errorCampo(campo, "FECHA_INVALIDA", FORMATO_FECHA, fila);
  return null;
}

/** A Monday that is not after the current week. */
function errorLunes(
  fecha: FechaISO,
  campo: string,
  fila: number | null,
  actual: FechaISO,
): ErrorCampo | null {
  if (!esLunes(fecha))
    return errorCampo(campo, "NO_ES_LUNES", "La fecha debe ser un lunes.", fila);
  if (fecha > actual)
    return errorCampo(
      campo,
      "FECHA_FUTURA",
      `La fecha no puede ser posterior a la semana actual (lunes ${fechaLarga(actual)}).`,
      fila,
    );
  return null;
}

// --- Alta ---------------------------------------------------------------------------------

export type EquiposConocidos = ReadonlyMap<string, { activo: boolean }>;
export type CampoAlta =
  | "employeeId"
  | "nombre"
  | "tipo"
  | "teamId"
  | "desde"
  | "enCobertura";
export type AltaValida = {
  employeeId: string;
  nombre: string;
  tipo: TipoPuesto;
  teamId: string | null;
  desde: FechaISO;
  enCobertura: boolean;
};
type OpcionesFila = {
  fila?: number | null;
  /** Names the field has in a file (the CSV column) when they differ from the form's. */
  campos?: Partial<Record<CampoAlta, string>>;
};

/** Team and coverage rules that follow from the position, shared by hire and move. */
function validarPuestoYEquipo(
  entrada: { tipo?: unknown; teamId?: unknown; enCobertura?: unknown },
  equipos: EquiposConocidos,
  nombre: (campo: CampoAlta) => string,
  fila: number | null,
) {
  const errores: ErrorCampo[] = [];
  const err = (campo: CampoAlta, codigo: string, detalle: string) =>
    errores.push(errorCampo(nombre(campo), codigo, detalle, fila));
  const tipo = texto(entrada.tipo) as TipoPuesto;
  const tipoValido = TIPOS_PUESTO.includes(tipo);
  if (!tipoValido)
    err("tipo", "VALOR_NO_PERMITIDO", "Seleccione un puesto: Técnico, Team Lead o Gerencia.");
  const teamId = texto(entrada.teamId) || null;
  const cobertura = entrada.enCobertura;
  if (typeof cobertura !== "boolean")
    err("enCobertura", "VALOR_NO_PERMITIDO", "Indique si la persona está en cobertura (true o false).");
  if (tipoValido && tipo === "GERENCIA") {
    if (teamId) err("teamId", "NO_APLICA", "Gerencia no pertenece a un equipo.");
    if (cobertura === true)
      err("enCobertura", "NO_APLICA", "Gerencia no se incluye en la evaluación.");
  } else if (tipoValido) {
    const equipo = teamId ? equipos.get(teamId) : undefined;
    if (!teamId) err("teamId", "OBLIGATORIO", "Seleccione un equipo.");
    else if (!equipo) err("teamId", "EQUIPO_INEXISTENTE", "El equipo seleccionado no existe.");
    else if (!equipo.activo)
      err("teamId", "EQUIPO_INACTIVO", "El equipo seleccionado está desactivado. Seleccione otro.");
  }
  return {
    errores,
    tipo: tipoValido ? tipo : undefined,
    teamId: tipoValido && tipo === "GERENCIA" ? null : teamId,
    enCobertura: typeof cobertura === "boolean" ? cobertura : undefined,
  };
}

export function validarAlta(
  entrada: Record<string, unknown>,
  ctx: { lunesActual: FechaISO; equipos: EquiposConocidos },
  opciones: OpcionesFila = {},
): Resultado<AltaValida> {
  const fila = opciones.fila ?? null;
  const nombreCampo = (campo: CampoAlta) => opciones.campos?.[campo] ?? campo;
  const errores: ErrorCampo[] = [];
  const legajo = validarLegajo(entrada.employeeId, nombreCampo("employeeId"), fila);
  const nombre = validarNombre(entrada.nombre, nombreCampo("nombre"), fila);
  const puesto = validarPuestoYEquipo(entrada, ctx.equipos, nombreCampo, fila);
  errores.push(...legajo.errores, ...nombre.errores, ...puesto.errores);
  const desde = texto(entrada.desde);
  const errorDesde =
    errorFecha(desde, nombreCampo("desde"), fila, "Indique desde qué lunes rige.") ??
    errorLunes(desde, nombreCampo("desde"), fila, ctx.lunesActual);
  if (errorDesde) errores.push(errorDesde);
  if (errores.length) return { errores };
  return {
    valor: {
      employeeId: legajo.valor!,
      nombre: nombre.valor!,
      tipo: puesto.tipo!,
      teamId: puesto.teamId,
      desde,
      enCobertura: puesto.enCobertura!,
    },
    errores,
  };
}

// --- Change of assignment -----------------------------------------------------------------

export type AsignacionActual = {
  tipo: TipoPuesto;
  teamId: string | null;
  enCobertura: boolean;
  /** Start of the latest assignment row. */
  desde: FechaISO;
  fechaIngreso: FechaISO | null;
};
export type CambioValido = {
  motivo: MotivoCambio;
  desde: FechaISO;
  tipo: TipoPuesto;
  teamId: string | null;
  enCobertura: boolean;
  comentario: string | null;
};

export function validarCambio(
  entrada: Partial<Record<keyof CambiarAsignacion, unknown>>,
  actual: AsignacionActual,
  ctx: { lunesActual: FechaISO; equipos: EquiposConocidos },
): Resultado<CambioValido> {
  const motivo = texto(entrada.motivo) as MotivoCambio;
  if (!MOTIVOS_CAMBIO.includes(motivo))
    return {
      errores: [
        errorCampo(
          "motivo",
          "VALOR_NO_PERMITIDO",
          "Seleccione el motivo: cambio de equipo, cambio de puesto o corrección de datos.",
        ),
      ],
    };
  const puesto = validarPuestoYEquipo(entrada, ctx.equipos, (c) => c, null);
  const errores = puesto.errores;
  const err = (campo: string, codigo: string, detalle: string) =>
    errores.push(errorCampo(campo, codigo, detalle));
  const equipoCambia = puesto.teamId !== actual.teamId;
  const tipoCambia = puesto.tipo !== actual.tipo;
  const coberturaCambia = puesto.enCobertura !== actual.enCobertura;
  const sinErroresDePuesto = errores.length === 0;
  if (sinErroresDePuesto) {
    if (motivo === "CAMBIO_EQUIPO" && !equipoCambia)
      err("teamId", "SIN_CAMBIOS", "El equipo seleccionado es el actual. Seleccione otro equipo.");
    if (motivo === "CAMBIO_PUESTO" && !tipoCambia)
      err("tipo", "SIN_CAMBIOS", "El puesto seleccionado es el actual. Seleccione otro puesto.");
    if (motivo === "CORRECCION" && !equipoCambia && !tipoCambia && !coberturaCambia)
      err(
        "motivo",
        "SIN_CAMBIOS",
        "No hay cambios para corregir. Modifique el equipo, el puesto o la cobertura.",
      );
  }
  const comentario = texto(entrada.comentario);
  // A correction's comment is also the justification of its audit event (280 characters).
  if (comentario.length > 280)
    err("comentario", "LONGITUD_EXCEDIDA", "El comentario admite hasta 280 caracteres.");
  else if (motivo === "CORRECCION" && !comentario)
    err(
      "comentario",
      "JUSTIFICACION_OBLIGATORIA",
      "Indique el motivo de la corrección, que queda registrado en la auditoría.",
    );
  let desde = actual.desde;
  if (motivo !== "CORRECCION") {
    const fecha = texto(entrada.desde);
    const errorDesde =
      errorFecha(fecha, "desde", null, "Indique desde qué lunes rige el cambio.") ??
      errorLunes(fecha, "desde", null, ctx.lunesActual);
    if (errorDesde) errores.push(errorDesde);
    else if (fecha <= actual.desde)
      err(
        "desde",
        "FECHA_ANTERIOR",
        `La fecha debe ser posterior al inicio de la asignación actual (${fechaLarga(actual.desde)}). Para modificar datos dentro de esa semana, use la corrección de datos.`,
      );
    else if (actual.fechaIngreso && fecha < actual.fechaIngreso)
      err(
        "desde",
        "FECHA_ANTERIOR",
        `La fecha no puede ser anterior al ingreso (${fechaLarga(actual.fechaIngreso)}).`,
      );
    else desde = fecha;
  }
  if (errores.length) return { errores };
  return {
    valor: {
      motivo,
      desde,
      tipo: puesto.tipo!,
      teamId: puesto.teamId,
      enCobertura: puesto.enCobertura!,
      comentario: comentario || null,
    },
    errores,
  };
}

// --- Deactivation -------------------------------------------------------------------------

/** The justification travels to the audit event, whose column holds 280 characters. */
export function validarJustificacion(valor: unknown, campo = "justificacion") {
  const justificacion = texto(valor);
  if (!justificacion)
    return {
      errores: [
        errorCampo(
          campo,
          "JUSTIFICACION_OBLIGATORIA",
          "Indique la justificación, que queda registrada en la auditoría.",
        ),
      ],
    };
  if (justificacion.length > 280)
    return {
      errores: [
        errorCampo(campo, "LONGITUD_EXCEDIDA", "La justificación admite hasta 280 caracteres."),
      ],
    };
  return { valor: justificacion, errores: [] as ErrorCampo[] };
}

export function validarBaja(
  entrada: { fechaBaja?: unknown; justificacion?: unknown },
  ctx: { hoy: FechaISO; desdeActual: FechaISO },
): Resultado<{ fechaBaja: FechaISO; justificacion: string; desdeBaja: FechaISO }> {
  const errores: ErrorCampo[] = [];
  const fecha = texto(entrada.fechaBaja);
  const errorBase = errorFecha(fecha, "fechaBaja", null, "Indique el último día trabajado.");
  if (errorBase) errores.push(errorBase);
  else if (fecha > ctx.hoy)
    errores.push(
      errorCampo(
        "fechaBaja",
        "FECHA_FUTURA",
        "La fecha no puede ser posterior a hoy. Registre la baja cuando se produzca.",
      ),
    );
  else if (fecha < ctx.desdeActual)
    errores.push(
      errorCampo(
        "fechaBaja",
        "FECHA_ANTERIOR",
        `La fecha no puede ser anterior al inicio de la asignación actual (${fechaLarga(ctx.desdeActual)}).`,
      ),
    );
  const justificacion = validarJustificacion(entrada.justificacion);
  errores.push(...justificacion.errores);
  if (errores.length) return { errores };
  return {
    valor: {
      fechaBaja: fecha,
      justificacion: justificacion.valor!,
      desdeBaja: lunesPosteriorA(fecha),
    },
    errores,
  };
}

// --- Person data --------------------------------------------------------------------------

export function validarDatosPersona(
  entrada: { nombre?: unknown; fechaIngreso?: unknown },
  ctx: { primerDesde: FechaISO | null },
): Resultado<{ nombre?: string; fechaIngreso?: FechaISO | null }> {
  const valor: { nombre?: string; fechaIngreso?: FechaISO | null } = {};
  const errores: ErrorCampo[] = [];
  if ("nombre" in entrada) {
    const nombre = validarNombre(entrada.nombre);
    errores.push(...nombre.errores);
    if (nombre.valor) valor.nombre = nombre.valor;
  }
  if ("fechaIngreso" in entrada) {
    if (entrada.fechaIngreso === null) valor.fechaIngreso = null;
    else {
      const fecha = texto(entrada.fechaIngreso);
      const error = errorFecha(fecha, "fechaIngreso", null, "Indique la fecha de ingreso.");
      if (error) errores.push(error);
      else if (ctx.primerDesde && fecha > ctx.primerDesde)
        errores.push(
          errorCampo(
            "fechaIngreso",
            "FECHA_POSTERIOR",
            `La fecha de ingreso no puede ser posterior al inicio de la primera asignación (${fechaLarga(ctx.primerDesde)}).`,
          ),
        );
      else valor.fechaIngreso = fecha;
    }
  }
  if (!("nombre" in entrada) && !("fechaIngreso" in entrada))
    errores.push(errorCampo("nombre", "SIN_CAMBIOS", "No hay cambios para guardar."));
  return errores.length ? { errores } : { valor, errores };
}

// --- Teams --------------------------------------------------------------------------------

const referencia = (valor: unknown) => texto(valor) || null;

function validarCodigoEquipo(valor: unknown): Resultado<string> {
  const codigo = texto(valor);
  const err = (c: string, detalle: string) => ({
    errores: [errorCampo("teamId", c, detalle)],
  });
  if (!codigo) return err("OBLIGATORIO", "Ingrese el código del equipo (por ejemplo, EQ-05).");
  if (codigo.length > 64)
    return err("LONGITUD_EXCEDIDA", "El código admite hasta 64 caracteres.");
  if (!/^EQ-\d{2,}$/.test(codigo))
    return err(
      "FORMATO_INVALIDO",
      "El código debe comenzar con EQ- y seguir con dos o más dígitos (por ejemplo, EQ-05).",
    );
  return { valor: codigo, errores: [] };
}

export function validarEquipoNuevo(entrada: {
  teamId?: unknown;
  nombre?: unknown;
  liderId?: unknown;
  gerenteId?: unknown;
}): Resultado<{
  teamId: string;
  nombre: string;
  liderId: string | null;
  gerenteId: string | null;
}> {
  const codigo = validarCodigoEquipo(entrada.teamId);
  const nombre = validarNombre(entrada.nombre, "nombre", null, "nombre del equipo");
  const errores = [...codigo.errores, ...nombre.errores];
  if (errores.length) return { errores };
  return {
    valor: {
      teamId: codigo.valor!,
      nombre: nombre.valor!,
      liderId: referencia(entrada.liderId),
      gerenteId: referencia(entrada.gerenteId),
    },
    errores,
  };
}

export function validarDatosEquipo(entrada: {
  nombre?: unknown;
  gerenteId?: unknown;
}): Resultado<{ nombre?: string; gerenteId?: string | null }> {
  const valor: { nombre?: string; gerenteId?: string | null } = {};
  const errores: ErrorCampo[] = [];
  if ("nombre" in entrada) {
    const nombre = validarNombre(entrada.nombre, "nombre", null, "nombre del equipo");
    errores.push(...nombre.errores);
    if (nombre.valor) valor.nombre = nombre.valor;
  }
  if ("gerenteId" in entrada) valor.gerenteId = referencia(entrada.gerenteId);
  if (!("nombre" in entrada) && !("gerenteId" in entrada))
    errores.push(errorCampo("nombre", "SIN_CAMBIOS", "No hay cambios para guardar."));
  return errores.length ? { errores } : { valor, errores };
}
