# Story 13.8: Query / load performance optimization — profile and speed up portfolio + detail reads at 3,656-app scale

Status: ready-for-dev

## Story

As a **user (and reviewer)**, I want the **portfolio and detail views to load quickly at 3,656-app
scale**, so that the dashboard is usable instead of stalling on repeated slow loads — without
changing any number on the screen or the two-state missing-data model.

## Context / Why

The review surfaced **repeated slow loads**: every portfolio page hit goes to the DB and rebuilds
the whole tree. Reading the read path confirms why. `getPortfolio` → `getApplications`
(`apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`) runs
`find({ active: { $ne: false } })` with **no projection**, pulls every full application document,
then `buildPortfolio` groups/sorts and calls `computeRollup` per node **on every request** — there
is **no cache**. Worse, the single-app paths (`getAppContext` → `getAppDetail` → `getHealthHistory`)
each call `getPortfolio()` and **rebuild the entire 3,656-app tree just to locate one app** via
`findAppContext`.

Important nuance from the 2026-06-23 design review: some of the slowness **may be a local-env
artifact** — the reviewer's Mongo runs in the same container as the API, so disk/CPU contention
inflates timings in a way production (separate Atlas instance) would not. So this story must
**separate "real, indexable/projectable query inefficiency" from "local-env artifact"** and bank the
structural wins (index, projection, avoid full-tree rebuild for single-app reads, optional cache) —
not chase a number that only exists locally.

This is a **perf-only** story: **no change to data correctness, the rollup math (`11-1`), or the
two-state `undefined`/monitored model (`5-6`)**. Same payloads, faster.

Existing precedent to reuse: the health-snapshot repo already does this right — it **projects**
(`{ _id: 0 }`), **limits**, and is **indexed** `{ applicationId: 1, recordedAt: -1 }`
(`apps/api/src/health-snapshots/mongo/mongo-health-snapshot.repository.ts`). And `applications`
already carries a baseline index migration (`db/1781100000000_index_applications_env_dev.ts`) we
extend rather than reinvent.

## Acceptance Criteria

1. **Profile first, measure before/after.** Capture baseline timings for the two hot endpoints
   (`GET /dashboard/portfolio` and `GET /dashboard/portfolio/apps/:id/detail`) at full scale (~3,656
   apps), and the same after changes. Record the method (e.g. `explain('executionStats')` for the
   Mongo query + server-side request timing) and the before/after numbers in the Dev Agent Record.
   The win must be a **real query/algorithmic improvement**, explicitly distinguished from any
   **local-env artifact** (DB co-located in the API container).

2. **Add the warranted index(es).** Extend the existing `applications` index migration pattern in
   `db/` so the portfolio query is index-backed: at minimum an index supporting
   `find({ active: { $ne: false } })` (e.g. on `active`); evaluate the **owner-scope filter** path
   too — `getApplications` uses a **case-insensitive `$regex` `$or`** on `itOwnerEmail` /
   `portfolioOwnerEmail`, which the existing plain `idx_itOwnerEmail` / `idx_portfolioOwnerEmail`
   indexes do **not** serve well. Either make the scope match index-friendly (e.g. exact lowercased
   match) or document why the regex stays. New migration is **forward-only and idempotent**,
   matching `1781100000000_index_applications_env_dev.ts` (no drop/delete keywords — keep it past
   the destructive-op guard).

3. **Project, don't over-fetch.** The portfolio query loads full documents; add a **projection**
   limited to the fields `buildPortfolio` / `toPortfolioApp` / `computeRollup` / `computeMaturity` /
   `computeBurnRate` actually read (grouping keys, health/coverage/SLO/maturity inputs, owner +
   contact fields, sync-status fields). Output payloads are **byte-for-byte unchanged** for the
   consumer.

4. **Stop rebuilding the whole tree for one app.** The single-app reads (`getAppContext`,
   `getAppDetail`, `getHealthHistory`) currently rebuild the entire portfolio to find one app.
   Replace the lookup with a **scoped query for the single application** (still honoring the
   `active` filter and the owner-scope contract) so a detail load does **not** pay for all 3,656
   apps. Behavior — including the scope-leak protection (a `mine` request never returns another
   owner's app) and the 404 for unknown/out-of-scope ids — is **identical**.

5. **No correctness or model change.** Rollups, maturity, burn-rate, health two-state (`undefined`
   vs monitored), owner-scoping, and the OpCo allowlist all produce the **same results** as before.
   This story adds indexes / projection / a leaner single-app path (and optionally a short-TTL
   cache, see AC-6) only.

6. **(Optional, if profiling shows the tree build — not Mongo — is the cost) short-TTL portfolio
   cache.** If, after indexing + projection, the remaining cost is the in-process tree/rollup build
   repeated per request, add a small **per-scope (all / mine / OpCo-allowlist), short-TTL,
   invalidate-on-sync** cache so back-to-back loads don't recompute. It must **honor scope** (never
   serve one scope's tree to another) and **never serve stale-past-a-sync** data
   (freshness/`lastSyncAt` semantics from `5-8`/`13-9` preserved). If profiling shows Mongo
   dominates, skip the cache and say so in the record — do not add speculative caching.

7. **Tests.** Unit tests assert the projection includes every field the builders read (a regression
   guard so a future field add isn't silently dropped from the projection) and that the single-app
   path returns the same context/404 as the old full-tree path for: an in-scope app, an out-of-scope
   app under `scope=mine`, and an unknown id. If a cache is added, test that a sync invalidates it
   and that scopes don't cross.

## Dev Notes

- **Hot read path:** `getPortfolio` → `getApplications` → `find({ active: { $ne: false } })` (no
  projection) → `buildPortfolio` (groups OpCo → BU → LOB, sorts, and calls `computeRollup` per node)
  in `apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`. Owner scope adds an `$or` with
  **case-insensitive `$regex`** on `itOwnerEmail` / `portfolioOwnerEmail` — note the regex when
  choosing indexes.
- **Single-app waste:** `getAppContext` calls `getPortfolio()` then walks the tree with
  `findAppContext`; `getAppDetail` and `DashboardService.getHealthHistory` both go through
  `getAppContext`. This is the clearest structural win — a detail/health-history request should
  query one app, not rebuild 3,656.
- **Index migration:** follow `db/1781100000000_index_applications_env_dev.ts` exactly (resolve
  prefixed collection name via `PREFIX_MONGO_COLLECTION_WITH_PROJECT_KEY`, `ensureCollection`, named
  indexes, forward-only `down()` with no drop/delete keywords). It already creates `idx_shortCode`,
  `idx_itOwnerEmail`, `idx_portfolioOwnerEmail`; add what profiling justifies (e.g. `idx_active`).
- **Projection model to copy:** `mongo-health-snapshot.repository.ts` already projects
  `{ _id: 0 }` + `.limit()` + indexed sort — same discipline applied to `applications`. Fields the
  portfolio builders read live in `toPortfolioApp` / `computeRollup` / `computeMaturity` /
  `computeBurnRate` and the grouping selectors (`opCoOf` / `businessUnitOf` / `lobOf`, which read
  `opCo` / `businessDeliveryPortfolio` / `businessUnit`).
- **Measure honestly:** Atlas in prod is a separate instance; the local DB-in-container is not
  representative for absolute latency. Lean on `explain('executionStats')` (docs examined vs
  returned, index used) for the _query-efficiency_ claim, and treat wall-clock local timings as
  directional only — this is the "real vs local artifact" split AC-1 asks for.
- **Endpoints unchanged:** `DashboardController` routes (`/dashboard/portfolio`,
  `/portfolio/apps/:id`, `/portfolio/apps/:id/detail`, `/portfolio/apps/:id/health-history`) and the
  UI client (`apps/ui/src/app/features/dashboard/services/dashboard.service.ts`) keep the same
  request/response shapes — purely a server-side speedup, no contract change.

## Out of scope / follow-ups

- **UI-side nav/tab-state preservation on Back** (so a return load is avoided entirely) is **story
  13-10**, not this.
- **Refresh cadence / when the data is re-synced** is **story 13-9** (`5-8`/`5-9` egress + async).
  This story doesn't change _when_ data lands, only how fast it reads.
- **Speculative prefetching/profiling on user interaction** is a parked idea in the backlog —
  revisit after this perf work; not in scope here.
- Pagination of the portfolio tree is listed as an option in the epic but is likely unnecessary if
  index + projection + single-app path land the win; only pursue if profiling still shows an
  unacceptable full-tree cost and the cache (AC-6) is insufficient. Note the decision in the record.

## References

- Phase-2 epic:
  `_bmad-output/planning-artifacts/epics-stories/phase-2-dashboard-trust-clarity-backlog-2026-06-23.md`
  → **E13-S8** (⚙️ perf; owner Bernardo / Iader; profile slow portfolio/detail queries; index /
  projection / pagination / caching as needed; measure before/after; no correctness or two-state
  change).
- Read path: `apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts` (`getApplications`,
  `buildPortfolio`, `getAppContext` / `getAppDetail`).
- Projection + index precedent:
  `apps/api/src/health-snapshots/mongo/mongo-health-snapshot.repository.ts`.
- Existing index migration to extend: `db/1781100000000_index_applications_env_dev.ts`.
- Builds on `11-1` (rollup math — must be unchanged), `5-6` (two-state model — unchanged), `3-3`
  (owner scope), and the OpCo allowlist plumbing (`PORTFOLIO_OPCO_ALLOWLIST`).

## Dev Agent Record

### File List

- db/ (new forward-only index migration on `applications`, e.g. `*_index_applications_perf_*`,
  following `db/1781100000000_index_applications_env_dev.ts`)
- apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts (+ spec) — add projection to
  `getApplications`; add a single-app scoped lookup so
  `getAppContext`/`getAppDetail`/`getHealthHistory` no longer rebuild the full tree
- apps/api/src/dashboard/dashboard.service.ts (+ spec) — wire the single-app read path (and optional
  short-TTL, scope-aware, invalidate-on-sync portfolio cache) if profiling warrants it
- \_bmad-output/implementation-artifacts/stories/13-8-query-perf-optimization.md — before/after
  profiling numbers + the "real query win vs local-env artifact" split recorded here
