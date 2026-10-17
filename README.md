# Sistema de Monitoreo de Indicadores y Gestión del Riesgo de Sobrecarga Laboral

Aplicación web diseñada para detectar a tiempo el riesgo de sobrecarga laboral en los empleados a partir de sus datos laborales, alertando al responsable para prevenirlo[cite: 3].

Este proyecto constituye el prototipo funcional (Fase 1) para la organización Nexus Digital S.R.L.[cite: 6, 12].

## Stack Tecnológico

- **Frontend / Backend:** Next.js (React + API Routes)
- **Base de Datos:** MySQL
- **Contenedores:** Docker (para base de datos local) --> IMPORTANTE PARA PORTABILIDAD.

## Requisitos Previos

- Node.js (v18 o superior)
- Docker y Docker Compose (para levantar MySQL local)
- Git

## Instalación y Ejecución Local

1. Clonar el repositorio
   git clone <Uhttps://github.com/eros7676/burnout-index-system.git>
   cd nexus-workload-monitor

2. Instalar dependencias
   npm install

3. Configuración de Variables de Entorno
   Crea un archivo llamado .env en la raíz del proyecto basándote en el archivo de ejemplo proporcionado:
   cp .env.example .env

Completa las variables dentro del .env con tus credenciales de desarrollo locales:

- DATABASE_URL: Cadena de conexión a MySQL.
- SMTP_HOST / SMTP_USER / SMTP_PASS: Credenciales del servidor de correo.

4. Levantar la Base de Datos (Docker)
   Inicia el contenedor de MySQL en segundo plano:
   docker-compose up -d

5. Ejecutar migraciones
   Sincroniza la estructura de la base de datos (tablas de empleados, evaluaciones, alertas, etc.)[cite: 22]:
   npm run db:migrate

6. Iniciar el servidor de desarrollo
   npm run dev

La aplicación estará disponible en http://localhost:3000.

---

## Estructura del Proyecto (Fase 1)

nexus-workload-monitor/
│
├── src/
│ │
│ ├── app/ # Next.js App Router (Frontend y Backend)
│ │ │
│ │ ├── api/ # Capa de lógica de negocio (Backend)
│ │ │ ├── auth/ # CU07: Autenticación y gestión de sesiones
│ │ │ ├── data-ingestion/ # CU01: Endpoint para procesar subida de CSV/XLSX
│ │ │ ├── risk-engine/ # CU02: Cálculo del índice y evaluación de reglas
│ │ │ ├── alerts/ # CU03: Generación y notificaciones por correo
│ │ │ └── reports/ # CU06: Endpoints para exportación de datos
│ │ │
│ │ ├── (dashboard)/ # Vistas protegidas de la aplicación (Frontend)
│ │ │ ├── home/ # CU05: Tablero general y semáforos por célula
│ │ │ ├── ingestion/ # CU01: Interfaz para subir archivos laborales
│ │ │ ├── rules-config/ # CU04: Configuración de pesos y umbrales
│ │ │ ├── employees/ # CU07: Gestión de usuarios, empleados y células
│ │ │ ├── audit/ # CU08: Registro de operaciones relevantes
│ │ │ └── my-data/ # CU09: Vista de solo lectura para empleados
│ │ │
│ │ └── login/ # Pantalla de inicio de sesión
│ │
│ ├── components/ # Componentes React reutilizables
│ │ (tablas, gráficos, formularios, etc.)
│ │
│ ├── lib/ # Lógica compartida y servicios auxiliares
│ │ ├── db.ts # Conexión a MySQL mediante Prisma o Drizzle ORM
│ │ ├── mail.ts # Cliente para el servidor de correo externo
│ │ └── validations.ts # Validaciones de archivos y formularios
│ │
│ └── prisma/ # Esquemas ORM y migraciones de MySQL (opcional)
│
├── .env.example # Ejemplo de variables de entorno
├── next.config.mjs # Configuración de Next.js
├── package.json # Dependencias y scripts del proyecto
└── README.md # Documentación general del proyecto

## Flujo de Trabajo (GitFlow)

Para mantener la integridad del código, el equipo opera bajo un flujo estricto de control de versiones:

1. Ramas Principales:
   - main: Código estable y listo para producción. Bloqueada para push directo.
   - develop: Rama de integración de características.
2. Desarrollo de Funcionalidades:
   - Crear una rama desde develop con el formato feature/CUXX-nombre-tarea (ej. feature/CU01-ingesta-csv).
3. Integración:
   - Subir la rama y abrir un Pull Request (PR) hacia develop.
   - El código debe ser revisado y aprobado por al menos un integrante del equipo antes de fusionarse.
