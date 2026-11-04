// Stubs of the people and teams endpoints for the mocked browser specs. They answer like the
// server does over the dataset of ./demo.ts (the same PERSONAS), so a spec reads one story.
// `organizacion(page)` goes after `demo(page, user)`; routes registered later win.
import type { Page, Route } from "@playwright/test";
import {
  suprimirGrupos,
  promedioDesdeCentesimos,
} from "../src/server/services/equipos-agregados";
import type { Nivel, SemanaPersona } from "../src/shared/contracts";
import type {
  DirectorioPersonasDTO,
  EquipoFilaDTO,
  FichaPersonaDTO,
  OpcionesEquipoDTO,
  OpcionesPersonaDTO,
  PersonaFilaDTO,
} from "../src/shared/contratos/organizacion";
import { PERSONAS } from "./demo";

export const LUNES_ACTUAL = "2026-11-02";
const ACTIVOS = PERSONAS.map((p) => p.employeeId);
const sinTildes = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");

/** Weeks of the dataset, newest first. */
const SEMANAS = [
  ...new Set(PERSONAS.flatMap((p) => p.semanas.map((w) => w.periodStart))),
].sort((a, b) => (a < b ? 1 : -1));

const desde = (p: (typeof PERSONAS)[number], hasta: string, max = 8) =>
  p.semanas
    .filter((w) => w.periodStart <= hasta)
    .sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1))
    .slice(0, max);
const vigente = (w: SemanaPersona | undefined) => (w?.actualizado ? w.indice : null);

const EQUIPOS = [
  { teamId: "EQ-01", nombre: "Célula ficticia 1", activo: true, lider: "TL-01" },
  { teamId: "EQ-02", nombre: "Célula ficticia 2", activo: true, lider: null },
  { teamId: "EQ-09", nombre: "Célula ficticia 9", activo: false, lider: null },
];
const referencia = (id: string | null) => {
  const p = PERSONAS.find((x) => x.employeeId === id);
  return p ? { employeeId: p.employeeId, nombre: p.nombre } : null;
};
const GERENTE = { employeeId: "GER-01", nombre: "Gerente ficticio de Operaciones" };

export function directorio(filtro: Record<string, string>): DirectorioPersonasDTO {
  const enAlcance = PERSONAS.filter((p) => !filtro.teamId || p.teamId === filtro.teamId);
  const semanas = SEMANAS.filter((s) =>
    enAlcance.some((p) => p.semanas.some((w) => w.periodStart === s)),
  );
  const periodStart = filtro.periodStart ?? semanas[0] ?? null;
  const q = sinTildes(filtro.q ?? "");
  const activas = (filtro.estado ?? "ACTIVAS") === "ACTIVAS";
  const filas = enAlcance
    .filter((p) => activas && ACTIVOS.includes(p.employeeId))
    .filter((p) => !q || sinTildes(`${p.nombre} ${p.employeeId}`).includes(q))
    .map((p) => ({ p, w: periodStart ? p.semanas.find((x) => x.periodStart === periodStart) : undefined }))
    .filter(({ w }) =>
      !filtro.nivel
        ? true
        : filtro.nivel === "DESACTUALIZADO"
          ? !!w && !w.actualizado
          : !!w?.actualizado && w.nivel === filtro.nivel,
    )
    .sort((a, b) => {
      const nombre = a.p.nombre.localeCompare(b.p.nombre, "es", { numeric: true });
      return filtro.orden === "nombre" ? nombre : (vigente(b.w) ?? -1) - (vigente(a.w) ?? -1) || nombre;
    });
  const page = Number(filtro.page ?? 1);
  const pageSize = Number(filtro.pageSize ?? 50);
  const items: PersonaFilaDTO[] = filas
    .slice((page - 1) * pageSize, page * pageSize)
    .map(({ p }) => ({
      employeeId: p.employeeId,
      nombre: p.nombre,
      tipo: p.tipo,
      activo: true,
      enCobertura: true,
      teamId: p.teamId,
      equipo: p.equipo,
      responsable: p.responsable,
      semanas: periodStart ? desde(p, periodStart) : [],
    }));
  return { items, total: filas.length, page, pageSize, periodStart, semanas };
}

export function ficha(employeeId: string): FichaPersonaDTO | null {
  const p = PERSONAS.find((x) => x.employeeId === employeeId);
  if (!p) return null;
  const semanas = desde(p, SEMANAS[0], 12);
  return {
    persona: {
      employeeId: p.employeeId,
      nombre: p.nombre,
      tipo: p.tipo,
      activo: true,
      enCobertura: true,
      teamId: p.teamId,
      equipo: p.equipo,
      responsableId: p.tipo === "TEAM_LEAD" ? "GER-01" : "TL-01",
      responsable: p.responsable,
      fechaIngreso: "2026-01-05",
      fechaBaja: null,
      vigenteDesde: "2026-03-02",
      lidera: p.employeeId === "TL-01" ? { teamId: "EQ-01", nombre: "Célula ficticia 1" } : null,
      gerenciaDe: 0,
    },
    asignaciones: [
      {
        asignacionId: `${p.employeeId}-2`,
        desde: "2026-03-02",
        hasta: null,
        tipo: p.tipo,
        teamId: p.teamId,
        equipo: p.equipo,
        responsable: p.responsable,
        enCobertura: true,
        activo: true,
        motivo: "CAMBIO_EQUIPO",
        comentario: null,
        registradoPor: "RR. HH.",
      },
      {
        asignacionId: `${p.employeeId}-1`,
        desde: "2026-01-05",
        hasta: "2026-03-02",
        tipo: p.tipo,
        teamId: "EQ-02",
        equipo: "Célula ficticia 2",
        responsable: "Team Lead ficticio 2",
        enCobertura: true,
        activo: true,
        motivo: "ALTA",
        comentario: null,
        registradoPor: "Instalación",
      },
    ],
    semanas,
    ultimaSemanaCargada: semanas[0]?.periodStart ?? null,
  };
}

export function opcionesPersona(): OpcionesPersonaDTO {
  return {
    legajoSugerido: "EMP-009",
    lunesActual: LUNES_ACTUAL,
    equipos: EQUIPOS.filter((e) => e.activo).map((e) => ({
      teamId: e.teamId,
      nombre: e.nombre,
      lider: referencia(e.lider)?.nombre ?? null,
      gerente: GERENTE.nombre,
    })),
  };
}

export function opcionesEquipo(): OpcionesEquipoDTO {
  return {
    codigoSugerido: "EQ-10",
    lunesActual: LUNES_ACTUAL,
    lideres: [
      { employeeId: "TL-01", nombre: "Team Lead ficticio 1", teamId: "EQ-01", equipo: "Célula ficticia 1", lideraTeamId: "EQ-01" },
      { employeeId: "TL-02", nombre: "Team Lead ficticio 2", teamId: "EQ-02", equipo: "Célula ficticia 2", lideraTeamId: null },
    ],
    gerentes: [GERENTE],
  };
}

/** The teams of the dataset with the server's suppression rules applied. */
export function equipos(periodStart?: string, estado = "ACTIVOS", teamId?: string): EquipoFilaDTO[] {
  const semana = periodStart ?? SEMANAS[0];
  const base = EQUIPOS.map((e) => {
    const miembros = PERSONAS.filter((p) => p.teamId === e.teamId);
    return { e, miembros, personasEvaluables: e.activo ? miembros.length : 0 };
  });
  const suprimidos = new Map(
    suprimirGrupos(
      base.filter(({ e }) => e.activo).map(({ e, personasEvaluables }) => ({ teamId: e.teamId, personasEvaluables })),
    ).map((x) => [x.teamId, x.suprimido]),
  );
  return base
    .filter(({ e }) => e.activo === (estado === "ACTIVOS") && (!teamId || e.teamId === teamId))
    .map(({ e, miembros, personasEvaluables }) => {
      const fila = {
        teamId: e.teamId,
        nombre: e.nombre,
        activo: e.activo,
        lider: referencia(e.lider),
        gerente: GERENTE,
        personasActivas: miembros.length,
        personasEvaluables,
      };
      const suprimido = e.activo ? (suprimidos.get(e.teamId) ?? null) : null;
      if (!e.activo || suprimido)
        return { ...fila, suprimido, alertasActivas: null, conteo: null, promedioIndice: null, evaluadas: null, tendenciaAlto: null };
      const conteo: Record<Nivel, number> = { BAJO: 0, MEDIO: 0, ALTO: 0, INCOMPLETO: 0 };
      let suma = 0;
      let evaluadas = 0;
      for (const p of miembros) {
        const w = p.semanas.find((x) => x.periodStart === semana);
        if (w?.actualizado && w.nivel) {
          conteo[w.nivel]++;
          evaluadas++;
          suma += Math.round((w.indice ?? 0) * 100);
        }
      }
      return {
        ...fila,
        suprimido: null,
        alertasActivas: miembros.filter((p) => p.semanas.some((w) => w.actualizado && w.alertId)).length,
        conteo,
        promedioIndice: promedioDesdeCentesimos(suma, evaluadas),
        evaluadas,
        tendenciaAlto: SEMANAS.filter((s) => s <= semana)
          .slice(0, 8)
          .reverse()
          .map((s) => ({
            periodStart: s,
            alto: miembros.filter((p) => {
              const w = p.semanas.find((x) => x.periodStart === s);
              return w?.actualizado && w.nivel === "ALTO";
            }).length,
          })),
      };
    });
}

export type Pedido = { metodo: string; ruta: string; cuerpo: unknown };
type Respuesta = { status: number; json: unknown };

/** An error body like the server's, with one entry per offending field. */
export const rechazo = (
  status: number,
  codigo: string,
  mensaje: string,
  detalles: { campo: string; codigo: string; detalle: string }[] = [],
): Respuesta => ({
  status,
  json: { error: { codigo, mensaje, detalles: detalles.map((d) => ({ fila: null, ...d })) } },
});

/**
 * Registers the people and teams endpoints. Writes are recorded in `pedidos` and answer with a
 * success unless `responder` returns something for them (a rejection, for a spec of the error path).
 */
export async function organizacion(
  page: Page,
  responder: (pedido: Pedido) => Respuesta | undefined = () => undefined,
) {
  const pedidos: Pedido[] = [];
  const entrega = (route: Route, status: number, json: unknown) =>
    route.fulfill({ status, json });
  await page.route(
    (url) => url.pathname.startsWith("/api/personas") || url.pathname.startsWith("/api/equipos"),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const metodo = request.method();
      // The full-history read of /api/personas is still answered by ./demo.ts.
      if (metodo === "GET" && url.pathname === "/api/personas") return route.fallback();
      const partes = url.pathname.split("/").filter(Boolean).slice(1);
      const filtro = Object.fromEntries(url.searchParams);
      if (metodo === "GET") {
        if (partes[0] === "personas" && partes[1] === "directorio")
          return entrega(route, 200, directorio(filtro));
        if (partes[0] === "personas" && partes[1] === "opciones")
          return entrega(route, 200, opcionesPersona());
        if (partes[0] === "personas") {
          const f = ficha(decodeURIComponent(partes[1]));
          return f
            ? entrega(route, 200, f)
            : entrega(route, 404, { error: { codigo: "NO_ENCONTRADO", mensaje: "La persona no existe.", detalles: [] } });
        }
        if (partes[1] === "opciones") return entrega(route, 200, opcionesEquipo());
        if (!partes[1])
          return entrega(route, 200, {
            periodStart: filtro.periodStart ?? SEMANAS[0],
            semanas: SEMANAS,
            items: equipos(filtro.periodStart, filtro.estado, filtro.teamId),
          });
        const fila = equipos(filtro.periodStart, "ACTIVOS").concat(equipos(undefined, "INACTIVOS")).find((e) => e.teamId === partes[1]);
        return fila
          ? entrega(route, 200, {
              ...fila,
              periodStart: filtro.periodStart ?? SEMANAS[0],
              semanas: SEMANAS,
              tecnicosActivos: PERSONAS.filter((p) => p.teamId === fila.teamId && p.tipo === "TECNICO").length,
            })
          : entrega(route, 404, { error: { codigo: "NO_ENCONTRADO", mensaje: "El equipo no existe.", detalles: [] } });
      }
      const cuerpo = request.headers()["content-type"]?.includes("json") ? request.postDataJSON() : "(archivo)";
      const pedido = { metodo, ruta: url.pathname, cuerpo };
      pedidos.push(pedido);
      const propia = responder(pedido);
      if (propia) return entrega(route, propia.status, propia.json);
      if (url.pathname === "/api/personas/importacion/validar")
        return entrega(route, 200, vistaPrevia());
      if (url.pathname === "/api/personas/importacion/confirmar")
        return entrega(route, 200, { correlacionId: "00000000-0000-4000-8000-000000000009", creadas: 2, omitidas: 1 });
      const id = (cuerpo as { employeeId?: string; teamId?: string } | null)?.employeeId ?? (cuerpo as { teamId?: string } | null)?.teamId ?? partes[1];
      return entrega(route, metodo === "POST" && partes.length === 1 ? 201 : 200, partes[0] === "equipos" ? { teamId: id } : { employeeId: id });
    },
  );
  return { pedidos };
}

export const vistaPrevia = (errores: { fila: number; campo: string; codigo: string; detalle: string }[] = []) => ({
  esquema: "personas-v1",
  estado: errores.length ? "RECHAZADA" : "VALIDADA",
  huella: "a".repeat(64),
  totalFilas: 3,
  nuevas: errores.length ? 0 : 2,
  omitidas: errores.length ? 0 : 1,
  muestra: errores.length
    ? []
    : [
        { fila: 2, employeeId: "EMP-009", nombre: "Persona ficticia 009", tipo: "TECNICO", teamId: "EQ-01", desde: LUNES_ACTUAL, enCobertura: true },
        { fila: 3, employeeId: "EMP-010", nombre: "Persona ficticia 010", tipo: "TECNICO", teamId: "EQ-01", desde: LUNES_ACTUAL, enCobertura: true },
      ],
  errores,
  advertencias: [],
});
