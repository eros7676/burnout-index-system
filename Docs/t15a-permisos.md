# T15a · Usuarios demo y permisos de servidor

Implementado en `t15-feature` después del commit T15b `5b11fcf`. No requiere una migración nueva. Las asignaciones de empleados/equipos usan el seed existente.

En la barra superior de cualquier pantalla, seleccionar **Usuario de demostración**. El cambio crea una sesión y recarga la página para descartar los resultados del usuario anterior. Sin sesión, las consultas de datos devuelven 401. El selector de identidades es público porque se trata de una demo local, no de autenticación productiva.

## Roles y ámbito

- **RRHH** (`demo-rrhh`): lectura de todos los resultados e informes; importar, confirmar, cancelar, consultar/reintentar jobs, gestionar correo simulado y consultar auditoría.
- **Gerencia** (`demo-gerencia`, GER-01): lectura de todos los resultados, informes y auditoría. Sin permisos de importación ni notificación.
- **Team Leads** (`demo-tl-01` a `demo-tl-04`): lectura de evaluaciones, resumen, alertas e informes únicamente de EQ-01 a EQ-04, respectivamente. Sin importaciones, jobs, auditoría ni controles de notificación.
- **Empleado** (`demo-empleado`, EMP-001): sin acceso a índices, alertas, informes ni operaciones administrativas. Puede consultar/cambiar la identidad de la demo.

Los permisos se verifican en los adaptadores HTTP de servidor para todas las rutas de datos. Los servicios internos inyectables y scripts locales siguen siendo código de confianza; no son endpoints públicos.

El Team Lead recibe el filtro de equipo en el servidor aunque el cliente no lo mande. Un filtro de otro equipo o empleado se rechaza con 403; lo mismo ocurre con un informe por ID fuera del equipo. La pertenencia se verifica contra el catálogo actual, incluso para informes históricos. El responsable debe estar activo y conservar el rol/equipo asignado. El ámbito se aplica también al conteo, resumen y paginación. Gerencia debe estar activa y conservar su tipo en el catálogo.

## Sesión y contrato

- `GET /api/demo/sesion`: `SesionDemoDTO`, con usuario actual (o null) y catálogo de identidades ficticias.
- `POST /api/demo/sesion`: JSON `{ "userId": "demo-rrhh" }` (o cualquiera de las identidades anteriores). Devuelve el usuario y una cookie `nexo_demo` HttpOnly, SameSite=Strict, con duración de ocho horas; Secure si se accede por HTTPS. Rechaza campos adicionales o usuarios desconocidos.
- Respuestas 401: sesión ausente, vencida o manipulada. Respuestas 403: rol sin permiso, ámbito ajeno o asignación de catálogo inválida. Los errores mantienen la forma `ApiError` y las respuestas no se cachean.

La cookie contiene ID y vencimiento firmados con HMAC-SHA256; rol y equipo se obtienen del catálogo del servidor. Ningún encabezado del cliente puede fijarlos. Los cambios de estado rechazan un `Origin` ajeno cuando está presente. La identidad del actor registrada por las importaciones T15b se deriva de la sesión verificada; la identidad se asocia internamente a la petición verificada, sin confiar en encabezados externos.

Sin `DEMO_SESSION_SECRET`, el servidor genera una clave aleatoria en memoria: reiniciarlo invalida las sesiones. Para varios procesos de la demo, configurar una clave privada aleatoria compartida en esa variable (no subirla al repositorio). La selección pública de usuario, sin contraseña ni verificación de identidad, impide considerar esto autenticación productiva. No usar con datos reales ni como control de acceso para un servicio público.

## Pruebas

`npm test` incluye firma y manipulación de cookie, falta de sesión, empleado bloqueado, permisos de escritura, filtros de equipo e inactividad del catálogo. `npm run db:test:http`, después del build, selecciona RRHH para el circuito existente y verifica por HTTP real los roles y el acceso a informes/equipos ajenos. `npm run test:ui` incluye el selector real, empleado bloqueado y ámbito del Team Lead, además de las regresiones existentes. Con MySQL real, usar `TEST_DATABASE_URL` aislada migrada/seeded cuyo nombre termine en `_test`.

Los escenarios reales de importación y la aceptación T16 seleccionan explícitamente RRHH; los escenarios con transporte interceptado conservan sus fixtures. Ninguna selección demo convierte esas respuestas simuladas en datos reales.

Verificación local del 01/11/2026: lint, typecheck y build Turbopack aprobados; 68 pruebas sin MySQL y 80 con MySQL aprobadas. Las pruebas HTTP del build real verificaron el circuito completo con RRHH, el actor de auditoría de la sesión, ausencia de sesión, empleado bloqueado, Gerencia, filtros ajenos y detalle por ID fuera/dentro del equipo. Los 19 escenarios de navegador aprobaron, incluidos el selector real, el empleado bloqueado y Team Lead limitado al equipo; cero omisiones. Base aislada: `nexus_t15_test`.

Las pruebas detectaron y permitieron corregir la copia innecesaria del cuerpo multipart en el guard y la comparación del origen local contra el hostname normalizado del servidor: ahora se conserva la petición original y se compara con su Host efectivo. La aserción del mensaje de permiso distingue el aviso de la app del anunciador de Next.js. No se relajaron los permisos.

Esta ejecución no repite las mediciones RNF01 de T16. La revisión humana y una autenticación productiva permanecen fuera de esta evidencia. T15b ya está commiteada; T15a permanece local sin commit ni push.

Revisión conjunta T15a/T15b: se reforzó la cobertura de sesión vencida, firma válida alterada, encabezados de rol falsificados y separación de evaluaciones/alertas/resumen entre equipos. No se detectaron fallos funcionales nuevos.
