# Contratos y pruebas del prototipo

Referencia sincronizada con [DOCUMENTACION vigente](<../DOCUMENTACION - 3 Plus.pdf>) el 28/10/2026 y el alcance académico final de Entrega 3 Plus (alfa-1). Si cambia el acuerdo contractual, actualizar tipos, consumidores y pruebas juntos.

1. Diccionario de entrada CSV

Las primeras nueve columnas son obligatorias y no admiten vacío. Las otras dos pueden omitirse; vacío se convierte a null. En el objeto interno ambos auxiliares siempre existen como number|null. Los IDs conservan ceros iniciales. No crear empleados automáticamente.

CSV

TypeScript

Tipo

Significado / regla

employee_id

employeeId

string

Código existente y activo en seed. No convertir a número.

period_start

periodStart

FechaISO

Lunes de semana cerrada.

period_end

periodEnd

FechaISO

Domingo, inicio+6 días.

horas_extra

horasExtra

number

0..168; decimal. HE.

dias_consecutivos_sin_descanso

diasConsecutivosSinDescanso

integer

≥0; racha al cierre, puede superar 7. DS.

tareas_activas

tareasActivas

integer

Total semanal, incluidas completadas. A≥0.

tareas_pendientes

tareasPendientes

integer

Sin completar al cierre. 0≤P≤A.

tareas_vencidas

tareasVencidas

integer

Pendientes con fecha límite ya vencida. 0≤V≤P.

vacaciones_pendientes_dias

vacacionesPendientesDias

integer

Saldo administrativo ≥0. VP.

horas_trabajadas

horasTrabajadas

number|null

Opcional; 0..168 y ≥HE.

dias_desde_ultimas_vacaciones

diasDesdeUltimasVacaciones

integer|null

Opcional; ≥0. Contexto, sin peso.

Huella de datos y mapeo

Normalizar antes de comparar: trim de celdas; ID sensible a mayúsculas; fechas ISO sin hora; números finitos en base decimal; -0 se normaliza a 0; auxiliares ausentes o vacíos son null. Serializar en el orden exacto de la tabla, con claves camelCase y valores normalizados; SHA-256 del JSON UTF-8 produce fingerprint. Distinto orden de filas/columnas, BOM, saltos de línea o 8 frente a 8.0 no cambian el contenido de un registro. sourceHash es SHA-256 de los bytes del archivo y sirve como metadato; no sustituye esta comparación.

2. Tipos compartidos y servicios

Ubicación acordada: src/shared/contracts.ts (tipos y errores), src/server/services (servicios), src/server/repositories (Prisma), src/app/api (rutas), src/app (vistas), templates (CSV), tests (datos y verificaciones). Cada módulo importa esos tipos; no mantener copias independientes.

type FechaISO = string; // YYYY-MM-DD validado en servidor

type Factor = 'HE' | 'DS' | 'CT' | 'VP';

type Nivel = 'BAJO' | 'MEDIO' | 'ALTO' | 'INCOMPLETO';

type EstadoJob =

  'PENDIENTE' | 'PROCESANDO' | 'COMPLETADO' | 'FALLIDO';

type ParPeriodo = {

  employeeId: string;

  periodStart: FechaISO;

  periodEnd: FechaISO;

};

type DatosLaborales = ParPeriodo & {

  horasExtra: number;

  diasConsecutivosSinDescanso: number;

  tareasActivas: number;

  tareasPendientes: number;

  tareasVencidas: number;

  vacacionesPendientesDias: number;

  horasTrabajadas: number | null;

  diasDesdeUltimasVacaciones: number | null;

};

type RegistroLaboral = DatosLaborales & {

  recordId: string;

  sourceImportId: string;

  dataVersion: number;

  fingerprint: string;

};

type ConfiguracionIndice = {

  version: string;

  effectiveFrom: FechaISO;

  windowDays: 7;

  persistencePeriods: 2;

  weights: Record<Factor, number>;

  thresholds: Record<Factor, number>;

  mediumLimit: number;

  highLimit: number;

  minExceededFactors: 2 | 3 | 4;

  createdBy: string;

  createdAt: string; // ISO UTC

};

type Persistencia = {

  anterior: null | {

    periodo: ParPeriodo;

    indice: number;

    excedidas: Factor[];

    dataFingerprint: string;

  };

  comunesExcedidas: Factor[];

  cumple: boolean;

  motivo: 'HISTORIAL_INSUFICIENTE'

    | 'NO_SOSTENIDO' | 'SOSTENIDO';

};

type Calculo = {

  indice: number;

  nivel: Nivel;

  indicadores: Record<Factor, number>;

  scores: Record<Factor, number>;

  contribuciones: Record<Factor, number>;

  ranking: Factor[];

  excedidas: Factor[];

  persistencia: Persistencia;

};

type Evaluacion = Calculo & ParPeriodo & {

  evaluationId: string;

  rulesVersion: string;

  engineVersion: 'cu02-v1';

  processingFingerprint: string;

  snapshot: {

    actual: RegistroLaboral;

    anterior: RegistroLaboral | null;

    reglas: ConfiguracionIndice;

  };

  supersedesEvaluationId: string | null;

  vigente: boolean;

  createdAt: string;

};

type Alerta = {

  alertId: string;

  evaluationId: string;

  employeeId: string;

  destinatarioId: string | null;

  motivoDestinatario: 'OK' | 'SIN_DESTINATARIO';

  causas: Factor[];

  sugerencias: string[];

  vigencia: 'ACTIVA' | 'SUPERADA';

  canal: 'INTERNO' | 'SIMULADO';

  estadoEnvio: 'NO_APLICA' | 'PENDIENTE' | 'ENVIADO'

    | 'FALLIDO' | 'SIN_DESTINATARIO';

  createdAt: string;

};

Reglas adicionales: vigente es un puntero por empleado/semana, no por rulesVersion; conservar versiones anteriores. anterior en Persistencia contiene el cálculo numérico con las reglas de la semana actual. cumple se refiere a las condiciones de ALTO (dos índices y factores comunes); motivo=NO_SOSTENIDO si hay anterior pero no se cumplen todas. Lista vacía de excedidas no es un dato faltante.

type ErrorCampo = {

  fila: number | null; // encabezado=1, primera fila=2

  campo: string | null; // nombre CSV si corresponde

  codigo: string;

  detalle: string;

};

type VistaPrevia = {

  importId: string;

  status: 'VALIDADA' | 'RECHAZADA';

  expiresAt: string;

  totalFilas: number;

  nuevas: number;

  omitidas: number;

  muestra: DatosLaborales[]; // primeras 10 válidas

  errores: ErrorCampo[];

  warnings: ErrorCampo[];

};

type JobDTO = {

  jobId: string;

  estado: EstadoJob;

  totalPares: number;

  completados: number;

  errores: { par: ParPeriodo; codigo: string;

    detalle: string }[];

  updatedAt: string;

};

type ResultadoImportacion = {

  importId: string;

  status: 'CONFIRMADA';

  insertados: number;

  omitidos: number;

  afectados: ParPeriodo[]; // nuevos y sucesores existentes

  procesamiento: JobDTO | null; // null si no hay afectados

};

type FactorInforme = {

  codigo: Factor;

  valor: number;

  umbral: number;

  score: number;

  contribucion: number;

  excedido: boolean;

};

type InformeDTO = {

  evaluacion: Evaluacion;

  empleado: { employeeId: string; nombre: string;

    teamId: string; tipo: 'TECNICO' | 'TEAM_LEAD' };

  factores: FactorInforme[]; // orden de ranking

  explicacion: string;

  recomendaciones: string[];

  alerta: Alerta | null;

};

type FilaTablero = ParPeriodo & {

  teamId: string;

  nombre: string;

  processingState: EstadoJob;

  actualizado: boolean;

  evaluationId: string | null;

  indice: number | null;

  nivel: Nivel | null;

  alertId: string | null;

};

type ResumenDTO = {

  totalEvaluaciones: number;

  conteo: Record<Nivel, number>;

  porcentajes: Record<Nivel, number>;

  noProcesados: number;

  promedioIndice: number | null;

  muestraPromedio: number;

};

type Pagina<T> = {

  items: T[];

  total: number;

  page: number;

  pageSize: number;

};

type ApiError = {

  error: { codigo: string; mensaje: string;

    detalles: ErrorCampo[] };

};

FilaTablero usa indice/nivel null solo cuando no hay evaluación; Evaluacion siempre tiene índice numérico. processingState describe ese par, no todos los pares del job: uno ya completado sigue COMPLETADO aunque falle otro. actualizado compara datos, antecedente, reglas y engineVersion esperados con el snapshot vigente. Si es false, señalar pendiente/fallo y no presentar el nivel anterior como actualizado; el detalle histórico sí puede conservarlo identificado.

Firmas obligatorias

// CU02 puro: sin acceso a base ni HTTP.

calcularEvaluacion(

  actual: RegistroLaboral,

  anterior: RegistroLaboral | null,

  reglas: ConfiguracionIndice

): Calculo

// Servicios asíncronos de servidor.

validarImportacion(

  archivo: File, actorId: string

): Promise<VistaPrevia>

confirmarImportacion(

  importId: string, actorId: string

): Promise<ResultadoImportacion>

procesarImportacion(jobId: string): Promise<JobDTO>

construirInforme(

  evaluationId: string

): Promise<InformeDTO>

crearAlertaSiCorresponde(

  evaluationId: string

): Promise<Alerta | null>

T07 implementa el motor puro; T08 lo usa, persiste y llama a CU03. T10 construye el informe; T11 crea/supera alertas. T04 orquesta confirmación/procesamiento; T13 expone las lecturas. construirInforme no crea alertas por una consulta GET: las alertas se generan en el procesamiento y el informe las lee. Error de contrato/regla lanza un error de dominio tipado que T04/T08 convierten a código, sin inventar Calculo.

3. API HTTP P0

Base /api; respuestas JSON excepto carga multipart. No crear rutas públicas para ejecutar CU02 empleado por empleado: lo ejecuta el servicio tras confirmar. Un 2xx al confirmar certifica la importación; consultar procesamiento.estado para saber si terminaron los cálculos.

Método / ruta

Entrada

Éxito

Implementa / consume

POST /api/importaciones/validar

multipart/form-data: file (CSV)

200 VistaPrevia; 422 vistaPrevia+error si filas inválidas

T04 / T06

POST /api/importaciones/{id}/confirmar

JSON {}

200 ResultadoImportacion

T04 / T06

DELETE /api/importaciones/{id}

Sin cuerpo

200 {importId,status:'CANCELADA'}

T04 / T06

GET /api/procesamientos/{jobId}

Sin cuerpo

200 JobDTO

T04 / T06,T14

POST /api/procesamientos/{jobId}/reintentar

JSON {}

200 JobDTO tras intento

T04+T08 / T06

GET /api/evaluaciones

Filtros/paginación

200 Pagina<FilaTablero>

T13 / T14

GET /api/evaluaciones/{evaluationId}

ID de evaluación

200 InformeDTO

T13+T10 / T14

GET /api/resumen

Filtros comunes

200 ResumenDTO

T13 / T14

GET /api/alertas

Filtros/paginación

200 Pagina<Alerta>

T13+T11 / T14

Consultas y errores uniformes

GET /api/evaluaciones: filtros opcionales employeeId, teamId, periodStart y nivel; page=1 y pageSize=50 por defecto, máximo 100. Orden periodStart descendente y employeeId ascendente. Devolver una FilaTablero por registro vigente, incluso pendiente/fallido; filtro nivel excluye filas sin nivel actualizado. GET /api/alertas: filtros opcionales employeeId, teamId, periodStart; page/pageSize iguales, orden createdAt descendente y alertId ascendente. Por defecto solo ACTIVA asociada a evaluación vigente y actualizada; el detalle de evaluación histórica muestra su alerta SUPERADA. GET /api/resumen usa employeeId/teamId/periodStart, sin paginación ni filtro nivel, para conservar el denominador. Filtros mal formados: 400.

HTTP 400: petición/formato inválido; 404: ID inexistente; 409: conflicto, job reclamado o estado incompatible; 410: vista previa vencida; 413: tamaño excedido; 415: formato no CSV; 422: filas/configuración inválidas; 500: error inesperado sin resultado controlado. ApiError es el formato común. Validar filas inválidas devuelve 422 {vistaPrevia:VistaPrevia,error:ApiError['error']}. Antes de parsear no es obligatorio crear importId. Confirmación/reintento procesados con fallo controlado devuelven 200 con job FALLIDO y sus errores; la UI no muestra éxito de cálculo por el 200. P1 agrega 401 sin sesión y 403 sin permiso.

Códigos de fila: OBLIGATORIO, NUMERO_INVALIDO, RANGO_INVALIDO, FECHA_INVALIDA, SEMANA_INVALIDA, PERIODO_ABIERTO, EMPLEADO_NO_EXISTE, EMPLEADO_FUERA_COBERTURA, DUPLICADO_LOTE, CONFLICTO_HISTORICO. Warnings: HORAS_EXTREMAS. Un warning nunca habilita una fila con error. En confirmación un conflicto sobrevenido devuelve 409 sin insertar y exige validar otra vez. Repetir un importId CONFIRMADA devuelve su resultado, incluso si pasaron 30 minutos; no vuelve a procesar.

4. Estados, reintentos y cambios

Importación y procesamiento

Validar: VALIDADA o RECHAZADA. VALIDADA puede pasar a CANCELADA o CONFIRMADA. Los datos temporales expiran a los 30 minutos; los metadatos permanecen y un importId no confirmado vencido devuelve 410. CONFIRMADA no vuelve atrás. Cancelar una carga ya cancelada devuelve el mismo estado; cancelar una confirmada devuelve 409.

Confirmar inserta registros y job PENDIENTE en la misma transacción. afectados es la unión SIN DUPLICADOS de los pares nuevos y de sus sucesores inmediatos existentes, incluidos los nuevos del mismo lote. El job conserva esa lista y el estado por par. Después el servidor reclama job → PROCESANDO y ejecuta por empleado/fecha ascendente: cargar versiones actuales → calcular/persistir T08 → crear/superar alerta T11 → producir informe T10. Solo después el par cuenta completado. El informe es una proyección de Evaluacion; no requiere otra tabla.

Al primer error se detiene y el job queda FALLIDO con par/código; los resultados de pares ya terminados se conservan. Reintentar reclama el job de forma exclusiva y vuelve a ejecutar pares idempotentemente; finaliza COMPLETADO al completar todos. La ejecución usa lease de 120 segundos renovado antes de cada par y token de propietario: no se admite dos ejecutores a la vez. Job PROCESANDO con lease vigente devuelve 409 al reintentar; vencido puede reclamarse. Un ejecutor que perdió el token no puede publicar resultados ni cambiar el estado.

Al reiniciar, los jobs PENDIENTE o con lease vencido se muestran recuperables y ofrecen Reintentar. No depender de una promesa suelta que siga ejecutándose tras responder HTTP. P0 procesa dentro de la petición hasta terminar o fallar; límites de archivo acotan el trabajo. Un despliegue con límites de ejecución requerirá worker/cola posterior.

Correcciones y versiones

P0 no permite reemplazar registros conflictivos desde la UI ni borrar historial para reimportar. El operador corrige el archivo ANTES de confirmar. Sustitución de una carga confirmada queda para el sistema final: RRHH autorizado deberá registrar motivo y versión nueva, preservar anterior y recalcular semana corregida y sucesora. Esta funcionalidad no se da por implementada en T04.

Nuevas reglas P0 por script: Eros define, Gonzalo persiste; effectiveFrom es lunes y único. El script valida, crea versión y job con todas las semanas donde pasa a ser aplicable. Si una regla más reciente tiene effectiveFrom posterior, limita el intervalo de aplicación de la nueva. Las consultas señalan desactualizados hasta completar reevaluación; no borran resultados anteriores. Nueva alerta ALTO supera a la anterior de esa semana. No implementar editor web ni correcciones manuales ocultas.

Concurrencia: antes de publicar, comprobar recordId/dataVersion actuales, configuración aplicable y antecedente contra lo leído para calcular; si cambiaron, no actualizar vigente y registrar REQUIERE_REPROCESO. El reintento toma las versiones nuevas. Transacción actualiza puntero vigente y supera la alerta antigua; el par no se marca completo hasta que su nueva alerta, si corresponde, existe.

5. Ejemplo integral reproducible

Seed: EMP-001 es técnico del equipo EQ-01; su responsable es TL-01, quien tiene superior GER-01. Todos ficticios. Configuración v1; reloj de prueba posterior al 2026-10-18 en la zona del prototipo. Las dos semanas siguientes están cerradas.

employee_id,period_start,period_end,horas_extra,dias_consecutivos_sin_descanso,tareas_activas,tareas_pendientes,tareas_vencidas,vacaciones_pendientes_dias,horas_trabajadas,dias_desde_ultimas_vacaciones

EMP-001,2026-10-05,2026-10-11,16,9,10,7,5,14,56,120

EMP-001,2026-10-12,2026-10-18,16,16,10,7,5,14,56,127

Paso 1 · Validar: nuevas=2, omitidas=0, errores=[], totalFilas=2; sin registros laborales aún. Paso 2 · Confirmar: insertados=2, omitidos=0 y dos pares afectados. Paso 3 · Procesar: primera semana 83,71; segunda 91,21. La racha DS pasa de 9 a 16 días porque transcurren siete jornadas más sin descanso. DS no se suma a otros indicadores ni se limita a siete.

Semana

Índice y nivel

Persistencia

Alerta

05–11/10/2026

83,71 · INCOMPLETO

Sin semana previa; guarda índice y cuatro excedidas

No

12–18/10/2026

91,21 · ALTO

Anterior=83,71; comunes HE,DS,CT,VP; cumple=true

Una, para TL-01

Informe de la segunda semana: HE 16/8, DS 16/6, CT 0,58/0,35, VP 14/10; scores 100/100/82,857142…/70; contribuciones 30/30/20,714285…/10,5; ranking HE→DS→CT→VP (HE precede a DS por desempate fijo). Explicación: «91,21 puntos; dos semanas consecutivas ≥70 y cuatro factores comunes excedidos». Sugerencias: HE revisar horas extra; DS descansos; CT pendientes/vencimientos; VP planificación del saldo. Revisión humana, sin decisiones automáticas.

Tablero: primera semana INCOMPLETO con 83,71; segunda ALTO con 91,21, alerta ACTIVA dirigida a TL-01, canal INTERNO y NO_APLICA. No enviar correo. Resumen de la segunda semana: total=1, ALTO=1 (100%), demás=0, noProcesados=0, promedio=91,21, muestraPromedio=1.

Repetir el mismo archivo: nuevas=0, omitidas=2; confirmar insertados=0 y procesamiento=null. Permanecen dos registros, dos evaluaciones y una alerta. Repetir el mismo importId confirmado devuelve el resultado original, con insertados=2; no representa otra inserción.

6. Escenarios de aceptación compartidos

Caso

Entrada / acción

Resultado esperado

BAJO

Dos semanas: HE=DS=VP=0; A=P=V=0

Primera INCOMPLETO índice 0; segunda BAJO 0; sin alerta.

MEDIO

Dos semanas: HE=8,DS=6,A=10,P=5,V=2,VP=10

CT=0,32; índice 48,93; segunda MEDIO; sin alerta.

ALTO

Ejemplo de §5

83,71 y 91,21; segunda ALTO y una alerta.

Pico aislado

Anterior: HE=0,DS=2,A=P=V=VP=0 (índice 5). Actual: HE=16,DS=9,A=10,P=7,V=5,VP=14.

Segunda MEDIO 83,71, NO_SOSTENIDO; sin alerta.

Hueco

Datos del 05/10 y del 19/10, falta 12/10

19/10 INCOMPLETO con índice numérico.

Fuera de orden

Importar 12/10 alto y después 05/10 alto

12/10 primero INCOMPLETO; luego ALTO vigente nuevo; anterior conservada; una alerta ACTIVA.

Archivo inválido

Una fila sin HE o con V>P

422 y cero registros/evaluaciones nuevos en todo el lote.

Duplicado / conflicto

Repetido interno; histórico distinto

Interno 422; conflicto detectado al validar 422, sobrevenido al confirmar 409; cero sustituciones.

Idempotencia

Repetir archivo, confirmar ID y reintentar job

No duplicar registros, evaluaciones ni alertas; conteos según §5.

Cero y límites

A=P=V=0; A=0,P=1; Xi=Ui

CT=0; segundo inválido; igualdad con umbral no excedida.

Redondeo / ranking

Índice contractual 39,99/40/69,99/70 y contribuciones empatadas

Con historia: 39,99 BAJO; 40/69,99 MEDIO; 70 ALTO solo si persiste. Empate HE/DS/CT/VP. Entradas exactas de borde en §6.1.

Job fallido

Forzar fallo T11 después de guardar datos/evaluación; reintentar

Carga CONFIRMADA, job FALLIDO; al reintentar COMPLETADO, sin duplicados.

Destinatario / vigencia

ALTO sin responsable; nueva evaluación no ALTO

Incidencia visible; alerta antigua SUPERADA y ninguna nueva ACTIVA.

Reglas nuevas

Nueva versión válida por script para semanas existentes

Job recalcula intervalo, conserva historial y actualiza vigentes; regla inválida no se guarda.

6.1 Entradas exactas para probar los límites

Cada fila usa reglas v1 y semana anterior con los mismos valores, salvo DS: para las filas de 69,99 y 70, DS anterior=12 y actual=19. Son dos semanas consecutivas; los auxiliares pueden ser null. A/P/V es total/pendientes/vencidas. Comparar el índice redondeado contractual.

HE

DS actual

A / P / V

VP

Índice / nivel

9.328

6

0 / 0 / 0

10

39,99 · BAJO

9.3333

6

0 / 0 / 0

10

40,00 · MEDIO

3.9946667

19

1 / 1 / 1

10

69,99 · MEDIO

4

19

1 / 1 / 1

10

70,00 · ALTO

7. Flujo de ejecución del sistema

Este flujo representa lo que ocurre al usar la app. El mapa de Tareas Resumen representa dependencias para desarrollar y terminar tareas; no confundir ambos. Los diagramas omiten responsables.

8. Glosario y criterio de entrega

DTO: objeto que un módulo entrega a otro. Contrato: forma y significado obligatorio de entradas/salidas. Seed: datos iniciales ficticios y reglas. Fingerprint: huella estable de contenido normalizado. Idempotencia: repetir una operación sin duplicar su efecto. Snapshot: copia de los datos/reglas usados. Transacción: guardado íntegro o rollback. Vigente: resultado actual por empleado/semana. Job: trabajo persistido de procesamiento. Lease: permiso temporal exclusivo para ejecutarlo. Mock: respuesta simulada con el mismo contrato. E2E: prueba desde carga del archivo hasta resultado visible.

Hecho: contrato compartido usado, criterios de la tarea cumplidos, pruebas relevantes aprobadas, npm run build correcto y PR revisado. README permite instalar, migrar, seedear, ejecutar y repetir el ejemplo sin instrucciones verbales; incluir .env.example, versiones en lockfile, comandos de pruebas y recuperación de job. T16 valida instalación limpia. Cada cambio contractual se actualiza en consumidores y pruebas antes de integrar.


## 9. Verificación de los requerimientos no funcionales

Referencia: RNF01–RNF07 de Entrega 3 Plus, alfa-1. Son criterios por comprobar y registrar en T16; no afirman pruebas aprobadas ni amplían P0. Los requisitos del sistema final conservan su etapa.

| Criterio | Etapa | Verificación y aceptación |
| --- | --- | --- |
| RNF01 · Rendimiento | P0 / T16 | 49 evaluables, un operador local y CSV de hasta 1.000 filas y 5 MiB: 95 % de consultas de tablero ≤3 s; validación más cálculo del lote ≤60 s. Registrar equipo, entorno, lote y mediciones. 10 usuarios y 10.000 registros: ampliación posterior, sin bloquear P0. |
| RNF02 · Seguridad | P1 / sistema final | P1: autorización por rol y ámbito en servidor; bloquear consulta de equipo ajeno. Sistema final: identidad autenticada, HTTPS y hash seguro de contraseñas; empleado sin acceso a índices/alertas. P0 local ficticio no acredita estos controles. |
| RNF03 · Usabilidad | P0 / T16 | Nivel con texto y color; errores con campo y causa. Operador equivalente a RRHH puede importar un CSV válido e identificar errores de otro inválido sin asistencia del desarrollador. |
| RNF04 · Fiabilidad | P0 / P1 / final | P0: carga inválida sin parciales; repetir archivo, confirmación o job no duplica datos/alertas. P1: fallo y reintento de correo simulado conservan alerta. Correo real se verifica al incorporarlo en el sistema final. |
| RNF05 · Escalabilidad | Ampliación posterior | Incorporar equipos/empleados sin cambiar el cálculo. Prueba con 100 empleados simulados, integridad y ámbito de acceso cuando haya roles. No sustituye el dataset de 49 ni obliga a modificar T03 para P0. |
| RNF06 · Mantenibilidad | P0 / T16 | Separación de importación, cálculo, notificación y persistencia. Cambiar pesos/umbrales mediante configuración versionada sin alterar el motor. Probar datos completos, insuficientes, picos aislados y varios factores sostenidos. |
| RNF07 · Portabilidad | P0 / T16 | Ejecutar importación y consultas equivalentes en Chrome y Firefox de escritorio. Mismo conjunto de datos y configuración produce los mismos resultados; documentar versiones de navegador. No exige instalar software cliente. |

Registro de evidencia: fecha, entorno, datos, pasos, resultado esperado/obtenido y estado (cumple, falla o pendiente). Un criterio futuro queda pendiente de su etapa. La compatibilidad documental no certifica rendimiento, seguridad ni funcionamiento. Esta matriz no requiere cambiar contratos, fórmula, seed ni fixtures T01–T03.
