import { Prisma, type PrismaClient } from "@prisma/client";
import type { ResumenDTO } from "../../shared/contracts";
import {
  leerResultados,
  leerAlertaEvaluacion,
} from "../repositories/consultas";
import type { Consulta } from "./filtros-consultas";

export async function consultarResultados(
  db: PrismaClient,
  filtros: Consulta,
  tipo: "evaluaciones" | "resumen" | "alertas",
) {
  return db.$transaction(
    async (tx) => {
      const resultados = await leerResultados(tx, filtros);
      if (tipo === "resumen") {
        const vigentes = resultados
          .filter((r) => r.fila.actualizado)
          .map((r) => r.fila);
        const conteo: ResumenDTO["conteo"] = {
          BAJO: 0,
          MEDIO: 0,
          ALTO: 0,
          INCOMPLETO: 0,
        };
        for (const f of vigentes) conteo[f.nivel!]++;
        const porcentajes = { ...conteo };
        for (const key of Object.keys(conteo) as (keyof typeof conteo)[])
          porcentajes[key] = vigentes.length
            ? Math.round((conteo[key] / vigentes.length) * 10000) / 100
            : 0;
        const resumen: ResumenDTO = {
          totalEvaluaciones: vigentes.length,
          conteo,
          porcentajes,
          noProcesados: resultados.length - vigentes.length,
          promedioIndice: vigentes.length
            ? Math.round(
                (vigentes.reduce((sum, f) => sum + f.indice!, 0) /
                  vigentes.length) *
                  100,
              ) / 100
            : null,
          muestraPromedio: vigentes.length,
        };
        return resumen;
      }
      const filas =
        tipo === "evaluaciones"
          ? resultados.filter(
              (r) =>
                !filtros.nivel ||
                (r.fila.actualizado && r.fila.nivel === filtros.nivel),
            )
          : resultados
              .filter((r) => r.alerta)
              .sort(
                (a, b) =>
                  b.alerta!.createdAt.getTime() -
                    a.alerta!.createdAt.getTime() ||
                  (a.alerta!.alertId < b.alerta!.alertId
                    ? -1
                    : a.alerta!.alertId > b.alerta!.alertId
                      ? 1
                      : 0),
              );
      // Evita overflow incluso con una página segura pero muy grande.
      const inicio =
        filtros.page - 1 > filas.length / filtros.pageSize
          ? filas.length
          : (filtros.page - 1) * filtros.pageSize;
      const pagina = filas.slice(inicio, inicio + filtros.pageSize);
      const items =
        tipo === "evaluaciones"
          ? pagina.map((r) => r.fila)
          : await Promise.all(
              pagina.map((r) =>
                leerAlertaEvaluacion(tx, r.alerta!.evaluationId),
              ),
            );
      return {
        items,
        total: filas.length,
        page: filtros.page,
        pageSize: filtros.pageSize,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 30000,
    },
  );
}
