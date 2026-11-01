# T11 · Alertas internas

Crea la alerta de CU03 cuando la evaluación vigente es `ALTO`. No recalcula el índice, no arma el informe y no envía correo. Las rutas GET quedan en T13 y el canal simulado en T12.

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
- `canal` queda en `INTERNO` y `estadoEnvio` en `NO_APLICA`.
- Un técnico avisa a su Team Lead (`EMP-001` → `TL-01`). Un Team Lead avisa a Gerencia (`TL-01` → `GER-01`).
- Si no hay ese responsable, la alerta se guarda con `destinatarioId` null y `motivoDestinatario` `SIN_DESTINATARIO`. Esa fila es la incidencia visible.
- `causas` son los factores excedidos, en el orden del ranking. `sugerencias` salen de `recomendacionesDe`.
- T08 marca `SUPERADA` la alerta de la evaluación anterior antes del adaptador. Si la evaluación nueva no es `ALTO`, no nace otra alerta `ACTIVA`.
- Un id inexistente lanza `ErrorDominio` con código `NO_ENCONTRADO`.
- Si el adaptador falla, la transacción revierte la evaluación, el puntero y la alerta. El reintento puede completarla sin duplicar.

`construirInforme` solo lee la fila. Una consulta del informe no crea la alerta.

## Verificación

Desde `NexusProject/nexus-project`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`alertas.test.ts` entra en `npm test`. `alertas.mysql.test.ts` entra en `npm run db:test` y exige `TEST_DATABASE_URL` de una base cuyo nombre termine en `_test`.
