// The alerts list and one alert's page, with the names, the person's weeks and the follow-up status of
// each alert in the same answer (D10: names inside the DTO, one query per kind, no per-row queries).
import { Prisma, type Alerta as AlertaDb, type PrismaClient } from "@prisma/client";
import type {
  AlertaListada,
  Factor,
  FiltrosAlertas,
  PaginaAlertas,
  UsuarioDemoDTO,
} from "../../shared/contracts";
import { ErrorDominio } from "../../shared/errors";
import { leerResultados } from "../repositories/consultas";
import { fechaDesdeDb } from "../repositories/fechas";
import { resumirSeguimientos, type Cliente } from "../repositories/seguimiento";
import {
  hoyEnBuenosAires,
  puedeSeguir,
  puedeVer,
  type TipoPersona,
} from "./seguimiento-reglas";

export type ConsultaAlertas = FiltrosAlertas & { page: number; pageSize: number };

/** Whoever asks; absent for internal callers, which then see everything. */
export type Solicitante = {
  usuario?: UsuarioDemoDTO | null;
  usuarios: readonly UsuarioDemoDTO[];
};

const FACTORES = new Set<string>(["HE", "DS", "CT", "VP"]);
const causasDe = (valor: Prisma.JsonValue): Factor[] =>
  Array.isArray(valor)
    ? (valor.filter((f) => typeof f === "string" && FACTORES.has(f)) as Factor[])
    : [];
const textosDe = (valor: Prisma.JsonValue): string[] =>
  Array.isArray(valor)
    ? valor.filter((t): t is string => typeof t === "string")
    : [];

type Semana = AlertaListada["serie"][number];

const semanaDe = (fila: {
  periodStart: string;
  periodEnd: string;
  nivel: Semana["nivel"];
  indice: number | null;
  actualizado: boolean;
}): Semana => ({
  periodStart: fila.periodStart,
  periodEnd: fila.periodEnd,
  nivel: fila.nivel,
  indice: fila.indice,
  actualizado: fila.actualizado,
});

async function armarListadas(
  tx: Cliente,
  alertas: readonly AlertaDb[],
  semanasPorPersona: ReadonlyMap<string, Semana[]>,
  semanaDeAlerta: ReadonlyMap<string, Semana>,
  solicitante: Solicitante,
): Promise<AlertaListada[]> {
  if (!alertas.length) return [];
  const personas = [...new Set(alertas.map((a) => a.employeeId))];
  const destinatarios = [
    ...new Set(alertas.flatMap((a) => (a.destinatarioId ? [a.destinatarioId] : []))),
  ];
  const empleados = await tx.empleado.findMany({
    where: { employeeId: { in: [...new Set([...personas, ...destinatarios])] } },
    select: {
      employeeId: true,
      nombre: true,
      tipo: true,
      teamId: true,
      equipo: { select: { nombre: true } },
    },
  });
  const porId = new Map(empleados.map((e) => [e.employeeId, e]));
  const nombres = new Map(solicitante.usuarios.map((u) => [u.userId, u.nombre]));
  const resumenes = await resumirSeguimientos(
    tx,
    alertas,
    nombres,
    hoyEnBuenosAires(),
  );
  return alertas.map((a) => {
    const persona = porId.get(a.employeeId);
    const semana = semanaDeAlerta.get(a.alertId) ?? null;
    return {
      alertId: a.alertId,
      evaluationId: a.evaluationId,
      employeeId: a.employeeId,
      destinatarioId: a.destinatarioId,
      motivoDestinatario: a.motivoDestinatario,
      causas: causasDe(a.causas),
      sugerencias: textosDe(a.sugerencias),
      vigencia: a.vigencia,
      canal: a.canal,
      estadoEnvio: a.estadoEnvio,
      createdAt: a.createdAt.toISOString(),
      persona:
        persona && persona.teamId && persona.tipo !== "GERENCIA"
          ? {
              nombre: persona.nombre,
              equipo: persona.equipo?.nombre ?? persona.teamId,
              teamId: persona.teamId,
              tipo: persona.tipo,
            }
          : null,
      destinatario: a.destinatarioId
        ? (porId.get(a.destinatarioId)?.nombre ?? null)
        : null,
      semana,
      serie: semana
        ? (semanasPorPersona.get(a.employeeId) ?? []).filter(
            (s) => s.periodStart <= semana.periodStart,
          )
        : [],
      seguimiento: resumenes.get(a.alertId) ?? null,
    };
  });
}

/** Weeks of each person, oldest first, and the week each alert belongs to, from one read of the results. */
function indexar(resultados: Awaited<ReturnType<typeof leerResultados>>) {
  const semanasPorPersona = new Map<string, Semana[]>();
  const semanaDeAlerta = new Map<string, Semana>();
  for (const { fila, alerta } of resultados) {
    const semana = semanaDe(fila);
    semanasPorPersona.set(fila.employeeId, [
      ...(semanasPorPersona.get(fila.employeeId) ?? []),
      semana,
    ]);
    if (alerta) semanaDeAlerta.set(alerta.alertId, semana);
  }
  for (const semanas of semanasPorPersona.values())
    semanas.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  return { semanasPorPersona, semanaDeAlerta };
}

const LECTURA = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  timeout: 30000,
};

/**
 * Every active alert whose stored result is current, filtered and newest week first. The stored results
 * are read once for the whole scope, as every list of the board does.
 */
export async function alertasFiltradas(
  tx: Prisma.TransactionClient,
  filtros: FiltrosAlertas,
  solicitante: Solicitante,
): Promise<AlertaListada[]> {
  const resultados = await leerResultados(tx, {
    employeeId: filtros.employeeId,
    teamId: filtros.teamId,
    page: 1,
    pageSize: 1,
  });
  const { semanasPorPersona, semanaDeAlerta } = indexar(resultados);
  const filas = resultados
    .flatMap((r) => (r.alerta ? [r.alerta] : []))
    .filter(
      (a) =>
        !filtros.periodStart ||
        semanaDeAlerta.get(a.alertId)?.periodStart === filtros.periodStart,
    );
  const listadas = await armarListadas(tx, filas, semanasPorPersona, semanaDeAlerta, solicitante);
  // «Dirigidas a usted»: the alerts the viewer may open and manage, by the recipient's type.
  const tipoDestinatario = new Map<string, string>();
  if (filtros.dirigidas) {
    const ids = [...new Set(listadas.flatMap((a) => (a.destinatarioId ? [a.destinatarioId] : [])))];
    const destinatarios = await tx.empleado.findMany({
      where: { employeeId: { in: ids } },
      select: { employeeId: true, tipo: true },
    });
    for (const d of destinatarios) tipoDestinatario.set(d.employeeId, d.tipo);
  }
  const dirigida = (a: AlertaListada) =>
    !!solicitante.usuario &&
    puedeSeguir(solicitante.usuario, {
      alertId: a.alertId,
      employeeId: a.employeeId,
      createdAt: new Date(a.createdAt),
      vigencia: a.vigencia,
      personaTeamId: a.persona?.teamId ?? null,
      destinatarioTipo: (a.destinatarioId
        ? (tipoDestinatario.get(a.destinatarioId) ?? null)
        : null) as TipoPersona | null,
    });
  return listadas
    .filter((a) => {
      if (filtros.dirigidas && !dirigida(a)) return false;
      const s = a.seguimiento;
      if (filtros.seguimiento === "SIN_SEGUIMIENTO" && s) return false;
      if (
        filtros.seguimiento &&
        filtros.seguimiento !== "SIN_SEGUIMIENTO" &&
        s?.estado !== filtros.seguimiento
      )
        return false;
      if (filtros.asignadoA && s?.asignadoA.userId !== filtros.asignadoA)
        return false;
      if (filtros.vencido && !s?.vencido) return false;
      return true;
    })
    .sort(
      (a, b) =>
        (b.semana?.periodStart ?? "").localeCompare(a.semana?.periodStart ?? "") ||
        b.createdAt.localeCompare(a.createdAt) ||
        a.alertId.localeCompare(b.alertId),
    );
}

export const LECTURA_ALERTAS = LECTURA;

/** One page of `alertasFiltradas`, with the teams the viewer may filter by. */
export async function listarAlertas(
  db: PrismaClient,
  filtros: ConsultaAlertas,
  solicitante: Solicitante,
): Promise<PaginaAlertas> {
  return db.$transaction(async (tx) => {
    const listadas = await alertasFiltradas(tx, filtros, solicitante);
    // Avoids overflow with a safe but very large page number.
    const inicio =
      filtros.page - 1 > listadas.length / filtros.pageSize
        ? listadas.length
        : (filtros.page - 1) * filtros.pageSize;
    const equipos = await tx.equipo.findMany({
      where: {
        activo: true,
        ...(solicitante.usuario?.rol === "TEAM_LEAD"
          ? { teamId: solicitante.usuario.teamId ?? undefined }
          : {}),
      },
      select: { teamId: true, nombre: true },
      orderBy: { teamId: "asc" },
    });
    return {
      items: listadas.slice(inicio, inicio + filtros.pageSize),
      total: listadas.length,
      personas: new Set(listadas.map((a) => a.employeeId)).size,
      page: filtros.page,
      pageSize: filtros.pageSize,
      equipos,
    };
  }, LECTURA);
}

/**
 * One alert with its person, week and follow-up status, also when it was superseded or its result is no
 * longer current. A viewer outside its scope gets "not found", the same as an alert that does not exist.
 */
export async function obtenerAlerta(
  db: PrismaClient,
  alertId: string,
  solicitante: Solicitante,
): Promise<AlertaListada> {
  const noExiste = new ErrorDominio("NO_ENCONTRADO", "No existe esa alerta.");
  return db.$transaction(async (tx) => {
    const base = await tx.alerta.findUnique({
      where: { alertId },
      include: {
        empleado: { select: { teamId: true } },
        destinatario: { select: { tipo: true } },
        evaluacion: { include: { periodo: true } },
      },
    });
    if (!base) throw noExiste;
    if (
      solicitante.usuario &&
      !puedeVer(solicitante.usuario, {
        alertId,
        employeeId: base.employeeId,
        createdAt: base.createdAt,
        vigencia: base.vigencia,
        personaTeamId: base.empleado.teamId,
        destinatarioTipo: (base.destinatario?.tipo ?? null) as TipoPersona | null,
      })
    )
      throw noExiste;
    const resultados = await leerResultados(tx, {
      employeeId: base.employeeId,
      page: 1,
      pageSize: 1,
    });
    const { semanasPorPersona, semanaDeAlerta } = indexar(resultados);
    // A superseded alert is not the current one of its week, so its week comes from its evaluation.
    if (!semanaDeAlerta.has(alertId)) {
      const periodo = base.evaluacion.periodo;
      semanaDeAlerta.set(alertId, {
        periodStart: fechaDesdeDb(periodo.periodStart),
        periodEnd: fechaDesdeDb(periodo.periodEnd),
        nivel: base.evaluacion.nivel,
        indice: Number(base.evaluacion.indice),
        actualizado: false,
      });
    }
    return (
      await armarListadas(tx, [base], semanasPorPersona, semanaDeAlerta, solicitante)
    )[0];
  }, LECTURA);
}
