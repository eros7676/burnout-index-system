# Repositorios

Acceso a Prisma/MySQL y transacciones. Las reglas de negocio van en services. T02 define modelos e integridad en `prisma/schema.prisma`; no duplicar el esquema en src/prisma. Importar el cliente de servidor desde `@/lib/db`.

`fechas.ts` convierte DATE sin desplazamiento por zona horaria. La vigencia se obtiene desde `PeriodoEmpleado`, no de un booleano almacenado en cada versión. Los adaptadores a DTO, publicación transaccional, control de versiones y reclamo/renovación de jobs se implementan junto a T04/T08/T09/T13. Ver [guía T02](../../../../../Docs/t02-persistencia.md).
