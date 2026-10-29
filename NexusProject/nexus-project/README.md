# Aplicación Next.js

La guía de instalación y alcance está en el [README principal](../../README.md).

Ejecutar npm ci, npm run dev, npm run lint, npm run typecheck, npm test y npm run build desde esta carpeta. Copiar .env.example a .env para Prisma. Docker Compose se ejecuta desde la raíz del repositorio. T01 y sus pruebas no requieren MySQL.

- src/shared/contracts.ts: contrato TypeScript común.
- src/shared/services.ts: firmas obligatorias de CU01/CU02/CU03.
- src/shared/api.ts: rutas, peticiones, respuestas y errores HTTP P0 tipados.
- src/shared/errors.ts: error de dominio común y códigos de validación.
- src/shared/mocks.ts: respuestas ficticias para desarrollar consumidores.
- src/server/services: validación y publicación de reglas T09. CU01/CU02/CU03 siguen pendientes; el motor CU02 va aparte.
- src/server/repositories: acceso a Prisma. `reglas.ts` inserta una versión nueva y su trabajo.
- src/app/api: rutas HTTP definidas en la documentación.
- prisma/: esquema, migración inicial y seed T02.
- templates/: CSV de referencia.
- tests/: pruebas base T01, catálogo/fechas T02, archivos/escenarios T03 y pruebas MySQL separadas.

La pantalla actual es una maqueta con datos ficticios fijos. No calcula índices ni envía notificaciones.

Ver [guía T01](../../Docs/t01-base.md) para consumir contratos y mocks sin redefinirlos.

Ver [guía T02](../../Docs/t02-persistencia.md) para persistencia. Con MySQL disponible: `npm run db:generate`, `npm run db:deploy` y `npm run db:seed`. El seed carga catálogo y reglas v1; no genera evaluaciones. Una versión posterior se publica con `npm run rules:publish -- ruta/regla.json`; ver [guía T09](../../Docs/t09-reglas.md). `npm run db:test` requiere una base de pruebas independiente. La migración y las siete comprobaciones MySQL de T02 pasaron localmente el 27/10/2026.

Ver [guía T03](tests/data/README.md) para la plantilla de 138 filas, cobertura de 49 evaluables y escenarios esperados. `npm test` también verifica esos datos; todavía no certifica un motor ni endpoints implementados. Los criterios RNF por etapa se registran en [Contratos y pruebas, sección 9](../../Docs/contratos-prototipo.md#9-verificación-de-los-requerimientos-no-funcionales).
