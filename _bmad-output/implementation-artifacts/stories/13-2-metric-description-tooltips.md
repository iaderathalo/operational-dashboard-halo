# Story 13.2: Metric description tooltips — how-calculated · source · meaning on every metric

Status: ready-for-dev

## Story

As a **dashboard user (executive or app owner)**, I want to **hover any rendered metric or card and
read how it is calculated, where the data comes from, and what it means**, so that the numbers are
**self-explaining** and I trust them without asking the team (a common dashboard convention).

## Context / Why

Reviewers can read a value (Health GREEN, Uptime 99.9%, Maturity 3/5, Burn Rate 1.4x) but cannot
tell _how_ it was derived, _which_ system it came from, or _what_ it actually asserts — so they
don't trust it. The review asked for a hover description on **every** metric carrying
`how-calculated · source · meaning`.

We already have **two** working hover-tooltip patterns from the provenance work (story `5-3`) and we
must extend them, not invent a third:

1. **Portfolio table** (`portfolio-page`): cells get `class="prov-cell"` + `[attr.data-prov]="…"`
   and a `title=""` to suppress the native tooltip; the
   `.prov-cell::after { content: attr(data-prov) }` CSS renders the bubble on hover. The text is
   produced by builder functions `buildHealthProvenance` / `buildUptimeProvenance` and methods
   `maturityTooltip` / `burnRateTooltip`.
2. **Detail cards** (`detail-page`): a
   `<span class="src-dot" [attr.data-tip]="sourceTip(metric.source)">` provenance dot, rendered by
   `.src-dot::after { content: attr(data-tip) }`, text from `buildSourceTip`.

Today those tooltips only say _provenance_ (live vs stale vs not-mapped vs placeholder). This story
upgrades the content to the full **`how-calculated · source · meaning`** triad and, critically,
pulls the per-metric strings out of the scattered builder functions/label maps into **one
maintainable map** keyed by metric. That single map is the explicit **seed for the 13-7 Data Mapping
Rules document** (epic S7) — define the descriptions once, consume them in the UI now and in the doc
later.

**Honesty constraint (carried from `5-6`):** metrics that are placeholder / NO-GO (e.g. Perception,
Active Users, Incidents, Last Incident — the `placeholderColumns` set — and any
`source: 'placeholder'` detail card) must NOT get a fabricated "how-calculated" line. They keep the
honest "not wired to a live source yet" message. We describe how a number is built only where a real
number is built.

## Acceptance Criteria

1. **Every rendered live metric carries a hover tooltip with all three parts**
   `how-calculated · source · meaning`. This covers, at minimum: portfolio table **Health**,
   **Uptime**, **Maturity**, **Burn Rate**; and each detail-page **overview metric card**. (Existing
   health/uptime/maturity/burn-rate tooltips are upgraded from provenance-only to the full triad —
   the per-app provenance suffix, e.g. "synced 2h ago / Stale / Not mapped", is preserved.)
2. **Content lives in ONE maintainable map** keyed by metric (e.g. a `METRIC_DESCRIPTIONS` map of
   `{ howCalculated, source, meaning }`), with a single formatter that renders
   `how · source · meaning`. The builder functions / methods read from this map instead of holding
   hard-coded strings inline. The map is placed so it can be imported by the 13-7 doc generation
   (shared/exported, not buried as a private field).
3. **Consistent with the existing provenance pattern (`5-3`)** — reuse `.prov-cell`/`data-prov` in
   the portfolio table and `.src-dot`/`data-tip` on detail cards; reuse the existing `::after`
   bubble CSS and `title=""` native-tooltip suppression. **No new tooltip mechanism, library, or
   visual language is introduced.**
4. **No fabricated descriptions for NO-GO / placeholder cells** (`5-6` honesty): metrics in the
   `placeholderColumns` set and any detail card with `source: 'placeholder'` keep the honest "not
   wired to a live source yet" message and are NOT given an invented calculation. "Not monitored" /
   "No SLO" / "No data" states keep their honest text.
5. **Dynamic provenance still composes with the static description**: where a metric already appends
   per-app state (live vs stale vs not-mapped, last-sync age, burn-rate band), that state is still
   shown alongside the static `how · source · meaning` — the upgrade is additive, not a replacement.
6. **Unit tests** cover the new formatter/map: (a) a live metric renders all three parts in order;
   (b) a placeholder/NO-GO metric returns the honest message and no fabricated calculation; (c) a
   metric with a missing live value (e.g. uptime `null`, no maturity, unknown burn-rate band) keeps
   its honest "unavailable" wording.

## Dev Notes

- **Single source of truth (the map).** Add a `METRIC_DESCRIPTIONS` map plus a
  `formatMetricTooltip(...)` helper. Co-locate where both pages and the future 13-7 doc can import
  it — a small shared module, e.g. `apps/ui/src/app/features/dashboard/metric-descriptions.ts` (or
  under `libs/shared/api/src/model/dashboard/` if the 13-7 doc generator will live API-side). Pick
  one and keep all per-metric copy there. Each entry: `{ label, howCalculated, source, meaning }`;
  the formatter joins `howCalculated · source · meaning`.
- **Portfolio table (`portfolio-page`):** the tooltip strings currently come from
  `apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.ts` —
  `buildHealthProvenance` (line ~49), `buildUptimeProvenance` (line ~66), `maturityTooltip` (line
  ~437), `burnRateTooltip` (line ~481), with label maps `healthLabels` / `maturitySignalLabels` /
  `burnRateBandLabels` (lines ~139–166). Have these read the static triad from the map and append
  the existing dynamic provenance suffix. The markup hooks
  (`class="prov-cell" title="" [attr.data-prov]="…"`) are already in `portfolio-page.component.html`
  (lines ~362–411, table headers ~342–352) — reuse them unchanged.
- **Detail cards (`detail-page`):** `buildSourceTip` in
  `apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.ts` (line ~34)
  currently returns provenance only (`'Live · Datadog'` / `'Real · from PlanView (not Datadog)'` /
  placeholder). Extend so a card with a live `source` also renders the metric's
  `how · source · meaning` from the map (keyed by `metric.label` / a metric id), while
  `source: 'placeholder'` keeps the honest placeholder line. The overview card markup is in
  `detail-page.component.html` (lines ~58–66); the bubble CSS is `.src-dot::after`
  (`detail-page.component.scss` ~755). Metric card shape: `DashboardDetailMetricCard` /
  `DashboardDetailSource = 'datadog' | 'planview' | 'placeholder'` in
  `libs/shared/api/src/model/dashboard/DetailPage.ts`.
- **CSS bubble:** already exists in both SCSS files — `.prov-cell::after` (portfolio scss ~554) and
  `.src-dot::after` (detail scss ~755). `white-space: nowrap` may need relaxing for the longer triad
  so the bubble wraps instead of overflowing; that is the only styling change in scope.
- **Reuse, don't reinvent.** This is content + one map + wiring into the two existing hover
  mechanisms. No new tooltip component, no Angular Material tooltip, no new directive.

## Out of scope / follow-ups

- The **13-7 Data Mapping Rules living document** (epic `E13-S7`,
  `stories/13-7-data-mapping-rules-doc.md`) consumes this map — generating/maintaining that doc is
  that story, not this one. This story only guarantees the map is exportable/seed-ready.
- **Configurable colour thresholds per metric** is **13-3**
  (`stories/13-3-per-metric-thresholds.md`) — describing the threshold bands in the tooltip is fine,
  but the settings UI to change them is out of scope.
- **Metric IA grouping / reorder** (Health 1st, Maturity 2nd, …) is **13-4** — not part of the
  tooltip work.
- Defining/wiring the **Perception** metric is gated on **S5**; until then Perception stays
  honest-placeholder here.

## References

- Phase-2 epic backlog:
  `_bmad-output/planning-artifacts/epics-stories/phase-2-dashboard-trust-clarity-backlog-2026-06-23.md`
  → **E13-S2** (and **E13-S7** the consuming doc).
- Reviewer ask: add metric descriptions to every dashboard.
- Builds on `5-3` (provenance tooltip pattern — `prov-cell`/`data-prov`, `src-dot`/`data-tip`) and
  respects `5-6` (`stories/5-6-missing-data-states.md`, two-state honest missing-data — no false
  GREEN, no fabricated calc).

## Dev Agent Record

### File List

- apps/ui/src/app/features/dashboard/metric-descriptions.ts (NEW — the one `METRIC_DESCRIPTIONS`
  map + `formatMetricTooltip`; seed for 13-7) — adjust location to
  `libs/shared/api/src/model/dashboard/` if the 13-7 doc generator is API-side
- apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.ts —
  `buildHealthProvenance` / `buildUptimeProvenance` / `maturityTooltip` / `burnRateTooltip` read
  static triad from the map + keep dynamic provenance suffix
- apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.scss — relax
  `.prov-cell::after` `white-space` for the longer triad (only if needed)
- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.ts — `buildSourceTip`
  extended to append `how · source · meaning` for live cards; placeholder stays honest
- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.scss — relax
  `.src-dot::after` `white-space` for the longer triad (only if needed)
- apps/ui/src/app/features/dashboard/metric-descriptions.spec.ts (NEW — formatter/map tests: live
  triad, placeholder honesty, missing-value honesty)
