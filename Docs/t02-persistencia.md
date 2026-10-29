# T02 · Persistencia Prisma/MySQL

La aplicación está en `NexusProject/nexus-project`. Se mantiene Prisma 6.19.3 y MySQL 8 del proyecto. T02 entrega modelos, migración inicial, cliente reutilizable de servidor, seed y pruebas de persistencia. La migración y las pruebas se ejecutaron en MySQL local el 27/10/2026. No hay endpoints, importador, motor ni procesamiento automático implementados por esta tarea.

## Instalar cuando MySQL esté disponible

Copiar los dos `.env.example` como indica el README y hacer coincidir las credenciales. No versionar `.env`. Desde la raíz, `docker compose up -d` es una opción; también se admite un servidor MySQL existente. Se requiere MySQL **8.0.16 o posterior** para hacer cumplir los CHECKs de la migración.

Desde la aplicación, con MySQL listo:

```powershell
npm ci
npm run db:generate
npm run db:validate
npm run db:deploy
npm run db:seed
npm run dev
```

`db:deploy` aplica la migración versionada sin shadow database ni reset y no carga el seed automáticamente. Repetirlo aplica únicamente las migraciones pendientes. La base indicada en DATABASE_URL debe existir y el usuario debe tener permisos de DDL. Para desarrollar cambios futuros se usa `npm run db:migrate -- --name descripcion`, que necesita una shadow database. No usar `db push` como sustituto de las migraciones: se perderían los CHECKs y la collation definidos en SQL.

Para comprobar la estructura sin servidor, `db:generate` y `db:validate` no consultan MySQL. Este último necesita DATABASE_URL definida (puede ser la URL ficticia del ejemplo). No afirmar que estos comandos certifican que la migración SQL fue aplicada.

Prisma CLI lee la configuración desde `prisma.config.ts`; ahí se carga `.env` con dotenv y se registra `scripts/seed.mjs`. Ese script compila TypeScript y luego inicia el seed en procesos separados, sin `&&` en el comando que Prisma lanza. `npm run db:compile-seed` comprueba solo la compilación y no se conecta a MySQL.

## Modelo y garantías

- `Equipo` y `Empleado`: identidad estable, pertenencia, actividad/cobertura y referencia al responsable. `GERENCIA` existe como destinatario, fuera de la cobertura evaluable. No amplía el DTO de informe, que sigue admitiendo TECNICO/TEAM_LEAD. Un responsable puede faltar: T11 debe conservar la incidencia. Los ciclos de jerarquía y la correspondencia de tipo/equipo se validan en los servicios; una FK por sí sola solo garantiza existencia.
- `Importacion`: archivo/hash, esquema, actor demo, timestamps, estados, conteos, errores y warnings. `resultadoConfirmacion` permite conservar la respuesta de una confirmación para repetirla sin reinsertar. `ImportacionTemporal` contiene todas las filas normalizadas y las primeras diez de muestra; es independiente de los registros confirmados. T04 debe eliminarla al confirmar/cancelar y purgarla al vencer a los 30 minutos, conservando los metadatos. MySQL no ejecuta esa limpieza automáticamente.
- `PeriodoEmpleado`: clave única empleado/inicio/fin y semana lunes–domingo comprobada por CHECK. Tiene `registroVigenteId` y `evaluacionVigenteId` opcionales: los servicios los publican transaccionalmente. Las FKs compuestas impiden apuntar a versiones de otro período/empleado. No hay booleano de vigencia almacenado en cada versión.
- `RegistroLaboral`: métricas, auxiliares nullable, fuente, fingerprint, versión y enlace a la versión anterior. Clave única período/dataVersion. DOUBLE conserva los `number` de horas sin redondear antes del cálculo; tareas y días usan INTEGER. Los CHECKs protegen rangos y vencidas ≤ pendientes ≤ total. Una versión anterior puede conservarse; P0 sigue rechazando sustituciones por importación. El esquema no habilita esa función futura.
- `ConfiguracionIndice`: versión y effectiveFrom único, pesos/umbrales JSON y límites. La migración comprueba lunes, ventana/persistencia P0 y límites básicos. La validación del contenido JSON y la publicación de una versión nueva están en [T09](t09-reglas.md). El trabajo queda pendiente: T08 recalcula.
- `Evaluacion`: resultado, índice DECIMAL(5,2), factores y snapshot completo JSON; registro actual, antecedente nullable, reglas, motor, huella y enlace a evaluación sustituida. Clave única período/processingFingerprint; agregar un antecedente permite guardar otra versión. Las referencias garantizan registro actual del mismo período y antecedente del mismo empleado. T08 debe comprobar que el antecedente corresponde exactamente a siete días antes. No se utiliza el nivel para representar fallos técnicos.
- `Alerta`: evaluationId único, empleado coherente con la evaluación mediante FK compuesta, destinatario nullable, causas, sugerencias y vigencia. INTERNO requiere NO_APLICA. T11 debe comprobar ALTO, vigencia y destinatario correcto, superar alertas antiguas y conservar historial. No hay tabla Informe: T10 construye su DTO desde las evaluaciones.
- `ProcessingJob` y `ProcessingJobPar`: origen importación o cambio de reglas, actor, timestamps, intentos, token/lease, lista sin pares repetidos, orden y estado/error de cada par. Los contadores y JobDTO se derivan de esa lista. T04/T08 implementarán reclamo exclusivo, lease de 120 segundos, renovación y comprobación de propietario/versiones antes de publicar. Las columnas permiten ese protocolo; no lo ejecutan solas.

Se restringen borrados/actualizaciones de claves referenciadas para conservar historia. Solo la fila temporal de importación usa eliminación en cascada. Las tablas usan `utf8mb4_bin`: los IDs respetan mayúsculas y ceros iniciales. La collation y los CHECKs están en el SQL de migración porque Prisma Schema Language no los representa; conservarlos y revisarlos en futuras migraciones.

## Uso desde los módulos siguientes

`src/lib/db.ts` exporta `prisma`, protegido con `server-only`, con pool reutilizable durante hot reload y conexión diferida hasta la primera consulta. Los Route Handlers llaman a servicios; los servicios usan repositorios. Seed y pruebas Node crean su propio PrismaClient y lo desconectan; no importan ese módulo exclusivo de Next.js.

`src/server/repositories/fechas.ts` convierte fechas YYYY-MM-DD a medianoche UTC y viceversa, sin la zona local del navegador/proceso. Las columnas de período son DATE; los timestamps son DATETIME(3) y los servicios deben escribir/serializar UTC.

Configurar MySQL en UTC (`default_time_zone = '+00:00'`) para que los defaults CURRENT_TIMESTAMP también sean UTC. El servidor local se comprobó con `@@system_time_zone = UTC` el 27/10/2026; verificarlo de nuevo en otras instalaciones.

Los modelos de Prisma no reemplazan los tipos públicos de `src/shared/contracts.ts`. Al producir DTOs:

- Obtener employeeId/periodStart/periodEnd del período y convertir DATE con `fechaDesdeDb`.
- Calcular `Evaluacion.vigente` comparando su ID con `PeriodoEmpleado.evaluacionVigenteId`.
- Convertir `indice` de Prisma Decimal a number y los timestamps con `toISOString()`.
- Conservar auxiliares explícitamente null y los snapshots con las formas de T01.
- Derivar estado de cada fila y contadores desde los pares del job, y comprobar si el snapshot sigue actualizado. T08/T13 implementan estas proyecciones.

Los JSON no tienen validación estructural automática. Los servicios deben validarlos antes de escribir/leer y construirlos con los contratos compartidos. No devolver objetos Prisma crudos por HTTP. Las evaluaciones/registros/reglas se tratan como inmutables desde los servicios; T02 no instala triggers que prohíban todo UPDATE.

## Seed

`prisma/seed-data.ts` publica IDs estables para T03: EQ-01..EQ-04, EMP-001..EMP-045, TL-01..TL-04 y GER-01. Los técnicos se distribuyen cíclicamente entre los cuatro equipos; cada Team Lead responde a GER-01. Son las 50 personas de Operaciones del caso formal; 49 son evaluables bajo el contrato P0. Si el grupo necesita 50 personas evaluables además de Gerencia, debe ampliar expresamente ese catálogo y sincronizar T03.

`prisma/seed-base.ts` siembra todo en una transacción y solo crea lo que falta, sin restablecer nombres, actividad, responsables ni historial existentes. Si v1 ya existe con otra definición, falla y revierte la carga en lugar de sobrescribirla. Las reglas iniciales son las acordadas: v1 desde 2026-01-05, pesos 30/30/25/15, umbrales 8/6/0,35/10, cortes 40/70 y dos semanas. Las versiones posteriores se publican con el script de [T09](t09-reglas.md); el seed no las crea ni las modifica.

No se crean importaciones, registros, evaluaciones ni alertas precalculadas. El ejemplo de `templates/ejemplo-dos-semanas.csv` conserva sus IDs y podrá importarse cuando esté T04. El comando compila el seed a `.seed-build` (ignorado) con TypeScript ya instalado; no agrega otro runtime ni necesita descargar ejecutores con npx.

## Pruebas

Sin MySQL:

```powershell
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run build
```

Las pruebas unitarias T02 verifican el catálogo, la jerarquía del seed, reglas v1 y conversión de fechas (incluidas fechas inexistentes, años bisiestos y desplazamientos horarios). No sustituyen pruebas de SQL.

Con MySQL, crear una base independiente, por ejemplo `nexus_workload_test`, otorgar los permisos correspondientes y aplicar la misma migración. Desde **otra terminal**, en la carpeta de la aplicación:

```powershell
$env:TEST_DATABASE_URL = 'mysql://usuario:clave@localhost:3306/nexus_workload_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm run db:deploy
npm run db:test
```

Sustituir usuario/clave por los de esa base. `db:test` nunca toma DATABASE_URL como fallback: exige TEST_DATABASE_URL y nombre terminado en `_test`. No forma parte de `npm test`. Comprueba seed repetible y rechazo de v1 alterada; claves únicas; punteros y referencias; CHECKs; auxiliares/null y precisión; IDs por mayúsculas; estados/errores de job; rollback y lectura de datos confirmados desde otra conexión. Utiliza transacciones revertidas excepto una prueba de persistencia que elimina únicamente sus propios IDs al finalizar. Una interrupción forzada puede dejar fixtures en esta base de pruebas; no usarla como base de la demo.

Las evaluaciones de estos tests son fixtures con resultados ya conocidos, no cálculo implementado. No prueban reclamos concurrentes, TTL, motor, endpoints ni alertas automáticas; eso corresponde a T04/T05/T07/T08/T09/T11/T16. La lectura desde otra conexión verifica persistencia de registros, evaluaciones y alertas tras commit. El seed se volvió a ejecutar después de reiniciar MySQL y conservó sus conteos; la demostración de reinicio con resultados producidos por el circuito completo pertenece a T16.

Verificación local del 27/10/2026: `prisma migrate status` confirmó la migración aplicada en `nexus_workload`; el seed repetido tras reiniciar `nexus_db` conservó cuatro equipos, 45 técnicos, cuatro Team Leads, un gerente y reglas `v1`; la migración se aplicó también en `nexus_t02_test`, donde `npm run db:test` pasó sus siete comprobaciones. Esa base separada queda disponible para repetir las pruebas.
