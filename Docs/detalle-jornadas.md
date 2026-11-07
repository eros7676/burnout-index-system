# Detalle por día: `jornadas-v1`

El archivo semanal (`indicadores-v1`) trae las horas, la racha sin descanso y los días desde las últimas
vacaciones ya calculados. El detalle por día muestra de dónde salen esas cifras. Es un tercer conjunto de
datos en `/importaciones` («Días») y sigue el mismo criterio que el detalle de tareas: **respalda** al
resumen semanal y no lo reemplaza. Corresponde a la ampliación de RF03 prevista en la documentación
(§6.3, «Registros desagregados por jornada, tarea y licencia»).

## Archivo

Plantilla: `templates/jornadas.csv`. Para la demo: `templates/jornadas-demo-ocho-semanas.csv`, generado con
`npm run demo:jornadas` a partir de `templates/demo-ocho-semanas.csv`.

| Columna | Contenido |
| --- | --- |
| `employee_id`, `period_start`, `period_end` | La persona y la semana, con las mismas reglas que el archivo semanal. |
| `fecha` | Un día de esa semana (AAAA-MM-DD). |
| `tipo_dia` | `TRABAJO`, `DESCANSO`, `VACACIONES` o `LICENCIA`. |
| `horas_trabajadas`, `horas_extra` | Horas del día. Obligatorias en un día de trabajo; vacías o 0 en los demás. |

Hasta 10.000 filas y 5 MB.

## Decisiones

- **D1. Respalda, no calcula.** El índice se sigue calculando con el resumen semanal. Confirmar días no crea
  procesamientos, no cambia evaluaciones ni alertas y deja la huella del detalle en `RegistroLaboral.huellaJornadas`.
- **D2. Qué se concilia.** Cada semana lleva sus siete días y tiene que coincidir con su resumen:
  - la suma de horas extra con `horas_extra`;
  - la suma de horas trabajadas con `horas_trabajadas`, si el resumen la informa;
  - la racha de días de trabajo que llega al domingo con `dias_consecutivos_sin_descanso`. Si la persona
    trabajó los siete días, el resumen tiene que decir 7 o más, porque la racha pudo empezar antes;
  - el último día de vacaciones con `dias_desde_ultimas_vacaciones` (domingo menos ese día). Sin vacaciones
    en la semana, el resumen tiene que decir 7 o más.

  Una diferencia rechaza el archivo completo y el error dice cuánto falta o sobra.
- **D3. Descanso, vacaciones y licencia cortan la racha.** No llevan horas; la base lo impide con
  `jornada_horas_chk`.
- **D4. La licencia no tiene motivo.** `LICENCIA` cubre cualquier licencia que no sea vacaciones, sin datos
  de salud ni familiares (documentación, §6.3). En la v1 no pondera en el índice (§4.2); solo se muestra.
- **D5. Un detalle cargado no se reemplaza.** El mismo archivo otra vez se omite. Días distintos para una
  semana que ya los tiene son un conflicto (`CONFLICTO_HISTORICO`), como en tareas.

## Dónde se ve

- **Personas** (lista) y **Semana a semana** (ficha): debajo de los días consecutivos sin descanso,
  «Licencia, 2 de 7 días», «Vacaciones, 5 de 7 días» o «Vacaciones y licencia, 4 de 7 días».
- **Última semana** (ficha) e **informe**: la misma leyenda, junto con la aclaración de que el índice no
  descuenta esos días.
- **Días de la semana** (ficha): los siete días de la semana elegida, con su tipo y sus horas. Sigue la
  regla del detalle de tareas: RR. HH. ve a todos, el Team Lead a su equipo y Gerencia a los Team Leads.
  Gerencia ve los conteos de un técnico, no sus días.

Una semana importada solo como resumen no muestra ninguna leyenda: no se sabe si hubo ausencias, que no
es lo mismo que cero.

## Demo

Los resúmenes de la demo nunca tienen vacaciones dentro de la semana, así que el generador no produce días
`VACACIONES`. Sí produce semanas con días de descanso y de licencia (35 de 392), siempre antes de la racha
que informa el resumen. Las horas se reparten en medias horas para que sumen exactamente el resumen.

Las empresas de la demostración (`templates/empresas/<id>/jornadas.csv`) se simulan al revés: primero los
días y después el resumen. Por eso sí tienen vacaciones dentro de la semana (ver
[Empresas de la demostración](empresas-demo.md), E6).

## Pruebas

- `tests/importacion-jornadas.test.ts`: reglas por fila y por semana, conciliación y huella.
- `tests/importacion-jornadas-demo.test.ts`: las 392 semanas de la demo coinciden con su resumen y el archivo
  es el que produce el generador.
- `tests/importacion-jornadas.mysql.test.ts`: confirmación sin recálculo, en varios lotes, idempotencia,
  conflicto, la restricción de la base, las ausencias por versión del registro y quién lee los días.
- `e2e/importaciones-jornadas.spec.ts`: la pantalla de importación con el archivo de días.
- `e2e/personas.spec.ts`: la leyenda en la lista, la ficha y el informe, y la tabla de días.
