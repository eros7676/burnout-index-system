# Aplicación Next.js

La guía de instalación y alcance está en el [README principal](../../README.md).

Ejecutar npm ci, npm run dev, npm run lint, npm run typecheck, npm test y npm run build desde esta carpeta. Copiar .env.example a .env para Prisma. Docker Compose se ejecuta desde la raíz del repositorio. T01 y sus pruebas no requieren MySQL.

- src/shared/contracts.ts: contrato TypeScript común.
- src/shared/services.ts: firmas obligatorias de CU01/CU02/CU03.
- src/shared/api.ts: rutas, peticiones, respuestas y errores HTTP P0 tipados.
- src/shared/errors.ts: error de dominio común y códigos de validación.
- src/shared/mocks.ts: respuestas ficticias para desarrollar consumidores.
- src/server/services: validación CSV T05, cálculo puro T07, persistencia de evaluaciones T08, reglas T09, informes T10 y alertas internas T11.
- src/server/repositories: lecturas y escrituras Prisma para validaciones, evaluaciones, reglas, informes y alertas.
- src/app/api: cinco rutas T04 de importación y procesamiento y cuatro consultas T13 implementadas.
- src/client/tablero-api.ts y src/components/dashboard-home.tsx: tablero T14 conectado a la API real, sin resultados precargados.
- prisma/: esquema, migración inicial y seed T02.
- templates/: CSV de referencia.
- tests/: pruebas de contratos, datos, validación, cálculo, persistencia, reglas, informes y alertas; las pruebas MySQL se ejecutan por separado.

El resumen en / y /home consume T13 y muestra resultados persistidos: filtros por empleado/equipo/semana/nivel, paginación, resumen, informe con ranking y alertas internas. Contempla carga, vacío, error y resultados desactualizados. Ver [guía T14](../../Docs/t14-tablero.md). La pantalla /importaciones (T06) consume la API real T04: valida CSV, muestra vista previa/errores, confirma, cancela y consulta/reintenta jobs. Ver [guía T06](../../Docs/t06-pantalla-carga.md).

Ver [guía T01](../../Docs/t01-base.md) para consumir contratos y mocks sin redefinirlos.

Ver [guía T02](../../Docs/t02-persistencia.md) para persistencia. Con MySQL disponible: `npm run db:generate`, `npm run db:deploy` y `npm run db:seed`. El seed carga catálogo y reglas v1; no genera evaluaciones. Una versión posterior se publica con `npm run rules:publish -- ruta/regla.json`; ver [guía T09](../../Docs/t09-reglas.md). `npm run db:test` requiere una base de pruebas independiente. La migración y las siete comprobaciones MySQL de T02 pasaron localmente el 27/10/2026.

Ver [guía T03](tests/data/README.md) para la plantilla de 138 filas, cobertura de 49 evaluables y escenarios esperados. Las pruebas de datos verifican los fixtures; las pruebas T07 ejecutan el motor real y las pruebas MySQL T04/T08/T10/T11 verifican importaciones, evaluaciones, informes y alertas persistidos. La carga CSV está conectada en T06 y el tablero en T14; la aceptación integral queda en T16. Los criterios RNF por etapa se registran en [Contratos y pruebas, sección 9](../../Docs/contratos-prototipo.md#9-verificación-de-los-requerimientos-no-funcionales).

Ver [T05](../../Docs/t05-validaciones.md), [T10](../../Docs/t10-informes.md) y [T11](../../Docs/t11-alertas.md) para integrar sus servicios. Durante la publicación de T08, T04 debe pasar `alPublicar: alPublicarAlerta` para crear la alerta en la misma transacción. Consultar un informe solo lee la alerta existente; no la crea ni envía correo.

T04 integra la confirmación HTTP y los reintentos con T08/T10/T11; ver [guía T04](../../Docs/t04-importaciones.md) y [criterios de integración](../../Docs/t11-alertas.md#integración-con-t04). `npm run db:test` verifica HTTP y MySQL con fallos inyectados. Después del build, `npm run db:test:http` inicia un servidor Next.js temporal y comprueba las cinco rutas T04 y cuatro consultas T13 reales con TEST_DATABASE_URL. Ver [guía T13](../../Docs/t13-consultas.md). `npm run test:ui` cubre T06/T14; con TEST_DATABASE_URL incluye el escenario real importación → tablero → informe/alerta → repetición sin duplicados. La base debe ser aislada, migrada, con nombre terminado en `_test` y sin registros laborales.
