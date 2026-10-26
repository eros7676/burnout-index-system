import type {
  CuerposExito,
  OperacionApi,
  PeticionesApi,
  RespuestaApi,
} from "../src/shared/api";
import type {
  Calculo,
  ConfiguracionIndice,
  DatosLaborales,
  Evaluacion,
  FilaTablero,
  InformeDTO,
  RegistroLaboral,
  ResumenDTO,
} from "../src/shared/contracts";
import type { ServiciosPrototipo } from "../src/shared/services";

type Igual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Exigir<T extends true> = T;

/** Verificación al compilar: cambios incompatibles deben revisarse entre módulos. */
export type ContratosEstables = [
  Exigir<Igual<keyof PeticionesApi, OperacionApi>>,
  Exigir<Igual<keyof CuerposExito, OperacionApi>>,
  Exigir<Igual<Evaluacion["indice"], number>>,
  Exigir<Igual<FilaTablero["indice"], number | null>>,
  Exigir<Igual<DatosLaborales["horasTrabajadas"], number | null>>,
  Exigir<Igual<ConfiguracionIndice["windowDays"], 7>>,
  Exigir<Igual<ConfiguracionIndice["persistencePeriods"], 2>>,
  Exigir<
    Igual<
      ServiciosPrototipo["calcularEvaluacion"],
      (
        actual: RegistroLaboral,
        anterior: RegistroLaboral | null,
        reglas: ConfiguracionIndice,
      ) => Calculo
    >
  >,
  Exigir<
    Igual<
      ServiciosPrototipo["construirInforme"],
      (evaluationId: string) => Promise<InformeDTO>
    >
  >,
  Exigir<
    Igual<
      PeticionesApi["obtenerResumen"]["query"],
      | {
          employeeId?: string;
          teamId?: string;
          periodStart?: string;
        }
      | undefined
    >
  >,
  Exigir<Igual<ResumenDTO["promedioIndice"], number | null>>,
  Exigir<
    Igual<
      Extract<
        RespuestaApi<"validarImportacion">,
        { status: 422 }
      >["body"]["vistaPrevia"]["status"],
      "VALIDADA" | "RECHAZADA"
    >
  >,
];
