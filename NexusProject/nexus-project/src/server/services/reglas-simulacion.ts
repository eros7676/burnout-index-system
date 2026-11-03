// Impact of a draft: the weeks it would govern, recomputed with the pure engine against
// the version in force today. Nothing is written; the result is a summary by level and team.
// Prior art: Stripe Radar rule preview, Socure RiskOS replay (workforce-admin.md §1.7 [S42][S43]).
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ConfiguracionIndice,
  FechaISO,
  Nivel,
  RegistroLaboral,
} from "../../shared/contracts";
import type {
  EquipoSimulacionDTO,
  PropuestaReglas,
  SimulacionReglasDTO,
} from "../../shared/contratos/reglas";
import { GRUPO_MINIMO } from "../../shared/semanas";
import { reglasDesdeDb } from "../repositories/evaluaciones";
import { fechaDesdeDb, fechaParaDb } from "../repositories/fechas";
import {
  leerAlcance,
  leerSeries,
  nombresDeEquipos,
  personasDelAlcance,
} from "../repositories/reglas-simulacion";
import { calcularEvaluacion } from "./calculo";
import { configuracionDe } from "./reglas-parametros";
import { ErrorBorrador, esRetroactivo } from "./reglas-politica";

/** Employee-weeks one simulation may read; a longer history is narrowed by moving the start date. */
export const LIMITE_SEMANAS_SIMULACION = 60_000;
/** People read per query: memory stays proportional to the batch, not to the history. */
const LOTE_PERSONAS = 200;
const DIA_MS = 86_400_000;
const NIVELES = ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"] as const satisfies readonly Nivel[];

const conteoVacio = (): Record<Nivel, number> => ({
  BAJO: 0,
  MEDIO: 0,
  ALTO: 0,
  INCOMPLETO: 0,
});

export type EquipoAcumulado = {
  personas: Set<string>;
  semanas: number;
  semanasConCambio: number;
  antes: Record<Nivel, number>;
  despues: Record<Nivel, number>;
};

/** Level of one week under two rule sets; null when the engine cannot evaluate the record. */
function nivelesDeSemana(
  actual: RegistroLaboral,
  anterior: RegistroLaboral | null,
  base: ConfiguracionIndice,
  candidata: ConfiguracionIndice,
): { antes: Nivel; despues: Nivel } | null {
  try {
    return {
      antes: calcularEvaluacion(actual, anterior, base).nivel,
      despues: calcularEvaluacion(actual, anterior, candidata).nivel,
    };
  } catch {
    return null;
  }
}

/**
 * Small teams are withheld so no individual can be inferred from a team's change
 * (group-of-5 rule). If exactly one team is withheld, the smallest visible one is
 * withheld too: otherwise the totals minus the visible teams would reveal it
 * (complementary suppression, Viva Glint; workforce-admin.md §4.5 [S33]).
 */
export function protegerEquipos(
  equipos: ReadonlyMap<string, EquipoAcumulado>,
  nombres: ReadonlyMap<string, string>,
  minimo = GRUPO_MINIMO,
): EquipoSimulacionDTO[] {
  const filas = [...equipos.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const ocultos = new Set(
    filas.filter(([, e]) => e.personas.size < minimo).map(([id]) => id),
  );
  if (ocultos.size === 1 && filas.length > 1) {
    const [vecino] = filas
      .filter(([id]) => !ocultos.has(id))
      .sort(([ia, a], [ib, b]) => a.personas.size - b.personas.size || (ia < ib ? -1 : 1));
    ocultos.add(vecino[0]);
  }
  return filas.map(([teamId, e]) => {
    const nombre = nombres.get(teamId) ?? teamId;
    return ocultos.has(teamId)
      ? { teamId, nombre, suprimido: true }
      : {
          teamId,
          nombre,
          suprimido: false,
          personas: e.personas.size,
          semanas: e.semanas,
          semanasConCambio: e.semanasConCambio,
          antes: { ...e.antes },
          despues: { ...e.despues },
        };
  });
}

/** Folds people one at a time, so the input can arrive in batches. */
export class AcumuladorSimulacion {
  private semanas = 0;
  private omitidas = 0;
  private readonly personas = new Set<string>();
  private readonly conCambio = new Set<string>();
  private readonly antes = conteoVacio();
  private readonly despues = conteoVacio();
  private readonly pasos = new Map<string, number>();
  readonly equipos = new Map<string, EquipoAcumulado>();

  constructor(
    private readonly base: ConfiguracionIndice,
    private readonly candidata: ConfiguracionIndice,
    private readonly desde: FechaISO,
    private readonly hasta: FechaISO | null,
  ) {}

  /** `registros` are one person's confirmed weeks, oldest first; the week before `desde` may be among them. */
  agregarPersona(
    employeeId: string,
    teamId: string | null,
    registros: readonly RegistroLaboral[],
  ) {
    const porSemana = new Map(registros.map((r) => [r.periodStart, r]));
    for (const actual of registros) {
      if (actual.periodStart < this.desde) continue;
      if (this.hasta !== null && actual.periodStart >= this.hasta) continue;
      const previa = new Date(fechaParaDb(actual.periodStart).getTime() - 7 * DIA_MS)
        .toISOString()
        .slice(0, 10);
      const niveles = nivelesDeSemana(
        actual,
        porSemana.get(previa) ?? null,
        this.base,
        this.candidata,
      );
      if (!niveles) {
        this.omitidas++;
        continue;
      }
      this.semanas++;
      this.personas.add(employeeId);
      this.antes[niveles.antes]++;
      this.despues[niveles.despues]++;
      const cambio = niveles.antes !== niveles.despues;
      if (cambio) {
        this.conCambio.add(employeeId);
        const paso = `${niveles.antes}>${niveles.despues}`;
        this.pasos.set(paso, (this.pasos.get(paso) ?? 0) + 1);
      }
      if (teamId !== null) {
        const equipo = this.equipos.get(teamId) ?? {
          personas: new Set<string>(),
          semanas: 0,
          semanasConCambio: 0,
          antes: conteoVacio(),
          despues: conteoVacio(),
        };
        equipo.personas.add(employeeId);
        equipo.semanas++;
        if (cambio) equipo.semanasConCambio++;
        equipo.antes[niveles.antes]++;
        equipo.despues[niveles.despues]++;
        this.equipos.set(teamId, equipo);
      }
    }
  }

  resumen(nombres: ReadonlyMap<string, string>) {
    const transiciones = [...this.pasos.entries()]
      .map(([paso, semanas]) => {
        const [de, a] = paso.split(">") as [Nivel, Nivel];
        return { de, a, semanas };
      })
      .sort(
        (x, y) =>
          y.semanas - x.semanas ||
          NIVELES.indexOf(x.de) - NIVELES.indexOf(y.de) ||
          NIVELES.indexOf(x.a) - NIVELES.indexOf(y.a),
      );
    const entran = transiciones
      .filter((t) => t.a === "ALTO")
      .reduce((n, t) => n + t.semanas, 0);
    const salen = transiciones
      .filter((t) => t.de === "ALTO")
      .reduce((n, t) => n + t.semanas, 0);
    return {
      semanas: this.semanas,
      personas: this.personas.size,
      omitidas: this.omitidas,
      antes: { ...this.antes },
      despues: { ...this.despues },
      transiciones,
      semanasConCambio: transiciones.reduce((n, t) => n + t.semanas, 0),
      personasConCambio: this.conCambio.size,
      // An alert exists for each week at Alto: weeks that become Alto create one, weeks that stop being Alto supersede it.
      alertas: { nuevas: entran, superadas: salen },
      equipos: protegerEquipos(this.equipos, nombres),
    };
  }
}

/** What a simulation read about the data; publication reads it again to detect drift. */
export type ContextoSimulacion = SimulacionReglasDTO["contexto"];

export async function contextoActual(
  tx: Prisma.TransactionClient,
  effectiveFrom: FechaISO,
): Promise<ContextoSimulacion> {
  const alcance = await leerAlcance(tx, fechaParaDb(effectiveFrom));
  if (!alcance.base)
    throw new ErrorBorrador(
      "CONFIGURACION_INVALIDA",
      "No hay una versión anterior a la fecha de inicio.",
      [
        {
          fila: null,
          campo: "effectiveFrom",
          codigo: "CONFIGURACION_INVALIDA",
          detalle: "El inicio debe ser posterior al de la primera versión.",
        },
      ],
    );
  return {
    versionEnVigor: alcance.base.version,
    versionSiguiente: alcance.siguiente?.version ?? null,
    ultimaSemana: alcance.ultimaSemana,
    semanas: alcance.semanas,
  };
}

/** True when the draft would change weeks that were already evaluated. */
export const requiereAprobacion = (contexto: ContextoSimulacion) =>
  esRetroactivo(contexto.semanas);

/**
 * Dry run. Reads one consistent snapshot, in batches of people, and writes nothing.
 * `ahora` stamps the result.
 */
export async function simularImpacto(
  db: PrismaClient,
  propuesta: PropuestaReglas,
  ahora: Date = new Date(),
  limite: number = LIMITE_SEMANAS_SIMULACION,
): Promise<SimulacionReglasDTO> {
  return db.$transaction(
    async (tx) => {
      const inicio = fechaParaDb(propuesta.effectiveFrom);
      const alcance = await leerAlcance(tx, inicio);
      if (!alcance.base)
        throw new ErrorBorrador(
          "CONFIGURACION_INVALIDA",
          "No hay una versión anterior a la fecha de inicio.",
        );
      if (alcance.semanas > limite)
        throw new ErrorBorrador(
          "ALCANCE_EXCESIVO",
          `El borrador modifica ${alcance.semanas.toLocaleString("es-AR")} semanas y la simulación admite hasta ${limite.toLocaleString("es-AR")}. Elija un inicio de vigencia más cercano.`,
        );
      const hasta = alcance.siguiente?.effectiveFrom ?? null;
      const base = reglasDesdeDb(alcance.base);
      const candidata = configuracionDe(propuesta, {
        version: "borrador",
        createdBy: "borrador",
        createdAt: ahora.toISOString(),
      });
      const acumulador = new AcumuladorSimulacion(
        base,
        candidata,
        propuesta.effectiveFrom,
        hasta ? fechaDesdeDb(hasta) : null,
      );
      const personas = await personasDelAlcance(tx, inicio, hasta);
      for (let i = 0; i < personas.length; i += LOTE_PERSONAS) {
        const lote = personas.slice(i, i + LOTE_PERSONAS);
        const { series, equipos } = await leerSeries(tx, lote, inicio, hasta);
        for (const employeeId of lote)
          acumulador.agregarPersona(
            employeeId,
            equipos.get(employeeId) ?? null,
            series.get(employeeId) ?? [],
          );
      }
      const nombres = await nombresDeEquipos(tx, [...acumulador.equipos.keys()]);
      const { semanas, personas: cantidad, omitidas, ...cuerpo } =
        acumulador.resumen(nombres);
      return {
        calculadaAt: ahora.toISOString(),
        alcance: {
          desde: propuesta.effectiveFrom,
          hasta: hasta ? fechaDesdeDb(hasta) : null,
          semanas,
          personas: cantidad,
          omitidas,
        },
        contexto: {
          versionEnVigor: alcance.base.version,
          versionSiguiente: alcance.siguiente?.version ?? null,
          ultimaSemana: alcance.ultimaSemana,
          semanas: alcance.semanas,
        },
        ...cuerpo,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 120_000,
      maxWait: 10_000,
    },
  );
}
