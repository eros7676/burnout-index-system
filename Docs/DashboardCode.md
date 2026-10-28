# Maqueta visual histórica

Este archivo conserva una propuesta HTML de interfaz con datos fijos. No define contratos ni acredita cálculo, alertas, correo, seguridad o cumplimiento normativo. Sus niveles, denominadores y textos pueden diferir de las reglas actuales; INCOMPLETO vigente conserva un índice numérico cuando solo falta historial. Para implementar, usar [DOCUMENTACION vigente](<../DOCUMENTACION - 3 Plus.pdf>), [contratos](contratos-prototipo.md) y [CU02](cu02-reglas.md).

<!DOCTYPE html>

<html lang="es"><head><meta charset="utf-8"/><meta content="width=device-width, initial-scale=1.0" name="viewport"/><meta content="web_dashboard" name="shell-type"/><link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/><style>@layer base{html,body{margin:0;padding:0;}body{overscroll-behavior:none;}main>:first-child{margin-top:0!important;}main>:last-child{margin-bottom:0!important;}}::-webkit-scrollbar{display:none;}</style><script src="https://cdn.tailwindcss.com"></script><script id="tailwind-config">tailwind.config = {
    darkMode: "class",
    theme: {
      extend: {
        "colors": {
          "on-tertiary-fixed": "#002113",
          "surface": "#f9f9ff",
          "tertiary-fixed-dim": "#7cd9a9",
          "outline": "#737783",
          "on-primary-container": "#bcd0ff",
          "on-primary-fixed": "#001a41",
          "primary": "#003f8a",
          "on-secondary-fixed-variant": "#38485d",
          "surface-container-high": "#e0e8ff",
          "on-surface": "#041b3c",
          "background": "#f9f9ff",
          "tertiary-container": "#006643",
          "inverse-primary": "#adc6ff",
          "surface-container-lowest": "#ffffff",
          "inverse-surface": "#1d3052",
          "on-tertiary-fixed-variant": "#005235",
          "on-tertiary": "#ffffff",
          "tertiary-fixed": "#98f6c4",
          "on-error": "#ffffff",
          "secondary-container": "#d0e1fb",
          "primary-fixed": "#d8e2ff",
          "on-tertiary-container": "#86e2b2",
          "on-secondary": "#ffffff",
          "primary-container": "#2457a7",
          "surface-tint": "#2b5cad",
          "primary-fixed-dim": "#adc6ff",
          "on-background": "#041b3c",
          "inverse-on-surface": "#edf0ff",
          "on-primary": "#ffffff",
          "surface-container": "#e8edff",
          "on-primary-fixed-variant": "#004493",
          "on-error-container": "#93000a",
          "on-secondary-fixed": "#0b1c30",
          "on-surface-variant": "#434751",
          "outline-variant": "#c3c6d3",
          "tertiary": "#004c30",
          "surface-bright": "#f9f9ff",
          "surface-container-low": "#f1f3ff",
          "secondary-fixed-dim": "#b7c8e1",
          "secondary": "#505f76",
          "error-container": "#ffdad6",
          "surface-dim": "#cadaff",
          "secondary-fixed": "#d3e4fe",
          "error": "#ba1a1a",
          "on-secondary-container": "#54647a",
          "surface-container-highest": "#d7e2ff",
          "surface-variant": "#d7e2ff"
        },
        "borderRadius": {
          "DEFAULT": "0.25rem",
          "lg": "0.5rem",
          "xl": "0.75rem",
          "full": "9999px"
        },
        "spacing": {
          "margin-desktop": "2rem",
          "space-xl": "2rem",
          "margin": "1rem",
          "gutter-desktop": "1.5rem",
          "space-md": "0.75rem",
          "margin-tablet": "1.5rem",
          "gutter": "1rem",
          "space-xs": "0.25rem",
          "space-sm": "0.5rem",
          "space-lg": "1.25rem"
        },
        "fontFamily": {
          "label-sm": [
            "Inter"
          ],
          "body-lg": [
            "Inter"
          ],
          "body-sm": [
            "Inter"
          ],
          "headline-md": [
            "Inter"
          ],
          "headline-xl": [
            "Inter"
          ],
          "body-md": [
            "Inter"
          ],
          "metric-display": [
            "Inter"
          ],
          "headline-sm": [
            "Inter"
          ],
          "headline-lg-mobile": [
            "Inter"
          ],
          "headline-lg": [
            "Inter"
          ],
          "headline-xl-mobile": [
            "Inter"
          ],
          "label-md": [
            "Inter"
          ]
        },
        "fontSize": {
          "label-sm": [
            "11px",
            {
              "lineHeight": "14px",
              "letterSpacing": "0.03em",
              "fontWeight": "600"
            }
          ],
          "body-lg": [
            "16px",
            {
              "lineHeight": "24px",
              "letterSpacing": "-0.005em",
              "fontWeight": "400"
            }
          ],
          "body-sm": [
            "13px",
            {
              "lineHeight": "18px",
              "letterSpacing": "0em",
              "fontWeight": "400"
            }
          ],
          "headline-md": [
            "18px",
            {
              "lineHeight": "24px",
              "letterSpacing": "-0.01em",
              "fontWeight": "600"
            }
          ],
          "headline-xl": [
            "32px",
            {
              "lineHeight": "40px",
              "letterSpacing": "-0.02em",
              "fontWeight": "600"
            }
          ],
          "body-md": [
            "14px",
            {
              "lineHeight": "20px",
              "letterSpacing": "0em",
              "fontWeight": "400"
            }
          ],
          "metric-display": [
            "28px",
            {
              "lineHeight": "32px",
              "letterSpacing": "-0.02em",
              "fontWeight": "600"
            }
          ],
          "headline-sm": [
            "15px",
            {
              "lineHeight": "20px",
              "letterSpacing": "-0.005em",
              "fontWeight": "600"
            }
          ],
          "headline-lg-mobile": [
            "20px",
            {
              "lineHeight": "28px",
              "letterSpacing": "-0.01em",
              "fontWeight": "600"
            }
          ],
          "headline-lg": [
            "24px",
            {
              "lineHeight": "32px",
              "letterSpacing": "-0.015em",
              "fontWeight": "600"
            }
          ],
          "headline-xl-mobile": [
            "26px",
            {
              "lineHeight": "32px",
              "letterSpacing": "-0.015em",
              "fontWeight": "600"
            }
          ],
          "label-md": [
            "12px",
            {
              "lineHeight": "16px",
              "letterSpacing": "0.01em",
              "fontWeight": "500"
            }
          ]
        }
      }
    }
  };</script></head><body class="bg-surface font-body-md text-body-md text-on-surface antialiased"><aside class="fixed left-0 top-0 h-full w-[260px] bg-surface-container-lowest z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]"><div class="flex flex-col"><div class="p-space-lg flex items-center gap-space-sm bg-surface-container-low/40"><img alt="Nexo Laboral Logo" class="h-8 w-auto object-contain" src="https://lh3.googleusercontent.com/aida/AEtjO1VcM4rzeYEv5GynTbiyqJNaq9-1KPMkZfQ1oGuuAJqRjCQy8M1lCUNguW-1TSAddb0QBB99znSIlvdX27Ux6TgZ8w5fuOAWFj0JXAE8644_faaF4rlrcz9j69kC-8T_bvZcG4FwiB2mu-2RZjVVZIn8KRTPQIDw-JSbvtoWa3odKRpcGex9_VCdUV9XeNCRLi7oTsMuAsQDF8uXSWwUlTDA5hy7Sdz8GSC8rLPGM1uoyZ4CIUv-8SR4bg"/><div class="flex flex-col min-w-0"><span class="font-headline-sm text-headline-sm text-primary tracking-tight truncate">Nexo Laboral</span><span class="font-label-sm text-label-sm text-secondary truncate">Nexus Digital · Operaciones</span></div></div><div class="px-space-md pt-space-md"><div class="flex items-center justify-between px-space-md py-space-sm bg-surface-container-low rounded-lg"><div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-primary text-[18px]">verified_user</span><span class="font-label-md text-label-md text-on-surface font-medium">RRHH Admin</span></div><span class="material-symbols-outlined text-outline text-[16px]">expand_more</span></div></div><nav class="flex flex-col gap-space-xs px-space-md pt-space-md" data-active-classes="bg-primary-container text-on-primary font-headline-sm rounded-lg"><a aria-current="page" class="flex items-center justify-between px-space-md py-space-sm transition-colors bg-primary-container text-on-primary font-headline-sm rounded-lg" data-path="resumen" href="#"><div class="flex items-center gap-space-sm"><span class="material-symbols-outlined text-[18px]">space_dashboard</span><span class="font-body-md text-body-md">Resumen</span></div></a><a class="flex items-center justify-between px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="personas" href="#"><div class="flex items-center gap-space-sm"><span class="material-symbols-outlined text-[18px]">group</span><span class="font-body-md text-body-md">Personas</span></div><span class="font-label-sm text-label-sm px-space-xs py-0.5 rounded bg-surface-container text-secondary">50</span></a><a class="flex items-center justify-between px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="equipos" href="#"><div class="flex items-center gap-space-sm"><span class="material-symbols-outlined text-[18px]">hub</span><span class="font-body-md text-body-md">Equipos</span></div><span class="font-label-sm text-label-sm px-space-xs py-0.5 rounded bg-surface-container text-secondary">4 cél.</span></a><a class="flex items-center justify-between px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="alertas" href="#"><div class="flex items-center gap-space-sm"><span class="material-symbols-outlined text-[18px]">warning</span><span class="font-body-md text-body-md">Alertas</span></div><span class="font-label-sm text-label-sm px-space-sm py-0.5 rounded-full bg-error text-on-error">4 activas</span></a><a class="flex items-center justify-between px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="importacion-de-datos" href="#"><div class="flex items-center gap-space-sm"><span class="material-symbols-outlined text-[18px]">upload_file</span><span class="font-body-md text-body-md">Importación de datos</span></div></a><a class="flex items-center justify-between px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="historial-y-reportes" href="#"><div class="flex items-center gap-space-sm"><span class="material-symbols-outlined text-[18px]">analytics</span><span class="font-body-md text-body-md">Historial y reportes</span></div></a><a class="flex items-center justify-between px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="configuracion-del-motor" href="#"><div class="flex items-center gap-space-sm"><span class="material-symbols-outlined text-[18px]">tune</span><span class="font-body-md text-body-md">Configuración del motor</span></div></a><a class="flex items-center justify-between px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="usuarios-y-permisos" href="#"><div class="flex items-center gap-space-sm"><span class="material-symbols-outlined text-[18px]">admin_panel_settings</span><span class="font-body-md text-body-md">Usuarios y permisos</span></div></a></nav></div><div class="p-space-md m-space-md bg-surface-container-low rounded-lg flex flex-col gap-space-xs"><div class="flex items-center gap-space-xs text-tertiary-container"><span class="material-symbols-outlined text-[14px]">sync_alt</span><span class="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Fase 1: Ingesta manual CSV/XLSX</span></div><span class="font-label-sm text-label-sm text-secondary">Motor v1.4.2 activo · 50 colaboradores</span><span class="font-label-sm text-label-sm text-outline">Nexus Digital · Córdoba, AR</span></div></aside><div class="pl-[260px]"><header class="fixed top-0 left-[260px] right-0 h-16 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex items-center justify-between px-space-lg"><div class="flex items-center gap-space-md min-w-0"><div class="flex items-center gap-space-sm text-secondary min-w-0"><span class="font-headline-sm text-headline-sm text-on-surface truncate">Operaciones y Desarrollo</span><span class="text-outline">/</span><div class="flex items-center gap-space-xs px-space-sm py-1 rounded bg-surface-container-low text-on-surface"><span class="material-symbols-outlined text-[16px] text-primary">calendar_today</span><span class="font-label-md text-label-md font-medium">Octubre 2024</span><span class="material-symbols-outlined text-[14px] text-outline">expand_more</span></div></div><div class="hidden xl:flex items-center gap-space-xs text-outline pl-space-md"><span class="material-symbols-outlined text-[14px]">schedule</span><span class="font-label-sm text-label-sm">Última importación: 24/10/2024 09:30 hs por M. Rossi</span></div></div><div class="flex items-center gap-space-md shrink-0"><a class="flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-colors" data-path="importacion-de-datos" href="#"><span class="material-symbols-outlined text-[18px]">add</span><span class="font-label-md text-label-md font-semibold">+ Importar datos</span></a><button class="relative p-space-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors"><span class="material-symbols-outlined text-[20px]">notifications</span><span class="absolute top-0 right-0 h-4 min-w-[16px] px-1 bg-error text-on-error font-label-sm text-label-sm rounded-full flex items-center justify-center font-bold">4</span></button><div class="flex items-center gap-space-sm pl-space-sm"><div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-on-primary text-[18px]">person</span></div><div class="hidden md:flex flex-col text-left"><span class="font-label-md text-label-md font-semibold text-on-surface leading-none">Lic. Mariana Rossi</span><span class="font-label-sm text-label-sm text-secondary leading-tight">RRHH Admin</span></div><span class="material-symbols-outlined text-outline text-[16px]">expand_more</span></div></div></header><main class="relative pt-16 bg-surface min-h-[calc(100vh-4rem)]"><div class="w-full px-gutter-desktop py-space-lg flex flex-col gap-space-lg"><div class="flex flex-col w-full">
<!-- ENCABEZADO ANALÍTICO -->
<section class="flex flex-col gap-space-md mb-space-lg">
<div class="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-space-md">
<div class="flex flex-col min-w-0">
<div class="flex items-center gap-space-xs text-primary font-label-sm text-label-sm uppercase tracking-wider mb-1">
<span class="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span>
<span>Tablero de Diagnóstico Operativo · RRHH</span>
</div>
<h1 class="font-headline-xl text-headline-xl text-on-surface tracking-tight font-semibold">
          Resumen de sobrecarga laboral
        </h1>
<p class="font-body-md text-body-md text-secondary mt-1">
          Área de Operaciones y Desarrollo · Nexus Digital S.R.L. · 50 personas distribuidas en 4 células
        </p>
</div>
<!-- Barra de herramientas superior -->
<div class="flex flex-wrap items-center gap-space-sm shrink-0">
<div class="flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-2 rounded-lg shadow-sm">
<span class="material-symbols-outlined text-[16px] text-primary">calendar_month</span>
<span class="font-label-md text-label-md text-on-surface font-medium">Octubre 2024 (Mes en curso)</span>
<span class="material-symbols-outlined text-[16px] text-outline">arrow_drop_down</span>
</div>
<div class="hidden md:flex items-center gap-space-xs bg-surface-container-low px-space-md py-2 rounded-lg text-secondary">
<span class="material-symbols-outlined text-[15px] text-secondary">memory</span>
<span class="font-label-sm text-label-sm">Motor v1.4.2 · 24/10/2024 09:30 hs</span>
</div>
<a class="inline-flex items-center gap-space-xs px-space-md py-2 rounded-lg bg-primary text-on-primary hover:bg-primary-container transition-all shadow-sm" data-path="importacion-de-datos" href="#">
<span class="material-symbols-outlined text-[18px]">file_upload</span>
<span class="font-label-md text-label-md font-semibold">Importar datos</span>
</a>
</div>
</div>
<!-- Metadatos de ingesta de archivo y validez -->
<div class="flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-low px-space-md py-space-xs rounded-lg text-secondary font-label-sm text-label-sm">
<div class="flex items-center gap-space-sm">
<span class="flex items-center gap-1 text-tertiary-container font-semibold">
<span class="material-symbols-outlined text-[16px]">check_circle</span>
          Dataset activo:
        </span>
<span class="font-mono text-on-surface font-medium">consolidado_octubre_v2.xlsx</span>
<span class="text-outline">•</span>
<span>Validación de integridad completada sin inconsistencias críticas</span>
</div>
<div class="flex items-center gap-space-xs text-outline">
<span class="material-symbols-outlined text-[14px]">shield</span>
<span>Hash SHA-256: 7f8a92...e41c</span>
</div>
</div>
<!-- Banner ético / metodológico preventivo -->
<div class="bg-surface-container-low rounded-lg p-space-md flex items-start gap-space-md shadow-sm">
<div class="p-1 rounded-full bg-secondary-container text-on-secondary-container shrink-0 mt-0.5">
<span class="material-symbols-outlined text-[18px]">verified</span>
</div>
<div class="flex flex-col min-w-0">
<span class="font-label-md text-label-md font-semibold text-on-surface">Marco Metodológico de Detección Objetiva</span>
<p class="font-body-sm text-body-sm text-secondary mt-0.5">
          Indicador preventivo de sobrecarga laboral computado a partir de 4 factores cuantitativos:
          <strong class="text-on-surface font-medium">horas extra acumuladas</strong>,
          <strong class="text-on-surface font-medium">días consecutivos sin descanso</strong>,
          <strong class="text-on-surface font-medium">volumen de tareas asignadas vs. completadas</strong> y
          <strong class="text-on-surface font-medium">días de licencia pendientes acumulados</strong>.
          Esta métrica no constituye diagnóstico médico ni evaluación psicológica; es una herramienta de soporte analítico para la gestión preventiva de equipos.
        </p>
</div>
</div>
</section>
<!-- FILA 1: TARJETAS KPI DE SALUD OPERATIVA -->
<section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mb-space-lg">
<!-- Tarjeta 1: Total evaluados -->
<div class="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
<div class="flex items-center justify-between">
<span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Personas evaluadas</span>
<span class="material-symbols-outlined text-secondary text-[20px]">groups</span>
</div>
<div class="my-space-sm flex items-baseline gap-space-xs">
<span class="font-metric-display text-metric-display text-on-surface font-semibold tracking-tight">50</span>
<span class="font-body-md text-body-md text-secondary">/ 50</span>
</div>
<div class="flex items-center justify-between text-secondary">
<div class="flex items-center gap-1 font-label-sm text-label-sm text-tertiary-container font-medium">
<span class="material-symbols-outlined text-[16px]">check</span>
<span>100% dotación activa</span>
</div>
<span class="font-label-sm text-label-sm text-outline">4 células</span>
</div>
</div>
<!-- Tarjeta 2: Riesgo Alto -->
<div class="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
<div class="absolute top-0 left-0 right-0 h-1 bg-error"></div>
<div class="flex items-center justify-between">
<span class="font-label-sm text-label-sm uppercase tracking-wider text-error font-semibold">Riesgo Alto</span>
<span class="material-symbols-outlined text-error text-[20px]">crisis_alert</span>
</div>
<div class="my-space-sm flex items-baseline gap-space-sm">
<span class="font-metric-display text-metric-display text-error font-semibold tracking-tight">4</span>
<span class="font-body-md text-body-md text-secondary">personas (8.0%)</span>
</div>
<div class="flex items-center justify-between">
<span class="inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-semibold">
<span class="material-symbols-outlined text-[14px]">trending_up</span>
          +1 vs. mes anterior
        </span>
<span class="font-label-sm text-label-sm text-secondary">Acción inmediata</span>
</div>
</div>
<!-- Tarjeta 3: Riesgo Medio -->
<div class="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
<div class="absolute top-0 left-0 right-0 h-1 bg-secondary"></div>
<div class="flex items-center justify-between">
<span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">Riesgo Medio</span>
<span class="material-symbols-outlined text-secondary text-[20px]">timelapse</span>
</div>
<div class="my-space-sm flex items-baseline gap-space-sm">
<span class="font-metric-display text-metric-display text-on-surface font-semibold tracking-tight">12</span>
<span class="font-body-md text-body-md text-secondary">personas (24.0%)</span>
</div>
<div class="flex items-center justify-between">
<span class="inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-medium">
<span class="material-symbols-outlined text-[14px]">horizontal_rule</span>
          Estable vs. mes anterior
        </span>
<span class="font-label-sm text-label-sm text-secondary">Seguimiento quincenal</span>
</div>
</div>
<!-- Tarjeta 4: Evaluaciones pendientes / incompletas -->
<div class="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
<div class="flex items-center justify-between">
<span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">Incompletas / Pendientes</span>
<span class="material-symbols-outlined text-secondary text-[20px]">pending_actions</span>
</div>
<div class="my-space-sm flex items-baseline gap-space-sm">
<span class="font-metric-display text-metric-display text-on-surface font-semibold tracking-tight">2</span>
<span class="font-body-md text-body-md text-secondary">personas (4.0%)</span>
</div>
<div class="flex items-center justify-between text-outline">
<span class="font-label-sm text-label-sm text-on-surface-variant truncate" title="Nunca computadas como riesgo bajo por principio precautorio">
          Sin imputar a riesgo bajo
        </span>
<span class="material-symbols-outlined text-[16px] text-primary" title="Principio de precaución activo">info</span>
</div>
</div>
</section>
<!-- FILA 2: GRIDS DE ANALÍTICA VISUAL (7 COLS / 5 COLS) -->
<section class="grid grid-cols-1 lg:grid-cols-12 gap-space-lg mb-space-lg">
<!-- Columna 7: Evolución temporal del riesgo -->
<div class="lg:col-span-7 bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-space-xs pb-space-md">
<div>
<h2 class="font-headline-sm text-headline-sm text-on-surface font-semibold">
            Evolución temporal del riesgo
          </h2>
<span class="font-label-sm text-label-sm text-secondary">Proporción mensual mayo – octubre 2024</span>
</div>
<!-- Leyenda técnica -->
<div class="flex items-center gap-space-md font-label-sm text-label-sm text-secondary">
<div class="flex items-center gap-1.5">
<span class="w-2.5 h-2.5 rounded-full bg-error"></span>
<span>Alto</span>
</div>
<div class="flex items-center gap-1.5">
<span class="w-2.5 h-2.5 rounded-full bg-primary-container"></span>
<span>Medio</span>
</div>
<div class="flex items-center gap-1.5">
<span class="w-2.5 h-2.5 rounded-full bg-tertiary-container"></span>
<span>Bajo</span>
</div>
</div>
</div>
<!-- Gráfico vectorial de áreas apiladas / serie temporal -->
<div class="w-full h-56 flex flex-col justify-end pt-2 pb-1 relative">
<svg class="w-full h-44 overflow-visible" preserveaspectratio="none" viewbox="0 0 540 160">
<!-- Guías horizontales sutiles -->
<line stroke="#f1f3ff" stroke-dasharray="3,3" stroke-width="1" x1="0" x2="540" y1="40" y2="40"></line>
<line stroke="#f1f3ff" stroke-dasharray="3,3" stroke-width="1" x1="0" x2="540" y1="80" y2="80"></line>
<line stroke="#f1f3ff" stroke-dasharray="3,3" stroke-width="1" x1="0" x2="540" y1="120" y2="120"></line>
<!-- Curva Bajo Riesgo (fondo verde sobrio) -->
<path d="M 0,90 Q 108,82 216,78 T 432,68 T 540,60 L 540,160 L 0,160 Z" fill="#004c30" fill-opacity="0.08"></path>
<path d="M 0,90 Q 108,82 216,78 T 432,68 T 540,60" fill="none" stroke="#006643" stroke-width="2"></path>
<!-- Curva Riesgo Medio (capa central azul/ámbar) -->
<path d="M 0,128 Q 108,124 216,118 T 432,108 T 540,98 L 540,160 L 0,160 Z" fill="#2457a7" fill-opacity="0.1"></path>
<path d="M 0,128 Q 108,124 216,118 T 432,108 T 540,98" fill="none" stroke="#2457a7" stroke-width="2"></path>
<!-- Curva Riesgo Alto (área de alerta superior acotada) -->
<path d="M 0,152 Q 108,148 216,145 T 432,142 T 540,136 L 540,160 L 0,160 Z" fill="#ba1a1a" fill-opacity="0.15"></path>
<path d="M 0,152 Q 108,148 216,145 T 432,142 T 540,136" fill="none" stroke="#ba1a1a" stroke-width="2.5"></path>
<!-- Puntos en el último mes (Octubre) -->
<circle cx="540" cy="60" fill="#006643" r="4"></circle>
<circle cx="540" cy="98" fill="#2457a7" r="4"></circle>
<circle cx="540" cy="136" fill="#ba1a1a" r="4"></circle>
</svg>
<!-- Eje temporal X -->
<div class="flex justify-between items-center text-outline font-label-sm text-label-sm pt-2">
<span>Mayo 24</span>
<span>Junio 24</span>
<span>Julio 24</span>
<span>Agosto 24</span>
<span>Septiembre 24</span>
<span class="text-primary font-bold">Octubre 24 (Actual)</span>
</div>
</div>
<div class="mt-space-md pt-space-sm bg-surface-container-low px-space-md py-space-sm rounded-lg flex items-center justify-between text-secondary font-label-sm text-label-sm">
<span class="flex items-center gap-1">
<span class="material-symbols-outlined text-[16px] text-primary">insights</span>
          Tendencia semestral: El porcentaje de bajo riesgo se contrajo 6% desde agosto debido al release 3.0.
        </span>
<span class="font-mono text-on-surface">Índice global: 31.4 / 100</span>
</div>
</div>
<!-- Columna 5: Distribución de riesgo por célula -->
<div class="lg:col-span-5 bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
<div>
<div class="flex items-center justify-between pb-space-xs">
<h2 class="font-headline-sm text-headline-sm text-on-surface font-semibold">
            Distribución por célula
          </h2>
<span class="font-label-sm text-label-sm text-secondary">4 células operativas</span>
</div>
<p class="font-label-sm text-label-sm text-secondary mb-space-md">
          Dotación total desglosada por niveles ponderados
        </p>
<!-- Barras horizontales comparativas -->
<div class="flex flex-col gap-space-md">
<!-- Célula Alfa -->
<div class="flex flex-col gap-1">
<div class="flex items-center justify-between font-label-md text-label-md">
<span class="text-on-surface font-semibold">Célula Alfa (14 pers.)</span>
<span class="text-error font-medium">2 Alto · 4 Medio · 8 Bajo</span>
</div>
<div class="w-full h-3 rounded-full bg-surface-container-high overflow-hidden flex">
<div class="h-full bg-error" style="width: 14.3%;" title="14% Alto"></div>
<div class="h-full bg-primary-container" style="width: 28.6%;" title="29% Medio"></div>
<div class="h-full bg-tertiary-container" style="width: 57.1%;" title="57% Bajo"></div>
</div>
</div>
<!-- Célula Beta -->
<div class="flex flex-col gap-1">
<div class="flex items-center justify-between font-label-md text-label-md">
<span class="text-on-surface font-semibold">Célula Beta (12 pers.)</span>
<span class="text-secondary font-medium">1 Alto · 3 Medio · 8 Bajo</span>
</div>
<div class="w-full h-3 rounded-full bg-surface-container-high overflow-hidden flex">
<div class="h-full bg-error" style="width: 8.3%;" title="8% Alto"></div>
<div class="h-full bg-primary-container" style="width: 25.0%;" title="25% Medio"></div>
<div class="h-full bg-tertiary-container" style="width: 66.7%;" title="67% Bajo"></div>
</div>
</div>
<!-- Célula Gamma -->
<div class="flex flex-col gap-1">
<div class="flex items-center justify-between font-label-md text-label-md">
<span class="text-on-surface font-semibold">Célula Gamma (13 pers.)</span>
<span class="text-secondary font-medium">1 Alto · 4 Medio · 8 Bajo</span>
</div>
<div class="w-full h-3 rounded-full bg-surface-container-high overflow-hidden flex">
<div class="h-full bg-error" style="width: 7.7%;" title="8% Alto"></div>
<div class="h-full bg-primary-container" style="width: 30.8%;" title="31% Medio"></div>
<div class="h-full bg-tertiary-container" style="width: 61.5%;" title="61% Bajo"></div>
</div>
</div>
<!-- Célula Delta -->
<div class="flex flex-col gap-1">
<div class="flex items-center justify-between font-label-md text-label-md">
<span class="text-on-surface font-semibold">Célula Delta (11 pers.)</span>
<span class="text-tertiary-container font-medium">0 Alto · 1 Medio · 10 Bajo</span>
</div>
<div class="w-full h-3 rounded-full bg-surface-container-high overflow-hidden flex">
<div class="h-full bg-error" style="width: 0%;" title="0% Alto"></div>
<div class="h-full bg-primary-container" style="width: 9.1%;" title="9% Medio"></div>
<div class="h-full bg-tertiary-container" style="width: 90.9%;" title="91% Bajo"></div>
</div>
</div>
</div>
</div>
<!-- Nota comparativa de célula crítica -->
<div class="mt-space-md p-space-sm rounded-lg bg-error-container text-on-error-container flex items-start gap-space-xs">
<span class="material-symbols-outlined text-[16px] shrink-0 mt-0.5">priority_high</span>
<span class="font-body-sm text-body-sm">
<strong>Célula Alfa</strong> presenta la mayor concentración de riesgo derivado del sprint final de la versión 3.0.
        </span>
</div>
</div>
</section>
<!-- FILA 3: TABLA DE PERSONAS QUE REQUIEREN ATENCIÓN PRIORITARIA -->
<section class="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md mb-space-lg">
<div class="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
<div>
<h2 class="font-headline-md text-headline-md text-on-surface font-semibold">
          Personas que requieren atención prioritaria
        </h2>
<p class="font-body-sm text-body-sm text-secondary">
          Casos identificados por umbrales de riesgo elevado o inconsistencia de registros de jornada
        </p>
</div>
<!-- Barra de filtros interactivos -->
<div class="flex flex-wrap items-center gap-space-xs">
<!-- Búsqueda -->
<div class="flex items-center gap-space-xs bg-surface-container-low px-space-sm py-1.5 rounded-lg text-on-surface">
<span class="material-symbols-outlined text-[16px] text-outline">search</span>
<input class="bg-transparent text-body-sm font-body-sm text-on-surface focus:outline-none w-40 placeholder:text-outline" id="filtro-busqueda" placeholder="Buscar por colaborador..." type="text"/>
</div>
<!-- Filtro Célula -->
<select class="bg-surface-container-low text-on-surface px-space-sm py-1.5 rounded-lg font-label-md text-label-md focus:outline-none" id="filtro-celula">
<option value="todas">Todas las células</option>
<option value="Alfa">Célula Alfa</option>
<option value="Beta">Célula Beta</option>
<option value="Gamma">Célula Gamma</option>
<option value="Delta">Célula Delta</option>
</select>
<!-- Filtro Nivel -->
<select class="bg-surface-container-low text-on-surface px-space-sm py-1.5 rounded-lg font-label-md text-label-md focus:outline-none" id="filtro-nivel">
<option value="todos">Todos los niveles</option>
<option value="alto">Riesgo Alto</option>
<option value="medio">Riesgo Medio</option>
<option value="incompleto">Datos Incompletos</option>
</select>
<button class="inline-flex items-center gap-1 px-space-sm py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md text-label-md transition-colors" onclick="alert('Exportando dataset consolidado en formato CSV compatible con auditoría laboral...')">
<span class="material-symbols-outlined text-[16px]">download</span>
<span>Exportar vista</span>
</button>
</div>
</div>
<!-- Tabla de alta densidad -->
<div class="overflow-x-auto w-full">
<table class="w-full text-left font-body-sm text-body-sm" id="tabla-casos">
<thead>
<tr class="bg-surface-container-low text-secondary font-label-sm text-label-sm uppercase tracking-wider h-10">
<th class="px-space-md py-2 rounded-l-lg">Colaborador / Rol</th>
<th class="px-space-md py-2">Célula</th>
<th class="px-space-md py-2 text-right">Índice</th>
<th class="px-space-md py-2 text-center">Nivel</th>
<th class="px-space-md py-2">Factores críticos detectados</th>
<th class="px-space-md py-2">Última eval.</th>
<th class="px-space-md py-2">Acción recomendada</th>
<th class="px-space-md py-2 text-right rounded-r-lg">Detalle</th>
</tr>
</thead>
<tbody class="text-on-surface">
<!-- Fila 1: Mateo Benítez -->
<tr class="hover:bg-surface-container-low/60 transition-colors fila-empleado" data-celula="Alfa" data-nivel="alto" data-nombre="mateo benitez">
<td class="px-space-md py-3">
<div class="flex items-center gap-space-sm">
<div class="w-8 h-8 rounded-full bg-error-container text-on-error-container font-semibold flex items-center justify-center font-label-md text-label-md shrink-0">
                  MB
                </div>
<div class="flex flex-col min-w-0">
<span class="font-label-md text-label-md font-semibold text-on-surface truncate">Mateo Benítez</span>
<span class="font-label-sm text-label-sm text-secondary truncate">Backend Senior</span>
</div>
</div>
</td>
<td class="px-space-md py-3 font-medium text-on-surface">Célula Alfa</td>
<td class="px-space-md py-3 text-right font-mono font-semibold text-error">84 / 100</td>
<td class="px-space-md py-3 text-center">
<span class="inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-semibold">
<span class="w-1.5 h-1.5 rounded-full bg-error"></span>
                Alto
              </span>
</td>
<td class="px-space-md py-3">
<div class="flex flex-wrap gap-1">
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">32h extra</span>
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">12d s/descanso</span>
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">8 tareas vencidas</span>
</div>
</td>
<td class="px-space-md py-3 font-mono text-secondary font-label-sm text-label-sm">24/10 09:30</td>
<td class="px-space-md py-3 text-secondary">
<span class="font-body-sm text-body-sm line-clamp-1 text-on-surface" title="Redistribuir backlog y programar franco compensatorio">
                Redistribuir backlog y programar franco
              </span>
</td>
<td class="px-space-md py-3 text-right">
<button class="p-1 text-primary hover:bg-surface-container-high rounded transition-colors" onclick="alert('Abriendo ficha de diagnóstico para Mateo Benítez...')" title="Ver ficha individual">
<span class="material-symbols-outlined text-[18px]">chevron_right</span>
</button>
</td>
</tr>
<!-- Fila 2: Lucía Fernández -->
<tr class="hover:bg-surface-container-low/60 transition-colors fila-empleado" data-celula="Beta" data-nivel="alto" data-nombre="lucia fernandez">
<td class="px-space-md py-3">
<div class="flex items-center gap-space-sm">
<div class="w-8 h-8 rounded-full bg-error-container text-on-error-container font-semibold flex items-center justify-center font-label-md text-label-md shrink-0">
                  LF
                </div>
<div class="flex flex-col min-w-0">
<span class="font-label-md text-label-md font-semibold text-on-surface truncate">Lucía Fernández</span>
<span class="font-label-sm text-label-sm text-secondary truncate">Tech Lead</span>
</div>
</div>
</td>
<td class="px-space-md py-3 font-medium text-on-surface">Célula Beta</td>
<td class="px-space-md py-3 text-right font-mono font-semibold text-error">79 / 100</td>
<td class="px-space-md py-3 text-center">
<span class="inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-semibold">
<span class="w-1.5 h-1.5 rounded-full bg-error"></span>
                Alto
              </span>
</td>
<td class="px-space-md py-3">
<div class="flex flex-wrap gap-1">
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">26h extra</span>
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">9d s/descanso</span>
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">14 tareas concur.</span>
</div>
</td>
<td class="px-space-md py-3 font-mono text-secondary font-label-sm text-label-sm">24/10 09:30</td>
<td class="px-space-md py-3 text-secondary">
<span class="font-body-sm text-body-sm line-clamp-1 text-on-surface" title="Delegar code-reviews y congelar nuevas asignaciones">
                Delegar reviews y congelar asignaciones
              </span>
</td>
<td class="px-space-md py-3 text-right">
<button class="p-1 text-primary hover:bg-surface-container-high rounded transition-colors" onclick="alert('Abriendo ficha de diagnóstico para Lucía Fernández...')" title="Ver ficha individual">
<span class="material-symbols-outlined text-[18px]">chevron_right</span>
</button>
</td>
</tr>
<!-- Fila 3: Gonzalo Morales -->
<tr class="hover:bg-surface-container-low/60 transition-colors fila-empleado" data-celula="Alfa" data-nivel="alto" data-nombre="gonzalo morales">
<td class="px-space-md py-3">
<div class="flex items-center gap-space-sm">
<div class="w-8 h-8 rounded-full bg-error-container text-on-error-container font-semibold flex items-center justify-center font-label-md text-label-md shrink-0">
                  GM
                </div>
<div class="flex flex-col min-w-0">
<span class="font-label-md text-label-md font-semibold text-on-surface truncate">Gonzalo Morales</span>
<span class="font-label-sm text-label-sm text-secondary truncate">DevOps Engineer</span>
</div>
</div>
</td>
<td class="px-space-md py-3 font-medium text-on-surface">Célula Alfa</td>
<td class="px-space-md py-3 text-right font-mono font-semibold text-error">76 / 100</td>
<td class="px-space-md py-3 text-center">
<span class="inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-semibold">
<span class="w-1.5 h-1.5 rounded-full bg-error"></span>
                Alto
              </span>
</td>
<td class="px-space-md py-3">
<div class="flex flex-wrap gap-1">
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">34h extra nocturnas</span>
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">Guardias no descansadas</span>
</div>
</td>
<td class="px-space-md py-3 font-mono text-secondary font-label-sm text-label-sm">24/10 09:30</td>
<td class="px-space-md py-3 text-secondary">
<span class="font-body-sm text-body-sm line-clamp-1 text-on-surface" title="Rotación obligatoria de guardia con célula Gamma">
                Rotación de guardia con cél. Gamma
              </span>
</td>
<td class="px-space-md py-3 text-right">
<button class="p-1 text-primary hover:bg-surface-container-high rounded transition-colors" onclick="alert('Abriendo ficha de diagnóstico para Gonzalo Morales...')" title="Ver ficha individual">
<span class="material-symbols-outlined text-[18px]">chevron_right</span>
</button>
</td>
</tr>
<!-- Fila 4: Camila Rossi -->
<tr class="hover:bg-surface-container-low/60 transition-colors fila-empleado" data-celula="Gamma" data-nivel="alto" data-nombre="camila rossi">
<td class="px-space-md py-3">
<div class="flex items-center gap-space-sm">
<div class="w-8 h-8 rounded-full bg-error-container text-on-error-container font-semibold flex items-center justify-center font-label-md text-label-md shrink-0">
                  CR
                </div>
<div class="flex flex-col min-w-0">
<span class="font-label-md text-label-md font-semibold text-on-surface truncate">Camila Rossi</span>
<span class="font-label-sm text-label-sm text-secondary truncate">QA Automation</span>
</div>
</div>
</td>
<td class="px-space-md py-3 font-medium text-on-surface">Célula Gamma</td>
<td class="px-space-md py-3 text-right font-mono font-semibold text-error">72 / 100</td>
<td class="px-space-md py-3 text-center">
<span class="inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-semibold">
<span class="w-1.5 h-1.5 rounded-full bg-error"></span>
                Alto
              </span>
</td>
<td class="px-space-md py-3">
<div class="flex flex-wrap gap-1">
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">22h extra</span>
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">28d vac. pendientes</span>
</div>
</td>
<td class="px-space-md py-3 font-mono text-secondary font-label-sm text-label-sm">24/10 09:30</td>
<td class="px-space-md py-3 text-secondary">
<span class="font-body-sm text-body-sm line-clamp-1 text-on-surface" title="Programar período de receso pendiente">
                Programar período de receso pendiente
              </span>
</td>
<td class="px-space-md py-3 text-right">
<button class="p-1 text-primary hover:bg-surface-container-high rounded transition-colors" onclick="alert('Abriendo ficha de diagnóstico para Camila Rossi...')" title="Ver ficha individual">
<span class="material-symbols-outlined text-[18px]">chevron_right</span>
</button>
</td>
</tr>
<!-- Fila 5: Martín Soria -->
<tr class="hover:bg-surface-container-low/60 transition-colors fila-empleado" data-celula="Alfa" data-nivel="medio" data-nombre="martin soria">
<td class="px-space-md py-3">
<div class="flex items-center gap-space-sm">
<div class="w-8 h-8 rounded-full bg-surface-container-high text-on-surface font-semibold flex items-center justify-center font-label-md text-label-md shrink-0">
                  MS
                </div>
<div class="flex flex-col min-w-0">
<span class="font-label-md text-label-md font-semibold text-on-surface truncate">Martín Soria</span>
<span class="font-label-sm text-label-sm text-secondary truncate">Frontend Semi-Senior</span>
</div>
</div>
</td>
<td class="px-space-md py-3 font-medium text-on-surface">Célula Alfa</td>
<td class="px-space-md py-3 text-right font-mono font-semibold text-primary">58 / 100</td>
<td class="px-space-md py-3 text-center">
<span class="inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-semibold">
<span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Medio
              </span>
</td>
<td class="px-space-md py-3">
<div class="flex flex-wrap gap-1">
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">14h extra</span>
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">Pico tareas de sprint</span>
</div>
</td>
<td class="px-space-md py-3 font-mono text-secondary font-label-sm text-label-sm">24/10 09:30</td>
<td class="px-space-md py-3 text-secondary">
<span class="font-body-sm text-body-sm line-clamp-1 text-on-surface" title="Monitoreo preventivo de cierre de release">
                Monitoreo preventivo de cierre
              </span>
</td>
<td class="px-space-md py-3 text-right">
<button class="p-1 text-primary hover:bg-surface-container-high rounded transition-colors" onclick="alert('Abriendo ficha de diagnóstico para Martín Soria...')" title="Ver ficha individual">
<span class="material-symbols-outlined text-[18px]">chevron_right</span>
</button>
</td>
</tr>
<!-- Fila 6: Sofía Valenzuela -->
<tr class="hover:bg-surface-container-low/60 transition-colors fila-empleado" data-celula="Beta" data-nivel="incompleto" data-nombre="sofia valenzuela">
<td class="px-space-md py-3">
<div class="flex items-center gap-space-sm">
<div class="w-8 h-8 rounded-full bg-surface-container-high text-secondary font-semibold flex items-center justify-center font-label-md text-label-md shrink-0">
                  SV
                </div>
<div class="flex flex-col min-w-0">
<span class="font-label-md text-label-md font-semibold text-on-surface truncate">Sofía Valenzuela</span>
<span class="font-label-sm text-label-sm text-secondary truncate">Data Analyst</span>
</div>
</div>
</td>
<td class="px-space-md py-3 font-medium text-on-surface">Célula Beta</td>
<td class="px-space-md py-3 text-right font-mono font-semibold text-outline">—</td>
<td class="px-space-md py-3 text-center">
<span class="inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high text-secondary font-semibold">
<span class="material-symbols-outlined text-[12px]">sync_problem</span>
                Incompleto
              </span>
</td>
<td class="px-space-md py-3">
<div class="flex flex-wrap gap-1">
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">Fichajes de entrada vacíos</span>
<span class="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm">Faltan marcas semana 42</span>
</div>
</td>
<td class="px-space-md py-3 font-mono text-secondary font-label-sm text-label-sm">24/10 09:30</td>
<td class="px-space-md py-3 text-secondary">
<span class="font-body-sm text-body-sm line-clamp-1 text-on-surface" title="Requerir validación manual a RRHH Operaciones">
                Requiere validación manual en RRHH
              </span>
</td>
<td class="px-space-md py-3 text-right">
<button class="p-1 text-primary hover:bg-surface-container-high rounded transition-colors" onclick="alert('Abriendo asistente de corrección de datos para Sofía Valenzuela...')" title="Subsanar datos">
<span class="material-symbols-outlined text-[18px]">edit_note</span>
</button>
</td>
</tr>
</tbody>
</table>
</div>
</section>
<!-- FILA 4: FEED OPERATIVO DE ALERTAS RECIENTES -->
<section class="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md">
<div class="flex items-center justify-between">
<div class="flex items-center gap-space-sm">
<span class="material-symbols-outlined text-error text-[20px]">notifications_active</span>
<h2 class="font-headline-sm text-headline-sm text-on-surface font-semibold">
          Últimas alertas automáticas generadas
        </h2>
</div>
<a class="font-label-md text-label-md text-primary font-semibold hover:underline flex items-center gap-1" data-path="alertas" href="#">
<span>Ver centro de alertas completo</span>
<span class="material-symbols-outlined text-[16px]">arrow_forward</span>
</a>
</div>
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
<!-- Alerta 1 -->
<div class="p-space-md rounded-lg bg-surface-container-low flex flex-col justify-between gap-space-sm hover:bg-surface-container transition-colors">
<div class="flex items-center justify-between">
<span class="font-label-sm text-label-sm font-semibold text-error uppercase">Crítica · Célula Alfa</span>
<span class="font-mono text-label-sm text-label-sm text-outline">09:34 hs</span>
</div>
<p class="font-body-sm text-body-sm text-on-surface font-medium line-clamp-2">
          M. Benítez acumuló 12 jornadas sin descanso semanal ininterrumpido.
        </p>
<div class="flex items-center justify-between text-secondary font-label-sm text-label-sm">
<span>Notificado: J. Romero (Lead Alfa)</span>
<span class="text-tertiary-container flex items-center gap-0.5">
<span class="material-symbols-outlined text-[14px]">done_all</span> Enviado
          </span>
</div>
</div>
<!-- Alerta 2 -->
<div class="p-space-md rounded-lg bg-surface-container-low flex flex-col justify-between gap-space-sm hover:bg-surface-container transition-colors">
<div class="flex items-center justify-between">
<span class="font-label-sm text-label-sm font-semibold text-error uppercase">Crítica · Célula Alfa</span>
<span class="font-mono text-label-sm text-label-sm text-outline">09:32 hs</span>
</div>
<p class="font-body-sm text-body-sm text-on-surface font-medium line-clamp-2">
          G. Morales superó el límite legal de 30 horas suplementarias mensuales.
        </p>
<div class="flex items-center justify-between text-secondary font-label-sm text-label-sm">
<span>Notificado: M. Rossi (RRHH)</span>
<span class="text-tertiary-container flex items-center gap-0.5">
<span class="material-symbols-outlined text-[14px]">done_all</span> Enviado
          </span>
</div>
</div>
<!-- Alerta 3 -->
<div class="p-space-md rounded-lg bg-surface-container-low flex flex-col justify-between gap-space-sm hover:bg-surface-container transition-colors">
<div class="flex items-center justify-between">
<span class="font-label-sm text-label-sm font-semibold text-primary uppercase">Advertencia · Célula Beta</span>
<span class="font-mono text-label-sm text-label-sm text-outline">09:31 hs</span>
</div>
<p class="font-body-sm text-body-sm text-on-surface font-medium line-clamp-2">
          L. Fernández tiene 14 tareas concurrentes en sprint de release crítico.
        </p>
<div class="flex items-center justify-between text-secondary font-label-sm text-label-sm">
<span>Notificado: Dir. Operaciones</span>
<span class="text-tertiary-container flex items-center gap-0.5">
<span class="material-symbols-outlined text-[14px]">done_all</span> Enviado
          </span>
</div>
</div>
<!-- Alerta 4 -->
<div class="p-space-md rounded-lg bg-surface-container-low flex flex-col justify-between gap-space-sm hover:bg-surface-container transition-colors">
<div class="flex items-center justify-between">
<span class="font-label-sm text-label-sm font-semibold text-secondary uppercase">Integridad · Ingesta</span>
<span class="font-mono text-label-sm text-label-sm text-outline">09:30 hs</span>
</div>
<p class="font-body-sm text-body-sm text-on-surface font-medium line-clamp-2">
          2 colaboradores con inconsistencias de marcas biométricas en semana 42.
        </p>
<div class="flex items-center justify-between text-secondary font-label-sm text-label-sm">
<span>Asignado: Soporte RRHH</span>
<span class="text-secondary flex items-center gap-0.5">
<span class="material-symbols-outlined text-[14px]">hourglass_top</span> En cola
          </span>
</div>
</div>
</div>
</section>
<!-- BLOQUE DE INFORMACIÓN INSTITUCIONAL Y LEGAL -->
<footer class="mt-space-lg p-space-md bg-surface-container-low rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-space-sm text-outline font-label-sm text-label-sm">
<div class="flex flex-col sm:flex-row sm:items-center gap-space-xs sm:gap-space-md">
<span class="text-on-surface font-semibold">Motor Nexo Laboral v1.4.2 (Algoritmo Preventivo)</span>
<span class="hidden sm:inline">•</span>
<span>Generado el 24/10/2024 · 09:30:14 GMT-3</span>
</div>
<div class="flex items-center gap-space-sm text-secondary">
<span>Tratamiento confidencial de datos · Cumplimiento Ley 25.326 de Protección de Datos Personales</span>
</div>
</footer>
<!-- LÓGICA DE FILTRADO INTERACTIVO CLIENT-SIDE -->
<script>
    (function initDashboardFilters() {
      const inputBusqueda = document.getElementById('filtro-busqueda');
      const selectCelula = document.getElementById('filtro-celula');
      const selectNivel = document.getElementById('filtro-nivel');
      const filas = document.querySelectorAll('.fila-empleado');

      function aplicarFiltros() {
        const texto = (inputBusqueda?.value || '').toLowerCase().trim();
        const celula = selectCelula?.value || 'todas';
        const nivel = selectNivel?.value || 'todos';

        filas.forEach(fila => {
          const rowNombre = fila.getAttribute('data-nombre') || '';
          const rowCelula = fila.getAttribute('data-celula') || '';
          const rowNivel = fila.getAttribute('data-nivel') || '';

          const coincideTexto = !texto || rowNombre.includes(texto);
          const coincideCelula = celula === 'todas' || rowCelula === celula;
          const coincideNivel = nivel === 'todos' || rowNivel === nivel;

          if (coincideTexto && coincideCelula && coincideNivel) {
            fila.classList.remove('hidden');
          } else {
            fila.classList.add('hidden');
          }
        });
      }

      inputBusqueda?.addEventListener('input', aplicarFiltros);
      selectCelula?.addEventListener('change', aplicarFiltros);
      selectNivel?.addEventListener('change', aplicarFiltros);
    })();

  </script>
</div><div class="mt-space-xl pt-space-md flex flex-col sm:flex-row items-center justify-between text-outline"><span class="font-label-sm text-label-sm">Documento confidencial para uso exclusivo de RRHH y Gerencia Operativa. Nexus Digital S.R.L. © 2024</span><span class="font-label-sm text-label-sm">ISO/IEC 27001 Ready · Servidores Región AR</span></div></div></main></div></body></html>
