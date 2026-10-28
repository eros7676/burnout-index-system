# Pruebas base, persistencia y escenarios pendientes

Desde la raíz de la aplicación: `npm test`. Usa TypeScript y el runner nativo de Node, sin dependencias adicionales ni MySQL. Compila contratos y pruebas en `.test-build/` (ignorado por Git/ESLint), luego descubre recursivamente los archivos `*.test.js`. No depende de globs del shell y funciona con Node 22 en Windows y Linux. Las nuevas pruebas se escriben como `*.test.ts` dentro de esta carpeta; deben usar imports relativos para ejecutarse fuera de Next.js.

T01 comprueba serialización y cobertura de las nueve respuestas, aislamiento de copias, ejemplo documental, rechazo con errores por fila, fallos de procesamiento separados del riesgo, omisiones y formato público del error de dominio. El compilador comprueba los tipos de los fixtures. Son verificaciones de la base, no pruebas de importación, cálculo ni persistencia implementados.

Implementar las verificaciones de DOCUMENTACION → Contratos y pruebas: BAJO/MEDIO/ALTO/INCOMPLETO, primera semana, huecos, carga fuera de orden, límites/redondeo, duplicados/conflictos, rollback y reintentos de trabajos sin alertas duplicadas.

T02 incorpora `persistence.test.ts` (catálogo ficticio, reglas iniciales y fechas DATE) sin conexión. `persistence.mysql.test.ts` se ejecuta solo con `npm run db:test`; exige TEST_DATABASE_URL para una base migrada cuyo nombre termine en `_test`. Comprueba restricciones SQL, seed repetible, historial/vigentes, rollback y persistencia entre conexiones. Las siete comprobaciones MySQL pasaron el 27/10/2026 en `nexus_t02_test`. Preparación y límites en [la guía T02](../../../Docs/t02-persistencia.md).

El CSV de templates/ejemplo-dos-semanas.csv espera índices 83,71 y 91,21: primera semana INCOMPLETO y segunda ALTO. El seed T02 carga EMP-001, TL-01 y GER-01; no carga registros ni resultados para que el ejemplo pueda importarse desde cero. Los mocks T01 representan ese resultado esperado sin calcularlo.

## T03 y verificación de T16

`npm test` también descubre `data.test.ts`: comprueba encabezados, cobertura del catálogo, archivos de escenarios y resultados de referencia de T03, sin MySQL. Ver [preparación de cada archivo](data/README.md). Estas comprobaciones no sustituyen las futuras pruebas de importación, motor y alertas.

T16 debe registrar evidencia de los RNF01–RNF07 según [Contratos y pruebas, sección 9](../../../Docs/contratos-prototipo.md#9-verificación-de-los-requerimientos-no-funcionales), distinguiendo P0, P1 y sistema final. Los controles futuros se registran pendientes; las pruebas actuales no acreditan rendimiento, autorización ni correo.
