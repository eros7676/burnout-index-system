# T16 · Integración y aceptación P0

Rama local `t16-feature`, creada desde `main` con T14 integrado (`40c43a0`). La aceptación ejecuta el circuito CSV → validación → confirmación → evaluación → informe → alerta → tablero sobre el build de producción y MySQL real. No agrega endpoints de pruebas ni modifica los contratos, el motor o los fixtures T03.

**Estado: implementación de las pruebas disponible; aceptación T16 todavía no cerrada.** El circuito funcional está aprobado en ambos navegadores. RNF01 falla para el lote máximo y RNF03 requiere el operador humano. `verify:p0` termina con error mientras persista el incumplimiento de rendimiento; no se relajaron los límites ni se omitió esa prueba.

## Instalación limpia y verificación

Requisitos: Node >=20.9, npm, Docker/MySQL 8.0.16+, Chrome y Firefox de Playwright. Ejecutar en una copia de las fuentes sin `.env`, `node_modules`, `.next`, `.test-build` ni `.seed-build`. El lockfile se conserva. No copiar secretos ni resultados generados de otra instalación.

Crear una base **exclusiva y vacía**, cuyo nombre termine en `_test`, con permiso de migración; nunca usar la base de la aplicación. Ejemplo descartable desde la raíz:

```powershell
docker run --name burnout-t16-test -e MYSQL_ROOT_PASSWORD=t16-local-test -e MYSQL_DATABASE=burnout_t16_test -p 127.0.0.1:3316:3306 -d mysql:8.0 --default-time-zone=+00:00
# Esperar hasta que mysqladmin ping indique mysqld is alive.
docker exec burnout-t16-test mysqladmin ping -uroot -pt16-local-test
cd NexusProject/nexus-project
npm ci
npx playwright install chromium firefox chrome
$env:TEST_DATABASE_URL='mysql://root:t16-local-test@127.0.0.1:3316/burnout_t16_test'
npm run verify:p0
```

La clave del ejemplo es exclusivamente local y descartable. `verify:p0` sustituye DATABASE_URL solo para sus subprocesos: genera Prisma, aplica la migración, siembra catálogo/reglas y ejecuta lint, tipos, pruebas sin MySQL, build, validación Prisma, pruebas MySQL, HTTP real, regresión T06/T14 y aceptación T16. Se detiene ante el primer error. No resetea bases, no continúa ante fallos ni omite aceptación por falta de TEST_DATABASE_URL. Los comandos se ejecutan en secuencia porque comparten fixtures.

Si Chrome no puede instalarse por permisos, se admite Chrome for Testing oficial sin instalación: establecer `$env:T16_CHROME_PATH` con la ruta absoluta a su `chrome.exe`. El proyecto `chrome` ejecuta ese binario; Firefox usa el instalado por Playwright. Chromium de T06/T14 sigue siendo necesario. Para ejecutar solo T16 sobre un build ya creado: `npm run test:acceptance`.

No ejecutar estas suites simultáneamente contra la misma base. Puertos 3106 y 3116 libres. Las pruebas rechazan una base con importaciones/resultados o reglas `t16-*` previas: no borran datos ajenos para simular una instalación limpia. Limpian únicamente sus importaciones/resultados y versiones de reglas de aceptación, conservando el seed. Una interrupción forzada puede dejar fixtures; usar otra base descartable si sucede. Al terminar: `docker stop burnout-t16-test`.

## Cobertura de aceptación

Los cuatro escenarios de `acceptance/circuito.spec.ts` se ejecutan tanto en Chrome como en Firefox:

- Fallo técnico después del commit: corrupción controlada de reglas exclusivamente en la base de pruebas, carga CONFIRMADA/job FALLIDO, cero evaluaciones ficticias, recarga, restauración y reintento desde T06; dos evaluaciones y una alerta. No hay interruptor de fallos en HTTP.
- Plantilla completa: CSV inválido sin parciales y con campo/causa visibles; 138 filas de 49 evaluables comparadas con el oráculo T03 mediante API real. Cuatro niveles en el tablero, pico aislado MEDIO, hueco INCOMPLETO con índice, ranking, persistencia, resumen y destinatario. Repetición de confirmación, job y archivo reordenado sin duplicar.
- Antecedente tardío: INCOMPLETO → ALTO, historial preservado. Script real T09 rechaza regla inválida y publica una versión válida; tablero desactualizado, recuperación del job desde T06 y nuevo MEDIO con alerta anterior SUPERADA.
- Límite P0: 1.000 filas para 49 evaluables, 5 MiB exactos (espacios normalizables, sin cambiar métricas), 1.000 evaluaciones y ninguna alerta; medición de validación más cálculo.

Las pruebas existentes de servicios/MySQL completan límites, redondeo, concurrencia, rollback, leases, cambios de datos/reglas, destinatario ausente y huellas. Las pruebas de navegador T06/T14 completan móvil, fallos de transporte y respuestas fuera de orden. `db:test:http` usa otro proceso Next.js que la aceptación posterior: las lecturas no dependen del estado en memoria de un único cliente Prisma.

## RNF y límites de la evidencia

- RNF01: se mide el tiempo desde Validar hasta Datos confirmados/procesamiento terminado para 138 filas y para 1.000 filas/5 MiB. Límite de 60 s. Cuarenta consultas completas (evaluaciones, resumen y alertas en secuencia) sobre la plantilla; percentil 95 por rango más próximo, límite 3 s. Se adjuntan muestras, versión de navegador, CPU/RAM y tamaño. Son mediciones locales de un operador, no certificación para otros equipos o carga concurrente.
- RNF03: automatización comprueba nivel textual, errores por campo y navegación. La comprensión de un operador equivalente a RRHH requiere la prueba humana de abajo; no se certifica con Playwright.
- RNF04: rechazo sin parciales, idempotencia y fallo/reintento reales. Correo simulado/real conserva su etapa posterior.
- RNF06: reglas nuevas por script sin cambiar motor, snapshots/historial y escenarios completos/insuficientes/picos/sostenidos.
- RNF07: mismos fixtures y oráculo en Chrome y Firefox de escritorio. Registrar versiones concretas del reporte.
- RNF02, RNF05 y demás ampliaciones mantienen P1/sistema final; P0 no acredita autenticación ni seguridad productiva o escalabilidad de 100 empleados.

## Protocolo de usabilidad humana (RNF03)

En una demo ficticia recién sembrada, entregar al operador `invalido_una_fila.csv` y `ejemplo-dos-semanas.csv`, sin indicaciones de navegación del desarrollador. Pedirle importar ambos, localizar fila/campo/causa del rechazo, identificar el nivel de cada semana y explicar por qué INCOMPLETO no es un fallo técnico. Pedirle abrir el ranking e identificar el destinatario y el carácter interno de la alerta. Registrar fecha, entorno, pasos completados, dudas y resultado; repetir tras corregir obstáculos. No registrar datos personales innecesarios. Hasta ejecutar este protocolo con una persona, su resultado es **pendiente**.

## Evidencia generada

`test-results/t16-results.json` contiene el resultado por navegador y los adjuntos de rendimiento. `test-results/acceptance/` conserva capturas, mediciones y trazas de fallos. Ambos están ignorados por Git. Conservar una copia del reporte si se necesita comparar corridas: Playwright reemplaza resultados anteriores. Nunca incluir URLs de conexión en los adjuntos.

## Ejecución local · 01/11/2026

Fuentes copiadas a `.t16-clean/` sin dependencias, artefactos previos ni archivos de entorno; `npm ci` instaló 403 paquetes desde el lockfile. Node 24.20.0, npm 11.19.0, Next.js 16.4.2/Turbopack, Windows 10, AMD Ryzen 5 3600 (6 núcleos), 15,91 GiB de RAM. MySQL 8.0.46 descartable, puerto 3316, configuración predeterminada salvo zona UTC. Migración inicial y seed aplicados desde cero, cuatro equipos/50 personas/49 evaluables, sin resultados precargados.

Lint, typecheck, build, validación Prisma, 60 pruebas sin MySQL, 65 con MySQL, nueve rutas HTTP reales y 15 escenarios T06/T14 aprobados desde esa copia. La aceptación funcional final pasó seis escenarios (tres por navegador), sin omisiones. Chrome for Testing 156.0.8078.80 y Firefox 157.0 produjeron los mismos 138 resultados del oráculo y los mismos efectos de historial, reglas, alertas y reintentos.

Mediciones (incluyen interacción de navegador):

- Chrome: lote de 138 filas/7.086 bytes, validación más procesamiento 13.696,07 ms; p95 de 40 consultas completas 271,74 ms. Cumple esos límites locales.
- Firefox: mismo lote, 13.738,17 ms; p95 283,67 ms. Cumple esos límites locales.
- Chrome: lote de 1.000 filas/5.242.880 bytes, 109.613,43 ms. **Falla** el límite de 60.000 ms.
- Firefox: mismo lote máximo, 106.591,14 ms. **Falla** el límite de 60.000 ms.

La carga máxima terminó COMPLETADA con 1.000 evaluaciones y cero alertas; su fallo es de rendimiento. No demuestra fallo de atomicidad ni pérdida de datos. La medición máxima usa métricas cero y espacios normalizables; no certifica otras distribuciones de factores ni concurrencia. No se atribuye el costo a un componente concreto sin perfilado. Queda pendiente optimizar y repetir esa prueba antes de aprobar RNF01/T16.

Se corrigieron dos expectativas de la suite contra T03: en 12/10 existen 48 registros (no los 49 del catálogo), y el pico MEDIO de EMP-016 corresponde al 05/10, no al 12/10. La corrida funcional posterior está en `.t16-clean/test-results/t16-results.json`; las mediciones originales de carga máxima se conservaron en `.t16-clean/test-results/t16-carga-maxima.json`. Las pruebas máximas siguen habilitadas en la configuración final. El comando con `--grep-invert 'límite P0'` se usó solo para repetir los escenarios corregidos; no reemplaza la aceptación completa.

Al terminar quedaron cero importaciones, registros laborales, evaluaciones, alertas y jobs de pruebas; solo la regla v1. Se detuvo el contenedor descartable. No se modificaron `.env`, la base de la aplicación ni GitHub; no se hizo commit ni push. La prueba humana RNF03, la optimización del lote máximo y la revisión de la tarea permanecen pendientes.
