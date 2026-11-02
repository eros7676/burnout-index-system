# UI/UX research for the Nexo Laboral rebuild

Desk research done on 2026-11-02 to ground the rebuild (DESIGN.md) in current
practice. Font features were verified by parsing the font files served by
Google Fonts; es-AR formats by running `Intl` in Node 24. Anything not
confirmed from a primary source is marked (unverified).

## 1. People-analytics and workload products

- Microsoft Viva Insights "is not designed to enable employee evaluation,
  tracking, automated decision making, profiling, or monitoring"; managers
  cannot see individuals' personal habits.
  https://learn.microsoft.com/en-us/viva/insights/introduction
- Viva and Lattice hide groups below a minimum size (5 by default) and say so.
  https://learn.microsoft.com/en-us/viva/insights/privacy/privacy-considerations ·
  https://help.lattice.com/en-us/articles/16541513-choosing-strong-or-basic-anonymity-protection-in-engagement-surveys
- Peakon's manager dashboard reads top-down from the overall score, shows the
  change since last round and at most three focus areas.
  https://doc.workday.com/peakon/en-us/workday-peakon-employee-voice/insights/manager-dashboards/mst1655302585906.html
- Culture Amp compares each group with the company, not with an absolute color.
  https://support.cultureamp.com/en/articles/7048608-report-colors

**Applied:** alerts read as workload conditions with causes before the score;
team aggregates under five people are hidden (`GRUPO_MINIMO`); Resumen shows
the change against the previous week.

## 2. Dashboards and tables

- "Overview first, zoom and filter, then details-on-demand" (Shneiderman).
  https://webspace.science.uu.nl/~telea001/uploads/VACourse/Shneiderman96.pdf
- Dashboards should be glanceable and focused on one task; encode with length
  and position, sort by value, color only reinforces.
  https://www.nngroup.com/articles/dashboards-preattentive/
- Tables: right-align numbers, caption, `scope`; filters discoverable and
  visibly active. https://design-system.service.gov.uk/components/table/ ·
  https://www.nngroup.com/articles/data-tables/ ·
  https://carbondesignsystem.com/patterns/filtering/
- Skeletons for page loads; empty states say what would appear and how to fill
  it. https://www.nngroup.com/articles/skeleton-screens/ ·
  https://www.nngroup.com/articles/empty-state-interface-design/

**Applied:** Resumen opens with the sorted list of people at Alto; filters are
selects with names; no pagination for 49 people; every list has loading,
empty and error states with a next step.

## 3. Data visualization

- Sparklines are "word-sized graphics" (Tufte).
  https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/
- Bullet graphs compare a value with a target over qualitative bands (Few).
  https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- Status: never color alone; color, shape and a text label; marks need 3:1.
  https://carbondesignsystem.com/patterns/status-indicator-pattern/ ·
  https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html ·
  https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html

**Applied:** the eight-week strip (consecutive Alto weeks join into one bar,
with "N semanas seguidas"), factor bullet graphs against their threshold, and
level tags with word + color + shape.

## 4. Typography

Tabular digits verified in the font files: IBM Plex Sans and Source Sans 3 by
default; Atkinson Hyperlegible Next, Public Sans, Red Hat Text, Instrument
Sans and others through `tnum`. Libre Franklin, Albert Sans, Lexend and
Commissioner have proportional digits only. Carbon's productive type set
(12/16, 14/20, 16/24, 20/28, 28/36) is built for product UIs.
https://carbondesignsystem.com/elements/typography/type-sets/

**Applied:** IBM Plex Sans, weights 400/600, Carbon productive sizes.

## 5. Content

- 79% of users scan; concise, scannable, objective text improved usability by
  124% combined. https://www.nngroup.com/articles/how-users-read-on-the-web/
- Plain language, specialist terms explained once, active voice.
  https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/
- Errors: what happened, specific, with a fix, near the source.
  https://www.nngroup.com/articles/error-message-guidelines/
- Repeated banners are ignored (banner blindness).
  https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/
- es-AR via `Intl`: `1.234,5`; `formatRange` produces malformed week labels, so
  week labels are built by hand; times forced to 24 h.

**Applied:** one disclaimer in the shell; every code mapped to words with
units (`src/shared/formato.ts`).

## 6. Motion

- Carbon: productive motion for tables and controls, expressive only for rare
  moments; durations 70–400 ms. https://carbondesignsystem.com/elements/motion/overview/
- Material 3 standard easing `cubic-bezier(0.2, 0, 0, 1)`.
  https://raw.githubusercontent.com/angular/components/main/src/material/core/tokens/m3/_md-sys-motion.scss
- Reduced motion: replace movement with opacity or nothing.
  https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- Lenis: anchors need `anchors: true`; nested scrollers need
  `data-lenis-prevent`; an in-progress smooth scroll cannot be interrupted by
  keyboard or scrollbar (open issue #107). The research recommended not using
  it. https://github.com/darkroomengineering/lenis ·
  https://www.github.com/darkroomengineering/lenis/issues/107

**Applied:** the house motion scale (120–300 ms, standard easing), one page
cascade, no count-up numbers. Lenis is kept because the owner asked for it,
with anchors on, inner scrollers opted out and no instance under reduced
motion.

## 7. Accessibility (WCAG 2.2 AA)

Contrast 4.5:1 for text, 3:1 for marks and focus; targets 24 px; tables with
`scope` and captions; `role="status"` for progress, `role="alert"` for
failures; charts with a text alternative.
https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html ·
https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html ·
https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html ·
https://www.w3.org/WAI/tutorials/images/complex/

## 8. Navigation

Left vertical navigation, visible text labels, only the screens the role may
open; the header names the product; a page header with title, context and
actions; a persistent strip names the identity being viewed in demo mode.
https://www.nngroup.com/articles/vertical-nav/ ·
https://carbondesignsystem.com/components/UI-shell-header/usage/ ·
https://primer.style/product/components/page-header/

## Not adopted (needs a decision or a schema change)

- Human actions on alerts ("Marcar como revisada", "Descartar") need a stored
  review state: a schema change outside this rebuild's scope.
