# T13 · API de consultas y resultados

T13 está integrado en `main`. Expone resultados persistidos de T04/T08/T10/T11, consumidos por el [tablero T14](t14-tablero.md). No agrega pantallas, cálculo público, autenticación ni permisos P1.

## Rutas

- `GET /api/evaluaciones`: `Pagina<FilaTablero>`. Filtros opcionales `employeeId`, `teamId`, `periodStart` y `nivel`. Orden por semana descendente y empleado ascendente. Incluye cada registro vigente confirmado aunque todavía no tenga evaluación o su procesamiento haya fallado.
- `GET /api/evaluaciones/{evaluationId}`: `InformeDTO` de T10, con factores, explicación, snapshot y alerta existente. Admite versiones históricas: `vigente=false` y alerta SUPERADA cuando corresponda. No admite filtros.
- `GET /api/resumen`: `ResumenDTO`. Solo `employeeId`, `teamId`, `periodStart`; rechaza paginación y filtro por nivel para conservar el denominador.
- `GET /api/alertas`: `Pagina<Alerta>`. Filtros `employeeId`, `teamId`, `periodStart`. Solo ACTIVA asociada a evaluación vigente y actualizada. Orden por creación descendente y alertId ascendente.

Listados: `page=1`, `pageSize=50`, máximo 100. Una página fuera del rango devuelve `items=[]` y conserva `total`. Los filtros combinados usan AND; un identificador válido sin coincidencias produce una lista vacía. Parámetros desconocidos, repetidos, vacíos o mal formados devuelven 400. Los identificadores admiten letras ASCII, números, guion y guion bajo (máximo 64 caracteres, 36 para evaluationId). `periodStart` debe ser una fecha ISO real que sea lunes. `nivel`: BAJO, MEDIO, ALTO o INCOMPLETO, en mayúsculas.

Respuestas JSON con `Cache-Control: no-store`. Errores `ApiError`: 400 petición inválida, 404 evaluación inexistente, 500 fallo técnico sin detalles de conexión/Prisma. El resumen sin resultados usa conteos y porcentajes cero, promedio null y muestra cero.

## Vigencia y procesamiento

`actualizado` compara la huella esperada del registro vigente, antecedente inmediato, reglas aplicables y motor con la evaluación que señala el puntero vigente. Se reutilizan conversiones y huella T08, sin persistir resultados durante GET. Las fuentes, reglas y respuestas se leen bajo una instantánea Repeatable Read, incluido el detalle individual.

Si no existe evaluación, `evaluationId`, `indice` y `nivel` son null. Si existe una evaluación desactualizada, se conservan su ID, índice y nivel para identificar el resultado previo, pero `actualizado=false`, se oculta su alerta y no coincide con el filtro `nivel`. **T14 debe señalar ese resultado como desactualizado y no presentarlo como el nivel actual.** El detalle por ID conserva el snapshot original.

`processingState` corresponde al par del trabajo más reciente por creación (desempate jobId), no al estado global del job. Un par COMPLETADO se conserva aunque falle otro par. Un resultado obsoleto cuyo par figuraba completo se presenta PENDIENTE. Un par PROCESANDO con lease vencido se presenta PENDIENTE usando el reloj UTC de MySQL, sin actualizar el trabajo. Un fallo al construir el informe puede dejar una evaluación actualizada con par FALLIDO: son conceptos separados.

Resumen: cuenta solo evaluaciones actualizadas; `noProcesados` cuenta registros sin evaluación actualizada. El promedio incluye índices numéricos de todos los niveles, también INCOMPLETO; `muestraPromedio=totalEvaluaciones`. Porcentajes y promedio se redondean a dos decimales. Los porcentajes usan las evaluaciones actualizadas como denominador. No se vuelven a incluir resultados antiguos durante una reevaluación pendiente.

El repositorio hace lecturas por lotes de períodos, antecedentes y reglas; filtra por vigencia antes de paginar para que `total` sea correcto. Está orientado al volumen P0 local. No se certifican aquí los objetivos de carga/rendimiento de T16 ni escalabilidad del sistema final.

## Comprobación

Desde `NexusProject/nexus-project`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
# Base MySQL aislada migrada, cuyo nombre termine en _test.
$env:TEST_DATABASE_URL='mysql://USUARIO:CLAVE@127.0.0.1:PUERTO/burnout_t13_test'
npm run db:test
npm run db:test:http
```

Las pruebas T13 cubren filtros estrictos, errores uniformes, listas vacías, cuatro niveles, paginación, resumen, datos/antecedentes/motor/reglas obsoletos, estados por par, leases y alertas históricas. Los fixtures MySQL usan un empleado propio y limpian sus importaciones/resultados. `db:test:http` inicia el servidor del build real y comprueba las cinco rutas T04 y cuatro rutas T13 con el ejemplo contractual. Requiere las semanas del ejemplo de EMP-001 vacías y limpia los resultados que creó.

Ejemplos con el servidor iniciado:

```text
/api/evaluaciones?teamId=EQ-01&periodStart=2026-10-12&page=1&pageSize=20
/api/evaluaciones?employeeId=EMP-001&nivel=ALTO
/api/resumen?teamId=EQ-01&periodStart=2026-10-12
/api/alertas?employeeId=EMP-001
```

## Evidencia local · 01/11/2026

Lint, typecheck y build de producción aprobados. Pasaron 60 pruebas sin MySQL y 65 con MySQL en la base aislada `burnout_t13_test`, además de las nueve rutas HTTP T04/T13 del servidor Next.js real. La regresión de T06 pasó sus ocho escenarios de navegador, incluido Chromium con API/MySQL reales. Se verificaron todos los niveles, resumen, filtros, paginación, historial, cambios de datos/antecedentes/reglas/motor y leases activos/vencidos. Los escenarios limpiaron sus resultados y se detuvo el contenedor descartable al terminar. No se modificó `.env` ni la base de la aplicación.
