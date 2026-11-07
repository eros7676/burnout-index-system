# Empresas de la demostración

La demo puede mostrar tres empresas de rubros distintos. Cada una tiene sus personas, equipos, datos
importados, reglas del índice y auditoría. Se elige al ingresar, antes del perfil, y se cambia desde la
franja de demostración.

| Empresa | Rubro | Variable de la base |
| --- | --- | --- |
| Conecta Servicios Técnicos | Mantenimiento y redes | `DATABASE_URL` |
| Rutas del Plata | Transporte y logística | `DATABASE_URL_TRANSPORTE` |
| Sanatorio del Parque | Salud | `DATABASE_URL_SALUD` |

La lista está en `src/server/empresas.ts`.

## Decisiones

- **E1. Una base por empresa.** Las tres usan el mismo esquema y las mismas migraciones, pero bases
  distintas. Ninguna consulta filtra por empresa: los datos de una empresa no pueden aparecer en otra
  porque viven en otra base. Esto evita agregar una columna de empresa a cada tabla y revisar cada
  consulta, para un uso que en la demo es de a una empresa por vez.
- **E2. La empresa viaja en la sesión firmada.** La cookie de la demo guarda el perfil y la empresa.
  Cada solicitud protegida corre en la base de la empresa de su sesión (`enEmpresa`), y `prisma`
  (`src/lib/db.ts`) resuelve el cliente de esa empresa en cada acceso. Una empresa que el servidor no
  tiene configurada no se acepta, ni en la cookie ni al ingresar.
- **E3. Sin variables, una sola empresa.** Si solo está `DATABASE_URL`, la app funciona como antes: sin
  paso de empresa ni selector. Las sesiones anteriores, que no tienen empresa, quedan en la primera.
- **E4. Mismo perfil al cambiar de empresa.** Desde la franja se entra a la otra empresa con el mismo
  perfil. Si esa empresa no lo tiene (por ejemplo, otro Team Lead), se vuelve al ingreso con la empresa
  elegida.
- **E5. El trabajo diferido conserva la empresa.** El recálculo que corre después de publicar reglas
  (`after`) toma la empresa de la solicitud que lo programó.

## Preparar una empresa

Por cada empresa adicional: crear la base, aplicar las migraciones y cargar la semilla.

```sh
DATABASE_URL="$DATABASE_URL_TRANSPORTE" npx prisma migrate deploy
DATABASE_URL="$DATABASE_URL_TRANSPORTE" npm run db:seed
```

Después se importan sus datos desde la pantalla de importación, con un perfil de RR. HH. de esa empresa.

## Pruebas

- `tests/permisos-demo.test.ts`: la sesión firma la empresa; una empresa no configurada se rechaza; la
  solicitud protegida corre en la empresa de la sesión; el selector lista los perfiles de otra empresa
  sin iniciar sesión en ella.
- `e2e/empresas.spec.ts`: el paso de empresa, los perfiles de cada empresa, el cambio desde la franja y
  el caso de una sola empresa.
