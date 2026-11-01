# Pruebas de servicios, persistencia e integración

T15b agrega `auditoria.test.ts` y `auditoria.mysql.test.ts`, y amplía la prueba HTTP del build con la consulta paginada de eventos. Cubre transiciones, privacidad, idempotencia, rollback y persistencia. Ver [guía T15b](../../../Docs/t15b-auditoria.md) para el estado de ejecución: SQL requiere Docker/MySQL disponible; compilar estas pruebas no equivale a ejecutarlas.

T12 agrega `notificaciones.test.ts`, `notificaciones.mysql.test.ts` y `e2e/notificaciones.spec.ts`. Amplía las pruebas HTTP del build y el escenario real de navegador con preparación persistida, recuperación tras recarga, fallo y reintento exitoso sin duplicar la alerta. Ver [guía T12](../../../Docs/t12-notificaciones.md). La limpieza de esas pruebas elimina primero sus intentos por la relación restrictiva con la alerta.

T16 agrega `acceptance/` y `playwright.acceptance.config.ts`: cuatro escenarios reales por navegador (Chrome/Firefox), sin interceptar la API. `npm run verify:p0` ejecuta todas las comprobaciones en secuencia y exige una base TEST_DATABASE_URL exclusiva; `npm run test:acceptance` requiere además el build previo. Reportes y mediciones en `test-results/`. Ver [guía T16](../../../Docs/t16-integracion.md).

La corrección de rendimiento agrega regresiones SQL de rollback de bloques de importación y de publicación concurrente por dos jobs distintos. La verificación completa pasó 60 pruebas sin MySQL, 67 con MySQL, nueve rutas HTTP, 15 escenarios de regresión y ocho de aceptación. El escenario de 1.000 filas/5 MiB mantiene su aserción ≤60 s y pasó en ambos navegadores. RNF03 con operador no se certifica por estas pruebas automatizadas.

T14 agrega siete escenarios de navegador en `e2e/tablero.spec.ts`, ejecutados por `npm run test:ui` después del build. Cubren estados, niveles/ranking, vigencia, filtros/paginación, errores/recuperación y móvil. La prueba real de `e2e/importaciones-real.spec.ts` extiende T06 con tablero, informe, alerta y repetición sin duplicados usando TEST_DATABASE_URL aislada; sin esa variable se omite. Ver [guía T14](../../../Docs/t14-tablero.md).

Desde la raíz de la aplicación: `npm test`. Usa TypeScript y el runner nativo de Node, sin dependencias adicionales ni MySQL. Compila contratos y pruebas en `.test-build/` (ignorado por Git/ESLint), luego descubre recursivamente los archivos `*.test.js`. No depende de globs del shell y funciona con Node 22 en Windows y Linux. Las nuevas pruebas se escriben como `*.test.ts` dentro de esta carpeta; deben usar imports relativos para ejecutarse fuera de Next.js.

T01 comprueba serialización y cobertura de las nueve respuestas, aislamiento de copias, ejemplo documental, rechazo con errores por fila, fallos de procesamiento separados del riesgo, omisiones y formato público del error de dominio. El compilador comprueba los tipos de los fixtures. Son verificaciones de la base, no pruebas de importación, cálculo ni persistencia implementados.

Las pruebas de servicios cubren BAJO/MEDIO/ALTO/INCOMPLETO, primera semana, huecos, carga fuera de orden, límites/redondeo, duplicados/conflictos, rollback y concurrencia. T16 verifica esos comportamientos a través de la API, los trabajos y el tablero integrados.

T02 incorpora `persistence.test.ts` (catálogo ficticio, reglas iniciales y fechas DATE) sin conexión. `persistence.mysql.test.ts` se ejecuta solo con `npm run db:test`; exige TEST_DATABASE_URL para una base migrada cuyo nombre termine en `_test`. Comprueba restricciones SQL, seed repetible, historial/vigentes, rollback y persistencia entre conexiones. Las siete comprobaciones MySQL pasaron el 27/10/2026 en `nexus_t02_test`. Preparación y límites en [la guía T02](../../../Docs/t02-persistencia.md).

El CSV de templates/ejemplo-dos-semanas.csv espera índices 83,71 y 91,21: primera semana INCOMPLETO y segunda ALTO. El seed T02 carga EMP-001, TL-01 y GER-01; no carga registros ni resultados para que el ejemplo pueda importarse desde cero. Los mocks T01 representan ese resultado esperado sin calcularlo.

## T03 y verificación de T16

T09 agrega `reglas.test.ts` a `npm test`: configuración completa, campos obligatorios, pesos y tolerancia de suma, umbrales, fechas UTC, vigencia en lunes y restricciones P0. `reglas.mysql.test.ts` se ejecuta con `npm run db:test` y exige una base migrada en `TEST_DATABASE_URL` cuyo nombre termine en `_test`. Comprueba rechazo sin escrituras, preservación de v1, duplicados de versión/vigencia, trabajos vacíos, intervalo con y sin versión siguiente, exclusión de períodos sin registros, orden de pares y rollback si falla la creación del trabajo. Los escenarios revierten sus datos, incluso al fallar una aserción. No ejecutan el motor T07/T08.

`npm test` también descubre `data.test.ts`: comprueba encabezados, cobertura del catálogo, archivos de escenarios y resultados de referencia de T03, sin MySQL. Ver [preparación de cada archivo](data/README.md). Estas comprobaciones de fixtures son independientes de las pruebas funcionales de los servicios.

T16 debe registrar evidencia de los RNF01–RNF07 según [Contratos y pruebas, sección 9](../../../Docs/contratos-prototipo.md#9-verificación-de-los-requerimientos-no-funcionales), distinguiendo P0, P1 y sistema final. Los controles futuros se registran pendientes; las pruebas actuales no acreditan rendimiento, autorización ni correo.

## T05 y T07

`validacion-importacion.test.ts` prueba parseo, normalización, errores, omisiones y conflictos; `validacion-importacion.mysql.test.ts` verifica el adaptador con catálogo e histórico reales, sin escrituras de validación. Ver [guía T05](../../../Docs/t05-validaciones.md). `calculo.test.ts` ejecuta el motor puro, incluidos los límites y las 138 filas del oráculo T03; ver [guía T07](../../../Docs/t07-calculo.md).

## T08

`evaluaciones.test.ts` prueba huellas canónicas y JSON exacto. `evaluaciones.mysql.test.ts` ejecuta el motor real con persistencia, snapshots, versiones, concurrencia y protección por token/lease. Se ejecuta con `npm run db:test` en una base MySQL terminada en `_test`; ver [guía T08](../../../Docs/t08-evaluaciones.md).

## T10

`informes.test.ts` cubre explicaciones de los cuatro niveles, el pico aislado MEDIO, el orden de factores y las recomendaciones. `informes.mysql.test.ts` lee evaluaciones reales, historial, snapshots y alertas sin escribir. Se ejecuta con `npm run db:test`; ver [guía T10](../../../Docs/t10-informes.md).

## T11

`alertas.test.ts` cubre destinatarios, incidencia sin responsable, causas, sugerencias y reintentos acotados de deadlock. `alertas.mysql.test.ts` verifica creación e idempotencia reales, seis creaciones concurrentes, publicación concurrente con T08, reemplazo ALTO por ALTO o BAJO, rechazo de alertas tardías para evaluaciones históricas y rollback. Se ejecuta con `npm run db:test`; ver [guía T11](../../../Docs/t11-alertas.md).

## Integración HTTP T04

`importaciones.test.ts` verifica peticiones, límites de carga y errores HTTP sin MySQL. `importaciones.mysql.test.ts` recorre el mismo adaptador de los Route Handlers por HTTP real con MySQL: confirmación/revalidación atómicas, rollback, cancelación/vencimiento, carreras, T08/T11/T10, fallos y reintentos, sucesores, alertas superadas, exclusividad, recuperación de lease/token y las 138 filas T03. Ver [guía T04](../../../Docs/t04-importaciones.md) y [criterios T11](../../../Docs/t11-alertas.md#integración-con-t04).

`npm run db:test:http` es una comprobación adicional que requiere `npm run build` previo y TEST_DATABASE_URL. Inicia y detiene su propio Next.js en un puerto local libre, verifica las cinco rutas y el ejemplo contractual con Prisma/informe/alerta, y elimina solo sus datos. Exige las dos semanas de EMP-001 vacías. No entra en `npm run db:test`, que sigue sin requerir un build. La API de consultas y la visualización siguen pendientes de T13/T14/T16.

## Navegador T06

npm run test:ui ejecuta Playwright sobre el build de producción (npm run build previo). Incluye interfaz con HTTP interceptado y un escenario optativo con API/MySQL reales mediante TEST_DATABASE_URL, base aislada migrada y sin registros laborales. Ver [guía T06](../../../Docs/t06-pantalla-carga.md) para comandos, cobertura y limpieza. No sustituye la aceptación del tablero T16.

## Consultas T13

consultas.test.ts comprueba filtros y errores HTTP sin MySQL. consultas.mysql.test.ts verifica resultados reales, paginación, niveles, resumen, historial, vigencia y estados por par, incluidos leases vencidos. db:test:http verifica además las cuatro rutas GET T13 del build real. Ver [guía T13](../../../Docs/t13-consultas.md).
