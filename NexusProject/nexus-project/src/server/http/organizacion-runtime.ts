import { prisma } from "../../lib/db";
import { crearHttpOrganizacion } from "./organizacion";
import { proteger } from "./permisos-demo";
const organizacion = crearHttpOrganizacion(prisma);
// Reads use LEER and a Team Lead is narrowed to their own team; every write needs ADMINISTRAR_PERSONAS.
export const httpOrganizacion = {
  directorio: proteger(prisma, "LEER", organizacion.directorio),
  ficha: proteger(prisma, "LEER", organizacion.ficha, "empleado"),
  opcionesPersona: proteger(prisma, "ADMINISTRAR_PERSONAS", organizacion.opcionesPersona),
  crearPersona: proteger(prisma, "ADMINISTRAR_PERSONAS", organizacion.crearPersona),
  editarPersona: proteger(prisma, "ADMINISTRAR_PERSONAS", organizacion.editarPersona),
  cambiarAsignacion: proteger(prisma, "ADMINISTRAR_PERSONAS", organizacion.cambiarAsignacion),
  darDeBaja: proteger(prisma, "ADMINISTRAR_PERSONAS", organizacion.darDeBaja),
  validarImportacion: proteger(prisma, "ADMINISTRAR_PERSONAS", organizacion.validarImportacion),
  confirmarImportacion: proteger(prisma, "ADMINISTRAR_PERSONAS", organizacion.confirmarImportacion),
  equipos: proteger(prisma, "LEER", organizacion.equipos),
  opcionesEquipo: proteger(prisma, "ADMINISTRAR_PERSONAS", organizacion.opcionesEquipo),
  equipo: proteger(prisma, "LEER", organizacion.equipo, "equipo"),
  crearEquipo: proteger(prisma, "ADMINISTRAR_PERSONAS", organizacion.crearEquipo),
  editarEquipo: proteger(prisma, "ADMINISTRAR_PERSONAS", organizacion.editarEquipo),
  cambiarLider: proteger(prisma, "ADMINISTRAR_PERSONAS", organizacion.cambiarLider),
  desactivarEquipo: proteger(prisma, "ADMINISTRAR_PERSONAS", organizacion.desactivarEquipo),
};
