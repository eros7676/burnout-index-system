# T10 · Informe individual

Construye el `InformeDTO` desde una evaluación ya guardada por T08. No calcula el índice, no publica otra evaluación y no crea ni supera alertas. Las rutas HTTP quedan en T13.

## Estado de integración

El servicio está implementado y verificado con evaluaciones persistidas, incluidos historial y alertas de T11. T04 solicita el informe al procesar cada par y T13 expone el detalle. El [tablero T14](t14-tablero.md), implementado localmente en `t14-feature`, muestra su ranking, reglas, persistencia y alerta. La aceptación integral y la prueba de comprensión por un operador siguen en T16.

## Uso

El procesamiento T16 puede usar `construirInformePublicado(db, evaluacion)` exclusivamente con la evaluación devuelta por una publicación ya confirmada. Reutiliza ese DTO en memoria y consulta empleado/alerta, evitando releer y decodificar el snapshot recién guardado. El informe de procesamiento se usa para comprobar su construcción; no se almacena otra copia ni se expone como resultado actual. Las consultas públicas y el detalle histórico continúan usando `construirInforme(db, evaluationId)` y leen la evaluación desde la base. El punto de inyección de fallos de T04 conserva su firma y se ejecuta también después de publicar.

`construirInforme` recibe el cliente Prisma, igual que las lecturas de T08. La firma de `ServiciosPrototipo` sigue siendo `construirInforme(evaluationId)`.

```ts
import { construirInforme } from "./src/server/services/informes";

const informe = await construirInforme(db, evaluationId);
```

- La evaluación sale de `obtenerEvaluacion`. Un id inexistente lanza `ErrorDominio` con código `NO_ENCONTRADO`. T13 puede traducirlo a 404.
- Índice, nivel, versión, ranking, persistencia y `vigente` son los de esa fila, también si ya no es la vigente.
- Valores y umbrales salen del snapshot guardado. Una regla posterior no cambia el informe histórico.
- `factores` sigue el ranking guardado. `excedido` usa la lista guardada.
- `explicacion` nombra el nivel guardado. Un índice de 70 o más con persistencia que no sostiene ALTO se explica como MEDIO. INCOMPLETO conserva el índice numérico. El texto dice que no es un diagnóstico.
- `recomendaciones` está en `recomendaciones.ts`, puro y sin lectura de base, para que T11 pueda reutilizarlo. Son sugerencias de revisión humana, una por factor excedido y en el orden del ranking. Si no hay factores excedidos, hay una sola frase que no pide una acción automática.
- `alerta` es la fila persistida de esa evaluación, con vigencia ACTIVA o SUPERADA, o `null` si no hay alerta. T11 la crea durante el procesamiento; esta lectura no la genera.
- El empleado sale del catálogo: nombre, equipo y tipo. No se agrega un snapshot de empleado al contrato.

## Verificación

Desde `NexusProject/nexus-project`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`informes.test.ts` entra en `npm test`. `informes.mysql.test.ts` entra en `npm run db:test` y exige `TEST_DATABASE_URL` de una base cuyo nombre termine en `_test`.
