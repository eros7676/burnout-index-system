# T06 · Pantalla de carga CSV

Disponible en `/importaciones`, desde «Importar datos» o «Importación de datos» en `/` y `/home`. Requiere la instalación de MySQL, migración y seed del README. El resumen sigue siendo una maqueta: consultar resultados y mostrarlos en el tablero corresponde a T13/T14.

## Uso

1. Seleccionar un CSV y pulsar **Validar CSV**. La API T04 comprueba formato, máximo 5 MiB/1.000 filas, catálogo, semanas y duplicados. El navegador no calcula ni persiste registros laborales.
2. Revisar total, nuevas, omitidas, muestra de hasta diez filas (incluidos los campos opcionales), errores por fila/campo y advertencias. Un lote rechazado no se puede confirmar. Corregir y volver a validar; las advertencias no habilitan filas inválidas.
3. **Confirmar importación** guarda el lote. **Cancelar vista previa** elimina el temporal sin guardar registros laborales. La vista vence a los treinta minutos y obliga a validar nuevamente. Un conflicto de confirmación también exige validar otra vez.
4. Revisar por separado **Datos confirmados** y **Procesamiento**. HTTP 200 no significa que el cálculo haya terminado: un job FALLIDO conserva los datos y permite reintentar. Un archivo idéntico muestra filas omitidas y puede confirmar sin job.
5. **Consultar estado** lee el job actual. **Reintentar procesamiento** se habilita para PENDIENTE/FALLIDO; PROCESANDO debe consultarse hasta que termine o el servidor indique que es recuperable. No se hacen reintentos automáticos ni cálculos en el cliente.

Los botones quedan bloqueados durante las peticiones. Si se pierde la respuesta al confirmar, se conserva el importId y se ofrece **Recuperar confirmación**: repite el mismo identificador idempotente. No iniciar otra carga para resolver una respuesta desconocida. La confirmación repetida puede devolver una instantánea antigua, por eso se consulta además el job actual.

Se conserva únicamente el último importId pendiente de verificar o jobId en localStorage, sin el CSV ni los indicadores. Tras recargar, se puede recuperar la confirmación o consultar el job. También se admite escribir el jobId manualmente. Si el navegador bloquea el almacenamiento, conservar los IDs visibles antes de salir; no se garantiza recuperación automática entre navegadores/dispositivos. No hay listado de jobs en T06.

La interfaz usa etiquetas de formulario, estados anunciados, errores con texto, botones nativos, foco visible y tablas con desplazamiento horizontal en pantallas pequeñas. La fecha de vencimiento se presenta en la hora local del navegador; las semanas del CSV conservan sus fechas ISO.

## Verificación reproducible

Desde `NexusProject/nexus-project`:

```powershell
npm ci
npx playwright install chromium
npm run lint
npm run typecheck
npm test
npm run build
npm run test:ui
```

Playwright inicia y detiene el servidor de producción en `127.0.0.1:3106` (dejar libre ese puerto). La suite de interfaz intercepta las respuestas HTTP para reproducir fallos, vencimiento, conflictos y recuperación sin MySQL. No usa mocks en el producto. Las trazas de fallos se guardan en `test-results/`, ignorado por Git.

Para incluir el escenario de Chromium con API y MySQL reales, usar una base **aislada**, migrada, cuyo nombre termine en `_test`, sin registros laborales; no usar la base de la aplicación:

```powershell
$env:TEST_DATABASE_URL='mysql://USUARIO:CLAVE@127.0.0.1:PUERTO/burnout_t06_test'
# Aplicar previamente la migración T02 a esa base usando DATABASE_URL.
npm run test:ui
```

El servidor temporal recibe TEST_DATABASE_URL como DATABASE_URL; no modifica `.env`. La prueba siembra catálogo/reglas, demuestra un CSV inválido, cancelación, ejemplo válido y repetición. Comprueba dos registros, evaluaciones 83,71 INCOMPLETO / 91,21 ALTO y una alerta. Elimina solo las importaciones y resultados que creó; conserva el catálogo. Sin TEST_DATABASE_URL, este escenario se informa como omitido, no como aprobado.

T06 no completa las consultas T13, el tablero T14 ni la aceptación integral T16.

## Evidencia local · 01/11/2026

En `t06-feature`, con Next.js 16.4.2, Chromium de Playwright y MySQL 8.0 descartable: lint, typecheck y build de producción correctos; 57 pruebas sin MySQL, 56 con MySQL y ocho escenarios de navegador aprobados. La prueba real verificó la carga inválida sin registros, cancelación, índices 83,71/91,21 con una alerta y archivo repetido con dos omisiones. Las pruebas con respuestas interceptadas verificaron errores 413/415/422, respuesta no JSON, vencimiento, conflicto 409, bloqueo durante confirmación, job FALLIDO/reintento y recuperación tras pérdida de conexión/recarga. La captura de 390 px se inspeccionó y no presenta desbordamiento de página; la tabla se desplaza horizontalmente. El contenedor de pruebas se detuvo al terminar. No se modificó la base de la aplicación ni `.env`.
