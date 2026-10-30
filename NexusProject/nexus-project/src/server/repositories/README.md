# Repositorios

Acceso a Prisma/MySQL y transacciones. Las reglas de negocio van en services. T02 define modelos e integridad en `prisma/schema.prisma`; no duplicar el esquema en src/prisma. Importar el cliente de servidor desde `@/lib/db`.

`fechas.ts` convierte DATE sin desplazamiento por zona horaria. La vigencia se obtiene desde `PeriodoEmpleado`, no de un booleano almacenado en cada versión. `reglas.ts` inserta una versión nueva y su trabajo; no actualiza reglas ni evaluaciones. El reclamo de jobs queda en T04/T08. Ver [guía T02](../../../../../Docs/t02-persistencia.md) y [guía T09](../../../../../Docs/t09-reglas.md).
