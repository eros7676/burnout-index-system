# Servicios del servidor

CU01, CU02 y CU03 usan `src/shared/contracts.ts`. El cálculo de CU02 es puro, sin Next.js ni Prisma; T08 orquesta la persistencia. Las rutas HTTP validan la petición y llaman servicios.

T09 está en `reglas.ts` (validación pura) y `publicar-reglas.ts` (versión inmutable más el trabajo de reevaluación). No calcula el índice ni abre una pantalla. El comando está en [Docs/t09-reglas.md](../../../../../Docs/t09-reglas.md).

T07 está en `calculo.ts`: `calcularEvaluacion` devuelve el `Calculo` completo sin IO ni mutaciones. Ver [Docs/t07-calculo.md](../../../../../Docs/t07-calculo.md). T08 consume este motor para persistir evaluaciones.

T08 está en `evaluaciones.ts`: carga versiones y reglas aplicables, publica evaluaciones idempotentemente, conserva historial y procesa sucesores inmediatos. Ver [Docs/t08-evaluaciones.md](../../../../../Docs/t08-evaluaciones.md) para integración con jobs y CU03.
