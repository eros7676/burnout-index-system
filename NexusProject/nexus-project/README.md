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
- src/app/api: cinco rutas T04 de importación y procesamiento implementadas; las consultas T13 siguen pendientes.
- prisma/: esquema, migración inicial y seed T02.
- templates/: CSV de referencia.
- tests/: pruebas de contratos, datos, validación, cálculo, persistencia, reglas, informes y alertas; las pruebas MySQL se ejecutan por separado.

La pantalla actual es una maqueta con datos ficticios fijos. No calcula índices ni envía notificaciones.

Ver [guía T01](../../Docs/t01-base.md) para consumir contratos y mocks sin redefinirlos.

Ver [guía T02](../../Docs/t02-persistencia.md) para persistencia. Con MySQL disponible: `npm run db:generate`, `npm run db:deploy` y `npm run db:seed`. El seed carga catálogo y reglas v1; no genera evaluaciones. Una versión posterior se publica con `npm run rules:publish -- ruta/regla.json`; ver [guía T09](../../Docs/t09-reglas.md). `npm run db:test` requiere una base de pruebas independiente. La migración y las siete comprobaciones MySQL de T02 pasaron localmente el 27/10/2026.

Ver [guía T03](tests/data/README.md) para la plantilla de 138 filas, cobertura de 49 evaluables y escenarios esperados. Las pruebas de datos verifican los fixtures; las pruebas T07 ejecutan el motor real y las pruebas MySQL T04/T08/T10/T11 verifican importaciones, evaluaciones, informes y alertas persistidos. La visualización queda para T06/T13/T14/T16. Los criterios RNF por etapa se registran en [Contratos y pruebas, sección 9](../../Docs/contratos-prototipo.md#9-verificación-de-los-requerimientos-no-funcionales).

Ver [T05](../../Docs/t05-validaciones.md), [T10](../../Docs/t10-informes.md) y [T11](../../Docs/t11-alertas.md) para integrar sus servicios. Durante la publicación de T08, T04 debe pasar `alPublicar: alPublicarAlerta` para crear la alerta en la misma transacción. Consultar un informe solo lee la alerta existente; no la crea ni envía correo.

T04 integra la confirmación HTTP y los reintentos con T08/T10/T11; ver [guía T04](../../Docs/t04-importaciones.md) y [criterios de integración](../../Docs/t11-alertas.md#integración-con-t04). `npm run db:test` verifica HTTP y MySQL con fallos inyectados. Después del build, `npm run db:test:http` inicia un servidor Next.js temporal y comprueba sus cinco rutas reales con TEST_DATABASE_URL. La visualización sigue pendiente de T06/T13/T14/T16.
