# Burnout Index System

Prototipo para identificar indicadores de posible sobrecarga laboral. Next.js + TypeScript + Prisma + MySQL. Los parámetros v1 son demostrativos; el sistema no diagnostica burnout.

## Estado y referencias

Existe una base de Next.js con **tablero conectado a resultados persistidos**, disponible en / y /home (T14, rama local `t14-feature`). T02 agrega el esquema Prisma, migración inicial, conexión y seed. Están implementados los servicios de validación CSV y duplicados T05, cálculo T07, persistencia de evaluaciones T08, reglas versionadas T09, informes T10 y alertas internas T11. T04 agrega la API de importación/confirmación y los jobs recuperables. T06 conecta la pantalla CSV en /importaciones con validación, vista previa, confirmación, cancelación y recuperación. T13 expone las consultas HTTP de evaluaciones, informe, resumen y alertas. T14 las consume con filtros, paginación, estados e informe individual. No confundir carpetas reservadas con funcionalidades terminadas.

T01 incorpora contratos TypeScript, catálogo HTTP, errores de dominio, mocks tipados y pruebas base sin base de datos. La guía de uso está en [Docs/t01-base.md](Docs/t01-base.md). Los mocks no implementan los endpoints ni el motor del índice.

T02 prepara la persistencia MySQL del P0 y sus pruebas de integración. La guía está en [Docs/t02-persistencia.md](Docs/t02-persistencia.md). La migración, el seed y las pruebas MySQL se verificaron localmente el 27/10/2026. Esto no completa CU01/CU02/CU03.

- [DOCUMENTACION: alcance, casos de uso y reglas](https://docs.google.com/document/d/13uTkbb7unMw-kcXwMvuIkLGyR5vwCOslZ-HQNOGouhQ/edit)
- [DOCUMENTACION vigente en PDF](<DOCUMENTACION - 3 Plus.pdf>)
- [Entrega 3 Plus final en PDF](<Grupo 8 - Entrega 3 Plus.pdf>) — referencia académica; versión final alfa-1.
- [Tareas del primer prototipo](Docs/tareas-prototipo.md)
- [Tareas P0 con casillas](https://github.com/eros7676/burnout-index-system/issues/2)
- [Contratos y pruebas de referencia](Docs/contratos-prototipo.md)
- [Mapa de carpetas y API](Docs/arquitectura.md)
- [Guía T09](Docs/t09-reglas.md)
- [Guía T10](Docs/t10-informes.md)
- [Guía T11](Docs/t11-alertas.md)
- [Guía T12: correo simulado e intentos](Docs/t12-notificaciones.md)
- [Guía T15b: auditoría de importaciones y reglas](Docs/t15b-auditoria.md)
- [Guía T05: validaciones CSV y duplicados](Docs/t05-validaciones.md)
- [Guía T04: API CSV, confirmación y recuperación](Docs/t04-importaciones.md)
- [Guía T06: pantalla CSV y pruebas de navegador](Docs/t06-pantalla-carga.md)
- [Guía T13: consultas, filtros y vigencia](Docs/t13-consultas.md)
- [Guía T14: tablero, informes y alertas](Docs/t14-tablero.md)
- [Guía T16: instalación limpia, aceptación y RNF](Docs/t16-integracion.md)
- [Diagnóstico de Turbopack y conexión local de sus workers](Docs/turbopack-diagnostico.md)

T03 incorpora la plantilla de 138 filas para 49 personas evaluables, archivos de errores y escenarios, resultados esperados y pruebas de datos. Ver [guía T03](NexusProject/nexus-project/tests/data/README.md). Estos archivos preparan la integración; no implementan importación ni cálculo.

T07 implementa `calcularEvaluacion`: fórmula, ranking, clasificación pura y persistencia semanal matemática, sin acceso a base de datos. Ver [guía T07](Docs/t07-calculo.md). T08 agrega persistencia de evaluaciones, snapshots, historial, vigencia, reintentos y protección frente a cálculos obsoletos; ver [guía T08](Docs/t08-evaluaciones.md). T10 arma el informe individual desde esa evaluación guardada, sin recalcular ni crear alertas; ver [guía T10](Docs/t10-informes.md). T11 crea la alerta interna única cuando el nivel vigente es ALTO; ver [guía T11](Docs/t11-alertas.md). T04 integra estos servicios desde la confirmación HTTP.

T04 publica con `alPublicar: alPublicarAlerta` y propietario de job tanto al confirmar como al reintentar. La integración HTTP con T08/T10/T11 tiene pruebas locales de atomicidad, alertas, idempotencia y recuperación; ver [guía T04](Docs/t04-importaciones.md) y [criterios de integración](Docs/t11-alertas.md#integración-con-t04). T13 expone los resultados y T14 los muestra. La aceptación integral se ejecuta con T16; sus resultados y criterios pendientes se registran en [la guía T16](Docs/t16-integracion.md).

## Alcance

T12 incorpora el correo simulado P1, su historial persistido y controles de preparación, procesamiento y reintento en el tablero. Mantiene una sola alerta y muestra **Enviado (simulado)**. Los envíos se solicitan explícitamente; una importación conserva `INTERNO / NO_APLICA`. Ver [guía T12](Docs/t12-notificaciones.md) para migración, API, demostración y pruebas.

| Etapa | Incluye |
| --- | --- |
| P0 | Demo local con datos ficticios; CSV semanal; validación y confirmación atómica; historial; índice/ranking; informes; alertas internas; tablero simple. |
| P1 | Correo simulado, permisos de demostración y auditoría ampliada. |
| Sistema final | XLSX, exportaciones, correo real, CRUD completo, vista del empleado y editor web de reglas. |

Una primera semana válida conserva su índice y produce INCOMPLETO por falta de historial. Una falla técnica pertenece al trabajo de procesamiento, no al nivel de riesgo. CU02 se ejecuta en servidor tras confirmar la importación.

## Instalación de la base actual

Requisitos: Node.js >=20.9 (se recomienda Node 22), npm, Git y Docker Compose para MySQL.

Desde la carpeta donde quieras clonar:

```bash
git clone https://github.com/eros7676/burnout-index-system.git
cd burnout-index-system
cp .env.example .env
docker compose up -d
cd NexusProject/nexus-project
cp .env.example .env
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Abrir http://localhost:3000. Docker toma DB_NAME/DB_USER/DB_PASSWORD y DB_PORT del .env de la raíz. El puerto publicado por defecto es 3306; si está ocupado, cambiar DB_PORT (por ejemplo, a 3307) y usar el mismo puerto en DATABASE_URL del .env de la aplicación. Esperar a que MySQL esté listo antes de aplicar migraciones. No subir archivos .env. El tablero y la importación necesitan MySQL; contratos y pruebas unitarias pueden ejecutarse sin la base. Sin registros importados, el tablero muestra el estado vacío.

Para demostrar T14: abrir **Importar datos**, validar y confirmar `templates/ejemplo-dos-semanas.csv` y esperar procesamiento COMPLETADO. Volver a **Resumen**: aparecen 83,71 INCOMPLETO y 91,21 ALTO, con una alerta interna para TL-01. **Ver informe** muestra ranking, umbrales, reglas y persistencia. Los filtros por empleado/equipo usan sus IDs; la semana comienza un lunes. **Actualizar resultados** consulta nuevamente la API. Ver [guía T14](Docs/t14-tablero.md).

## Comprobaciones y base de datos

Ejecutar desde NexusProject/nexus-project:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run db:validate
```

`db:generate` genera el cliente sin conectarse a MySQL; `db:validate` necesita una DATABASE_URL con formato válido pero no abre conexión. `db:deploy` aplica las migraciones versionadas y `db:seed` carga el catálogo ficticio y reglas v1. `db:migrate` se reserva para desarrollar nuevas migraciones y requiere MySQL y permisos para una shadow database.

El seed puede repetirse sin sobrescribir filas existentes: cuatro equipos, 45 técnicos, cuatro Team Leads y un gerente (50 personas, 49 evaluables según los tipos P0). Conserva EMP-001 → TL-01 → GER-01. No precarga registros laborales, evaluaciones ni alertas: el CSV del ejemplo debe poder importarse desde cero. Los archivos y escenarios T03 ya están en `templates/` y `tests/data/`. Las versiones posteriores a v1 se publican con el script de [T09](Docs/t09-reglas.md).

`npm test` ejecuta las pruebas sin MySQL de contratos T01, catálogo/fechas T02, archivos T03, transporte HTTP T04, validación T05, cálculo T07, huellas/JSON T08, reglas T09, informes T10, alertas T11 y filtros/errores T13. `npm run db:test` ejecuta exclusivamente las pruebas MySQL y exige TEST_DATABASE_URL para una base migrada cuyo nombre termine en `_test`; ver la guía T02. Incluye importación por HTTP, persistencia, validación, reglas, informes y alertas reales, con comprobaciones de historial, rollback y concurrencia. Después de `npm run build`, `npm run db:test:http` verifica las cinco rutas T04 y cuatro consultas T13 del servidor Next.js real sobre esa base aislada. T16 debe verificar el circuito completo con el tablero.

La evidencia local de T04 y sus comandos reproducibles están en [la guía de importaciones](Docs/t04-importaciones.md). Las pruebas SQL usan una base aislada con la migración T02. `npm run test:ui` verifica T06/T14 con respuestas interceptadas; con TEST_DATABASE_URL incluye importación, tablero, informe y alerta reales desde Chromium. `npm run test:acceptance` ejecuta T16 con API/MySQL reales en Chrome/Firefox y conserva los incumplimientos RNF como pruebas fallidas.

## Trabajo en equipo

T16 agrega `npm run verify:p0`: verificación secuencial desde migración/seed hasta aceptación con MySQL real, Chrome y Firefox. Exige TEST_DATABASE_URL de una base exclusiva vacía terminada en `_test`. No usar la base de la aplicación. Ver [guía T16](Docs/t16-integracion.md) para instalación limpia, comandos, mediciones y protocolo humano de usabilidad. Los cambios de esta tarea permanecen locales en `t16-feature`.

La falla de rendimiento T16 está corregida: el lote máximo de 1.000 filas/5 MiB pasó en **53,75 s en Chrome y 53,68 s en Firefox**, frente a 106–110 s iniciales y con el límite original de 60 s. `npm run verify:p0` aprobó todas las comprobaciones automatizadas. La confirmación usa bloques atómicos y el procesamiento reduce consultas/transacciones manteniendo historial, alertas y recuperación. Ver [evidencia T16](Docs/t16-integracion.md). RNF03 sigue requiriendo una prueba con operador humano; la aceptación humana de T16 no se da por cerrada.

Crear ramas feature/TXX-descripcion desde main y abrir PR a main para revisión. No se presupone una rama develop ni protección configurada. Una tarea se completa con contrato respetado, pruebas relevantes y revisión; compilar la maqueta no completa P0.

Los cambios de contratos deben actualizar documentación, tipos, consumidores y pruebas juntos. Los responsables se gestionan fuera de esta guía; las tareas no dependen de nombres fijos.
