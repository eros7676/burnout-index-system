# T11 · Alertas internas

Crea la alerta de CU03 cuando la evaluación vigente es `ALTO`. No recalcula el índice, no arma el informe y no envía correo. Las rutas GET quedan en T13 y el canal simulado en T12.

## Estado de integración

El servicio está implementado y verificado con T08/T10 y MySQL, incluida la publicación atómica, el rollback y la concurrencia. T04 (PR #11) agrega la conexión desde confirmación y reintento HTTP, con pruebas de integración. T13/T14 cubren consulta y visualización, y T16 verifica el circuito completo con interfaz.

## Uso

`crearAlertaSiCorresponde` recibe el cliente Prisma, igual que T08 y T10. La firma de `ServiciosPrototipo` sigue siendo `crearAlertaSiCorresponde(evaluationId)`.

Durante el procesamiento, T04 pasa el adaptador en la misma transacción que publica la evaluación:

```ts
import { alPublicarAlerta } from "./src/server/services/alertas";
import { evaluarPeriodo } from "./src/server/services/evaluaciones";

const evaluacion = await evaluarPeriodo(db, par, {
  alPublicar: alPublicarAlerta,
});
```

- Solo un nivel `ALTO` vigente inserta una fila en `Alerta`. `BAJO`, `MEDIO` e `INCOMPLETO` no insertan nada, aunque el índice supere 70.
- La fila es única por `evaluationId`. Repetir la publicación o la función devuelve la misma alerta.
- Las llamadas concurrentes al mismo ID se serializan con un bloqueo exclusivo antes de leer la evaluación y la alerta. Los conflictos `P2034` y los deadlocks MySQL `1213` expuestos como `P2010` reintentan la transacción completa, con un máximo de tres intentos; otros errores se propagan.
- `canal` queda en `INTERNO` y `estadoEnvio` en `NO_APLICA`.
- Un técnico avisa a su Team Lead (`EMP-001` → `TL-01`). Un Team Lead avisa a Gerencia (`TL-01` → `GER-01`).
- Si no hay ese responsable, la alerta se guarda con `destinatarioId` null y `motivoDestinatario` `SIN_DESTINATARIO`. Esa fila es la incidencia visible.
- `causas` son los factores excedidos, en el orden del ranking. `sugerencias` salen de `recomendacionesDe`.
- T08 marca `SUPERADA` la alerta de la evaluación anterior antes del adaptador. Si la evaluación nueva no es `ALTO`, no nace otra alerta `ACTIVA`.
- Un id inexistente lanza `ErrorDominio` con código `NO_ENCONTRADO`.
- Si el adaptador falla, la transacción revierte la evaluación, el puntero y la alerta. El reintento puede completarla sin duplicar.

`construirInforme` solo lee la fila. Una consulta del informe no crea la alerta.

## Integración con T04

La publicación de T08 admite un callback opcional; T04 pasa `alPublicar: alPublicarAlerta` en cada publicación del procesamiento y sus reintentos. Sin ese callback la publicación guarda la evaluación, pero no crea automáticamente su alerta. Las pruebas T11 verifican el callback directamente; `importaciones.mysql.test.ts` verifica también su invocación desde HTTP y `db:test:http` recorre el build real de Next.js. Ver [guía T04](t04-importaciones.md).

La confirmación de CU01 inserta registros y job en una transacción. Después, cada par se evalúa mediante T08 con el adaptador de T11 dentro de la transacción de publicación de ese par. T04 solicita el informe T10 y solo entonces cuenta el par como completado. Si falla T11, se revierte la publicación de ese par; la importación sigue CONFIRMADA y los pares ya completados se conservan. T04 registra el fallo del job fuera de la transacción revertida y permite reintentarlo según el contrato.

Criterios de aceptación cubiertos por las pruebas locales de T04, sobre una base aislada con migración y seed:

- Validar y confirmar por HTTP `templates/ejemplo-dos-semanas.csv`: dos registros y dos evaluaciones, primera INCOMPLETO con 83,71 y segunda ALTO con 91,21; job COMPLETADO.
- Comprobar una sola alerta ACTIVA de la segunda evaluación, dirigida a TL-01, con canal INTERNO y estado NO_APLICA. El informe debe leer esa misma alerta.
- Repetir el mismo `importId`: devolver el resultado original sin nuevos registros, evaluaciones ni alertas. Revalidar el archivo idéntico como otra carga debe omitir sus filas y confirmar sin trabajo nuevo.
- Inyectar un fallo de T11 desde la prueba de integración: conservar la carga CONFIRMADA, dejar el job FALLIDO y revertir la publicación del par fallido. Reintentar por la API debe terminar el job sin duplicar resultados ni alertas.
- Comprobar que T04 procesa también los sucesores inmediatos afectados y usa el mismo adaptador al reintentar. Si una evaluación sustituye otra, la alerta antigua queda SUPERADA y solo nace otra ACTIVA si la nueva es ALTO.

En T10/T11, la comprobación del callback desde HTTP se registró como dependencia de T04. T04 aporta esa evidencia (PR #11).

## Verificación

Desde `NexusProject/nexus-project`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`alertas.test.ts` entra en `npm test`. `alertas.mysql.test.ts` entra en `npm run db:test` y exige `TEST_DATABASE_URL` de una base cuyo nombre termine en `_test`.

Las pruebas cubren seis creaciones concurrentes de la misma alerta, publicaciones concurrentes con T08, reemplazo ALTO por ALTO, ausencia de alertas tardías para evaluaciones históricas, rollback y los reintentos acotados de deadlock. La regresión concurrente reproduce `P2010`/`1213` con la implementación anterior.

Verificación de la corrección: lint, typecheck y build predeterminado con Turbopack correctos; 45 pruebas sin MySQL y 39 con MySQL aprobadas. La suite SQL se ejecutó sobre una base aislada con la migración T02, sin modificar la base de la aplicación.
