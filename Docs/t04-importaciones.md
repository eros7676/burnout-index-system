# T04 · API CU01 y procesamiento persistido

Implementa validación, confirmación y cancelación CSV, consulta de trabajos y reintento. Integra T05 → T08 → T11 → T10 usando los contratos existentes, la migración T02 y el operador ficticio `demo-local`. Las pantallas y consultas del tablero corresponden a T06/T13/T14; identidad y permisos, a P1.

## Rutas disponibles

- `POST /api/importaciones/validar`: multipart/form-data con un único campo `file`, archivo `.csv`. Devuelve `VistaPrevia`; filas inválidas devuelven 422 con `{vistaPrevia,error}`.
- `POST /api/importaciones/{id}/confirmar`: Content-Type application/json, cuerpo `{}`. Devuelve `ResultadoImportacion` después del intento de procesamiento.
- `DELETE /api/importaciones/{id}`: sin cuerpo. Cancela y elimina el temporal; repetir conserva el resultado. Confirmadas no se cancelan.
- `GET /api/procesamientos/{jobId}`: `JobDTO` actual, con cantidades y errores por par.
- `POST /api/procesamientos/{jobId}/reintentar`: JSON `{}`. Recupera trabajos pendientes, fallidos o abandonados. Un trabajo completado se devuelve sin ejecutarlo otra vez.

Las respuestas usan Cache-Control no-store y los errores siguen `ApiError`: 400 petición/formato, 404 identificador inexistente, 409 conflicto/estado/job reclamado, 410 temporal vencido, 413 tamaño, 415 otro formato, 422 filas/reglas y 500 error inesperado. Una falla controlada posterior al commit devuelve **200 con job FALLIDO**: ese 200 confirma los datos, no el cálculo. Los errores inesperados no exponen mensajes de Prisma.

El transporte cuenta bytes mientras llegan, incluso sin Content-Length, antes de parsear multipart: máximo 5 MiB de archivo más 64 KiB de envoltorio. Después comprueba el tamaño exacto del archivo. T05 aplica el máximo de 1.000 filas y las validaciones de contenido. Se exige extensión CSV; MIME vacío, CSV, texto, octet-stream y el MIME CSV habitual de Excel son compatibles. El nombre/MIME no sustituye la validación del contenido.

## Persistencia y atomicidad

La vista previa dura 30 minutos. `ImportacionTemporal.datos` conserva las filas parseadas por T05, con celdas recortadas y números de línea, también las inicialmente omitidas para revalidar todo el lote. Los valores textuales conservan precisión. `muestra` es una cadena JSON dentro de la columna JSON para evitar recorte numérico; el DTO HTTP expone el array normal. No se guarda el CSV original. Los metadatos, hash de bytes, actor, cantidades, errores y warnings quedan en `Importacion`.

Confirmar bloquea el importId y revalida catálogo e histórico dentro de una transacción SERIALIZABLE. Inserta solo filas nuevas, actualiza punteros y guarda confirmación y job antes del commit. Un conflicto no reemplaza registros; una falla revierte todo. Las carreras transitorias se reintentan de forma acotada sobre la transacción completa; las restricciones únicas siguen siendo la última protección. Un histórico idéntico que apareció después de validar pasa a omitido.

La optimización T16 realiza lecturas e inserciones en bloques de hasta 200 filas, con IDs internos UUID de 36 caracteres para los períodos/registros nuevos. No usa `skipDuplicates` ni ignora conflictos. Los punteros se publican mediante un UPDATE parametrizado acotado a los períodos y a la fuente de esta importación, solo si siguen vacíos; se verifica la cantidad afectada. Sucesores y IDs se consultan por lote y los pares del job se insertan juntos. Todos los bloques siguen dentro de la misma transacción: fallar en el segundo revierte también el primero. No cambia el contrato HTTP ni requiere migración.

Los afectados son los pares nuevos y sus sucesores inmediatos existentes, sin duplicados, ordenados por empleado y fecha. No se propaga hasta W+2. Si todas las filas se omiten, no se crea job.

Al confirmar o cancelar se elimina el temporal. La limpieza de vencidos es diferida al operar CU01 y conserva metadatos; el vencimiento se comprueba igualmente al confirmar/cancelar y devuelve 410. No requiere cron para impedir confirmaciones vencidas.

`resultadoConfirmacion` conserva cantidades, afectados y respuesta original. Repetir el mismo ID no inserta ni dispara procesamiento, incluso después del vencimiento. Una petición simultánea puede leer la instantánea PENDIENTE guardada con el commit mientras la primera sigue procesando. Para el estado actual se usa GET del job; un reintento posterior no reescribe la respuesta original de confirmación.

## Jobs y recuperación

`procesarImportacion` reclama el trabajo con token nuevo y lease de 120 segundos, usando el reloj UTC de MySQL. Renueva antes de cada par y pasa siempre `propietario` y `alPublicar: alPublicarAlerta` a T08. Solo cuenta el par COMPLETADO después de construir el informe T10. Si falla T11, evaluación/puntero/alerta de ese par se revierten juntos.

Al primer fallo se detiene y guarda FALLIDO, par y código fuera de la transacción revertida. Los pares ya completados se conservan. Si falla T10 después de publicar, la evaluación queda guardada y el par sigue fallido hasta completar su informe mediante reintento.

Reintentar recorre la lista persistida con datos y reglas actuales. T08/T11 reutilizan resultados por huella y alertas por evaluación. También permite ejecutar los jobs CAMBIO_REGLAS creados por T09. Un lease vigente devuelve 409; el dueño anterior no puede publicar, completar pares ni cerrar el job si perdió el token o venció su permiso.

Un GET representa un PROCESANDO abandonado como PENDIENTE recuperable, sin modificarlo en la base. Se recupera con el POST de reintento. Los jobs PENDIENTE tras un reinicio usan la misma ruta. P0 procesa dentro de la petición, sin promesas sueltas después de responder. Un entorno con límites de ejecución necesitará un worker posterior.

## Ejemplo local

Con MySQL migrado y seed, desde la raíz de la aplicación y con el servidor iniciado, en PowerShell:

```powershell
curl.exe -F "file=@templates/ejemplo-dos-semanas.csv;type=text/csv" http://localhost:3000/api/importaciones/validar
curl.exe -X POST -H "Content-Type: application/json" --data '{}' http://localhost:3000/api/importaciones/IMPORT_ID/confirmar
curl.exe http://localhost:3000/api/procesamientos/JOB_ID
curl.exe -X POST -H "Content-Type: application/json" --data '{}' http://localhost:3000/api/procesamientos/JOB_ID/reintentar
```

Sustituir los IDs por los devueltos. El ejemplo espera dos registros: 83,71 INCOMPLETO y 91,21 ALTO, una alerta ACTIVA para TL-01, canal INTERNO y estado NO_APLICA. Otro archivo idéntico omite las dos filas y confirma sin job.

## Verificación

Desde `NexusProject/nexus-project`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
# TEST_DATABASE_URL: base MySQL migrada cuyo nombre termine en _test.
npm run db:test
# Usa el build anterior; inicia y detiene Next.js en un puerto local libre.
npm run db:test:http
```

`importaciones.test.ts` prueba peticiones, formatos, límites durante streaming y errores sin MySQL. `importaciones.mysql.test.ts` usa HTTP real sobre el adaptador de los Route Handlers y MySQL real, con fallos inyectables por argumentos internos, nunca por HTTP. Cubre rollback durante inserción, carreras idénticas y conflictivas, vencimiento, cancelación, revalidación, T11/T10 fallidos, sucesores, reemplazo de alertas, lease/token, dos reintentos simultáneos y las 138 filas del oráculo T03.

`db:test:http` verifica las cinco rutas del **build real de Next.js** con el ejemplo contractual, Prisma e informe/alerta. Exige las dos semanas de EMP-001 vacías en la base de pruebas, siembra catálogo/reglas sin sobrescribirlos y elimina solo las importaciones/resultados creados por la comprobación. No toma DATABASE_URL como fallback; inyecta TEST_DATABASE_URL al servidor temporal. No requiere modificar .env.

Evidencia local del 31/10/2026: Node 24.20.0, MySQL 8.0.46 descartable en puerto 3310, base `burnout_t04_test` con migración T02 y seed. Pasaron **57 pruebas sin MySQL y 56 con MySQL**, lint sin advertencias, typecheck y build predeterminado con Turbopack. `db:test:http` verificó las cinco rutas del build real y el ejemplo 83,71/91,21 con alerta única. La plantilla completa reprodujo las 138 filas del oráculo para 49 evaluables. Al terminar quedaron cero registros laborales y cero jobs de pruebas; se detuvo el contenedor descartable. No se modificó la base de la aplicación ni .env.

La implementación y estas pruebas son locales en `t04-feature`; no implican integración a main, publicación remota ni aceptación del tablero o de T16.
