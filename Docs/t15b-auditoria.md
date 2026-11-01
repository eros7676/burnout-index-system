# T15b · Auditoría de importaciones y reglas

Implementación local en `t15-feature`, creada desde el commit T12 `f8febc9`. T15a (roles y permisos) queda fuera de esta tarea. La aplicación sigue siendo una demostración local con datos ficticios.

## Eventos

La migración `20261101010000_t15b_auditoria` agrega `EventoAuditoria`. Conserva identificador, acción, entidad, recurso, actor, fecha UTC del servidor y detalles definidos por el código. No copia archivos CSV, nombres de archivo, celdas, mensajes de error libres, peticiones, credenciales ni datos personales al evento.

- `IMPORTACION_VALIDADA` / `IMPORTACION_RECHAZADA`: identificador de carga, autor, hash, esquema, cantidades y códigos de error. Los rechazos de estructura/UTF-8 del CSV anteriores a la vista previa registran un identificador propio y un código, sin guardar el contenido rechazado.
- `IMPORTACION_CONFIRMADA`: actor que confirma, carga/hash/esquema, insertados, omitidos y job. Los registros laborales versionados, snapshots y reglas usadas siguen vinculados mediante los identificadores P0; la auditoría no los reemplaza.
- `IMPORTACION_CANCELADA`: carga, actor y estado anterior.
- `REGLAS_PUBLICADAS`: versión anterior aplicable en la fecha de inicio, versión nueva, vigencia, parámetros validados, autor, job y cantidad de semanas afectadas. Funciona tanto desde el servicio como desde `npm run rules:publish`, porque la escritura está en el repositorio compartido.

Los rechazos del transporte (tamaño, MIME, petición multipart inválida) ocurren antes de acceder a MySQL y mantienen su respuesta incluso si la base no está disponible. No generan eventos T15b. Una validación de contenido que necesita registrar un evento requiere MySQL; si falla la auditoría no se informa éxito.

Cada transición y su evento se guardan en la misma transacción. Repetir confirmación o cancelación devuelve el resultado previo sin agregar otro evento. Una restricción única por entidad/recurso/acción evita duplicados. Publicaciones de reglas inválidas o duplicadas no producen un evento de publicación. Si falla guardar el evento, también se revierte el cambio.

No hay operaciones de modificación o borrado de eventos en el servicio ni en la API. Los eventos no usan claves foráneas a cargas/reglas: sobreviven a su eliminación y conservan referencias históricas. Esto no es un registro resistente a manipulaciones por un administrador SQL; tampoco agrega autenticación o autorización T15a. No usar con datos reales ni exponer públicamente esta demo.

## Consulta

`GET /api/auditoria` devuelve `Pagina<EventoAuditoria>`, con `Cache-Control: no-store`. Orden: fecha descendente e identificador descendente como desempate. Conteo y página se leen en una transacción consistente. La clave interna de deduplicación no se expone.

Filtros opcionales: `accion`, `entidad` (`IMPORTACION`/`REGLAS`), `recursoId`, `actorId`, `desde`, `hasta`, `page`, `pageSize`. Las fechas son UTC ISO con milisegundos, por ejemplo `2026-11-01T00:00:00.000Z`; los extremos son inclusivos. Página por defecto 1, máximo 1.000.000; tamaño por defecto 50, máximo 100. Parámetros desconocidos, duplicados, fechas inexistentes, intervalos invertidos o valores inválidos devuelven 400. Fallos técnicos devuelven 500 uniforme sin exponer infraestructura.

Ejemplos: `/api/auditoria?recursoId=ID_DE_IMPORTACION` y `/api/auditoria?entidad=REGLAS&accion=REGLAS_PUBLICADAS&pageSize=20`. La tarea agrega consulta HTTP, sin una pantalla nueva. Tipos, catálogo HTTP y mocks compartidos se actualizan juntos.

## Instalación y verificación

Desde `NexusProject/nexus-project`, ejecutar `npm run db:generate` y `npm run db:deploy` antes de usar la aplicación. La migración conserva las tablas y los metadatos existentes; no inventa eventos históricos para operaciones anteriores a su instalación.

Comprobaciones: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y `npm run db:validate`. Para SQL: preparar una base exclusiva terminada en `_test`, migrarla/seedearla con `DATABASE_URL` y ejecutar `npm run db:test` usando la misma URL en `TEST_DATABASE_URL`. Después del build: `npm run db:test:http` y `npm run test:ui`.

`auditoria.test.ts` verifica filtros y errores. `auditoria.mysql.test.ts` agrega rechazos, formato sin contenido sensible, cancelación repetida, confirmación concurrente, publicación de reglas, rollback ante fallo de auditoría, consulta y persistencia entre conexiones. Las pruebas SQL conservan sus eventos en la base aislada y limpian solo sus datos operativos. La prueba HTTP del build también consulta los eventos de la carga real.

Verificación local del 01/11/2026: lint, typecheck, build Turbopack, validación Prisma y 64 pruebas sin MySQL aprobadas.

Después del reinicio de Docker por el usuario se completaron las comprobaciones pendientes sobre `nexus_t15_test`, una base aislada nueva:

- Las tres migraciones T02/T12/T15b se aplicaron desde cero y el seed terminó correctamente.
- `npm run db:test`: 80 pruebas aprobadas, cero fallidas u omitidas. Incluye los seis casos T15b de trazabilidad, privacidad, concurrencia, reglas, rollback y persistencia/consulta.
- `npm run db:test:http`: operaciones P0, T12 y consulta T15b verificadas sobre el build Next.js real, con filtros y errores.
- `npm run test:ui`: 17 escenarios aprobados, cero omitidos, incluido el circuito con API/MySQL reales.

El bloqueo anterior `ERROR_NO_SYSTEM_RESOURCES` de Docker/WSL quedó resuelto y no quedan comprobaciones SQL o HTTP pendientes de esta tarea. Esta ejecución no repite la aceptación de rendimiento T16 ni modifica sus resultados. La revisión humana y la integración remota quedan separadas.
