# Burnout Index System

Prototipo para identificar indicadores de posible sobrecarga laboral. Next.js + TypeScript + Prisma + MySQL. Los parámetros v1 son demostrativos; el sistema no diagnostica burnout.

## Estado y referencias

Existe una base de Next.js y una **maqueta visual con datos fijos**, disponible en / y /home. T02 agrega el esquema Prisma, migración inicial, conexión y seed; los módulos funcionales y su integración siguen pendientes. No confundir carpetas reservadas con funcionalidades terminadas.

T01 incorpora contratos TypeScript, catálogo HTTP, errores de dominio, mocks tipados y pruebas base sin base de datos. La guía de uso está en [Docs/t01-base.md](Docs/t01-base.md). Los mocks no implementan los endpoints ni el motor del índice.

T02 prepara la persistencia MySQL del P0 y sus pruebas de integración. La guía está en [Docs/t02-persistencia.md](Docs/t02-persistencia.md). La migración, el seed y las pruebas MySQL se verificaron localmente el 27/10/2026. Esto no completa CU01/CU02/CU03.

- [DOCUMENTACION: alcance, casos de uso y reglas](https://docs.google.com/document/d/1aYIW8zZtLqwAlr5YQnljINkdmViz5vhH7_XVnLjOpXs/edit)
- [Tareas P0 con casillas](https://github.com/eros7676/burnout-index-system/issues/2)
- [Contratos y pruebas de referencia](Docs/contratos-prototipo.md)
- [Mapa de carpetas y API](Docs/arquitectura.md)

## Alcance

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

Abrir http://localhost:3000. Docker toma DB_NAME/DB_USER/DB_PASSWORD y DB_PORT del .env de la raíz. El puerto publicado por defecto es 3306; si está ocupado, cambiar DB_PORT (por ejemplo, a 3307) y usar el mismo puerto en DATABASE_URL del .env de la aplicación. Esperar a que MySQL esté listo antes de aplicar migraciones. No subir archivos .env. Para trabajar solo con contratos y la maqueta, se pueden omitir Docker, migración y seed.

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

El seed puede repetirse sin sobrescribir filas existentes: cuatro equipos, 45 técnicos, cuatro Team Leads y un gerente (50 personas, 49 evaluables según los tipos P0). Conserva EMP-001 → TL-01 → GER-01. No precarga registros laborales, evaluaciones ni alertas: el CSV del ejemplo debe poder importarse desde cero. El generador de archivos y escenarios para toda la cobertura corresponde a T03; el script de nuevas reglas, a T09.

`npm test` ejecuta contratos/mocks T01 y comprobaciones de catálogo/fechas T02, sin MySQL. `npm run db:test` ejecuta exclusivamente las pruebas MySQL y exige TEST_DATABASE_URL para una base migrada cuyo nombre termine en `_test`; ver la guía T02. Las siete comprobaciones MySQL de T02 pasaron en `nexus_t02_test`. T07/T08/T16 deben agregar las pruebas del motor y del circuito completo.

## Trabajo en equipo

Crear ramas feature/TXX-descripcion desde main y abrir PR a main para revisión. No se presupone una rama develop ni protección configurada. Una tarea se completa con contrato respetado, pruebas relevantes y revisión; compilar la maqueta no completa P0.

Los cambios de contratos deben actualizar documentación, tipos, consumidores y pruebas juntos. Los responsables se gestionan fuera de esta guía; las tareas no dependen de nombres fijos.
