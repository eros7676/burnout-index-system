import "server-only";
import type { PrismaClient } from "@prisma/client";
import { clienteDe, empresaActual } from "../server/empresas";

/**
 * The database of the request's company (src/server/empresas.ts). Every access resolves the client
 * at call time, so runtimes built once at import (`crearHttpX(prisma)`) still reach the company the
 * session chose. The connection opens on the first query, not on import.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_, clave) {
    const cliente = clienteDe(empresaActual());
    const valor = Reflect.get(cliente, clave, cliente);
    return typeof valor === "function" ? valor.bind(cliente) : valor;
  },
});
