# Aplicación Next.js

La guía de instalación y alcance está en el [README principal](../../README.md).

Ejecutar npm ci, npm run dev, npm run lint, npm run typecheck y npm run build desde esta carpeta. Copiar .env.example a .env para Prisma. Docker Compose se ejecuta desde la raíz del repositorio.

- src/shared/contracts.ts: contrato TypeScript común.
- src/server/services: CU01/CU02/CU03, con motor CU02 puro.
- src/server/repositories: acceso a Prisma.
- src/app/api: rutas HTTP definidas en la documentación.
- prisma/: única ubicación de esquema y futuras migraciones/seed.
- templates/: CSV de referencia.
- tests/: escenarios de aceptación pendientes.

La pantalla actual es una maqueta con datos ficticios fijos. No calcula índices ni envía notificaciones.
