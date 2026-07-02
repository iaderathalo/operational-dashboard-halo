# Story 7.4: Estate-wide Monitors rollup tile — OK / Warn / Alert / No Data on the summary bar

Status: done

## Story

As a **portfolio stakeholder**, I want a summary bar tile that shows how many Datadog monitors
across the entire visible portfolio are in each state (OK, Warning, Alert, No Data), so that I can
see the estate-wide monitoring health at a glance without drilling into individual apps.

## Context / Why

The portfolio summary bar already carries rolled-up reliability signals (error-budget burn,
maturity, top-risks panel) built by stories 11-1 and 11-2. Monitors are the most direct signal of
current app health in Datadog: an estate-wide view of how many monitors are OK vs degraded vs silent
gives operators the instant "is anything on fire right now?" answer.

The per-app monitor list is already synced by the bulk Datadog fetch (story 1-4,
`buildMonitorBreakdown` in `health-rollup.ts`) and stored on each app's `ApplicationMonitor[]`. All
aggregation is therefore **client-side** over already-synced data — no new Datadog API call, no new
backend endpoint.

**No Data is surfaced as a first-class bucket** (not collapsed into Warning) to distinguish apps
whose monitors have never reported from apps where monitors are actively degraded. This is
consistent with the two-state missing-data model from story 5-6 (never a false silent state).

The one backend change needed was preserving `datadogState` through `buildMonitorBreakdown` so the
Warn bucket can be filled from the Datadog-native four-state value (OK / Warn / Alert / No Data)
rather than only from the legacy GREEN / RED / AMBER status string. Legacy apps that have not
re-synced after deploy have AMBER monitors that map to No Data until the first sync completes —
acceptable transient behaviour.

50-monitor/app cap: `health-rollup.ts` fetches up to 50 monitors per app; apps with more than 50 may
under-count. No fix in scope for this story.

ADO: User Story US-1.4 (#2698566), Task #2708161.

## Acceptance Criteria

1. A **Monitors rollup tile** appears on the portfolio summary bar showing counts for four buckets:
   **OK**, **Warning**, **Alert**, **No Data** — all four are always visible (zero counts shown
   honestly, not hidden).
2. **No Data is explicit** — monitors whose `datadogState` is absent or unmapped are placed in the
   No Data bucket, not in Warning or Alert.
3. **Aggregation is client-side** — no new Datadog API call or backend endpoint is added; the tile
   reads from already-synced `ApplicationMonitor[]` data via `buildMonitorRollup()`.
4. The tile **reuses `.pf-summary-stat` card styling** — no new visual language or component.
5. `datadogState` is **preserved through `buildMonitorBreakdown`** in `health-rollup.ts` so the four
   Datadog states (OK / Warn / Alert / No Data) can be distinguished at aggregation time.
6. **Legacy AMBER fallback** is documented and tested: monitors with only a legacy `status=AMBER`
   (pre-sync) map to `noData`, `status=GREEN` maps to `ok`, `status=RED` maps to `alert`.
7. **50-monitor/app cap** caveat is documented (under-count possible for large apps; out of scope).
8. **US-2.4 drill-down** (list of firing monitors) is deferred; a
   `// TODO(US-2.4): drill into firing-monitors list` comment is present in the template with no
   click handler wired.
9. Unit tests cover: empty portfolio, empty monitors, each individual bucket, multi-app aggregation,
   and legacy fallback mappings (`GREEN->ok`, `RED->alert`, `AMBER->noData`).
10. Playwright/Chrome e2e: tile renders and all four buckets are visible with non-trivial counts.

## Dev Notes / Files Touched

**Backend (one change):**

- `apps/api/src/datadog/health-rollup.ts` — `buildMonitorBreakdown` now preserves `datadogState` on
  each `ApplicationMonitor` so aggregation callers can bucket by native Datadog state.
- `apps/api/src/datadog/health-rollup.spec.ts` — 4 new assertions: `datadogState` carries through
  for each of Alert / OK / Warn / No Data.
- `apps/api/src/dashboard/seed/portfolio.seed.health.ts` — 4 seed apps enriched with
  `ApplicationMonitor[]` arrays (Mercer FIBER = OK, Mercer Beacon = Warn, Email Marketing = Alert,
  Chat Bot = No Data) to produce meaningful demo counts.
- `apps/api/src/dashboard/seed/portfolio.seed.shared.ts` — supporting seed plumbing.

**Shared model:**

- `libs/shared/api/src/model/dashboard/Application.ts` — `ApplicationMonitor` carries
  `datadogState`.
- `libs/shared/api/src/model/dashboard.ts` — re-exports `ApplicationMonitor` so UI importers access
  the type from a single import without a second path.

**Frontend (aggregation + tile):**

- `apps/ui/src/app/features/dashboard/monitor-rollup.util.ts` (NEW) — `buildMonitorRollup()`
  aggregates `ApplicationMonitor[]` across the portfolio tree into `{ ok, warn, alert, noData }`;
  `monitorRollupCache` is populated inside `recomputeTopRisks()` following the `topRiskAppsCache`
  caching precedent.
- `apps/ui/src/app/features/dashboard/monitor-rollup.util.spec.ts` (NEW) — 11 tests: empty apps,
  empty monitors, each `datadogState` bucket, multi-app aggregation, legacy fallback (`GREEN->ok`,
  `RED->alert`, `AMBER->noData`), and `datadogState` priority over `status`.
- `apps/ui/src/app/features/dashboard/metric-descriptions.ts` — tooltip description added for the
  Monitors rollup metric.
- `apps/ui/src/app/features/dashboard/models/portfolio.model.ts` — `ApplicationMonitor` re-exported
  so the component has a single model import.
- `apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.ts` — wires
  `monitorRollupCache`; calls `buildMonitorRollup()` in `recomputeTopRisks()`.
- `apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.html` — renders
  the four-bucket `.pf-summary-stat` tile; `// TODO(US-2.4): drill into firing-monitors list`
  comment in the template; no click handler wired.

## Verification

- **Build:** `nx build api ui` — GREEN. Pre-existing warnings (CommonJS optimization bailouts from
  `@okta`, bundle budget exceeded by ~313 kB) are unrelated to this change.
- **Unit tests — API:** 261 tests, 35 suites — all pass.
  - `health-rollup.spec.ts` +4 assertions: `datadogState` is carried through `buildMonitorBreakdown`
    for each bucket (Alert / OK / Warn / No Data).
- **Unit tests — UI:** 185 tests, 21 suites — all pass.
  - `monitor-rollup.util.spec.ts` 11 new tests: empty apps, empty monitors, OK bucket, Warn bucket,
    Alert bucket, No Data bucket, multi-app aggregation, legacy `GREEN->ok` / `RED->alert` /
    `AMBER->noData` fallback, and `datadogState` priority over `status`.
- **Playwright / Chrome e2e:** tile rendered; counts observed: 2 OK, 2 Warn, 1 Alert, 1 No Data —
  all four buckets visible. Auth bypass reverted before the run. Screenshots:
  - `captures/2708161/01-portfolio-full.png`
  - `captures/2708161/02-summary-bar.png`

## References

- ADO: User Story US-1.4 (#2698566), Task #2708161.
- Work-scope draft (Raja/Anand 2026-06-25): US-1.4 / 2.4 — monitor rollup and drill-down.
  `_bmad-output/planning-artifacts/work-scope-reconciliation-2026-06-25.md`.
- Builds on story 1-4 (bulk monitor fetch / `buildMonitorBreakdown` in `health-rollup.ts`).
- Respects story 5-6 (two-state missing-data — No Data explicit, never a false silent state).
- Caching pattern from story 11-1 (`topRiskAppsCache` / `recomputeTopRisks()`).
- Metric-descriptions map from story 13-2.
- US-2.4 drill-down (firing monitors list) deferred — `TODO` comment in template.
- E2e screenshots: `captures/2708161/`.
