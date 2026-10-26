import type {
  Alerta, Calculo, ConfiguracionIndice, InformeDTO, JobDTO,
  RegistroLaboral, ResultadoImportacion, VistaPrevia,
} from "./contracts";

/** Firmas de implementación; no son servicios ejecutables ni rutas HTTP. */
export interface ServiciosPrototipo {
  calcularEvaluacion(actual: RegistroLaboral, anterior: RegistroLaboral | null, reglas: ConfiguracionIndice): Calculo;
  validarImportacion(archivo: File, actorId: string): Promise<VistaPrevia>;
  confirmarImportacion(importId: string, actorId: string): Promise<ResultadoImportacion>;
  procesarImportacion(jobId: string): Promise<JobDTO>;
  construirInforme(evaluationId: string): Promise<InformeDTO>;
  crearAlertaSiCorresponde(evaluationId: string): Promise<Alerta | null>;
}
