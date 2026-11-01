# Diagnóstico de Turbopack en Windows

## Resultado

El 31/10/2026 se verificó el build predeterminado de Next.js 16.4.2 con Turbopack,
incluido un build desde `.next` vacío, sin cambiar CSS, loader, dependencias ni
scripts. No es necesario pasar a Webpack para compilar este proyecto en un entorno
que permita la comunicación local del compilador con sus procesos auxiliares.

## Causa observada y límites

El mensaje inicial fue `node process exited before we could connect to it with
exit code: 0`, durante la transformación de `globals.css` con el loader Tailwind.
Ese mensaje por sí solo no identifica una regla CSS inválida.

Se ejecutó directamente el worker generado por Turbopack contra un servidor TCP
local de diagnóstico, antes de enviarle trabajo de Tailwind. Se observaron:

| Prueba | Resultado |
| --- | --- |
| Worker en el entorno restringido | `connect EACCES 127.0.0.1:<puerto>`; nunca se conecta |
| Mismo worker fuera del sandbox | Conexión local aceptada |
| Build con instrumentación temporal de conexiones, fuera del sandbox | Correcto |
| Build sin instrumentación, fuera del sandbox | Correcto |
| Build limpio, eliminando solo `.next`, fuera del sandbox | Correcto |

El worker de Turbopack ejecuta `process.exit(0)` al cerrarse su socket. Al fallar la
conexión, el cierre termina ocultando el error de permisos detrás del mensaje
genérico de salida con código cero. La prueba directa permite observar EACCES.

Los intentos iniciales fuera del sandbox también fallaron; no se atribuye cada uno
de esos fallos a la misma causa sin trazas individuales. La recuperación quedó
comprobada con builds sin instrumentación y con caché vacía. No se demostró una
corrupción concreta de caché ni una falla del contenido CSS.

Cambiar solamente Node 26.13.0 por Node 24.22.1 no resolvió los intentos fallidos.
La integración existente de Tailwind sí logró compilar al recuperar la comunicación
del worker; no se justifica migrar de loader o actualizar paquetes a ciegas.

## Cómo proceder si reaparece

1. Ejecutar desde `NexusProject/nexus-project` en una terminal normal con permisos
   de conexión local. En una ejecución automatizada restringida, usar el mecanismo
   autorizado para ejecutar el build fuera del sandbox; no desactivar el firewall
   ni cambiar la seguridad global del equipo.
2. Detener servidores/builds anteriores. Si persiste, eliminar únicamente la
   carpeta generada `.next` dentro de esa aplicación y repetir `npm run build`.
   No eliminar fuentes, archivos de entorno, lockfile ni la base de datos.
3. Si vuelve a fallar, capturar el error de conexión real del worker antes de
   concluir que falla Tailwind. Si es EACCES, revisar los permisos de comunicación
   local del proceso. Si es otro error, diagnosticarlo por separado.

`npm run build -- --webpack` sigue siendo una alternativa temporal comprobada.
Cambiar de compilador evita ese recorrido, pero no corrige una restricción TCP.
Los errores de descarga de Google Fonts sin red son un problema distinto.

No se guardaron opciones NODE_OPTIONS de diagnóstico ni se modificaron variables
de entorno del usuario. Los scripts auxiliares se usaron solo en `.test-build`,
que está ignorado por Git, y se retiraron al terminar.
