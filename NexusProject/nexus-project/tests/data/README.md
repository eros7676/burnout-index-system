# T03 · Plantilla de datos y archivos de prueba

`templates/indicadores.csv` contiene 138 filas para las 49 personas evaluables del seed T02: 45 técnicos (`EMP-001` a `EMP-045`) y cuatro Team Leads (`TL-01` a `TL-04`). `GER-01` existe, pero está fuera de cobertura. El catálogo se define en `prisma/seed-data.ts`; no se crean empleados desde el CSV.

Las semanas comienzan el 28/09, 05/10 y 12/10 de 2026. Fijar el reloj de prueba en `2026-10-19T12:00:00Z`: todas están cerradas. Datos ficticios, encabezados `indicadores-v1`. Una base limpia significa migración y seed aplicados, sin registros laborales, importaciones ni evaluaciones previas.

## Escenarios de la plantilla principal

- `EMP-001`: ejemplo contractual; 83,71 INCOMPLETO → 91,21 ALTO, con alerta en la segunda semana.
- `EMP-002` a `EMP-005`: ALTO sostenido; INCOMPLETO → ALTO → ALTO.
- `EMP-006` a `EMP-015`: INCOMPLETO → MEDIO → MEDIO.
- `EMP-016`: pico aislado de 83,71 como MEDIO, sin alerta.
- `EMP-017`: falta la semana del 05/10; el 12/10 queda INCOMPLETO con índice numérico.
- `EMP-018`: una sola semana, INCOMPLETO.
- `EMP-019`: INCOMPLETO → ALTO; los archivos separados permiten comprobar la llegada fuera de orden.
- `EMP-020` a `EMP-045`: INCOMPLETO → BAJO → BAJO.
- `TL-01` a `TL-04`: límites 39,99 / 40,00 / 69,99 / 70,00; la segunda semana queda BAJO / MEDIO / MEDIO / ALTO, respectivamente.

`resultados_esperados.csv` tiene una fila por empleado/semana de la plantilla. Usa CU02 y reglas v1, sin redondear pasos intermedios; al final aplica `Math.round((I + Number.EPSILON) * 100) / 100`. `EMP-029` del 05/10 da 15,87 con las operaciones `number` de JavaScript del contrato. Son referencias para T07, no resultados de un motor ya implementado.

## Preparación y resultado de cada archivo

- `ejemplo_contractual.csv`: base limpia; dos nuevas filas, índices 83,71 y 91,21.
- `todo_cero.csv`: base limpia; dos filas de `EMP-020`, primera INCOMPLETO 0 y segunda BAJO 0, sin alertas. Probar por separado de la plantilla: comparten claves con valores diferentes.
- `fuera_de_orden_1_semana_2026-10-12.csv` y `fuera_de_orden_2_semana_2026-10-05.csv`: base limpia; importar primero el archivo 1 y luego el 2. El 12/10 pasa de INCOMPLETO a una nueva evaluación vigente ALTO; una alerta ACTIVA.
- `con_warnings.csv`: plantilla previamente cargada; `EMP-020`, semana libre del 21/09, 90 horas trabajadas y 45 extra. Válido con warning HORAS_EXTREMAS.
- `identico_reordenado.csv`: plantilla previamente cargada; mismo contenido normalizado, otro orden, BOM, CRLF y `16.0`. Resultado: omitidas=138, insertados=0.
- `conflicto_historico.csv`: plantilla previamente cargada; misma clave con métricas diferentes, 422 al validar. Para probar 409 al confirmar, validar primero este archivo en una base limpia; después insertar/confirmar la fila original de la plantilla para `EMP-002` del 05/10 mediante otra importación y finalmente confirmar la primera vista previa, aún vigente. El conflicto debe aparecer después de validar; no se confirma una vista previa rechazada. Cero sustituciones.
- `invalido_una_fila.csv`: base limpia; 138 filas, solo `EMP-030` del 05/10 tiene vencidas > pendientes. Rechazar todo el lote con 422, cero registros guardados. Una base limpia evita mezclar este error con conflictos históricos.
- `invalido_varios_errores.csv`: base limpia y reloj fijo indicado arriba. Contiene obligatorios vacíos, números inválidos, rangos, fechas/semanas inválidas, período abierto en 2030, empleado inexistente y duplicado de lote. La racha de `EMP-012` pasa de 9 a 14: ambas son válidas; no hay un código adicional por esa variación. Rechazo del lote, informando todos los errores contractuales detectados.
- `invalido_columna_faltante.csv` / `invalido_columna_desconocida.csv`: rechazo por formato de encabezados.
- `invalido_fuera_cobertura.csv`: base con seed; `GER-01`, existente y fuera de cobertura, produce EMPLEADO_FUERA_COBERTURA. `EMP-999` en el archivo de varios errores cubre EMPLEADO_NO_EXISTE.

Los resultados HTTP, persistencia, reevaluación y alertas son criterios para T04/T07/T08/T11. Las pruebas actuales verifican archivos y catálogo, sin implementar esos módulos ni cargar datos en MySQL.
