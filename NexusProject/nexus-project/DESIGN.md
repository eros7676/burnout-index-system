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
| `--level-bajo` (+ `-ink`) | #1a8c63 (#146b4b) | Bajo (calm) |
| `--level-medio` (+ `-ink`) | #bf7f0c (#8a5a00) | Medio |
| `--level-alto` (+ `-ink`) | #a3192b | Alto (the only urgent color) |
| `--level-incompleto` | #5c6875, hatched | Incompleto: a gap in history, not a severity |
| `--danger` / `--success` / `--notice` (+ `-soft`) | #a3174f / #0b6a62 / #5b3d9e | states: request errors (berry), completed actions (teal), simulated or pending (violet). Hues of their own, apart from the level scale and the accent, and always with an icon |
| `--strip` family | #18212b | the dark demo strip of the shell |

The level fills pass the palette validator against the surface (lightness band, chroma, CVD ΔE ≥ 7.9 with the shape marks as secondary encoding, 3:1); the `-ink` steps are for text on the `-soft` fills (≥ 4.5:1). The level scale is sequential (calm → urgent). Each level also differs in
shape: Bajo/Medio a square mark, Alto a diamond, Incompleto/Desactualizado an
outline; Incompleto fills are hatched (WCAG 1.4.1). The mark is the same in a
LevelTag, a legend key (`LevelMark`) and the distribution key.

States are drawn another way, so they never read as a level (visual-system
R27): a soft fill with a 1 px outline in the state's hue and a circle icon
(`exito` check, `info`, `error`), where a level is a soft fill without outline
and a square or diamond. The accent is for what can be clicked or is selected
(R28): the info notice is neutral and the stepper uses ink.

## Type

IBM Plex Sans (next/font, weights 400 and 600 only): its digits are tabular by
default, so columns of figures align. Sizes are Carbon's productive steps, and the
line height is part of the step:

| Token | Size/line | Use |
|---|---|---|
| `--text-xs` | 12/16 | column headers, labels above controls, secondary lines under a value, asides, tags, axis labels |
| `--text-md` | 14/20 | body, table cells, controls |
| `--text-lg` | 16/24 | section titles |
| `--text-xl` | 20/28 | sub-headlines |
| `--text-2xl` | 28/36 | page title (h1) |
| `--text-display` | 32/40 | headline figures |

`* { line-height: var(--leading) }` with `--leading: round(nearest, 1.2em + 3px, 4px)`
resolves every element's line height from its own size to the pair above, so
the declared pair is the rendered one and text boxes sit on the 4 px grid (R31,
R32). A module sets a size and nothing else. Weights are the two tokens;
`th` and `strong` use `--weight-strong`, not the UA's bold. A Section uses at
most three sizes (R33).

Sentence case everywhere; no all-caps labels, no eyebrows, no middle-dot meta
strings; separate facts with commas or layout.

## Layout

```
┌── demo strip: "Modo demostración…" · Perfil activo [usuario ▾] ───────────┐
├─────────────┬──────────────────────────────────────────────────────────────┤
│ Nexo Laboral│ PageHeader: h1 + one context line                  [primary] │
│ rol, alcance│ FilterBar: [Semana ▾] [other filters]                        │
│             │                                                              │
│ Seguimiento │ Sections (white, 10 px radius, 1 px line), one gutter apart  │
│ Datos       │ ┌ answer, 8 columns ─────────┐ ┌ support, 4 ──────┐          │
│ Mi espacio  │ └────────────────────────────┘ └──────────────────┘          │
│             │ ┌ trend / detail, 12 columns ──────────────────────┐          │
└─────────────┴──────────────────────────────────────────────────────────────┘
```

Sidebar 248 px, content max 1320 px, 32 px page padding, 4 px spacing grid.
The content is one container that centers once the window is wider than its
maximum (Polaris "center when there is no secondary column"). The sidebar and
the page start on one line: equal top padding, and the brand row is as tall as
the title's line, so brand and h1 share a center.

**Grid.** Twelve columns with one gutter (`--gutter`, 20 px). Splits are 12,
8+4 (answer and support, the answer top-left), 4+8, 6+6 and 4+4+4 (peers of
one kind), built with `Columns`; below 1100 px they stack. The gutter is also
the row gap, the distance between sections and the distance from the header to
the first block, so no gap is a compound of two values. The shell lays out a
screen's root as one grid with that gutter, so a screen cannot lose the header
gap. Blocks side by side
end on one line: the containers stretch (`Columns`, `Stack`) and their content
stays top-aligned, never stretched.

**Breakpoints.** Two: 900 px (the sidebar moves above the page) and 1100 px
(side-by-side blocks stack). Media queries cannot read tokens, so the set is
written here.

**Sizes (tokens).**

| Token | Value | Where |
|---|---|---|
| `--control-h` | 32 px | every Button, ButtonLink, SelectField, SearchField, DateField, form field, Pagination and nav link (Carbon small, Fiori compact for mouse use) |
| `--tag-h` | 24 px | LevelTag and StatusTag |
| `--row-h`, `--row-h-2` | 48 / 64 px | a table body row; a row whose first cell has a second line (person and team) |
| `--pad-section` | 24 px | Section padding, the same on four sides |
| `--icon-sm`, `--icon-md` | 16 / 20 px | icons next to 12-14 px text and next to 16 px text; the rendered stroke is 1.5 px at both |
| `--plot-h` | 220 px | plot of every weekly chart; bars take 60 % of their slot |
| `--radius-2xs`, `-xs`, `-sm`, `-md` | 2 / 3 / 6 / 10 px | marks and chart bars, tags and week cells, controls, sections |

Table header 12/16; text of the first and last columns sits on the Section's
key lines (the table bleeds one cell padding past them). Column rules are
1 px; focus and selection use 2 px.

## Components (src/shared/ui)

| Component | Rule |
|---|---|
| `PageHeader` | every screen opens with it; title and context on the left, actions on the right ending on the content's edge and on one control line; `volver` only on detail pages; no bottom margin (the page grid spaces it) |
| `Section` | a titled block; it is one piece of the entrance cascade; title at 16/24, aside at 12/16 on its baseline |
| `Columns`, `Stack` | `8-4`, `4-8`, `6-6`, `4-4-4` on twelve columns; blocks end level, the last block of a `Stack` takes the leftover height |
| `FilterBar`, `Toolbar` | the page's filters, week included, on one control line: `FilterBar` between the header and the content, `Toolbar` inside a Section |
| `Figure` | a number with its label above and meaning below; peers share width, top and gap |
| `LevelTag`, `LevelMark` | level as word + color + shape; `actualizado=false` reads "Desactualizado"; the mark alone for legends |
| `WeekStrip` | eight weeks, oldest → newest; consecutive Alto weeks join into one bar |
| `Plot` | the frame of every weekly chart: y axis with round ticks (`escalaLinda`), hairline grid, optional level bands named inside them, one slot per week as the hit target, week labels below |
| `DistributionBar`, `TrendLine`, `IndexChart`, `FactorBullet` | dependency-free charts, each with a hidden data table or accessible name and a readout on every mark; `TrendLine` is one weekly quantity (people in Alto, extra hours) with its finding written above it; one direct label at most; a missing week is a gap, never zero |
| `Tip`, `useLectura` | one tooltip bubble for the app. `Tip` on one trigger, only for what the screen does not say (a rule, a definition, a full date); `useLectura` gives a chart one tab stop, arrow keys between marks and a readout that leads with the value. Hover after 200 ms, focus at once, tap on touch, Escape dismisses, hoverable, persistent (WCAG 1.4.13) |
| `DataTable` | scrollable region with a label; numbers right-aligned with their header; first and last columns on the Section's key lines; `tabla.rowLink` names a row (ink), `tabla.cellLink` is the one action or value that opens a detail (accent) |
| `Button`, `ButtonLink` | one height (`--control-h`); primary filled, secondary outlined, quiet text-only; `alinearTexto` offsets a quiet button's padding so its text continues the column |
| `SkeletonRows`, `Empty`, `ErrorBox`, `Notice` | loading inside the datum's box; empty says what would appear and the next step, left-aligned; errors say what failed and offer retry; each state carries an icon |
| `SelectField`, `SearchField`, `DateField`, `Pagination` | visible labels; selects carry names, values carry ids — nobody types an ID |
| `TextField`, `TextAreaField`, `SelectFormField`, `CheckboxField`, `Form`, `FormGroup`, `FormActions`, `KeyFacts` | create and edit pages: annotated layout from 760 px of form width (group title and note on the left third; fields, notices, error summary and actions on the right), one column below it; labels above in body size, short fields on one row, buttons under the fields |
| `TextoTareas`, `textoTareas` | a week's tasks in words, «7 pendientes de 10, **5 vencidas**»; no bar (three counts read better as words) |
| `WeekDataTable` | loaded weekly data as loaded (7,5 h stays 7,5 h), no index or level |
| `StatusTag` | the state of an action or record (neutro, aviso, éxito, incidencia): outlined, with an icon; never a level |
| `Icon` | 16 or 20 px only (other sizes snap), one rendered stroke |
| `Stepper` | a flow's steps with the current one marked, in ink |

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

Roles: RR. HH. = RRHH; reading = RRHH, Gerencia and Team Lead (a Team Lead is
narrowed to their own team by the server). Lists link to detail pages; create
and edit are dedicated pages (R41–R43), never inline panels.

| Module | Route | Roles | Data |
|---|---|---|---|
| Ingreso | `/` | anyone | `GET /api/demo/sesion` |
| Resumen | `/home` | reading | `/api/personas`, `/api/resumen`, `/api/alertas` |
| Personas | `/employees` | reading | `/api/personas/directorio` (server-paged), `/api/equipos` (filter) |
| Persona (ficha) | `/employees/[employeeId]`, a week's tasks at `?semana=` (the old `/weeks/[periodStart]` redirects here) | reading (task rows: RR. HH., the team's lead; Gerencia only Team Leads) | `/api/personas/{id}`, `/api/reglas`, `/api/tareas`, `/api/tareas/historial` |
| Nueva persona | `/employees/new` | RR. HH. | `POST /api/personas`, `/api/personas/opciones` |
| Editar, cambiar equipo o puesto, dar de baja | `/employees/[employeeId]/edit`, `/move`, `/deactivate` | RR. HH. | `PATCH /api/personas/{id}`, `/asignaciones`, `/baja` |
| Importar personas | `/employees/import` | RR. HH. | `/api/personas/importacion/validar`, `/confirmar` (`personas-v1`) |
| Equipos | `/teams` | RR. HH., Gerencia | `/api/equipos` |
| Equipo | `/teams/[teamId]` | RR. HH., Gerencia; Team Lead only their own («Mi equipo» in the sidebar) | `/api/equipos/{teamId}`, `/api/personas/directorio`, `/api/tareas/equipo` |
| Nuevo equipo, editar, cambiar líder, desactivar | `/teams/new`, `/teams/[teamId]/edit`, `/lead`, `/deactivate` | RR. HH. | `/api/equipos`, `/api/equipos/opciones` |
| Alertas | `/alerts` | reading | `/api/alertas`, CSV `/api/exportaciones/alertas` |
| Alerta | `/alerts/[alertId]` | reading (mail: RR. HH.) | `/api/alertas/{id}`, `/seguimiento`, notifications (T12) |
| Informe | `/reports/[evaluationId]` | reading | `/api/evaluaciones/[id]` |
| Importación | `/importaciones` | RR. HH. | T04 routes, `/api/importaciones/tareas/validar` (`tareas-v1`), `/api/procesamientos` |
| Reglas | `/rules-config` | reading (edit: RR. HH.) | `/api/reglas`, `/api/reglas/versiones` |
| Borrador de reglas | `/rules-config/drafts/[borradorId]` | reading (edit: RR. HH.; approve: Gerencia) | `/api/reglas/borradores/{id}` and its simulate, submit, approve, reject, publish, discard actions |
| Auditoría | `/audit` | RR. HH., Gerencia | `/api/auditoria` (keyset-paged), `/api/auditoria/exportacion` (CSV, JSON) |
| Evento de auditoría | `/audit/[eventoId]` | RR. HH., Gerencia | `/api/auditoria/{eventoId}` |
| Operación de auditoría | `/audit/operations/[correlacionId]` | RR. HH., Gerencia | `/api/auditoria/operaciones/{correlacionId}` |
| Mis datos | `/my-data` | Empleado, Team Lead | `/api/mis-datos`, `/api/mis-datos/tareas` |

The sidebar shows only what the role may open (`src/components/shell/sesion.tsx`);
the server enforces the same scope (`proteger`). Aggregates smaller than five
people are not shown (`GRUPO_MINIMO`). CSV exports share one format
(`FORMATO_CSV`: semicolon, BOM, CRLF), and the audit export adds its own
formula guard.

## Decisions

### Global

#### Sistema

- 2026-11-02 — Colors, type sizes, radii and motion come from the tokens in globals.css, never raw values. (held by owner)
- 2026-11-02 — IBM Plex Sans, weights 400 and 600, Carbon productive sizes. (held by src/app/layout.tsx)
- 2026-11-02 — The level scale is the only saturated color; Alto is the only red. (held by owner)
- 2026-11-02 — Component styles are CSS Modules; Tailwind runs on globals.css only, for its reset. (held by next.config.ts)
- 2026-11-02 — Every control in the main area is `--control-h` (32 px); no screen sets its own control height. (held by work/enterprise/audit/rules.mjs, R10)
- 2026-11-02 — Type is Carbon's productive pairs, and the line height is resolved from the size by `--leading`. (held by globals.css)
- 2026-11-04 — Level fills re-stepped to pass the palette validator (Medio and Alto were ΔE 2.6 for deuteranopia); tags take the `-ink` text steps (D12). (held by globals.css and the dataviz validator run in work/graficos/inventario.md)
- 2026-11-04 — Better charts, not more charts: every existing chart has axes where it plots a quantity, a readout on every mark (hover, arrow keys, tap) and keeps its text alternative; no chart library (D12). (held by src/shared/ui/plot.tsx, tip.tsx and the e2e chart checks)
- 2026-11-04 — A tooltip only adds what the screen does not say (a rule, a definition, a full date) and never holds essential information (NN/g); it follows WCAG 2.2 SC 1.4.13 (D12). (held by src/shared/ui/tip.tsx)
- 2026-11-04 — A chart answers one question and its finding is written above it («7 personas en Alto, igual que la semana anterior»); a fact is drawn once per screen. Evolución is the Alto count as a line, team history a heat strip like the person strip, tasks are words, Mis datos plots extra hours (work/graficos/investigacion-librerias.md). (held by owner, 2026-11-04)
- 2026-11-04 — Resumen says which condition weighs most: «Condiciones que superan el umbral» lists, per factor, the people with a current result over its threshold, most frequent first, finding above. The counts are the stored evaluations' (`ResumenDTO.excedidas`), never recomputed in the client; bars in neutral ink, every value labelled where drawn. (held by e2e/tablero.spec.ts, tests/consultas.mysql.test.ts)
- 2026-11-04 — Load is findable, not only readable: Personas orders by tareas vencidas, horas extra and días sin descanso (the week's current record, highest first, sorted column marked with `aria-sort`) and filters by Puesto. Alertas says its list in one sentence («20 alertas de 8 personas; 20 sin seguimiento, 0 con el seguimiento vencido»), each part a filter link; Team Lead and Gerencia also get «dirigidas a usted» (`dirigidas=1`: the alerts they may follow). Mis datos opens the week with a sentence of facts (no threshold word, RF10) and shows tasks before the table. The report's task factor carries its counts in words; the person page names the oldest overdue task's delay. (held by e2e/personas.spec.ts, e2e/seguimiento.spec.ts, e2e/modulos.spec.ts, e2e/tareas.spec.ts, tests/organizacion.mysql.test.ts, tests/exportaciones.mysql.test.ts)
- 2026-11-04 — What waits for a person is on Resumen whatever the week: «Esperan revisión» counts alerts without a follow-up and overdue follow-ups, each linking to the alerts list with that filter (the counts are that list's totals, read after the page loads). «Nuevas en Alto» is a clause of the trend finding, not a figure. A team's alert figure counts people with an active alert, not alert-weeks. A team's task list keeps its state in the URL (`?tareas=VENCIDA`, `todas`), so the overdue figure, its button («Ver las N tareas vencidas del equipo») and a shared link open the same list; Gerencia, whose list holds only Team Leads, gets neither the count nor the link. (held by e2e/tablero.spec.ts, e2e/tareas.spec.ts)
- 2026-11-04 — Overdue tasks are a headline figure wherever load is read: Resumen (total, people, change from the previous week), Equipos (a column), the team's week (replacing «Con resultado vigente», now the average's detail), the person's last week, and a figure row over a week's tasks (whose filter options then carry no counts). Counts only, never rows; a team's total is withheld with its other aggregates. (held by owner, e2e/tareas.spec.ts, tests/organizacion.mysql.test.ts)
- 2026-11-04 — Tasks live where the person and the team live: a week's tasks open inside the person page (`?semana=`, from «Ver tareas» on each week or «Ver las N tareas vencidas»), a team's tasks in one list on its page, overdue first; there is no separate week page and no second weekly table. The person page opens with its newest week's tasks already listed (asking for them with a click was a step with no decision in it); a team's list still opens on request, since it reads every member. Each read is recorded per person. A role that cannot read a person's rows is not offered the way in (work/ia/auditoria.md). (held by e2e/tareas.spec.ts, tests/tareas.mysql.test.ts)
- 2026-11-04 — Every create and edit form, the rules draft included, takes one annotated layout (R47): group title and note on the left, controls and actions on the right; a form label is body size in ink so it reads before its help. (held by shared/ui field.module.css and form.tsx)
- 2026-11-06 — The day detail is a third dataset on the import screen («Días», `jornadas-v1`): seven rows per person-week, each a worked, rest, vacation or leave day (leave carries no reason). Like tasks it reconciles against the weekly summary (hours, the streak that reaches Sunday, the last vacation day), a difference rejects the whole file with what is missing, and confirming recalculates nothing (Docs/detalle-jornadas.md). (held by e2e/importaciones-jornadas.spec.ts, tests/importacion-jornadas*.test.ts)
- 2026-11-06 — Leave is shown, never weighed: a week with day detail reads «Licencia, N de 7 días» under the streak in the people list and the person's weekly table, beside the level on the person page and in the report, which says the index does not discount it. A week imported as a summary alone shows nothing (unknown, not zero). The person page lists the chosen week's days under the task rows' rule, so Gerencia does not see a technician's days. (held by e2e/personas.spec.ts, tests/importacion-jornadas.mysql.test.ts)
- 2026-11-02 — Danger, success and notice have hues of their own and an icon; the four level hues appear only on level encodings. (held by globals.css)
- 2026-11-02 — The accent appears only on interactive or selected elements. (held by owner)

#### Patrones

- 2026-11-02 — Every screen opens with PageHeader: title, one context line, at most one primary action. (held by owner)
- 2026-11-02 — The page is a 12-column grid with one gutter; splits are 12, 8+4, 4+8, 6+6 or 4+4+4, and blocks side by side end level. (held by shared/ui Columns)
- 2026-11-02 — The week is a filter: it sits in the page's FilterBar with the other filters, never in the header actions. (held by owner)
- 2026-11-02 — The first and last columns of a table sit on the Section's key lines. (held by shared/ui table.module.css)
- 2026-11-02 — The demo/not-a-diagnosis disclaimer appears once, in the shell's demo strip. (held by e2e/shell.spec.ts)
- 2026-11-02 — Visible text never shows raw IDs, enums or ISO dates; formato.ts maps them. (held by tests/formato.test.ts)
- 2026-11-02 — A level is always word + color + shape; a non-current result reads Desactualizado. (held by owner)
- 2026-11-02 — Wherever a person appears with history, the eight-week strip shows it. (held by owner)
- 2026-11-02 — Filters are selects with names; no screen asks to type an ID. (held by owner)
- 2026-11-02 — App code animates only through src/shared/motion; reduced motion is decided there. (held by the motion git-grep check)
- 2026-11-03 — Lists show a week's task counts (activas, pendientes, vencidas); the task items live on the week page and the task history, which back those counts (D5). (held by e2e/tareas.spec.ts)
- 2026-11-02 — [provisional] An action's or record's state uses StatusTag; a level only ever uses LevelTag. (held by owner)
- 2026-11-02 — [provisional] The report page is the one detail of a week's result; lists link to it instead of opening inline panels. (held by owner)
- 2026-11-03 — Every CSV export uses `FORMATO_CSV` (semicolon, BOM, CRLF; cells with the separator are quoted), the audit export included. (held by tests/auditoria-exportacion.test.ts)
- 2026-11-03 — An alert opens on its own page with the follow-up case and the simulated mail; lists never expand inline (D4). (held by e2e/seguimiento.spec.ts)
- 2026-11-03 — Weekly tasks are imported as `tareas-v1` snapshots whose counts must match the week's totals, or the batch is rejected (D5). (held by tests/importacion-tareas*.test.ts)
- 2026-11-03 — Team membership is effective-dated; people and teams are deactivated, never deleted (D6). (held by tests/organizacion*.test.ts)
- 2026-11-03 — Rules change through a draft that is simulated before it is published; a retroactive change needs a second user from Gerencia (D7). (held by tests/reglas-borradores*.test.ts)
- 2026-11-03 — A person has at most one open follow-up case; notes are append-only and closing needs a reason (D8). (held by tests/seguimiento*.test.ts)
- 2026-11-03 — Every write, denial and sensitive read records a catalog event with actor, subject and outcome in the same transaction (D9). (held by tests/auditoria*.test.ts)
- 2026-11-03 — Lists that grow with headcount × weeks page on the server (50 by default, 100 at most) (D10). (held by tests/rutas-api.test.ts and the repositories' tests)
- 2026-11-04 — Fields in a Toolbar or FilterBar share a six-column track (two columns at tablet width, one on a phone), so a second row of filters starts under the first. (held by shared/ui field.module.css, work/enterprise/audit/rules.mjs R11)
- 2026-11-04 — A StatusTag draws the one icon of its tone; callers pass only the word. (held by shared/ui status-tag.tsx)
- 2026-11-04 — A filter that changes several sections (Resumen's week) sits in the FilterBar above the content; a filter of one list sits in that section's Toolbar. (held by owner)
- 2026-11-04 — Deactivating is «Dar de baja» and its state «De baja»; the entry button is `dangerSecondary`, the confirming submit `danger`, and a condition that blocks it disables the submit and says why. (held by tests/organizacion*.test.ts, shared/ui button.tsx)
- 2026-11-04 — Every timestamp shown carries its year («4 nov 2026, 03:22») through formato.ts momentoConAnio. (held by tests/formato.test.ts)
- 2026-11-04 — Key facts sit in one row up to six; more balance over rows with no orphan item. (held by tests/columnas.test.ts)
- 2026-11-04 — Suggestions for review are written from the week's data (value, distance past the threshold, the week before, then a §5.4 action) by one pure server function, and read the same in the report, the alert and the person page, where the newest week's show under «Sugerencias de revisión» with the factor name in bold. A week with no factor past its threshold shows no section on the person page. (held by tests/informes.test.ts, tests/alertas.mysql.test.ts, e2e/personas.spec.ts)
- 2026-11-04 — An alert's notice section is titled by what it does: «Aviso por correo» with one «Enviar aviso por correo» when the server has SMTP, «Correo simulado» with its two simulations otherwise; a delivered notice reads «Enviado por correo» or «Enviado (simulado)». (held by e2e/notificaciones.spec.ts, tests/notificaciones.mysql.test.ts)
