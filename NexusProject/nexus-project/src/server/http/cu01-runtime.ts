import { prisma } from "../../lib/db";
import { crearHttpCu01 } from "./cu01";

export const httpCu01 = crearHttpCu01(prisma);
