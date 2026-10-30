# T09 · Versiones de reglas

El seed sigue cargando v1 y no la modifica. Este comando agrega una versión nueva, inmutable, y anota las semanas ya confirmadas que hay que recalcular. No calcula el índice ni abre una pantalla. El recálculo lo hacen T07 y T08.

Ejecutar desde `NexusProject/nexus-project`, con MySQL migrado y el seed aplicado:

```powershell
npm run rules:publish -- ruta/regla.json
```

El JSON tiene la forma de `ConfiguracionIndice`. Un archivo válido sería:

```json
{
  "version": "v2",
  "effectiveFrom": "2026-03-02",
  "windowDays": 7,
  "persistencePeriods": 2,
  "weights": { "HE": 0.3, "DS": 0.3, "CT": 0.25, "VP": 0.15 },
  "thresholds": { "HE": 10, "DS": 6, "CT": 0.35, "VP": 10 },
  "mediumLimit": 40,
  "highLimit": 70,
  "minExceededFactors": 2,
  "createdBy": "demo-local",
  "createdAt": "2026-03-02T00:00:00.000Z"
}
```

`effectiveFrom` tiene que ser un lunes y no puede repetirse. Los cuatro pesos van de 0,05 a 0,70 y suman 1, con tolerancia 0,000001. Los umbrales son mayores que 0 y el de tareas no pasa de 1. P0 solo acepta ventana de 7 días y persistencia de 2 semanas. Los cortes cumplen `0 < medio < alto ≤ 100`.

Si algo de eso falla, no se escribe nada. Si la regla es válida, en la misma transacción se inserta la fila y un `ProcessingJob` de origen `CAMBIO_REGLAS`. El trabajo incluye las semanas confirmadas cuyo lunes es igual o posterior al inicio de esta versión y anterior al inicio de una versión más nueva, si existe. El orden es empleado y fecha. Si todavía no hay semanas confirmadas, el trabajo queda `COMPLETADO` con cero pares: las importaciones posteriores toman la versión vigente según la fecha. v1 no se actualiza.

Una regla inválida termina con código de salida 1 y el detalle por campo. El comando no imprime la URL de la base.

Pruebas permanentes: `npm test` comprueba validación y límites de la configuración. `npm run db:test` comprueba publicación atómica, preservación de v1, duplicados, intervalos, orden de pares y trabajos vacíos; requiere `TEST_DATABASE_URL` de una base migrada cuyo nombre termine en `_test`. Ver [las instrucciones de pruebas](../NexusProject/nexus-project/tests/README.md).
