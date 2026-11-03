---
name: Nexo Laboral
tokens: src/app/globals.css (:root)
motion: src/shared/motion (mirrors the --motion-* tokens)
kit: src/shared/ui
research: ../../Docs/investigacion-ui.md
---

# Nexo Laboral — design record

The product shows, week by week, who carries sustained work overload and why,
so a person (RRHH, a Team Lead, management) reviews it in time. It is not a
diagnosis and never rates people. Every screen answers one question in its
header; everything else on the screen supports that answer.

Audience: RRHH analysts, Team Leads and management on desktop Chrome/Firefox
(RNF07). UI copy is Spanish (es-AR) in a formal neutral register (see Content).
Code, comments and this file are English.

## Principles

1. **Answer first.** A screen's title and one context line state what it
   answers; the first block is that answer (a sorted list, not KPI tiles).
   Overview → filter → detail on demand (Shneiderman).
2. **Conditions, not people.** Alerts and levels describe workload conditions
   ("Horas extra y días consecutivos sin descanso"), with factors before the score.
3. **The week is the unit.** Every value belongs to a week; the eight-week
   strip is the product's signature and appears wherever a person does.
4. **Say it once.** The demo/"not a diagnosis" disclaimer lives in one place:
   the shell's demo strip, linking to Reglas. No repeated banners, no
   explanatory paragraphs a label could replace.
5. **Words, not codes.** No raw IDs, enums or ISO dates as visible text; names,
   plain levels, es-AR dates and numbers with units (`src/shared/formato.ts`).
6. **Quiet chrome, loud data.** Neutrals carry the layout; only the level scale
   is saturated, and it is never shown without its word.

## Color

| Token | Value | Role |
|---|---|---|
| `--ink` / `--ink-2` / `--ink-3` | #18212b / #4a5563 / #657080 | text: primary, secondary, tertiary (all ≥ 4.5:1 on white) |
| `--paper` / `--surface` / `--surface-2` | #f2f3f1 / #fff / #f7f8f6 | app background, sections, table head and hover |
| `--line` / `--line-strong` | #e1e4df / #c6ccc5 | dividers, control borders |
| `--accent` (+ `-hover`, `-soft`) | #1f5673 | interactive only: links, primary button, selected nav, focus |
| `--level-bajo` | #3f7559 | Bajo (calm, recedes) |
| `--level-medio` | #9a5b0b | Medio |
| `--level-alto` | #b42318 | Alto (the only urgent color) |
| `--level-incompleto` | #5c6875, hatched | Incompleto: a gap in history, not a severity |
| `--danger`, `--success`, `--notice` | | request errors, completed actions, simulated/pending states |
| `--strip` family | #18212b | the dark demo strip of the shell |

The level scale is sequential (calm → urgent). Each level also differs in
shape: Bajo/Medio a square mark, Alto a diamond, Incompleto/Desactualizado an
outline; Incompleto fills are hatched (WCAG 1.4.1).

## Type

IBM Plex Sans (next/font, weights 400 and 600 only): its digits are tabular by
default, so columns of figures align. Sizes follow Carbon's productive set:

| Token | Size/line | Use |
|---|---|---|
| `--text-xs` | 12/16 | column headers, axis labels, group titles — never a value |
| `--text-sm` | 13/18 | secondary line under a value, captions |
| `--text-md` | 14/20 | body, table cells, controls |
| `--text-lg` | 16/24 | section titles |
| `--text-xl` | 20/28 | legend figures |
| `--text-2xl` | 28/36 | page title (h1) |
| `--text-display` | 32/40 | headline figures |

Sentence case everywhere; no all-caps labels, no eyebrows, no middle-dot meta
strings; separate facts with commas or layout.

## Layout

```
┌──────────────── demo strip: "Modo demo…" · Viendo como [usuario ▾] ───────┐
├─────────────┬──────────────────────────────────────────────────────────────┤
│ Nexo Laboral│ PageHeader: h1 + one context line        [filters] [primary] │
│ rol, alcance│                                                              │
│             │ Sections (white, 10 px radius, 1 px line), 20 px apart      │
│ Seguimiento │ ┌ answer (wide) ─────────────┐ ┌ supporting column ┐        │
│ Datos       │ └────────────────────────────┘ └───────────────────┘        │
│ Mi espacio  │ ┌ trend / detail (full width) ─────────────────────┐        │
└─────────────┴──────────────────────────────────────────────────────────────┘
```

Sidebar 248 px, content max 1320 px, 32 px page padding, 4 px spacing grid.
Content is left-aligned. Radii by role: 3 px tags and week cells, 6 px
controls, 10 px sections. One elevation (`--shadow-pop`) for popovers only.

## Components (src/shared/ui)

| Component | Rule |
|---|---|
| `PageHeader` | every screen opens with it; `volver` only on detail pages |
| `Section` | a titled block; it is one piece of the entrance cascade |
| `Figure` | a number with its label above and meaning below |
| `LevelTag` | level as word + color + shape; `actualizado=false` reads "Desactualizado" |
| `WeekStrip` | eight weeks, oldest → newest; consecutive Alto weeks join into one bar |
| `DistributionBar`, `WeekColumns`, `IndexChart`, `FactorBullet` | SVG-free, dependency-free charts, each with a hidden data table or aria-label |
| `DataTable` | scrollable region with a label; numbers right-aligned; row header is the person |
| `SkeletonRows`, `Empty`, `ErrorBox`, `Notice` | loading inside the datum's box; empty says what would appear and the next step; errors say what failed and offer retry |
| `SelectField`, `SearchField`, `Toolbar`, `DateField` | visible labels; selects carry names, values carry ids — nobody types an ID |
| `TaskBar`, `TaskLegend`, `textoTareas` | a week's tasks as one bar (vencidas, pendientes, completadas) with the same counts in words; the legend once per block |
| `HoursColumns` | hours per week with extra hours stacked; neutral, never a level |
| `WeekDataTable` | loaded weekly data as loaded (7,5 h stays 7,5 h), no index or level |
| `StatusTag` | the state of an action or record (neutral, aviso, éxito, incidencia); never a level |
| `Stepper`, `Pagination` | a flow's steps with the current one marked; previous/next with "Página n de m" |

A new pattern is added to the kit first, then used.

## Content

Register (D1; research work/enterprise/research/ux-writing-es.md §2, after the RAE
DPD, Microsoft's Spanish style guide and Workday/SAP/Oracle/IBM product copy):
buttons are an infinitive plus its object ("Confirmar importación"); titles,
labels and column headers are noun phrases; states, empty states and success
messages are impersonal ("Se guardaron 120 registros."); *usted* only when the
user must act ("Corrija el archivo y valídelo nuevamente."); permission errors
say "No tiene permiso para…". Never voseo, tú, «acá», exclamations, "por favor"
or emojis. Terms (D2): RR. HH., Gerencia, Team Lead, Empleado as role labels;
"equipo" for the org unit (data names keep «Célula ficticia N»); "persona" for
whoever the index covers; "factores", never "causas"; "importar", never
"cargar" as a noun.

- Levels: Bajo, Medio, Alto, Incompleto (no previous week to confirm), plus
  "Desactualizado" when the stored result is not current (T14).
- Factors: Horas extra, Días consecutivos sin descanso, Carga de tareas, Vacaciones
  pendientes — always with units ("16 h", "9 días").
- Weeks: "12–18 oct 2026", built from the date string (no browser time zone).
- Numbers: decimal comma, two decimals for indices ("91,21").
- Buttons say what happens ("Validar archivo", "Simular envío"); an action keeps
  its name through its result.
- Empty: what would appear here + how to fill it. Error: what failed
  ("No se pudo…") + the remedy in *usted*.

## Motion

Scale (tokens `--motion-*`, mirrored in `src/shared/motion/motion.ts`): 120 /
180 / 240 / 300 ms, ease `cubic-bezier(.2,0,0,1)`, cascade step 35 ms, rows 25
ms, travel 12/8/6 px. A page pours in once (`usePageEnter`, `data-enter` on
the header and each section); data waits for its piece (`useArrival`); table
rows stagger on load (`useRowsEnter`). Only `transform`/`opacity` move;
`will-change` is released after entry. App code never imports `gsap`.
Reduced motion is one switch in the motion module (every helper becomes a
no-op, tokens read 0 ms). Lenis smooths page scroll (owner's request); it is
not created under reduced motion, anchors stay enabled, and every inner
scroller (tables, sidebar) carries `data-lenis-prevent`. Research advises
against smooth scroll for keyboard users (Docs/investigacion-ui.md §6); the
mitigations above are the price of keeping it.

## Accessibility

WCAG 2.2 AA: text ≥ 4.5:1, chart marks and control borders ≥ 3:1, visible 2 px
focus ring, targets ≥ 24 px, `th scope` on every table, `role="status"` for
progress and results, `role="alert"` only for failures, charts with a text
alternative.

## Module map

| Module | Route | Roles | Data |
|---|---|---|---|
| Ingreso | `/` | anyone | `GET /api/demo/sesion` |
| Resumen | `/home` | RRHH, Gerencia, Team Lead | `/api/personas`, `/api/resumen`, `/api/alertas` |
| Personas | `/employees`, `/employees/[employeeId]` | RRHH, Gerencia, Team Lead | `/api/personas` |
| Equipos | `/teams` | RRHH, Gerencia | `/api/personas` |
| Alertas | `/alerts` | RRHH, Gerencia, Team Lead | `/api/alertas`, notifications (T12) |
| Informe | `/reports/[evaluationId]` | RRHH, Gerencia, Team Lead | `/api/evaluaciones/[id]` |
| Importación | `/importaciones` | RRHH | T04 routes, `/api/procesamientos` |
| Reglas | `/rules-config` | RRHH, Gerencia, Team Lead | `/api/reglas` |
| Auditoría | `/audit` | RRHH, Gerencia | `/api/auditoria` |
| Mis datos | `/my-data` | Empleado, Team Lead | `/api/mis-datos` |

The sidebar shows only what the role may open (`src/components/shell/sesion.tsx`);
the server enforces the same scope (`proteger`). Aggregates smaller than five
people are not shown (`GRUPO_MINIMO`).

## Decisions

### Global

#### Sistema

- 2026-11-02 — Colors, type sizes, radii and motion come from the tokens in globals.css, never raw values. (held by owner)
- 2026-11-02 — IBM Plex Sans, weights 400 and 600, Carbon productive sizes. (held by src/app/layout.tsx)
- 2026-11-02 — The level scale is the only saturated color; Alto is the only red. (held by owner)
- 2026-11-02 — Component styles are CSS Modules; Tailwind runs on globals.css only, for its reset. (held by next.config.ts)

#### Patrones

- 2026-11-02 — Every screen opens with PageHeader: title, one context line, at most one primary action. (held by owner)
- 2026-11-02 — The demo/not-a-diagnosis disclaimer appears once, in the shell's demo strip. (held by e2e/shell.spec.ts)
- 2026-11-02 — Visible text never shows raw IDs, enums or ISO dates; formato.ts maps them. (held by tests/formato.test.ts)
- 2026-11-02 — A level is always word + color + shape; a non-current result reads Desactualizado. (held by owner)
- 2026-11-02 — Wherever a person appears with history, the eight-week strip shows it. (held by owner)
- 2026-11-02 — Filters are selects with names; no screen asks to type an ID. (held by owner)
- 2026-11-02 — App code animates only through src/shared/motion; reduced motion is decided there. (held by the motion git-grep check)
- 2026-11-02 — [provisional] Tasks are shown as the week's counts (activas, pendientes, vencidas), never as task items. (held by owner)
- 2026-11-02 — [provisional] An action's or record's state uses StatusTag; a level only ever uses LevelTag. (held by owner)
- 2026-11-02 — [provisional] The report page is the one detail of a week's result; lists link to it instead of opening inline panels. (held by owner)
