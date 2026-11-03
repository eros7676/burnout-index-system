import { prisma } from "../../lib/db";
import { crearHttpPersonas } from "./personas";
import { proteger, usuarioDeSolicitud } from "./permisos-demo";
const personas = crearHttpPersonas(prisma);
export const httpPersonas = {
  personas: proteger(prisma, "LEER", personas.personas),
  misDatos: proteger(prisma, "PROPIOS", (request) =>
    personas.misDatos(request, usuarioDeSolicitud(request).employeeId!),
  ),
  reglas: proteger(prisma, "LEER", personas.reglas, "global"),
};
