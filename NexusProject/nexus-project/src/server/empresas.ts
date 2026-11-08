import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import type { EmpresaDTO } from "../shared/contracts";

type Empresa = EmpresaDTO & {
  /** Environment variable with the company's database URL. */
  variable: string;
};

/**
 * The demo companies. Each one is a separate database (same schema, own migrations and seed), so
 * people, teams, imports, rules and audit never mix and no query needs a company filter. The first
 * one is the default and uses DATABASE_URL; a company whose variable is unset is not offered, so a
 * server with only DATABASE_URL behaves as a single-company app.
 */
export const EMPRESAS: readonly Empresa[] = [
  {
    id: "conecta",
    nombre: "Conecta Servicios Técnicos",
    rubro: "Mantenimiento y redes",
    descripcion: "Cuadrillas de mantenimiento, fibra óptica y mesa de ayuda técnica.",
    variable: "DATABASE_URL",
  },
  {
    id: "rutas",
    nombre: "Rutas del Plata",
    rubro: "Transporte y logística",
    descripcion: "Choferes de larga distancia, reparto urbano y depósito.",
    variable: "DATABASE_URL_TRANSPORTE",
  },
  {
    id: "salud",
    nombre: "Sanatorio del Parque",
    rubro: "Salud",
    descripcion: "Enfermería por turnos, guardia y servicios de internación.",
    variable: "DATABASE_URL_SALUD",
  },
  {
    id: "nexus",
    nombre: "Nexus",
    rubro: "Mantenimiento y redes",
    descripcion: "La demo original: los equipos de Conecta con las ocho semanas que se cargaron primero.",
    variable: "DATABASE_URL_NEXUS",
  },
];

const dto = ({ id, nombre, rubro, descripcion }: Empresa): EmpresaDTO => ({
  id,
  nombre,
  rubro,
  descripcion,
});

/** Companies this server can open, default first. */
export function empresasDisponibles(env: NodeJS.ProcessEnv = process.env): EmpresaDTO[] {
  return EMPRESAS.filter((e, i) => i === 0 || !!env[e.variable]).map(dto);
}

export const EMPRESA_POR_DEFECTO = EMPRESAS[0].id;

/** The company if this server can open it; anything else is null (never trusted as a database name). */
export function empresaValida(id: unknown, env: NodeJS.ProcessEnv = process.env): string | null {
  return typeof id === "string" && empresasDisponibles(env).some((e) => e.id === id) ? id : null;
}

export const empresaDTO = (id: string): EmpresaDTO =>
  dto(EMPRESAS.find((e) => e.id === id) ?? EMPRESAS[0]);

const contexto = new AsyncLocalStorage<string>();

/** Runs `tarea` reading and writing `empresa`'s database through `prisma` (src/lib/db.ts). */
export function enEmpresa<T>(empresa: string, tarea: () => T): T {
  return contexto.run(empresa, tarea);
}

/** The company of the running request; outside one (scripts, tests), the default. */
export const empresaActual = () => contexto.getStore() ?? EMPRESA_POR_DEFECTO;

const globalEmpresas = globalThis as typeof globalThis & {
  clientesEmpresa?: Map<string, PrismaClient>;
};
const clientes = (globalEmpresas.clientesEmpresa ??= new Map());

/** One pool per company, reused across hot reloads. The connection opens on the first query. */
export function clienteDe(empresa: string): PrismaClient {
  let cliente = clientes.get(empresa);
  if (!cliente) {
    const datos = EMPRESAS.find((e) => e.id === empresa);
    if (!datos || !empresaValida(empresa)) throw new Error(`Empresa desconocida: ${empresa}`);
    cliente =
      datos.variable === "DATABASE_URL"
        ? new PrismaClient()
        : new PrismaClient({ datasourceUrl: process.env[datos.variable] });
    clientes.set(empresa, cliente);
  }
  return cliente;
}
