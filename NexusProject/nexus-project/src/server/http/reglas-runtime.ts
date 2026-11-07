import { after } from "next/server";
import { empresaActual, enEmpresa } from "../empresas";
import { prisma } from "../../lib/db";
import { crearHttpReglas } from "./reglas";
import { proteger } from "./permisos-demo";

// Work after the response keeps the request's company: `after` may run outside its async context.
function despuesEnEmpresa(tarea: () => Promise<unknown>) {
  const empresa = empresaActual();
  after(() => enEmpresa(empresa, tarea));
}
const reglas = crearHttpReglas(prisma, { despues: despuesEnEmpresa });
// Versions: every role that reads rules. Drafts: the handler narrows LEER to who edits or approves.
export const httpReglas = {
  versiones: proteger(prisma, "LEER", reglas.versiones, "global"),
  listarBorradores: proteger(prisma, "LEER", reglas.listarBorradores, "global"),
  obtenerBorrador: proteger(prisma, "LEER", reglas.obtenerBorrador, "global"),
  crearBorrador: proteger(prisma, "EDITAR_REGLAS", reglas.crearBorrador),
  actualizarBorrador: proteger(prisma, "EDITAR_REGLAS", reglas.actualizarBorrador),
  simularBorrador: proteger(prisma, "EDITAR_REGLAS", reglas.simularBorrador),
  enviarBorrador: proteger(prisma, "EDITAR_REGLAS", reglas.enviarBorrador),
  aprobarBorrador: proteger(prisma, "APROBAR_REGLAS", reglas.aprobarBorrador),
  rechazarBorrador: proteger(prisma, "APROBAR_REGLAS", reglas.rechazarBorrador),
  descartarBorrador: proteger(prisma, "EDITAR_REGLAS", reglas.descartarBorrador),
  publicarBorrador: proteger(prisma, "EDITAR_REGLAS", reglas.publicarBorrador),
};
