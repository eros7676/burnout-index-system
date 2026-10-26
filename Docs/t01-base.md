# T01 · Base y contratos compartidos

La raíz ejecutable es `NexusProject/nexus-project`. Se conserva Next.js App Router con TypeScript estricto, alias `@/*`, ESLint, lockfile y `.env.example`. Las tres capas son vistas/Route Handlers, servicios de negocio y repositorios Prisma. Los contratos no importan Next.js ni Prisma.

## Instalación y verificación

Desde esa carpeta, con Node >=20.9 (recomendado Node 22) y npm:

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

Abrir `http://localhost:3000` o `/home` para ver la maqueta existente. Para T01 no hace falta levantar MySQL. Los `.env.example` de raíz y aplicación ya contienen valores ficticios de desarrollo: copiar cada uno a `.env` antes de trabajar con Docker/Prisma según el README. No versionar secretos. Las variables de MySQL nunca llevan prefijo `NEXT_PUBLIC_`.

La CI ejecuta instalación limpia, lint, typecheck, pruebas, build y validación del esquema Prisma. `npm test` compila y descubre pruebas TypeScript usando el runner de Node; no instala otro framework. La carpeta generada `.test-build` se ignora y no se publica.

## Una fuente de tipos para cada módulo

- `src/shared/contracts.ts`: todos los DTO de Contratos y pruebas, más los tipos derivados de filtros, paginación, cancelación y rechazo de validación.
- `src/shared/services.ts`: las seis firmas obligatorias de CU01/CU02/CU03. `ServiciosPrototipo['calcularEvaluacion']`, por ejemplo, permite tipar el motor de T07 sin copiar su firma. Es una interfaz, sin implementaciones de negocio.
- `src/shared/api.ts`: `API_ROUTES`, `PeticionesApi`, `CuerposExito`, `RespuestaApi`, defaults de paginación y estados HTTP. Especifica las nueve operaciones P0; no crea endpoints.
- `src/shared/errors.ts`: `ErrorDominio`, códigos de fila y warning. Los códigos adicionales de contrato/configuración/reproceso identifican errores técnicos; no son niveles de riesgo.
- `src/shared/mocks.ts`: respuestas tipadas con `satisfies`, basadas en el ejemplo de dos semanas, más escenarios de presentación.

Ejemplo para un consumidor de T06/T14:

```ts
import type { InformeDTO } from '@/shared/contracts';
import { crearRespuestaMock } from '@/shared/mocks';

const respuesta = crearRespuestaMock('obtenerInforme');
if (respuesta.status === 200) {
  const informe: InformeDTO = respuesta.body;
  console.log(informe.evaluacion.indice); // 91.21, dato fijo de prueba
}
```

`crearRespuestaMock` devuelve una copia independiente y serializable. No hace fetch, no valida un CSV, no persiste y no simula efectos de confirmación/cancelación entre llamadas. Sus fechas e identificadores `mock-*` son fijos: no sirven como importaciones reales ni como huellas SHA-256. Las pantallas funcionales deberán reemplazar este proveedor explícito por la API de T04/T13. La maqueta actual conserva sus propios datos visuales y sigue identificada como tal.

Mocks disponibles: éxito para cada operación; `validacionRechazadaMock` (422 con vista previa); `confirmacionFallidaMock` (200, carga confirmada y job fallido); `importacionRepetidaMock` (sin nuevos afectados); `filasEscenarioMock` (cuatro niveles más pendiente/fallido); `resumenVacioMock`; y `errorContratoMock`. Los escenarios de presentación adicionales son independientes del ejemplo integral y no se suman a su resumen.

## Reglas de integración

Validar conserva una vista previa temporal durante 30 minutos; confirmar debe guardar datos y job atómicamente. Después del commit, el servidor procesa CU02 → alerta CU03 → informe para todos los niveles. Un 200 al confirmar puede contener un job FALLIDO: la UI debe inspeccionar `procesamiento.estado`. INCOMPLETO conserva un índice numérico y significa falta de semana anterior; un fallo técnico se expresa en el job. GET del informe no crea alertas. El procesamiento incluye pares nuevos y sus sucesores inmediatos existentes.

Las rutas exactas están en `API_ROUTES` y en [arquitectura](arquitectura.md). La validación recibe `multipart/form-data` con campo `file`. Confirmación y reintento reciben `{}` JSON; DELETE y GET no llevan cuerpo. GET evaluaciones admite employeeId/teamId/periodStart/nivel/page/pageSize, alertas los mismos sin nivel, y resumen solo employeeId/teamId/periodStart. Defaults: page=1, pageSize=50, máximo 100. El resumen no recibe filtro nivel para conservar el denominador. Orden de evaluaciones: período descendente y empleado ascendente; alertas: createdAt descendente y alertId ascendente. Los filtros y su validación real se implementan en T13.

Errores públicos: `{ error: { codigo, mensaje, detalles } }`; validación de filas inválidas usa 422 `{ vistaPrevia, error }`. El resto de estados y semántica figuran en [Contratos y pruebas](contratos-prototipo.md). `ErrorDominio.toApiError()` expone solo código, mensaje y detalles; los adaptadores de T04/T08 eligen el estado HTTP y no deben exponer stack ni errores de infraestructura. No se añaden permisos P1 ni autenticación productiva a P0.

## Límite de esta tarea

T01 deja la base compilable, contratos importables, mocks y pruebas base. La revisión del acuerdo CU02 por Eros y la revisión del PR siguen siendo pasos humanos. T02 implementará modelos/migraciones/seed, T04/T13 los endpoints y T07/T08 el motor e historial. Las pruebas actuales comprueban el acuerdo de los fixtures, no certifican esas funcionalidades futuras. El P0 completo sigue pendiente.
