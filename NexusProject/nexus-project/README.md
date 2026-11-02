# Aplicación Next.js

Instalación completa, requisitos y alcance en el [README principal](../../README.md). Ejecutar los comandos npm desde esta carpeta; Docker Compose desde la raíz del repositorio.

## Preparación

Copiar `.env.example` a `.env`, configurar `DATABASE_URL`, ejecutar `npm ci`, `npm run db:generate`, `npm run db:deploy` y `npm run db:seed`. Hay tres migraciones: persistencia T02, intentos de notificación T12 y auditoría T15b. El seed conserva el catálogo ficticio y las reglas v1 sin precargar resultados. No subir archivos `.env`.

Iniciar con `npm run dev`, abrir `/` y entrar como **RRHH** para importar `templates/ejemplo-dos-semanas.csv` desde **Importar datos**. Cada perfil ve solo las secciones que puede abrir; pantallas, roles, tokens y reglas de diseño están en [DESIGN.md](DESIGN.md).

## Permisos y trazabilidad

[T15a](../../Docs/t15a-permisos.md) agrega sesión firmada y controles en los runtimes HTTP. RRHH administra cargas y notificaciones; Gerencia consulta todos los resultados y auditoría; cada Team Lead solo consulta su equipo; el empleado no consulta índices, informes ni alertas. Sin sesión: 401; sin permiso: 403. La selección pública de identidades es únicamente para una demo local, sin autenticación productiva. Las sesiones duran ocho horas. Sin `DEMO_SESSION_SECRET` se invalidan al reiniciar; varios procesos necesitan una clave privada compartida.

[T15b](../../Docs/t15b-auditoria.md) guarda eventos junto con validaciones, confirmaciones, cancelaciones y reglas. Los reintentos conservan la trazabilidad sin duplicar eventos. `GET /api/auditoria` ofrece filtros y paginación a RRHH y Gerencia, sin una pantalla específica. Los actores de importación provienen de la sesión verificada. El registro no copia CSV ni contraseñas y no reemplaza snapshots/versiones de P0.

[T12](../../Docs/t12-notificaciones.md) conserva intentos y estados de correo simulado sobre la misma alerta. Preparar y procesar son acciones explícitas; se muestran como **Enviado (simulado)**. No se envía correo real.

## Verificación

Ejecutar `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y `npm run db:validate`.

Para integración, usar una base exclusiva cuyo nombre termine en `_test`, migrada y con seed. Establecer `TEST_DATABASE_URL` a esa base; nunca usar la base de la aplicación. Ejecutar en secuencia:

```sh
npm run db:test
npm run db:test:http
npm run test:ui
```

`db:test:http` y `test:ui` necesitan un build previo. Las pruebas HTTP seleccionan RRHH y comprueban también rechazos y ámbito de otros roles. Sin `TEST_DATABASE_URL`, `test:ui` omite escenarios reales: esa ejecución no acredita integración completa. Las pruebas conservan sus eventos de auditoría en la base aislada y limpian sus datos operativos.

`npm run test:acceptance` ejecuta T16 en Chrome/Firefox; `npm run verify:p0` encadena instalación y suites. Consultar [guía T16](../../Docs/t16-integracion.md) para Chrome for Testing, rendimiento y usabilidad humana. La aceptación histórica de T16 y la variación posterior registrada en [T12](../../Docs/t12-notificaciones.md) no equivalen a una medición actual de rendimiento. La revisión de T15a/T15b se centra en permisos, trazabilidad y regresiones funcionales.

Contratos, rutas y mocks están en `src/shared/`; los guards HTTP en `src/server/http/`; reglas, importación y cálculo en `src/server/services/` y `src/server/repositories/`. Publicar reglas con `npm run rules:publish -- ruta/regla.json`; ver [T09](../../Docs/t09-reglas.md). Evidencia y estructura de las suites en [tests/README.md](tests/README.md).
