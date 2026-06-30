# Story 13.4: Metric information architecture — group App Monitoring vs App Perception & reorder

Status: ready-for-dev

## Story

As a **dashboard user**, I want the portfolio table and the app-detail metrics **grouped into "App
Monitoring" vs "App Perception"**, with the most important monitoring metrics first (**Health,
Maturity, Uptime, then burn-rate**) and the **still-undefined perception metrics hidden** until
perception is defined, so that the table and detail read clearly and I'm not distracted by
placeholder columns that carry no live signal.

## Context / Why

The portfolio table today interleaves live monitoring signals with not-yet-defined perception and
other placeholder columns, and the column order doesn't lead with what matters. Health (live
Datadog), Maturity (`7-2`), and Uptime (live Datadog SLO) are the real monitoring signals;
Perception is still a placeholder (`placeholderColumns.perception` is `true`) and its definition is
itself an open product question owned by story `13-5`. Mixing the two groups, and ranking a
greyed-out Perception column second, makes the table read as if perception were a first-class live
metric.

This story is an **information-architecture cleanup**, not a data change: separate the two metric
families, reorder the monitoring side, and **hide** the perception column/metrics. **Hiding
perception is exactly what removes the dependency on `13-5`** — once the column is gone, the
monitoring side is fully shippable now with zero new data. When `13-5` lands a real perception
definition, the hidden column/tab is re-enabled under the "App Perception" group with no re-layout.

The portfolio table header/body lives in
`apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.html` (the
`<thead>`/`<tbody>` block, ~lines 340–435) with the placeholder flags in
`apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.ts`
(`placeholderColumns`, ~lines 173–178). The detail tab bar is `DETAIL_TABS` in
`apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.data.ts` (~lines 24–34), rendered
by the `tab-bar` `*ngFor` in `detail-page.component.html` (~line 43).

## Acceptance Criteria

1. **Portfolio table — group split.** The `<th>`/`<td>` columns are visually grouped into **App
   Monitoring** vs **App Perception** (a grouped header row / super-header spanning the monitoring
   columns and the perception column, or a clear visual separator), so the two metric families read
   as distinct families rather than one flat row.
2. **Portfolio table — monitoring reorder.** Within the App Monitoring group the columns are ordered
   **Health (1st), Maturity (2nd), Uptime (3rd), Burn Rate (after)** — i.e. `Maturity` and `Uptime`
   swap from today's `Health → Perception → Uptime → Maturity → Burn Rate` order, and `Perception`
   no longer sits between Health and the monitoring metrics. The non-metric columns (`Application`,
   `Total External Users`, `Total Internal Users`, `Active Users`, `Incidents`, `Last Incident`)
   keep their current relative positions and are not part of the monitoring/perception grouping.
3. **Portfolio table — hide perception.** The **Perception** column (`<th>Perception</th>` and its
   `data-label="Perception"` `<td>`) is **hidden** rather than greyed: it is removed from render
   (gated on the existing `placeholderColumns.perception` flag) so it does not occupy a column until
   perception is defined (`13-5`). Flipping that flag to `false` re-shows it under the App
   Perception group with no further layout change.
4. **Portfolio summary — perception consistency.** The portfolio summary "User Perception" breakdown
   stat (the `pf-summary-stat`, ~line 142) and the per-section "User Perception" row (~line 302) are
   hidden behind the **same** `placeholderColumns.perception` gate so the summary doesn't advertise
   a metric the table no longer shows. (Health, Active Incidents, and roll-up badges are
   unaffected.)
5. **Detail tabs — group & gate.** In `DETAIL_TABS`, the **Perception** tab is hidden behind the
   same perception gate (not deleted from the type/definition), and the monitoring-side tabs
   (`Health`, and Maturity context where shown) read as App-Monitoring; tab order leads with the
   monitoring signal (`Overview → Health → …`) and Perception only appears once re-enabled. No other
   tab (`AI Tokens`, `AI Drift`, `Cost`, `Incidents`, `Contacts`, `Settings`) is reordered or
   removed.
6. **No scope regression.** The **All / My Applications** scope toggle (`3-3`) is unaffected —
   grouping/reordering is pure presentation over the same `apps`/`currentNode` data; re-scoping
   still re-renders the same grouped layout.
7. **No missing-data regression.** The **two-state missing-data model** (`5-6`) is preserved:
   Health/Uptime/Maturity cells keep their `metric-muted` / "—" honest-empty rendering and
   provenance tooltips (`prov-cell`, `data-prov`); nothing about hiding perception turns an
   unmonitored app into a false GREEN.
8. **Tests.** A UI test asserts the new monitoring column order (Health, Maturity, Uptime, Burn
   Rate) and that the Perception column/summary/detail-tab are absent while
   `placeholderColumns.perception` is `true` and present when it is `false`.

## Dev Notes

- **Column reorder (monitoring side):** in `portfolio-page.component.html`, move the `Maturity`
  `<th>`/`<td>` ahead of `Uptime` so the monitoring block reads
  `Health → Maturity → Uptime → Burn Rate`; keep `Burn Rate` immediately after. Today's order is
  `Application, Health, Perception, Uptime, Maturity, Burn Rate, Total External Users, Total Internal Users, Active Users, Incidents, Last Incident`
  — only the monitoring metrics move.
- **Group header:** add a super-header `<tr>` (or a styled column separator) in the `<thead>` that
  labels the monitoring span "App Monitoring" and the perception span "App Perception"; reuse
  existing `app-table` styling — no new visual language. When perception is hidden, the "App
  Perception" label collapses with its column.
- **Hide, don't grey:** the perception column already carries
  `[class.placeholder-col]="placeholderColumns.perception"`. Switch from dimming to omission — wrap
  the perception `<th>`/`<td>` (and the two summary blocks) in
  `*ngIf="!placeholderColumns.perception"`. Keep the `placeholderColumns` object in
  `portfolio-page.component.ts` (~lines 173–178) as the single on/off switch so `13-5` flips one
  flag.
- **Detail tabs:** gate the Perception entry in `DETAIL_TABS` (`detail-page.data.ts`) behind the
  same perception concept rather than deleting it — e.g. filter it out of the rendered `tabs` while
  perception is undefined — so the `'perception'` `DetailTabId`, the perception `tab-panel` (~line
  444), and `PERCEPTION_STATUS_LABELS` stay intact for re-enablement. Do **not** restructure the
  perception panel content.
- **Reuse, don't reinvent:** this is markup ordering + a render gate + a group header. No model,
  API, or service change; no new Datadog call. The maturity/uptime/health cells and their
  provenance/missing-data behavior are moved verbatim.

## Out of scope / follow-ups

- **Defining what "Perception" actually is** (subjective sentiment vs NFR/performance thresholds)
  and re-enabling the perception column/tab with real data is **story `13-5`** (E13-S5, currently
  blocked on the product decision).
- Per-metric threshold bands for the reordered columns are **story `13-3`** (E13-S3); this story
  only changes order and grouping, not band logic.
- A descriptive Maturity breakdown in the cell/tooltip is **story `13-6`** (E13-S6); unaffected here
  beyond the column moving to 2nd.

## References

- Phase-2 epic:
  `_bmad-output/planning-artifacts/epics-stories/phase-2-dashboard-trust-clarity-backlog-2026-06-23.md`
  → **E13-S4**.
- Builds on / must not regress: `3-3` (All/My-Applications scope toggle), `5-6` (two-state
  missing-data model), `7-2` (maturity score). Gated peer: `13-5` (perception definition) re-enables
  the hidden perception group.

## Dev Agent Record

### File List

- apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.html — reorder
  monitoring `<th>`/`<td>` (Health, Maturity, Uptime, Burn Rate), add App Monitoring / App
  Perception group header, gate Perception column + the two "User Perception" summary blocks on
  `placeholderColumns.perception`
- apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.ts — keep
  `placeholderColumns.perception` as the single hide/show switch; any helper to expose the gate to
  the template
- apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.scss —
  group-header / separator styling (reuse existing `app-table` discipline)
- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.data.ts — gate the Perception
  entry in `DETAIL_TABS` (keep `'perception'` `DetailTabId`, panel, and `PERCEPTION_STATUS_LABELS`
  intact for re-enablement)
- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.ts / .html — render
  only the non-gated tabs while perception is undefined
- (+ a UI spec asserting monitoring column order and perception hidden/shown by the flag)
