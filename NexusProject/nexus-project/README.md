# Aplicación Next.js

La guía de instalación y alcance está en el [README principal](../../README.md).

Ejecutar npm ci, npm run dev, npm run lint, npm run typecheck, npm test y npm run build desde esta carpeta. Copiar .env.example a .env para Prisma. Docker Compose se ejecuta desde la raíz del repositorio. T01 y sus pruebas no requieren MySQL.

- src/shared/contracts.ts: contrato TypeScript común.
- src/shared/services.ts: firmas obligatorias de CU01/CU02/CU03.
- src/shared/api.ts: rutas, peticiones, respuestas y errores HTTP P0 tipados.
- src/shared/errors.ts: error de dominio común y códigos de validación.
- src/shared/mocks.ts: respuestas ficticias para desarrollar consumidores.
- src/server/services: CU01/CU02/CU03, con motor CU02 puro.
- src/server/repositories: acceso a Prisma.
- src/app/api: rutas HTTP definidas en la documentación.
- prisma/: única ubicación de esquema y futuras migraciones/seed.
- templates/: CSV de referencia.
- tests/: pruebas base T01; escenarios funcionales pendientes.

La pantalla actual es una maqueta con datos ficticios fijos. No calcula índices ni envía notificaciones.

Ver [guía T01](../../Docs/t01-base.md) para consumir contratos y mocks sin redefinirlos.
