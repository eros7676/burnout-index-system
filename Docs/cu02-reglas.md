# CU02: reglas de referencia

Referencia sincronizada con [DOCUMENTACION vigente](<../DOCUMENTACION - 3 Plus.pdf>) el 28/10/2026. Alcance académico: Entrega 3 Plus final, alfa-1. Los cambios contractuales deben sincronizarse con tipos, consumidores y pruebas.

4. CU02 · CALCULAR ÍNDICE DE RIESGO DE SOBRECARGA

4.1 Entradas, salidas y secuencia

Entrada: un RegistroLaboral confirmado, registro de la semana inmediatamente anterior si existe y ConfiguracionIndice aplicable al inicio de la semana actual. El motor calcula sin Prisma ni Next.js. El servicio de T08 obtiene datos, guarda evaluación y llama CU03.

Salida: Evaluacion con índice numérico, cuatro scores, contribuciones, ranking completo, nivel y explicación de persistencia. El informe se genera para todos los niveles. Un error de contrato/reglas devuelve error técnico; no se confunde con INCOMPLETO.

Validar registro y reglas. Elegir la configuración de mayor effectiveFrom ≤ periodStart. Para P0 se usa v1 desde 2026-01-05. Buscar la semana cuyo periodStart sea exactamente 7 días anterior, no la última fila disponible.

Calcular las cuatro variables numéricas de acuerdo con las definiciones y umbrales.

Normalizar cada variable a escala 0–100 y aplicar los pesos.

Determinar los factores excedidos y comprobar persistencia en períodos consecutivos.

Clasificar y guardar snapshot completo de datos actuales, datos anteriores usados o ausencia explícita, reglas, resultado y processingFingerprint. No almacenar un índice null por falta de historial.

Persistir la evaluación y solicitar CU03 para construir el informe, incluso si el nivel es INCOMPLETO. Solo ALTO crea alerta. Errores de persistencia/cálculo mantienen job FALLIDO para reintento; no se publican como BAJO.

4.2 Definición concreta de las cuatro variables

HE (horas extra): cantidad de horas extra de la SEMANA. Valor ≥ 0. Umbral inicial ilustrativo U_HE = 8 h/semana.

DS (días seguidos): días trabajados consecutivos al final de esa semana, incluyendo antecedentes. Umbral inicial U_DS = 6 días. P0 valida un entero no negativo; no cruza la continuidad de la racha entre semanas. La consistencia cronológica de origen corresponde a quien prepara los datos. El fixture 9→14 es aceptado por el contrato P0; una validación cronológica adicional queda para una ampliación posterior.

CT · Proporción de pendientes y vencidas

A = tareasActivas: total de tareas que estuvieron bajo responsabilidad en la semana, incluidas las completadas; P = tareasPendientes al cierre; V = tareasVencidas al cierre. V ⊆ P ⊆ A.

CT = 0,60 × (V / A) + 0,40 × (P / A)

Si A=0, CT=0 solo cuando P=V=0. Si no se cumple 0≤V≤P≤A, CU01 rechaza el registro y el motor devuelve error de contrato. El peso adicional de V es intencional: una vencida aporta a ambos términos.

Umbral v1: U_CT=0,35. CT mide acumulación relativa, no esfuerzo ni productividad. A=10, P=10 y V=0 da CT=0,40 y supera este umbral: es el comportamiento deliberado de la regla demostrativa, no prueba de sobrecarga. Por sí solo no basta para ALTO.

VP (vacaciones pendientes): saldo de días al cierre. Umbral inicial U_VP = 10 días. Este indicador es una señal contextual de recuperación pendiente, no evidencia concluyente de sobrecarga. Las demás licencias no forman parte de las variables ponderadas de la v1.

4.3 Normalización, fórmula y pesos iniciales

Factor

Valor umbral

Peso

Lectura

HE

8 h / semana

30 %

Horas extra

DS

6 días

30 %

Racha al cierre

CT

0,35 (proporción)

25 %

Pendientes y vencidas

VP

10 días

15 %

Saldo vacaciones

Paso A · Normalizar cada variable

score_i = min(100; 50 × Xi / Ui)

Xi es el valor observado y Ui su umbral positivo. En TypeScript min equivale a Math.min. Alcanzar Ui produce score=50; duplicarlo produce score=100. «Excedida» significa Xi > Ui, estrictamente; Xi=Ui no cuenta como excedida.

Paso B · Ponderar sin redondear

contribución_i = peso_i × score_i

Los pesos HE=0,30, DS=0,30, CT=0,25 y VP=0,15 suman 1. Cada contribución se expresa en puntos del índice; no en porcentaje de causalidad. El mayor peso de HE y DS prioriza jornada extendida y continuidad sin recuperación; CT y VP aportan señales complementarias. Los umbrales iniciales permiten contrastar escenarios simulados y se revisarán según las pruebas y la devolución docente, sin asumir validación empírica.

Paso C · Obtener el índice

I = 0,30 × S_HE + 0,30 × S_DS + 0,25 × S_CT + 0,15 × S_VP

indice = Math.round((I + Number.EPSILON) × 100) / 100

S_HE, S_DS, S_CT y S_VP son los scores normalizados de cada factor. Ese indice con dos decimales es el valor contractual usado para comparar con 40 y 70. CT, scores, contribuciones y comparación Xi>Ui usan precisión completa. El ranking se ordena por contribución sin redondear; desempate fijo HE → DS → CT → VP. Redondear solo su presentación a dos decimales; la suma de valores mostrados puede diferir 0,01 del índice.

Ejemplo · HE=16 h, DS=9 días, A=10, P=7, V=5 y VP=14 días

CT = 0,60 × 5/10 + 0,40 × 7/10 = 0,58

Scores: HE=100; DS=75; CT=82,857142…; VP=70.

Contribuciones: HE=30; DS=22,5; CT=20,714285…; VP=10,5.

Índice = 83,71. Ranking HE → DS → CT → VP. Sin semana anterior el nivel es INCOMPLETO. En el ejemplo integral de Contratos y pruebas, la semana siguiente tiene DS=16 e índice 91,21; ambas cumplen persistencia y la segunda queda ALTO.

4.4 Clasificación exacta y persistencia

Aplicar este orden, sin excepciones implícitas:

0. Si el registro o las reglas son inválidos, devolver error; no guardar Evaluacion. CU01 ya impide faltantes obligatorios en P0.

1. Calcular siempre el índice actual si los datos/reglas son válidos. Si no existe registro válido de la semana inmediatamente anterior, nivel=INCOMPLETO, indice conserva su número y motivo=HISTORIAL_INSUFICIENTE. Esto también se aplica si el índice actual es menor que 40.

2. Con semana anterior disponible: si indice actual <40, nivel=BAJO.

3. Con semana anterior disponible: si no se cumplen todas las condiciones de ALTO y el índice actual ≥40, nivel=MEDIO. Un pico ≥70 no sostenido se explica en el informe.

4. ALTO requiere simultáneamente: índice actual ≥70; índice anterior ≥70; y la intersección entre factores excedidos de ambas semanas contiene al menos dos códigos iguales (HE, DS, CT o VP). Se comparan índices numéricos, no el nivel previo. Por eso un primer período INCOMPLETO con 83,71 sí permite ALTO en el segundo.

La semana anterior se calcula desde su RegistroLaboral usando las MISMAS reglas seleccionadas para la semana actual, incluso si su evaluación histórica usaba otra versión. Esta comparación se guarda en el snapshot; no se altera la evaluación publicada del período anterior. Un hueco de semanas no cuenta como persistencia.

Importación fuera de orden: si llega la semana W después de W+1, procesar W y reevaluar W+1 si existe. La huella de W+1 incluye datos de W o su ausencia; debe cambiar aunque W+1 conserve sus propios datos. No hace falta recalcular W+2 por ese motivo: la persistencia depende de índices semanales, no del nivel anterior.

4.5 Configuración, versionado e idempotencia (RF05/RF06/RF09)

ConfiguracionIndice v1: version='v1'; effectiveFrom='2026-01-05'; windowDays=7; persistencePeriods=2; weights HE/DS/CT/VP; thresholds HE/DS/CT/VP; mediumLimit=40; highLimit=70; minExceededFactors=2; createdBy y createdAt. En P0 la configuración se carga por seed/script, sin editor web.

Validar pesos finitos entre 0,05 y 0,70 y suma 1 con tolerancia 0,000001; umbrales finitos >0 y CT≤1. P0 acepta exclusivamente windowDays=7 y persistencePeriods=2. Otras ventanas/persistencias se difieren y requieren ampliar contratos y pruebas.

Validar límites: 0 < mediumLimit < highLimit ≤ 100. minExceededFactors entero entre 2 y 4, nunca mayor que el número de dimensiones activas. No aceptar configuración parcialmente guardada.

Cada edición crea una versión inmutable con effectiveFrom en lunes y único. P0 permite nuevas reglas por script de Eros + Gonzalo: validar, persistir, crear trabajo de reevaluación para todas las semanas donde esa versión resulte aplicable y procesar en orden. Conservar resultados anteriores; marcar como vigente solo el último resultado correcto para cada par empleado/semana.

Idempotencia: processingFingerprint = huella de registro actual + registro previo (o AUSENTE) + snapshot/versión de reglas + engineVersion='cu02-v1'. Clave única empleado+semana+processingFingerprint. Misma huella reutiliza evaluación; antecedentes nuevos o nueva regla crean otra. En transacción, supersedesEvaluationId enlaza la anterior y se actualiza el puntero vigente. Evitar que un job antiguo sustituya resultados de datos/reglas más nuevos mediante comprobación de versiones antes del commit.

Ordenar ranking por contribución, pero mostrar también valor real, umbral y exceso. El ranking indica qué aportó MÁS al modelo, NO demuestra causalidad clínica ni que la variable causó burnout.

4.6 Escenarios que deben probarse

C1: primera semana válida, incluso con índice bajo → INCOMPLETO con número; dos semanas bajas consecutivas → segunda BAJO y sin alerta.

C2: índice entre 40 y 69,99 → MEDIO; sin alerta.

C3: con semana anterior existente, pico aislado ≥70 sin persistencia → MEDIO; sin semana anterior → INCOMPLETO. Sin al menos dos factores comunes excedidos, nunca ALTO.

C4: dos semanas consecutivas ≥ 70 con al menos dos mismas variables excedidas → ALTO; CU03.

C5: falta un obligatorio o hay A=0 con P/V>0 → CU01 rechaza el lote; llamada directa inválida al motor → error. Solo historial insuficiente produce INCOMPLETO en P0; datos no procesados se muestran como PENDIENTE/FALLIDO.

C6: mismo fingerprint reutiliza evaluación; antecedentes tardíos o reglas nuevas crean evaluación vigente nueva sin borrar historial. C7: CT cero; Xi=Ui no excedida; índices 39,99/40/69,99/70 y desempates. Datos y resultados esperados en Contratos y pruebas.
