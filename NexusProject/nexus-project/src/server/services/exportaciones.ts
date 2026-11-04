// CSV exports of the alerts list (with follow-up status), the weekly people list and the team summary.
// Same filters and the same scope as the screens; groups under five people are withheld; the event is
// recorded before any byte leaves; a file over the cap is refused, never cut.
// Research: work/enterprise/research/workforce-admin.md §1.10, §4.5; audit-trail.md (EXPORTACION_GENERADA).
import { Prisma, type PrismaClient } from "@prisma/client";
import type { UsuarioDemoDTO } from "../../shared/contracts";
import {
  ESTADO_ENVIO,
  FACTOR,
  NIVEL,
  TIPO,
  semana as textoSemana,
} from "../../shared/formato";
import {
  ESTADO_SEGUIMIENTO,
} from "../../shared/contratos/seguimiento";
import type {
  FiltrosExportacion,
  TipoExportacion,
} from "../../shared/contratos/exportaciones";
import { GRUPO_MINIMO } from "../../shared/semanas";
import { registrarEvento, type ContextoAuditoria } from "../repositories/auditoria";
import { leerResultados } from "../repositories/consultas";
import { fechaDesdeDb, fechaParaDb } from "../repositories/fechas";
import {
  aplicarTope,
  fragmentosCsv,
  type Celda,
} from "./exportaciones-csv";
import { promedioIndices } from "./consultas";
import {
  alertasFiltradas,
  LECTURA_ALERTAS,
  type Solicitante,
} from "./seguimiento-alertas";
import { esVencido, hoyEnBuenosAires } from "./seguimiento-reglas";

export type Exportacion = {
  nombreArchivo: string;
  filas: number;
  fragmentos: Iterable<string>;
};

type Tabla = {
  titulo: string;
  nombreArchivo: string;
  encabezados: string[];
  filas: Celda[][];
  /** The filters in words, for the file's first lines. */
  filtros: string[];
};

const ROL: Record<UsuarioDemoDTO["rol"], string> = {
  RRHH: "RR. HH.",
  GERENCIA: "Gerencia",
  TEAM_LEAD: "Team Lead",
  EMPLEADO: "Empleado",
};
/** A level only counts when its stored result is current, as on the screens. */
const textoNivel = (nivel: keyof typeof NIVEL | null, actualizado: boolean) =>
  !nivel ? "Sin evaluación" : actualizado ? NIVEL[nivel] : "Desactualizado";

const momentoLocal = (ahora: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  }).format(ahora);

const sumarDias = (fecha: string, dias: number) =>
  new Date(fechaParaDb(fecha).getTime() + dias * 86400000)
    .toISOString()
    .slice(0, 10);

// ── Alerts ────────────────────────────────────────────────────────────────

async function tablaAlertas(
  tx: Prisma.TransactionClient,
  filtros: FiltrosExportacion,
  solicitante: Solicitante,
  nombresEquipo: ReadonlyMap<string, string>,
  ahora: Date,
): Promise<Tabla> {
  const alertas = aplicarTope(await alertasFiltradas(tx, filtros, solicitante));
  const dicho: string[] = [];
  if (filtros.employeeId) dicho.push(`Persona = ${filtros.employeeId}`);
  if (filtros.teamId)
    dicho.push(`Equipo = ${nombresEquipo.get(filtros.teamId) ?? filtros.teamId}`);
  if (filtros.periodStart)
    dicho.push(`Semana desde = ${filtros.periodStart}`);
  if (filtros.seguimiento)
    dicho.push(
      `Seguimiento = ${filtros.seguimiento === "SIN_SEGUIMIENTO" ? "Sin seguimiento" : ESTADO_SEGUIMIENTO[filtros.seguimiento]}`,
    );
  if (filtros.asignadoA) {
    const u = solicitante.usuarios.find((x) => x.userId === filtros.asignadoA);
    dicho.push(`Responsable = ${u?.nombre ?? filtros.asignadoA}`);
  }
  if (filtros.vencido) dicho.push("Solo seguimientos vencidos");
  return {
    titulo: "Alertas con seguimiento",
    nombreArchivo: `alertas-${hoyEnBuenosAires(ahora)}.csv`,
    encabezados: [
      "Legajo",
      "Persona",
      "Equipo",
      "Tipo",
      "Semana desde",
      "Semana hasta",
      "Nivel",
      "Índice",
      "Factores que superan el umbral",
      "Destinatario",
      "Envío",
      "Vigencia",
      "Seguimiento",
      "Responsable del seguimiento",
      "Vence",
      "Vencido",
      "Fecha de la alerta",
    ],
    filas: alertas.map((a) => [
      a.employeeId,
      a.persona?.nombre,
      a.persona?.equipo,
      a.persona ? TIPO[a.persona.tipo] : null,
      a.semana?.periodStart,
      a.semana?.periodEnd,
      a.semana ? textoNivel(a.semana.nivel, a.semana.actualizado) : null,
      a.semana?.actualizado ? a.semana.indice : null,
      a.causas.map((f) => FACTOR[f]).join(", "),
      a.destinatario ?? "Sin destinatario",
      ESTADO_ENVIO[a.estadoEnvio],
      a.vigencia === "ACTIVA" ? "Activa" : "Superada",
      a.seguimiento ? ESTADO_SEGUIMIENTO[a.seguimiento.estado] : "Sin seguimiento",
      a.seguimiento?.asignadoA.nombre,
      a.seguimiento?.vence,
      a.seguimiento ? a.seguimiento.vencido : null,
      momentoLocal(new Date(a.createdAt)),
    ]),
    filtros: dicho,
  };
}

// ── People and teams of one week ──────────────────────────────────────────

async function semanaElegida(
  tx: Prisma.TransactionClient,
  filtros: FiltrosExportacion,
): Promise<string | null> {
  if (filtros.periodStart) return filtros.periodStart;
  const ultima = await tx.periodoEmpleado.aggregate({
    _max: { periodStart: true },
    where: {
      empleado: filtros.teamId ? { teamId: filtros.teamId } : undefined,
      employeeId: filtros.employeeId,
      registroVigente: { importacion: { status: "CONFIRMADA" } },
    },
  });
  return ultima._max.periodStart?.toISOString().slice(0, 10) ?? null;
}

async function personasDeLaSemana(
  tx: Prisma.TransactionClient,
  filtros: FiltrosExportacion,
  semana: string | null,
) {
  const empleados = await tx.empleado.findMany({
    where: {
      activo: true,
      enCobertura: true,
      tipo: { in: ["TECNICO", "TEAM_LEAD"] },
      teamId: filtros.teamId,
      employeeId: filtros.employeeId,
    },
    include: { equipo: true, responsable: true },
    orderBy: [{ teamId: "asc" }, { employeeId: "asc" }],
  });
  const resultados = semana
    ? await leerResultados(tx, {
        employeeId: filtros.employeeId,
        teamId: filtros.teamId,
        periodStart: semana,
        page: 1,
        pageSize: 1,
      })
    : [];
  const porPersona = new Map(resultados.map((r) => [r.fila.employeeId, r]));
  return empleados.map((e) => ({ empleado: e, resultado: porPersona.get(e.employeeId) }));
}

async function tablaPersonas(
  tx: Prisma.TransactionClient,
  filtros: FiltrosExportacion,
  nombresEquipo: ReadonlyMap<string, string>,
  ahora: Date,
): Promise<Tabla> {
  const semana = await semanaElegida(tx, filtros);
  const personas = aplicarTope(await personasDeLaSemana(tx, filtros, semana));
  const fin = semana ? sumarDias(semana, 6) : null;
  const dicho: string[] = [];
  if (semana) dicho.push(`Semana = ${textoSemana(semana, fin!)}`);
  if (filtros.employeeId) dicho.push(`Persona = ${filtros.employeeId}`);
  if (filtros.teamId)
    dicho.push(`Equipo = ${nombresEquipo.get(filtros.teamId) ?? filtros.teamId}`);
  return {
    titulo: "Personas, carga de trabajo de la semana",
    nombreArchivo: `personas-${semana ?? hoyEnBuenosAires(ahora)}.csv`,
    encabezados: [
      "Legajo",
      "Persona",
      "Equipo",
      "Tipo",
      "Responsable",
      "Semana desde",
      "Semana hasta",
      "Nivel",
      "Índice",
      "Horas extras",
      "Días consecutivos sin descanso",
      "Tareas activas",
      "Tareas pendientes",
      "Tareas vencidas",
      "Vacaciones pendientes (días)",
      "Alerta activa",
    ],
    filas: personas.map(({ empleado, resultado }) => {
      const fila = resultado?.fila;
      const registro = resultado?.registro;
      return [
        empleado.employeeId,
        empleado.nombre,
        empleado.equipo?.nombre ?? empleado.teamId,
        TIPO[empleado.tipo],
        empleado.responsable?.nombre,
        semana,
        fin,
        fila ? textoNivel(fila.nivel, fila.actualizado) : "Sin datos",
        fila?.actualizado ? fila.indice : null,
        registro?.horasExtra,
        registro?.diasConsecutivosSinDescanso,
        registro?.tareasActivas,
        registro?.tareasPendientes,
        registro?.tareasVencidas,
        registro?.vacacionesPendientesDias,
        fila ? !!resultado?.alerta : null,
      ];
    }),
    filtros: dicho,
  };
}

async function tablaEquipos(
  tx: Prisma.TransactionClient,
  filtros: FiltrosExportacion,
  nombresEquipo: ReadonlyMap<string, string>,
  ahora: Date,
): Promise<Tabla> {
  const semana = await semanaElegida(tx, filtros);
  const personas = await personasDeLaSemana(tx, filtros, semana);
  const equipos = await tx.equipo.findMany({
    where: { activo: true, teamId: filtros.teamId },
    orderBy: { teamId: "asc" },
  });
  const casos = await tx.casoSeguimiento.findMany({
    where: {
      estado: { not: "CERRADO" },
      employeeId: { in: personas.map((p) => p.empleado.employeeId) },
    },
    select: { employeeId: true, estado: true, vence: true },
  });
  const hoy = hoyEnBuenosAires(ahora);
  const equipoDe = new Map(
    personas.map((p) => [p.empleado.employeeId, p.empleado.teamId]),
  );
  const dicho: string[] = [];
  if (semana) dicho.push(`Semana = ${textoSemana(semana, sumarDias(semana, 6))}`);
  if (filtros.teamId)
    dicho.push(`Equipo = ${nombresEquipo.get(filtros.teamId) ?? filtros.teamId}`);
  return {
    titulo: "Resumen por equipo",
    nombreArchivo: `equipos-${semana ?? hoy}.csv`,
    encabezados: [
      "Equipo",
      "Semana desde",
      "Semana hasta",
      "Personas",
      "Con resultado vigente",
      "Bajo",
      "Medio",
      "Alto",
      "Incompleto",
      "Índice promedio",
      "Alertas activas",
      "Seguimientos abiertos",
      "Seguimientos vencidos",
      "Nota",
    ],
    filas: equipos.map((equipo) => {
      const miembros = personas.filter((p) => p.empleado.teamId === equipo.teamId);
      const base: Celda[] = [
        equipo.nombre,
        semana,
        semana ? sumarDias(semana, 6) : null,
        miembros.length,
      ];
      // Fewer than five people could identify an individual: no figure of the group is shown.
      if (miembros.length < GRUPO_MINIMO)
        return [
          ...base,
          ...Array<Celda>(9).fill(null),
          `Grupo de menos de ${GRUPO_MINIMO} personas: indicadores no mostrados.`,
        ];
      const vigentes = miembros.flatMap((p) =>
        p.resultado?.fila.actualizado ? [p.resultado.fila] : [],
      );
      const conteo = (nivel: keyof typeof NIVEL) =>
        vigentes.filter((f) => f.nivel === nivel).length;
      const deEquipo = casos.filter((c) => equipoDe.get(c.employeeId) === equipo.teamId);
      return [
        ...base,
        vigentes.length,
        conteo("BAJO"),
        conteo("MEDIO"),
        conteo("ALTO"),
        conteo("INCOMPLETO"),
        promedioIndices(vigentes.map((f) => f.indice!)),
        miembros.filter((p) => p.resultado?.alerta).length,
        deEquipo.length,
        deEquipo.filter((c) =>
          esVencido(
            {
              estado: c.estado,
              vence: c.vence ? fechaDesdeDb(c.vence) : null,
            },
            hoy,
          ),
        ).length,
        null,
      ];
    }),
    filtros: dicho,
  };
}

// ── Entry point ───────────────────────────────────────────────────────────

/**
 * Reads the rows under the viewer's scope, refuses a file over the cap, records EXPORTACION_GENERADA and
 * only then hands back the pieces to stream. Nothing is written if the audit event cannot be.
 */
export async function exportar(
  db: PrismaClient,
  tipo: TipoExportacion,
  filtros: FiltrosExportacion,
  solicitante: Solicitante & { usuario: UsuarioDemoDTO },
  actor: ContextoAuditoria,
  ahora: Date = new Date(),
): Promise<Exportacion> {
  const { tabla, nombres } = await db.$transaction(async (tx) => {
    const equipos = await tx.equipo.findMany({
      select: { teamId: true, nombre: true },
    });
    const nombres = new Map(equipos.map((e) => [e.teamId, e.nombre]));
    const tabla =
      tipo === "alertas"
        ? await tablaAlertas(tx, filtros, solicitante, nombres, ahora)
        : tipo === "personas"
          ? await tablaPersonas(tx, filtros, nombres, ahora)
          : await tablaEquipos(tx, filtros, nombres, ahora);
    return { tabla, nombres };
  }, LECTURA_ALERTAS);
  const { usuario } = solicitante;
  // A Team Lead's request carries their team (proteger injects it); everyone else sees all.
  const alcance =
    usuario.rol === "TEAM_LEAD" && usuario.teamId
      ? (nombres.get(usuario.teamId) ?? usuario.teamId)
      : "todos los equipos";
  await registrarEvento(db, {
    accion: "EXPORTACION_GENERADA",
    recursoId: actor.solicitudId ?? `${Date.now()}`,
    actor,
    detalles: {
      dataset: tipo.toUpperCase(),
      formato: "CSV",
      filtros: Object.fromEntries(
        Object.entries(filtros).filter(([, v]) => v !== undefined),
      ),
      filas: tabla.filas.length,
      alcance: usuario.rol === "TEAM_LEAD" ? (usuario.teamId ?? null) : null,
    },
  });
  return {
    nombreArchivo: tabla.nombreArchivo,
    filas: tabla.filas.length,
    fragmentos: fragmentosCsv({
      preambulo: [
        tabla.titulo,
        `Generado el ${momentoLocal(ahora)} (hora de Buenos Aires) por ${ROL[usuario.rol]}`,
        `Alcance: ${alcance}. Filtros: ${tabla.filtros.length ? tabla.filtros.join("; ") : "ninguno"}`,
        "Documento confidencial: contiene datos personales.",
      ],
      encabezados: tabla.encabezados,
      filas: tabla.filas,
    }),
  };
}
