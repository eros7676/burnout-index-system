# Pruebas base y escenarios pendientes

Desde la raíz de la aplicación: `npm test`. Usa TypeScript y el runner nativo de Node, sin dependencias adicionales ni MySQL. Compila contratos y pruebas en `.test-build/` (ignorado por Git/ESLint), luego descubre recursivamente los archivos `*.test.js`. No depende de globs del shell y funciona con Node 22 en Windows y Linux. Las nuevas pruebas se escriben como `*.test.ts` dentro de esta carpeta; deben usar imports relativos para ejecutarse fuera de Next.js.

T01 comprueba serialización y cobertura de las nueve respuestas, aislamiento de copias, ejemplo documental, rechazo con errores por fila, fallos de procesamiento separados del riesgo, omisiones y formato público del error de dominio. El compilador comprueba los tipos de los fixtures. Son verificaciones de la base, no pruebas de importación, cálculo ni persistencia implementados.

Implementar las verificaciones de DOCUMENTACION → Contratos y pruebas: BAJO/MEDIO/ALTO/INCOMPLETO, primera semana, huecos, carga fuera de orden, límites/redondeo, duplicados/conflictos, rollback y reintentos de trabajos sin alertas duplicadas.

El CSV de templates/ejemplo-dos-semanas.csv espera índices 83,71 y 91,21: primera semana INCOMPLETO y segunda ALTO. Requiere catálogo ficticio EMP-001 y responsable TL-01 (seed pendiente T02). Los mocks T01 representan ese resultado esperado sin calcularlo.
