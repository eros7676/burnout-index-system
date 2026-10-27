# T03 · Plantilla de datos y archivos de prueba

`templates/indicadores.csv` es la plantilla principal: 50 empleados (EMP-001 a EMP-050), 140 filas, semanas del 28/09, 05/10 y 12/10 de 2026 (cerradas con un reloj de prueba posterior al 18/10). Encabezados exactos del contrato `indicadores-v1`. Datos ficticios.

## Escenarios en la plantilla principal
| Empleados | Escenario | Resultado esperado |
|---|---|---|
| EMP-001 | Ejemplo contractual (2 semanas) | 83,71 INCOMPLETO → 91,21 ALTO + alerta |
| EMP-002 a 005 | ALTO sostenido (3 semanas) | INCOMPLETO → ALTO → ALTO |
| EMP-006 a 015 | MEDIO | INCOMPLETO → MEDIO → MEDIO |
| EMP-016 | Pico aislado | 83,71 como MEDIO (no sostenido), sin alerta |
| EMP-017 | Hueco (falta 05/10) | 12/10 INCOMPLETO con índice numérico |
| EMP-018 | Una sola semana | INCOMPLETO |
| EMP-019 | Carga fuera de orden (ver abajo) | INCOMPLETO → ALTO |
| EMP-020 a 045 | BAJO | INCOMPLETO → BAJO → BAJO |
| EMP-046 a 049 | Límites 39,99 / 40,00 / 69,99 / 70,00 | BAJO / MEDIO / MEDIO / ALTO |
| EMP-050 | Todo en cero | INCOMPLETO 0 → BAJO 0 |

`tests/data/resultados_esperados.csv` trae el índice y nivel esperado de cada fila, calculado con las fórmulas de CU02 (para comparar con el motor de T07).

## Archivos de prueba (`tests/data/`)
**Importante: cada archivo se prueba sobre la base indicada. Si se importa después de la plantilla algo que no corresponde, el resultado cambia (por ejemplo, un conflicto en lugar de un warning).**

| Archivo | Base | Qué prueba | Esperado |
|---|---|---|---|
| `ejemplo_contractual.csv` | limpia | Ejemplo integral §5 | nuevas=2; 83,71 y 91,21 |
| `fuera_de_orden_1_semana_2026-10-12.csv` y `_2_semana_2026-10-05.csv` | limpia | Importar primero el 12/10 y después el 05/10 | 12/10 INCOMPLETO, luego ALTO vigente nuevo; una alerta ACTIVA |
| `con_warnings.csv` | con plantilla cargada | EMP-020, semana libre del 21/09, 90 h trabajadas y 45 h extra | Válido, con warning HORAS_EXTREMAS |
| `identico_reordenado.csv` | con plantilla cargada | Mismo contenido con otro orden, BOM, CRLF y `16.0` | omitidas=140, insertados=0 |
| `conflicto_historico.csv` | con plantilla cargada | Misma clave con valor distinto | 422 al validar, 409 al confirmar |
| `invalido_una_fila.csv` | cualquiera | Una fila con vencidas > pendientes entre 140 | 422, cero registros guardados |
| `invalido_varios_errores.csv` | limpia | Un error de cada tipo (usa una semana de 2030 para PERIODO_ABIERTO) | Todos los errores juntos, con sus códigos |
| `invalido_columna_faltante.csv` / `invalido_columna_desconocida.csv` | cualquiera | Encabezados mal | Rechazo por formato |
| `invalido_fuera_cobertura.csv` | con seed | EMP-051 | EMPLEADO_FUERA_COBERTURA, **solo si el seed tiene a EMP-051 inactivo** (si no existe, da EMPLEADO_NO_EXISTE) |

## Pendiente de confirmar con Gonzalo (T02)
- Los IDs `EMP-001` a `EMP-050` (con guion) deben existir en el seed. Si usa otros, se reemplazan con buscar y reemplazar.
- La Entrega 3 (6.2 Relevamiento funcional) indica 4 Team Leads y 45 técnicos. Acá los 50 son EMP-xxx; si el seed incluye a los Team Leads como evaluables, hay que ajustar algunos IDs.
- Para probar EMPLEADO_FUERA_COBERTURA, el seed necesita un empleado inactivo (EMP-051).
