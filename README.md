# Burnout Index System

Prototipo para identificar indicadores de posible sobrecarga laboral. Next.js + TypeScript + Prisma + MySQL. Los parámetros v1 son demostrativos; el sistema no diagnostica burnout.

## Estado y referencias

Existe una base de Next.js y una **maqueta visual con datos fijos**, disponible en / y /home. Todavía faltan los módulos funcionales, modelos de datos, migraciones y seed. No confundir carpetas reservadas con funcionalidades terminadas.

T01 incorpora contratos TypeScript, catálogo HTTP, errores de dominio, mocks tipados y pruebas base sin base de datos. La guía de uso está en [Docs/t01-base.md](Docs/t01-base.md). Los mocks no implementan los endpoints ni el motor del índice.

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
npm run dev
```

Abrir http://localhost:3000. Docker toma DB_NAME/DB_USER/DB_PASSWORD del .env de la raíz. Prisma toma DATABASE_URL del .env de la aplicación; ambas configuraciones deben coincidir. No subir archivos .env.

## Comprobaciones y base de datos

Ejecutar desde NexusProject/nexus-project:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run db:validate
```

Los scripts db:generate y db:migrate están preparados para T02. **El esquema aún no tiene modelos**: no hay tablas funcionales, migraciones ni seed. T02 debe agregar modelos/migraciones/seed y documentar el comando de carga antes de poder reproducir el circuito completo. `npm test` ejecuta las pruebas base de contratos y mocks de T01; T07/T08/T16 deben agregar las pruebas del motor, persistencia y circuito completo.

## Trabajo en equipo

Crear ramas feature/TXX-descripcion desde main y abrir PR a main para revisión. No se presupone una rama develop ni protección configurada. Una tarea se completa con contrato respetado, pruebas relevantes y revisión; compilar la maqueta no completa P0.

Los cambios de contratos deben actualizar documentación, tipos, consumidores y pruebas juntos. Los responsables se gestionan fuera de esta guía; las tareas no dependen de nombres fijos.
