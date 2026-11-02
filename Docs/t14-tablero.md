# T14 · Tablero web con índices, factores y alertas

Integrado en `main` (PR #14); se desarrolló en `t14-feature` desde `main` con T13 integrado. Las consultas reales de T13 reemplazaron la maqueta. Después la interfaz se reconstruyó (ver [DESIGN.md](../NexusProject/nexus-project/DESIGN.md)): `/` es el ingreso por perfil y el tablero se reparte entre Resumen (`/home`), Personas, Alertas e Informe. Los mocks se usan exclusivamente en las pruebas. No cambia contratos, motor, persistencia ni reglas.

## Uso

1. Con MySQL, migración y seed del README, abrir `/importaciones`, validar y confirmar `templates/ejemplo-dos-semanas.csv`. Esperar procesamiento COMPLETADO.
2. Abrir Personas y elegir a EMP-001: su ficha muestra las dos semanas, 83,71 Incompleto y 91,21 Alto, con sus tareas. En Alertas hay una alerta activa, interna, para TL-01.
3. Abrir **Ver informe** (o el índice de la semana): empleado/equipo/período, índice, nivel, versión de reglas y motor, explicación, ranking completo con valores/umbrales/puntuaciones/contribuciones, persistencia y recomendaciones para revisión humana. El informe lee la alerta guardada; no la crea.
4. Resumen se consulta por semana (selector **Semana**). Personas filtra por nombre, **Equipo**, **Nivel** y **Semana** con selectores; nadie escribe IDs. Las semanas se muestran como fechas es-AR armadas desde el texto, sin conversión de zona horaria. El resumen cuenta evaluaciones semanales; el promedio incluye Incompleto conforme al contrato P0.
5. Alertas muestra las 100 más recientes del alcance y avisa cuántas hay en total.
6. Cada pantalla vuelve a consultar al abrirse; después de un error aparece **Reintentar**. No hay polling ni cálculo del índice en el navegador. Para recuperar un job pendiente/fallido, usar la pantalla de importación con su jobId.

## Estados y vigencia

- Carga anunciada, vacío explícito, errores HTTP/red/JSON y reintento. Si una consulta falla, el conjunto de resultados se oculta para no mezclar filtros nuevos con datos viejos.
- Sin evaluación: índice vacío y texto Sin evaluación. PENDIENTE/PROCESANDO/FALLIDO/COMPLETADO se muestran separados del nivel; un fallo del informe no borra un resultado actualizado.
- Con `actualizado=false`: no se muestra el índice/nivel anterior como actual ni su alerta; el nivel se lee **Desactualizado** y se aclara si espera recálculo o si el cálculo falló. **Ver informe** en la ficha abre el snapshot con una advertencia de resultado desactualizado. Un detalle con `vigente=false` también muestra esa advertencia y puede incluir la alerta SUPERADA.
- INCOMPLETO conserva el índice numérico y explica la falta de historial. No representa un fallo técnico.
- Las alertas muestran destinatario, causas, sugerencias, canal, estado y vigencia. SIN_DESTINATARIO queda visible como incidencia. ENVIADO de canal SIMULADO se identifica como simulado.
- Cambiar filtros, páginas o actualizar cierra el detalle anterior. Se cancelan peticiones al reemplazar consultas o cerrar el detalle; las respuestas tardías no reemplazan resultados nuevos.
- Niveles con texto y color, formularios etiquetados, foco visible y regiones de tabla desplazables por teclado. Diseño adaptable a móvil.

## Verificación reproducible

Desde `NexusProject/nexus-project`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run db:validate
npm run test:ui
```

Playwright inicia el build de producción en `127.0.0.1:3106`; requiere Chromium instalado (`npx playwright install chromium`). Sin TEST_DATABASE_URL se omite explícitamente el escenario MySQL. Los escenarios T14 interceptados cubren cuatro niveles, procesamiento, resultado obsoleto/histórico, ranking, alertas sin destinatario, filtros y paginaciones, vacío, carga, errores HTTP/JSON/red, reintentos y respuestas fuera de orden. Las capturas de escritorio y móvil quedan en `test-results/` (ignorado).

Para verificar además persistencia/API/navegador reales, usar exclusivamente una base aislada migrada, sin registros laborales, cuyo nombre termine en `_test`:

```powershell
$env:TEST_DATABASE_URL='mysql://USUARIO:CLAVE@127.0.0.1:PUERTO/burnout_t14_test'
# Aplicar previamente la migración T02 a esa base usando DATABASE_URL.
npm run db:test
npm run db:test:http
npm run test:ui
```

La prueba Chromium T06/T14 siembra el catálogo y ejecuta CSV inválido/cancelación, CSV válido, tablero con índices/niveles persistidos, detalle/ranking/persistencia, alerta para TL-01, filtro semanal/resumen y reimportación sin duplicados. Limpia solo sus importaciones/resultados. No modifica `.env` ni la base de la aplicación.

T16 conserva la aceptación integral de todos los escenarios P0, rendimiento, usabilidad y portabilidad entre navegadores.

## Evidencia local · 01/11/2026

En `t14-feature`, desde `main` (`c678a1a`), con Node 24.20.0, Next.js 16.4.2, Chromium y MySQL 8.0.46 descartable en puerto 3314: lint, typecheck, build Turbopack y validación Prisma correctos; 60 pruebas sin MySQL, 65 con MySQL, nueve rutas HTTP reales y 15 escenarios de navegador aprobados. El build final y la suite de navegador incluyen la validación nativa de IDs y el diseño móvil. Se inspeccionaron capturas de escritorio, móvil (390 px) y tablero con datos reales; sin desbordes de página.

El circuito real verificó 83,71 INCOMPLETO / 91,21 ALTO, ranking HE→DS→CT→VP, persistencia, destinatario TL-01, NO_APLICA y repetición sin duplicados. Al finalizar quedaron cero registros laborales, evaluaciones, alertas y jobs de prueba; se detuvo el contenedor. Las suites que usan la misma base se ejecutan en secuencia. Evidencia registrada antes del merge: no se modificaron `.env` ni la base de la aplicación.
