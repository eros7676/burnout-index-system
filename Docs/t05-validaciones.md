# T05 · Validaciones de importación y duplicados

T05 implementa la lectura, normalización y validación del CSV de CU01, con cotejo
de catálogo e histórico. No guarda importaciones ni implementa endpoints: la vista
previa persistida, su vencimiento y la confirmación atómica corresponden a T04.
No modifica los contratos públicos, el esquema ni los fixtures de T03.

## Uso desde T04

Desde la raíz de la aplicación (`NexusProject/nexus-project`):

```ts
import { validarCsvImportacion } from "./src/server/services/validacion-importacion";
import { fuenteValidacionPrisma } from "./src/server/repositories/validacion-importacion";

const resultado = await validarCsvImportacion(
  new Uint8Array(await archivo.arrayBuffer()),
  fuenteValidacionPrisma(db),
  new Date(),
);
```

`resultado` incluye `sourceHash`, estado, cantidades, primeras diez filas válidas,
errores, warnings y `filasNuevas` con datos normalizados, huella y fila de origen.
Si existe cualquier error, `filasNuevas` está vacío, aunque las cantidades describan
filas individualmente válidas. No interpretar `nuevas` como permiso para insertar.
T04 añade `importId` y `expiresAt` para construir la `VistaPrevia` contractual.

`leerCsvImportacion(bytes)` permite separar el parseo; devuelve `sourceHash` y
`filas` con celdas y números de línea. `validarFilasImportacion(filas, fuente, ahora)`
permite repetir todas las validaciones. T04 puede conservar esas filas parseadas
en su almacenamiento temporal para revalidar al confirmar.

En confirmación T04 debe volver a validar contra el catálogo e histórico actuales
usando `fuenteValidacionPrisma(tx)` dentro de su transacción. Debe además proteger
la concurrencia (aislamiento, restricciones y tratamiento de carreras) al insertar:
una lectura de T05 sola no garantiza atomicidad ni exclusión. Un conflicto nuevo
se traduce a 409, sin inserciones parciales; la validación inicial rechazada es 422.
No volver a confirmar ni procesar un `importId` ya confirmado.

La interfaz interna `FuenteValidacion` permite inyectar lecturas por lote sin
Prisma en las pruebas. El adaptador Prisma solo lee empleados y el registro vigente
de períodos confirmados. No crea empleados ni sustituye registros históricos.

## Reglas

- CSV UTF-8 estricto, comas, BOM, LF/CRLF y comillas escapadas/multilínea; ignora
  filas completamente vacías. Máximo 5 MiB y 1.000 filas de datos. Encabezados
  canónicos recortados, sin repetidos ni desconocidos; nueve obligatorios.
- Trim de celdas, IDs sensibles a mayúsculas, fechas reales YYYY-MM-DD, lunes a
  domingo separados por seis días. El domingo debe haber terminado en
  `America/Argentina/Buenos_Aires`; el reloj es inyectable.
- Números decimales finitos con punto, sin fórmulas, notación exponencial, hex ni
  separadores de miles. No redondea métricas; normaliza -0 a 0 y auxiliares vacíos
  o ausentes a null. Enteros no negativos; rechaza desbordamiento del Int de MySQL
  (máximo 2147483647) antes de intentar persistir. DS puede superar siete.
- Horas entre 0 y 168; HE no supera horas trabajadas si están presentes. Más de
  40 extra o 80 trabajadas genera HORAS_EXTREMAS. El warning no elimina errores.
- `vencidas ≤ pendientes ≤ activas`. Empleado existente, activo y evaluable
  (TECNICO/TEAM_LEAD y en cobertura).
- Duplicado interno por empleado/período: error, incluso con datos idénticos.
  Histórico vigente idéntico: omitido. Diferente: CONFLICTO_HISTORICO.
- `fingerprintDatos` calcula SHA-256 del JSON con las claves camelCase en el orden
  contractual. `sourceHash` usa los bytes originales y no decide la duplicación.

Los errores de fila usan `ErrorCampo` y los códigos existentes. Los errores previos
a la vista previa lanzan `ErrorFormatoImportacion` (subclase de `ErrorDominio`,
código CONTRATO_INVALIDO), con `estadoHttp` 400 o 413 y detalles cuando corresponda.
T04 debe limitar la carga antes de leerla completa y comprobar que se ofrece CSV
(415 para otro formato); T05 comprueba el contenido, no un nombre o MIME de archivo.

## Verificación

`npm test` incorpora automáticamente las pruebas T05 sin MySQL. Cubre fixtures T03,
normalización, conflictos, errores, límites, fechas/cierre, warnings y revalidación.
`npm run db:test`, con TEST_DATABASE_URL de una base migrada terminada en `_test`,
incorpora una prueba real del adaptador y confirma ausencia de escrituras durante
la validación. Sus fixtures se revierten en una transacción incluso ante error.

La confirmación, idempotencia de escrituras, HTTP y circuito completo se verifican
en T04/T16, no se dan por implementados con estas validaciones.

Evidencia local del 31/10/2026: 44 pruebas sin MySQL aprobadas, lint completo y
typecheck correctos. Build verificado con `next build --webpack`. El build por
defecto no pudo completar: primero falló la descarga de fuentes sin red y, con
red, Turbopack reportó un fallo interno al iniciar el proceso de CSS. No se cambió
la configuración de compilación. El fallo de Turbopack también se reprodujo con
Node 24.22.1, incluyendo sus procesos auxiliares mediante PATH temporal.

Con Docker disponible se creó la base aislada `burnout_t05_test` en `nexus_db`
(MySQL 8.0, puerto local 3307), se aplicó la migración T02 y se ejecutó la suite
MySQL completa: **24 pruebas aprobadas, cero fallos**, incluida T05. La primera
ejecución detectó un fixture T05 sin equipo; se corrigió creando un equipo aislado
dentro de la misma transacción revertida. Se comprobó catálogo, registro vigente,
omisión, conflicto, empleado desactivado y ausencia de escrituras de validación.
La base de la aplicación `nexus_workload` no se modificó.

Verificación posterior: el build predeterminado con Turbopack también pasó,
incluida una ejecución con caché vacía. El [diagnóstico de Turbopack](turbopack-diagnostico.md)
registra el error de conexión local EACCES observado en el worker y las pruebas
de recuperación, sin cambios de CSS ni configuración.
