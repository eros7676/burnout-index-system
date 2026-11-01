# Repositorios

T16 agrega `registros-importacion.ts`: escrituras y lecturas en bloques de 200 dentro de la confirmación SERIALIZABLE, sin omitir conflictos; publicación parametrizada de punteros restringida a la fuente y los períodos del lote. Los estados de procesamiento actualizan job/par juntos, conservando los bloqueos y la comprobación de token/lease antes y después del trabajo. Ver [T04](../../../../../Docs/t04-importaciones.md) y [T16](../../../../../Docs/t16-integracion.md).

Acceso a Prisma/MySQL y transacciones. Las reglas de negocio van en services. T02 define modelos e integridad en `prisma/schema.prisma`; no duplicar el esquema en src/prisma. Importar el cliente de servidor desde `@/lib/db`.

T04 agrega `importaciones.ts` (bloqueo de carga y limpieza diferida de temporales), `transaccion-importacion.ts` (transacciones SERIALIZABLE con reintentos acotados) y `procesamientos.ts` (reclamo, renovación y cambios de estado condicionados por token y lease con reloj UTC de MySQL). Ver [guía T04](../../../../../Docs/t04-importaciones.md).

`fechas.ts` convierte DATE sin desplazamiento por zona horaria. La vigencia se obtiene desde `PeriodoEmpleado`, no de un booleano almacenado en cada versión. `reglas.ts` inserta una versión nueva y su trabajo; no actualiza reglas ni evaluaciones. `informes.ts` solo lee el empleado del catálogo y la alerta ya guardada. `alertas.ts` inserta la alerta interna única de una evaluación. El reclamo de jobs queda en T04/T08. Ver [guía T02](../../../../../Docs/t02-persistencia.md), [guía T09](../../../../../Docs/t09-reglas.md), [guía T10](../../../../../Docs/t10-informes.md) y [guía T11](../../../../../Docs/t11-alertas.md).
