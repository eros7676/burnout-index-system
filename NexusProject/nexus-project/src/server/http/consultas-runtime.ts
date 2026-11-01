import { prisma } from "../../lib/db";
import { crearHttpConsultas } from "./consultas";
export const httpConsultas = crearHttpConsultas(prisma);
