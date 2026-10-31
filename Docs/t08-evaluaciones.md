# T08 · Evaluaciones, vigencia e historial

Implementación de la tarjeta T08 y CU02 §§4.4–4.6 de DOCUMENTACION, sobre T02/T07/T09.
Usa el esquema existente: no agrega migraciones ni modifica los contratos públicos.

## Servicios disponibles

`src/server/services/evaluaciones.ts` recibe un `PrismaClient` explícito. Las rutas
pueden pasar el cliente de `src/lib/db.ts`; las pruebas usan un cliente exclusivo.

```ts
import { evaluarPeriodo, obtenerEvaluacion } from "./src/server/services/evaluaciones";

const evaluacion = await evaluarPeriodo(db, {
  employeeId: "EMP-001", periodStart: "2026-10-12", periodEnd: "2026-10-18",
});
const detalle = await obtenerEvaluacion(db, evaluacion.evaluationId);
```

- `evaluarPeriodo`: selecciona el registro vigente confirmado, la semana exactamente
  siete días anterior y la regla de mayor `effectiveFrom` aplicable al inicio actual.
  Delega toda la matemática en T07, incluyendo clasificar y puntuar el antecedente
  con las reglas actuales. Sin antecedente conserva índice numérico e INCOMPLETO.
- `prepararEvaluacion` / `publicarEvaluacion`: permiten separar lectura y publicación.
  La segunda vuelve a leer las entradas; si cambió un registro, su versión, la regla
  aplicable o el antecedente/ausencia, rechaza con `REQUIERE_REPROCESO`.
- `obtenerParesAfectados(tx, nuevos)`: unión sin duplicados de nuevos y sucesores
  inmediatos ya existentes, ordenada por empleado/fecha. Incluye sucesores nuevos
  del mismo lote si se llama después de insertarlo dentro de la transacción de T04.
- `evaluarAfectados`: calcula esos pares en orden, un commit por par. Se detiene al
  primer error; conserva los resultados ya publicados. No recalcula W+2 por la
  llegada tardía de W, porque la persistencia usa índices y no el nivel previo.
- `obtenerEvaluacion`: detalle guardado o null, incluyendo resultados históricos.
  `vigente` deriva del puntero del período; no se almacena como booleano en versiones.
- `evaluacionActualizada`: comprueba si el resultado vigente sigue correspondiendo
  a los datos/antecedentes/reglas actuales. Una regla nueva puede dejar un vigente
  desactualizado hasta reprocesarlo. T13 debe mostrar esa distinción.

## Huella, snapshots y atomicidad

La huella SHA-256 incluye el registro actual completo, antecedente completo o null,
snapshot de reglas y `engineVersion=cu02-v1`. La serialización ordena claves para
que el orden de propiedades JSON no cambie la identidad. No incluye job ni hora de
procesamiento. La clave única período/huella reutiliza evaluaciones en reintentos.

Cada publicación guarda resultado y snapshots inmutables, enlaza
`supersedesEvaluationId`, actualiza `evaluacionVigenteId` y supera la alerta de la
evaluación anterior en una transacción SERIALIZABLE. No borra versiones previas.
Las lecturas bloquean filas y rangos, incluida la ausencia de antecedentes/reglas,
hasta el commit. Los conflictos transitorios P2034 se reintentan hasta tres veces;
un snapshot obsoleto se rechaza, sin volverlo vigente silenciosamente.

Un error de cálculo, contrato, configuración o persistencia lanza una excepción y
revierte la publicación; nunca se representa como BAJO ni INCOMPLETO técnico.

### Precisión de las columnas JSON

Prisma 6 recorta algunos números de `InputJsonValue` a 15 cifras; además el parseo
de JSON numérico de MySQL puede cambiar una unidad de precisión. Esto fue comprobado
con `28.999999999999996`, `13.333333333333334` y `9.333300000012345`.

Para conservar exactamente los `number` de T07, **las columnas JSON de Evaluacion**
usan el sobre interno `{cu02JsonV1: "<texto JSON completo>"}`. El repositorio lo
codifica/decodifica, valida el snapshot y comprueba resultado/huella antes de devolver
el DTO. Los consumidores deben usar `obtenerEvaluacion` o `evaluacionDesdeDb`, no
exponer filas Prisma ni consultar directamente propiedades dentro del sobre.
El DTO público conserva números, objetos y arrays de T01. El índice continúa como
DECIMAL(5,2) y se devuelve como number. No cambia el almacenamiento de otras tablas.

## Integración con T04, T10 y T11

T08 no implementa las rutas de importación, reclamo/renovación del job, informes ni
generación de alertas de las otras tarjetas. Expone el punto de integración:

```ts
await evaluarPeriodo(db, par, {
  propietario: { jobId, ownerToken },
  alPublicar: async (tx, evaluacion) => {
    // Adaptador de CU03: usar este tx para asegurar la alerta única de T11.
    // T10 construye el informe de la evaluación; no hay una tabla Informe.
  },
});
```

Cuando T04 ejecute un job debe pasar siempre `propietario`. T08 exige job PROCESANDO,
token coincidente, lease vigente y pertenencia del par; bloquea el job durante la
publicación y comprueba nuevamente el vencimiento después de CU03. Un ejecutor que
perdió el permiso no publica ni cambia estados. Sin propietario, el servicio sirve
para procesamiento explícito local fuera de jobs.

`alPublicar` se ejecuta también al reutilizar una evaluación: debe ser idempotente y
usar exclusivamente el tx recibido, sin correo ni IO externo. Si falla, evaluación,
puntero y cambio de alerta se revierten juntos. El reintento puede completar CU03 sin
duplicar resultados. Sin adaptador, T08 guarda solo la evaluación y supera la alerta
anterior; no inventa informes ni alertas nuevas.

T04 conserva los pares del job, reclama/renueva su lease de 120 segundos y registra
FALLIDO/par/código fuera de la transacción que falló. Solo marca un par COMPLETADO
cuando evaluación y CU03 terminaron. `evaluarAfectados` es una conveniencia para
procesar listas; no sustituye ese protocolo persistido ni marca jobs completos.

## Verificación reproducible

Desde `NexusProject/nexus-project`, con dependencias y cliente Prisma generados:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Para pruebas reales usar una base independiente cuyo nombre termine en `_test`:

```sh
# Configurar DATABASE_URL y TEST_DATABASE_URL con la misma URL MySQL de pruebas.
npm run db:deploy
npm run db:test
```

Las pruebas no toman DATABASE_URL como fallback. Los escenarios T08 crean IDs
aleatorios y eliminan solo sus fixtures en finally; no usar una base productiva.

Evidencia del 31/10/2026: Node 24.19.0, MySQL 8.4 en contenedor local y base aislada
`burnout_t08_test`, migración T02 aplicada. **35 pruebas sin MySQL y 23 comprobaciones
MySQL aprobadas**, además de lint, typecheck y build. Incluye:

- 4 niveles guardados, snapshots, precisión completa y lectura desde otra conexión.
- Reintentos sin duplicados y dos publicaciones concurrentes con la misma huella.
- Antecedente tardío, sucesor inmediato, historial conservado y vigencia correcta.
- Regla nueva efectiva, anterior calculado con esa regla y alerta antigua superada.
- Rechazo de snapshots obsoletos por reglas, antecedentes y versiones de datos.
- Rollback de evaluación/puntero/alerta ante fallo de CU03.
- Token perdido, lease vencido y vencimiento durante la publicación.

CU03 se representa mediante adaptadores transaccionales de prueba: estos resultados
no declaran implementados T10/T11 ni el circuito HTTP/E2E de T04/T16.
