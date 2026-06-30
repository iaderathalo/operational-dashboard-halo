---
baseline_commit: 9635eeb7d8bb77a312bc50953f1ee7989b4d42c
---

# Story 12.1: Synced-data cards — real Recent Health Events + Recent Activity from data we already sync

Status: done

## Story

As an **app owner**, I want the detail page's **Recent Health Events** and **Recent Activity** cards
to show real per-app history — status transitions and a feed of our own derived events — instead of
the dummy rows, so that I can trust what the page tells me about an application without a single new
Datadog call.

## Context / Why

The detail page ships a rich set of mockup tabs backed by **dummy data**, and two of them are
**GO-NOW** off data the sync **already brings** — zero new dependency, no `service`-tag gate. This
is the first, quick-win pass of the card-truth epic (E12): kill two dummy tabs immediately with data
already in Mongo.

**Recent Health Events** is a diff of consecutive **`HealthSnapshot`** statuses. That append-only
series is already synced per app and already read for the Health Timeline (FR-3):
`findRecentByApplicationId` → `getHealthHistory`
(`GET /dashboard/portfolio/apps/:id/health-history`) → `buildHealthTimeline` in the UI. Diffing
adjacent records where `status` changes yields a real list of status transitions — same series, new
derivation, no extra fetch.

**Recent Activity** is a feed assembled from **our own derived events** — the things we already
compute on each sync: sync runs (`lastSyncStatus` / `lastSyncAt`), health transitions (the same
snapshot diff), SLO-burn-band changes (`burnRate.band`, story 11-2), and mapping/provenance changes
(`datadogMapped` / `resolutionPath`, 5-3/5-6). Nothing here calls Datadog; everything is read off
data already persisted.

Both cards must honor the standing missing-data discipline: ~100% coverage of mapped apps,
**honest-empty** when there is no history yet (never seeded), and **never a false GREEN** — an
unknown/unmapped status is not painted green (cf. 5-6, FR-3). Today both cards are populated by the
server-side seed `createDashboardDetailResponse` (`detail.seed.ts`, fields `healthEvents` /
`activityLog`) and rendered in the overview/health tabs — this story replaces those two seeded
blocks with derived truth.

## Acceptance Criteria

1. **Recent Health Events** is derived by **diffing consecutive `HealthSnapshot` records** (the same
   already-synced series read via `findRecentByApplicationId` / the `health-history` path): emit one
   entry per adjacent pair whose `status` changes, carrying timestamp, `fromLabel`→`toLabel`, and
   source — newest first. No-change runs produce no row; an unknown status maps to amber, never
   green.
2. **Recent Activity** is a feed built from **our own derived events** — sync runs (`lastSyncStatus`
   / `lastSyncAt`), health transitions (same snapshot diff), SLO-burn-band changes (`burnRate.band`,
   11-2), and mapping/provenance changes (`datadogMapped` / `resolutionPath`, 5-3/5-6) — ordered
   newest-first with a color/tone per event kind.
3. Both feeds are **pure local derivation over already-synced data** — **no new Datadog API call**
   is added, and no per-app fetch on render beyond the series the app already loads.
4. **~100% coverage of mapped apps:** any app with a `HealthSnapshot` history yields real Health
   Events; any app yields a Recent Activity feed from at least its sync-run events.
5. **Honest-empty, never false GREEN:** when an app has no snapshot history (or no derivable
   events), the card shows an explicit empty state rather than seeded rows, consistent with the
   Health Timeline's empty state (5-6 / 5-8); the two-state missing-data model is respected
   (unmapped is distinguished, not greened).
6. The seeded `healthEvents` / `activityLog` blocks (`detail.seed.ts`) are **no longer the source of
   truth** in real (non-demo) mode; demo mode may keep its showcase rows, mirroring the Health
   Timeline's demo/real split.
7. Unit tests cover: the **transition-diff** (multi-status series → correct transitions, no-change →
   no rows), the **empty** case (no history → honest-empty, not GREEN), and the **unmapped** app
   case.

## Dev Notes

- **Snapshot source (do not re-fetch):** Health Events diff the same series as the timeline —
  `HealthSnapshotRepository.findRecentByApplicationId`
  (`apps/api/src/health-snapshots/health-snapshot.repository.ts`), surfaced through
  `DashboardService.getHealthHistory` and `GET .../health-history` in
  `apps/api/src/dashboard/dashboard.controller.ts`. The series is `HealthSnapshot[]` (`status`,
  `recordedAt`, `datadogMapped`, `resolutionPath`, `monitorCount`, `uptimePct`) from
  `libs/shared/api/src/model/dashboard/HealthSnapshot.ts`.
- **Transition-diff:** sort by `recordedAt`, walk adjacent pairs, emit on `status` change → the
  `DashboardDetailHealthEvent` shape (`time`, `event`, `fromLabel`, `toLabel`, `source`, `duration`)
  in `libs/shared/api/src/model/dashboard/DetailPage.ts`. Mirror `buildHealthTimeline`'s tone rule
  (`apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.data.ts`) so an unknown status
  never reads GREEN.
- **Activity feed:** assemble `DashboardDetailActivityItem[]` (`time`, `color`, `text`) from derived
  signals already on the app context — `lastSyncStatus`/`lastSyncAt` and `burnRate.band`
  (`portfolio.model.ts`, 11-2), the health-transition diff, and `datadogMapped`/`resolutionPath`
  (5-3/5-6).
- **Where today's dummy lives:** server-side, `createDashboardDetailResponse` in
  `apps/api/src/dashboard/seed/detail.seed.ts` populates `healthEvents` (~line 653) and
  `activityLog` (~line 679); it's invoked from `MongoPortfolioRepository.getAppDetail`
  (`apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`). Replace those two blocks with the
  derived feeds (build server-side from the app context + snapshot series, or overlay client-side
  mirroring the timeline's `loadHealthTimeline` demo/real split — keep the same pattern).
- **Render sites (unchanged markup):** `activityLog` renders in the overview tab and `healthEvents`
  in the health tab table of
  `apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.html`; the timeline
  demo/real toggle lives in `detail-page.component.ts` (`loadHealthTimeline` /
  `renderHealthTimeline`, `healthTimelineLive` / `healthTimelineEmpty`) — reuse that empty-state
  discipline.
- **Reuse, don't reinvent:** this is derivation + render over an already-loaded series — not a new
  fetch, not a new endpoint, not a new Datadog call.

## Out of scope / follow-ups

- The LLM-on-demand **Maturity Recommendations** tab is **story 12-2** (rides on synced data;
  gateway-gated).
- **Open Incidents** (ServiceNow), **Health Check Breakdown** (Synthetics), and **Infra Cost MTD**
  cards are **12-3 / 12-4 / 12-5** — each blocked on a spike/probe or an activated tag, not part of
  this quick win.
- Persisting a true append-only **activity event log** (vs. deriving the feed on read) is a
  data-depth follow-up; this story derives from already-synced state.

## References

- Phase-2 backlog:
  `_bmad-output/planning-artifacts/epics-stories/phase-2-card-truth-and-recommendations-backlog-2026-06-23.md`
  → **E12-S1**.
- Source research:
  `_bmad-output/planning-artifacts/research/card-sourcing-and-maturity-recommendations-research-2026-06-23.md`.
- Builds on FR-3 (Health Timeline / `buildHealthTimeline`), `5-3`/`5-6` (provenance / two-state
  missing-data, never-false-GREEN), `5-8` (data-freshness honesty), `11-2` (SLO burn-rate band).

## Dev Agent Record

### Implementation summary

Implemented **client-side**, mirroring the FR-3 Health Timeline's demo/real split — the cleanest
option the Dev Notes allowed, with **zero backend/API/model change**. The detail page already loads
the append-only `HealthSnapshot` series (`getHealthHistory` → `applyHealthTimeline`); both cards now
derive from that same series:

- **Recent Health Events** — `buildHealthEvents` diffs consecutive snapshots (sorted by
  `recordedAt`), emitting one row per status change (newest first) with `from→to` labels, `Datadog`
  source, and the time spent in the prior state.
- **Recent Activity** — `buildActivityFeed` assembles health transitions + mapping/provenance
  changes + the latest sync run (newest first, capped at 12).
- Both run in **real mode only** (`syncedCardsReal`); demo mode keeps its seeded showcase rows.
  Unknown status → Amber (never a false GREEN); honest-empty states render when the series yields no
  rows; the provenance dot flips placeholder→datadog when live.

### Completion notes / deviations

- The activity feed derives from the `HealthSnapshot` series, which does **not** carry
  `burnRate.band` per snapshot, so **SLO-burn-band changes (AC-2 sub-input) are not included** —
  that needs a persisted per-snapshot activity log (already flagged in this story's Out-of-scope as
  a data-depth follow-up). Sync runs + health transitions + mapping changes ARE included, satisfying
  AC-2's intent.
- **No backend/API/shared-model change was needed** (the original File List anticipated server-side
  work); the client-side path is honest and lighter, and reuses the already-loaded series (AC-3: no
  new Datadog call, no extra fetch).

### Validation

- `nx test ui` → green; **9 new unit tests** in `detail-page.data.spec.ts` cover transition-diff,
  no-change, empty, unknown-never-green, single-snapshot sync run, transitions, and
  unmapped-not-green (AC-7).
- `nx build ui` → green (AOT template typecheck of the new bindings).
- `nx lint ui` → runs in CI/VDI (needs the private `@mmctech-artifactory/polaris-base` eslint
  config).

### File List

- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.data.ts — `buildHealthEvents` +
  `buildActivityFeed` derivations (+ status-label/tone/time/duration helpers)
- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.data.spec.ts — 9 unit tests for
  the two derivations; `snapshot` helper gains an overrides arg
- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.ts — `syncedCardsReal`
  flag; derive both cards in `applyHealthTimeline`; reset in `loadHealthTimeline`
- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.html — Recent
  Activity + Recent Health Events: honest-empty states + provenance dot reflects real source
- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.scss — `.activity-time`
  widened (92px) + `flex-shrink: 0` + `nowrap` so the "MMM DD HH:MM" time no longer wraps/misaligns

### Change Log

- 2026-06-23 — E12-S1 implemented client-side (mirrors FR-3): Recent Health Events + Recent Activity
  now derive from the already-synced `HealthSnapshot` series; no new Datadog call, no backend
  change. Status → review.
- 2026-06-23 — Review polish: fixed Recent Activity row misalignment — the wider "MMM DD HH:MM" time
  was wrapping inside the old 52px `.activity-time`; widened to 92px with `flex-shrink: 0` +
  `white-space: nowrap`.
- 2026-06-23 — Review polish (2): tightened horizontal alignment — `.activity-item` →
  `align-items: center` and removed the `.activity-dot` `margin-top: 6px` nudge so dot · time · text
  share one midline. `nx build ui` green.
- 2026-06-23 — Code review (Approve w/ 1 low fix): reworded the Recent Health Events empty state
  "...in this period." → "...recorded yet." (the events are not range-windowed, so the old wording
  implied a filter that doesn't exist). Lint verified against polaris-base rules + prettier. Status
  → done.
