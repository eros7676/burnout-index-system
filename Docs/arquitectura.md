# Estructura y contratos de implementación

La raíz ejecutable de Next.js es NexusProject/nexus-project. Se conserva para aprovechar el trabajo existente.

| Ubicación dentro de la aplicación | Función |
| --- | --- |
| src/app/(dashboard)/ | Pantallas; las carpetas sin page.tsx son reservas. |
| src/app/api/ | Route Handlers; sin lógica matemática ni consultas Prisma directas. |
| src/shared/contracts.ts | Tipos compartidos de DOCUMENTACION. |
| src/server/services/ | CU01, CU02 y CU03; CU02 puro separado de la orquestación. |
| src/server/repositories/ | Prisma, consultas y transacciones. |
| src/components/ | Componentes React; dashboard-home es una maqueta. |
| prisma/ | Esquema, futuras migraciones y seed de T02. |
| templates/ | Encabezado CSV y ejemplo contractual. |
| tests/ | Pruebas por implementar. |

## API acordada

| Método | Ruta | Operación |
| --- | --- | --- |
| POST | /api/importaciones/validar | CSV → vista previa temporal |
| POST | /api/importaciones/[id]/confirmar | Confirmación transaccional |
| DELETE | /api/importaciones/[id] | Cancelar vista previa |
| GET | /api/procesamientos/[jobId] | Consultar procesamiento |
| POST | /api/procesamientos/[jobId]/reintentar | Recuperar trabajo |
| GET | /api/evaluaciones | Resultados y estados por empleado/semana |
| GET | /api/evaluaciones/[evaluationId] | Informe individual |
| GET | /api/resumen | Conteos y promedio |
| GET | /api/alertas | Alertas internas vigentes |

Las carpetas reservadas NO implementan estos endpoints. No añadir una API pública para calcular CU02 por empleado: confirmar dispara el procesamiento de servidor. Consultar un informe no crea alertas.

## Reservas para etapas posteriores

Login/auth, audit, rules-config, employees, my-data e integrations se conservan como reservas. No bloquean P0. Eliminar archivos .gitkeep no equivale a eliminar una funcionalidad: las reservas antiguas de API se reemplazaron por los nombres acordados.

No existe autenticación implementada por usar un grupo de rutas llamado (dashboard). P0 solo se usa localmente con datos ficticios.

## Contratos

[Contratos y pruebas](contratos-prototipo.md) contiene tipos, entradas/salidas, estados y ejemplo. CU02 y sus fórmulas se rigen por DOCUMENTACION. Si cambia la fuente, sincronizar el repositorio antes de integrar. La entrega PDF y Docs/DashboardCode.md son antecedentes, no sustituyen el contrato vigente.
