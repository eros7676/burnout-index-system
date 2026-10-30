# Servicios del servidor

CU01, CU02 y CU03 usan `src/shared/contracts.ts`. El cálculo de CU02 es puro, sin Next.js ni Prisma; T08 orquesta la persistencia. Las rutas HTTP validan la petición y llaman servicios.

T09 está en `reglas.ts` (validación pura) y `publicar-reglas.ts` (versión inmutable más el trabajo de reevaluación). No calcula el índice ni abre una pantalla. El comando está en [Docs/t09-reglas.md](../../../../../Docs/t09-reglas.md).
