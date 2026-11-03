"use client";
import { useConsulta } from "@/client/use-consulta";
import { ESTADO_PROCESO, entero } from "@/shared/formato";
import { Button, ErrorBox, SkeletonRows } from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import { reglasApi } from "./api";
import s from "./recalculo.module.css";

/**
 * State of the reprocessing a published version started. The job runs after the response,
 * so the screen reads it on demand and offers "Actualizar estado" instead of polling.
 */
export function Recalculo({ jobId }: { jobId: string | null }) {
  const consulta = useConsulta(
    (signal) => reglasApi.procesamiento(jobId as string, signal),
    jobId ? `procesamiento:${jobId}` : null,
  );
  if (!jobId)
    return (
      <p className={s.texto}>
        No se recalculó ninguna semana: la versión rige desde una semana sin
        datos evaluados.
      </p>
    );
  if (consulta.estado === "cargando") return <SkeletonRows filas={1} />;
  if (consulta.estado === "error")
    return <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />;
  const job = consulta.datos;
  const tono =
    job.estado === "COMPLETADO"
      ? "exito"
      : job.estado === "FALLIDO"
        ? "incidencia"
        : "aviso";
  return (
    <div className={s.estado}>
      <StatusTag tono={tono}>{ESTADO_PROCESO[job.estado]}</StatusTag>
      <span className={`${s.texto} num`}>
        {entero(job.completados)} de {entero(job.totalPares)} evaluaciones
        recalculadas
      </span>
      {job.estado !== "COMPLETADO" && (
        <Button variante="secondary" onClick={consulta.reintentar}>
          Actualizar estado
        </Button>
      )}
    </div>
  );
}
