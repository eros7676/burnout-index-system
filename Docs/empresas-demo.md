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
- **E6. Los datos se simulan día por día.** Cada persona vive sus días (trabajo, descanso, vacaciones,
  licencia, con sus horas) y el resumen semanal se calcula a partir de ellos. Así el detalle por día
  concilia con el resumen por construcción, y la racha sin descanso, los días desde las últimas vacaciones y
  el saldo de vacaciones siguen de una semana a la otra: una racha de 14 días al domingo es 21 o menos de
  7 el domingo siguiente, nunca 9. El generador es determinista (una semilla por empresa).
- **E7. Cada rubro tiene su semana normal y sus reglas.** Las reglas v1 de cada empresa salen de su
  catálogo y pasan la misma validación que una versión publicada. Las fuentes están en
  [la investigación de rubros](research/2026-11-07-rubros.md).

## Datos de cada empresa

Todas tienen la misma estructura que la semilla genérica: una gerente, cuatro equipos con su Team Lead y
45 personas, 49 en cobertura, y ocho semanas (31/08 al 25/10/2026). Cambian los nombres, la semana
normal, la carga y las reglas.

| | Conecta | Rutas del Plata | Sanatorio del Parque |
| --- | --- | --- | --- |
| Equipos | Mantenimiento Norte y Sur, Redes y Fibra Óptica, Mesa de Ayuda Técnica | Larga Distancia, Reparto Urbano, Depósito y Carga, Programación de Tráfico | Internación General, Guardia Externa, Terapia Intensiva, Quirófano y Esterilización |
| Semana normal | Lunes a viernes, 8 h | Lunes a viernes 8 h y sábado 4 h: 44 h (CCT 40/89) | Turnos de 12 h, dos sí y dos no: 36 a 48 h |
| Cómo aparece la sobrecarga | Guardias de fin de semana y jornadas largas | Domingos trabajados y jornadas largas en ruta | Quedarse después del turno y cubrir turnos en días libres |
| Pesos HE · DS · CT · VP | 30 · 30 · 25 · 15 % | 35 · 35 · 15 · 15 % | 35 · 25 · 15 · 25 % |
| Umbrales HE · DS · CT · VP | 8 h · 6 días · 0,35 · 10 días | 6 h · 6 días · 0,40 · 10 días | 8 h · 4 días · 0,40 · 10 días |
| Caso sostenido (EMP-001) | Sofía Romero | Diego Alvarez | Carla Domínguez |
| Cuándo sube | Gradualmente | Al final, con el pico de reparto | A mitad del período, con el pico de la guardia |

Los límites de Medio (40) y Alto (70) y los dos factores excedidos son los mismos en las tres.

Los archivos están en `templates/empresas/<id>/`: `catalogo.json` (nombres y reglas), `indicadores.csv`,
`tareas.csv` y `jornadas.csv`. Se regeneran con `npm run demo:empresas`; los perfiles están en
`scripts/empresas/`.

## Preparar las empresas

Con Docker, `docker compose up -d --wait` crea las tres bases (`nexus_workload`, `nexus_rutas` y
`nexus_salud`) y el `.env.example` de la app ya trae sus tres variables. Con la app corriendo:

```sh
npm run demo:cargar
```

Por cada empresa configurada, aplica las migraciones, carga su semilla (`DEMO_EMPRESA=<id> npm run db:seed`)
e importa sus tres archivos por la API de importación, como RR. HH., esperando el cálculo del índice antes
de los detalles. Lee las variables del entorno o del `.env`, como la app. Una empresa sin variable se
omite. Se puede repetir: un archivo ya cargado se omite. `--url` apunta a otra dirección de la app
(por defecto http://127.0.0.1:3000), y los ids limitan la carga (`npm run demo:cargar -- rutas`).

Sobre una base que ya tiene otras semanas cargadas, la importación se detiene por conflicto histórico y la
semilla rechaza una v1 distinta. `npm run demo:cargar -- --reiniciar` vacía antes cada base de la demo
(`prisma migrate reset`), así todas las copias terminan con los mismos datos. Un volumen de Docker creado
antes de que existieran las otras dos bases las crea con
`docker compose exec mysql sh /docker-entrypoint-initdb.d/01-empresas.sh`.

`.github/workflows/demo-empresas.yml` hace este recorrido en CI cuando cambia algo de lo que lo compone:
Docker, el `.env.example`, la base, los archivos de las empresas o el script.

## Pruebas

- `tests/permisos-demo.test.ts`: la sesión firma la empresa; una empresa no configurada se rechaza; la
  solicitud protegida corre en la empresa de la sesión; el selector lista los perfiles de otra empresa
  sin iniciar sesión en ella.
- `e2e/empresas.spec.ts`: el paso de empresa, los perfiles de cada empresa, el cambio desde la franja y
  el caso de una sola empresa.
- `tests/empresas-demo.test.ts`: los archivos de cada empresa pasan los validadores reales de importación
  y concilian; la racha, los días desde vacaciones y el saldo siguen de semana en semana; hay licencias,
  vacaciones y un caso sostenido según el umbral de cada empresa; el catálogo nombra a todos con la misma
  estructura que la semilla y sus reglas son una v1 válida; los archivos son los del generador.
