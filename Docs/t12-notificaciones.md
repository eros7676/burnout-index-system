# T12 · Correo simulado e historial de intentos

Implementado localmente en `t12-feature`, desde `main` (`f142172`). Extiende T11 como funcionalidad P1. La importación y T11 siguen creando la alerta `INTERNO / NO_APLICA`; la simulación se solicita expresamente desde el tablero o la API. No hay transporte SMTP ni correo real.

## Demostración

Aplicar las migraciones con `npm run db:deploy`, conservar el seed y abrir la aplicación. Importar `templates/ejemplo-dos-semanas.csv` si todavía no existen sus registros. En **Alertas internas vigentes**:

1. **Preparar fallo simulado** guarda un intento `PENDIENTE` y pasa la misma alerta al canal `SIMULADO`.
2. **Procesar envío pendiente** lo termina como `FALLIDO`; la alerta y la evaluación permanecen.
3. **Reintentar correo simulado** agrega otro intento pendiente. Procesarlo termina como **Enviado (simulado)**.
4. **Ver / actualizar intentos** consulta el historial, con número, destinatario, fecha y detalle. Después de recargar la página permite recuperar un pendiente y procesarlo.

**Preparar correo simulado** usa el resultado exitoso desde el primer intento. Si no existe un responsable válido, el procesamiento devuelve `SIN_DESTINATARIO`. Después de corregir el catálogo se puede preparar otro intento, que vuelve a resolver técnico → Team Lead o Team Lead → Gerencia. No se implementa un editor de empleados en T12.

## Persistencia y concurrencia

La migración `20261101000000_t12_notificaciones` agrega `IntentoNotificacion`, sin recrear tablas existentes. Cada intento conserva alerta, UUID de solicitud, número correlativo, destinatario al prepararlo, resultado solicitado (`EXITO`/`FALLO`), estado, detalle, creación y finalización. El destinatario es un snapshot para conservar el historial aunque cambie el responsable. Los intentos no se borran durante un reintento.

Preparar guarda el intento y actualiza la alerta atómicamente. Procesar guarda el estado final y el estado agregado de la alerta en otra transacción. Ambas operaciones bloquean la misma alerta con `FOR UPDATE`. Solo puede existir un intento pendiente por alerta a través de estos servicios. Los conflictos transaccionales/deadlocks se reintentan hasta tres veces.

- Repetir `(alertId, requestId)` devuelve el intento original, sin rebobinar el estado agregado. Reutilizar esa clave con otro resultado devuelve 409.
- Solicitudes distintas mientras hay un pendiente devuelven ese pendiente; después de `ENVIADO` devuelven el envío exitoso existente. No se simula una nueva entrega después del éxito.
- Después de `FALLIDO` o `SIN_DESTINATARIO`, un UUID nuevo crea el siguiente intento. Las claves únicas por solicitud y número refuerzan la integridad.
- Repetir el procesamiento de un intento terminado devuelve ese mismo resultado y la misma fecha. No vuelve a modificar la alerta.
- Una alerta `SUPERADA` no admite nuevos intentos. Si queda superada mientras hay un pendiente, procesarlo lo cierra como `FALLIDO`, sin simular entrega. Se conserva su historial.
- Un fallo de la base revierte la operación completa. El intento pendiente sigue siendo recuperable; no depende de promesas en segundo plano ni de un worker.

## Contrato HTTP P1

Las tres operaciones están en `src/shared/api.ts`, con tipos y mocks. Todas responden 200 con JSON y `Cache-Control: no-store` cuando tienen éxito.

- `GET /api/alertas/{alertId}/notificaciones`: `IntentoNotificacion[]`, orden descendente por número; incluye el historial de alertas superadas.
- `POST /api/alertas/{alertId}/notificaciones`: JSON `{ "requestId": "UUID-v4", "resultado": "EXITO" }` o `FALLO`. Devuelve `IntentoNotificacion`, normalmente pendiente. No admite campos adicionales.
- `POST /api/alertas/{alertId}/notificaciones/{intentoId}/procesar`: sin cuerpo; devuelve el intento finalizado.

Errores: 400 por cuerpo, filtros o identificadores inválidos; 404 por alerta/intento inexistente o intento ajeno; 409 por estado incompatible o clave reutilizada con otro resultado; 500 uniforme por fallo técnico, sin detalles internos. Un fallo **simulado** es resultado de negocio 200 con estado `FALLIDO`, no un error HTTP 500.

`src/lib/mail.ts` contiene el simulador puro y determinista; `src/server/services/notificaciones.ts` controla las transacciones y el historial. Las consultas T13 y el informe T10 reflejan el canal/estado de la misma alerta, sin recalcular ni crear otra. El navegador elige el resultado de demostración, pero el servidor decide y persiste todos los cambios. Se mantiene el entorno local con datos ficticios y la autorización por roles sigue correspondiendo a T15a.

## Verificación

Desde `NexusProject/nexus-project`, con una base aislada migrada en `TEST_DATABASE_URL` cuyo nombre termine en `_test`:

```sh
npm run db:generate
npm run db:deploy
npm run db:seed
npm run lint
npm run typecheck
npm test
npm run build
npm run db:validate
npm run db:test
npm run db:test:http
npm run test:ui
npm run test:acceptance
```

Para preparar la base de pruebas, usar su URL también como `DATABASE_URL` al migrar/seedear. No usar la base de la aplicación para las pruebas SQL o de navegador.

La aceptación T16 requiere Chrome y Firefox. Si Chrome no está instalado, usar Chrome for Testing temporal y establecer `T16_CHROME_PATH` como indica [la guía T16](t16-integracion.md). Para comprobar solo T12 con Firefox: `npm run test:ui -- e2e/notificaciones.spec.ts e2e/importaciones-real.spec.ts --browser firefox`.

`notificaciones.test.ts` comprueba simulación y validación HTTP. `notificaciones.mysql.test.ts` prueba fallo/reintento, historial, seis solicitudes/procesamientos concurrentes, destinatario corregido, recuperación entre conexiones, vigencia, claves idempotentes y estados HTTP. Las pruebas del build real verifican las tres operaciones HTTP T12. Playwright cubre errores, historial y recuperación, además del circuito con API/MySQL reales desde importación hasta fallo y reintento exitoso. Cada escenario elimina únicamente sus propios datos.

Evidencia local del 01/11/2026, en Windows con Node 24.20.0 y MySQL 8 sobre la base exclusiva `nexus_t12_test`:

- Migraciones desde cero, seed, lint, typecheck, build Turbopack y validación Prisma aprobados.
- 62 pruebas sin MySQL y 73 con MySQL aprobadas.
- Las nueve operaciones P0 y las tres T12 verificadas por HTTP sobre el build real.
- 17 escenarios de interfaz en Chromium aprobados, incluido el circuito T12 con API/MySQL reales y recuperación tras recarga.
- Tres escenarios T12 adicionales en Firefox aprobados, incluido el circuito con API/MySQL reales. Captura revisada: `test-results/t12-correo-real.png`.
- Aceptación T16: cuatro escenarios Firefox 157.0 aprobados, con 48,86 s para el lote de 1.000 filas/5 MiB. En Chrome for Testing 156.0.8078.80, los tres escenarios funcionales pasaron; la primera medición del lote máximo fue 60,92 s y **falló** el límite original de 60 s. La repetición aislada aprobó la misma aserción, con una duración total del caso de 59,0 s. No se modificaron límites ni servicios P0 de importación/cálculo/procesamiento. El margen de rendimiento en Chrome es reducido y esta repetición no certifica cumplimiento estable del RNF01.

El resumen reproducido desde las salidas del runner se conserva en `test-results/t12-verificacion.json`. Playwright limpia su directorio de salida al iniciar cada suite; los informes completos de aceptación anteriores fueron reemplazados por la comprobación posterior de Firefox. Los resultados y la medición fallida también quedan registrados arriba para no depender de esos archivos temporales.

La revisión humana y la integración remota se registran por separado. Esta evidencia automatizada no sustituye la prueba de usabilidad con operador de T16.
