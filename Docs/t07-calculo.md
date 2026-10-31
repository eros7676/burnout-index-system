# T07 · Motor matemático CU02 y ranking

`NexusProject/nexus-project/src/server/services/calculo.ts` implementa la firma de
`ServiciosPrototipo.calcularEvaluacion` de T01. Sigue DOCUMENTACION (CU02 §§4.2–4.6
y tarjeta T07) y reutiliza la validación pura de configuración de T09.

```ts
import { calcularEvaluacion } from "./src/server/services/calculo";

const calculo = calcularEvaluacion(actual, anterior, reglas);
```

Recibe `RegistroLaboral` confirmado, antecedente o `null`, y `ConfiguracionIndice`.
Devuelve `Calculo`: índice, indicadores HE/DS/CT/VP, scores, contribuciones,
ranking, excedidas, nivel y explicación de persistencia. No usa base de datos,
reloj, estado global ni APIs de Next.js, y no modifica las entradas.

- CT usa el total semanal incluidas tareas completadas. Si A=P=V=0 devuelve cero;
  otras relaciones que incumplen 0 ≤ V ≤ P ≤ A lanzan `ErrorDominio`.
- Score = min(100, 50 × valor / umbral), contribución = peso × score. Solo el
  índice final se redondea, con la expresión contractual de CU02.
- El ranking usa contribuciones sin redondear; desempata HE → DS → CT → VP.
  No expresa causalidad clínica. Excedida significa valor estrictamente mayor al umbral.
- Sin semana inmediatamente anterior: INCOMPLETO con índice numérico, incluso cero.
  Un antecedente válido más antiguo se considera hueco. Un empleado diferente,
  un antecedente inválido o un período igual/posterior producen error de contrato.
- La semana anterior se puntúa con las reglas actuales, aunque estas hayan comenzado
  a regir después de esa semana. BAJO < corte medio; ALTO exige ambos índices ≥ corte
  alto y el mínimo configurado de factores comunes excedidos; el resto es MEDIO.
- Las entradas inválidas lanzan `ErrorDominio` con código CONTRATO_INVALIDO o
  CONFIGURACION_INVALIDA; no se convierten en un nivel ni generan una evaluación.

T08 debe seleccionar la versión aplicable más reciente, consultar el antecedente,
guardar snapshots/huella/historial y gestionar vigencia. CU01 valida catálogo,
cobertura y semana cerrada. El motor no consulta estos datos ni confirma importaciones.
Las rutas, informes, alertas y su conexión al tablero corresponden a otras tareas.

## Verificación sin MySQL

Desde `NexusProject/nexus-project`, después de `npm ci` y `npm run db:generate`
(este último requiere DATABASE_URL con formato válido, sin conectar a la base):

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

`tests/calculo.test.ts` cubre el ejemplo 83,71 y 91,21, ceros, igualdad con umbrales,
saturación, tareas completadas, ranking y desempates antes del redondeo,
39,99/40/69,99/70, persistencia, picos, huecos, reglas nuevas, cortes/mínimo
configurables, entradas inválidas y determinismo con entradas congeladas.
También ejecuta el motor real contra las 138 filas y resultados esperados de T03,
sin modificar los fixtures ni duplicar su oráculo.

Validación en esta rama (31/10/2026, Node 24.19.0): 32 pruebas sin MySQL aprobadas,
incluidas 10 pruebas T07. No se requieren migraciones nuevas para esta tarea.
