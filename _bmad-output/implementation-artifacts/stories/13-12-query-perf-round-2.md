# Story 13.12: Query / load performance — round 2 (push from "fast" to "very fast" at 3,656-app scale)

Status: backlog

## ⚠️ Validation findings (2026-06-25) — READ FIRST: the collation approach is a DEAD END

Tier 0 (collation owner-scope query + covering index) was implemented and **validated on the VDI
with `explain('executionStats')`** against the real ~3,717-doc collection, then **reverted to
backlog**. The collation approach does **not** work. Results (owner-scoped query; `nReturned: 46` in
every case → data parity is fine, but no index win):

| Attempt                                                                                        | totalDocsExamined | Plan                                                |
| ---------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------- |
| Original `$regex '^email$' i`                                                                  | 3670              | IXSCAN `active_1` + FETCH-filter (scans all active) |
| Single-field collation index                                                                   | 3670              | planner ignores the collation email index           |
| Compound collation `{email, active}`                                                           | 3670              | still not used                                      |
| Plain equality, no index                                                                       | 3717              | COLLSCAN                                            |
| **Plain compound `{email, active}` + `$or` with `active` INSIDE each branch + plain equality** | **46** ✅         | **SUBPLAN (index-union), ~5ms**                     |

**Conclusion:** MongoDB's planner will NOT route
`{ active:{$ne:false}, $or:[{itOwnerEmail},{portfolioOwnerEmail}] }` through collation indexes
(single OR compound). The **proven fix** (COLLSCAN 3670 → IXSCAN 46) is:

1. A **normalized lowercased field** `itOwnerEmailLc` / `portfolioOwnerEmailLc` — Mongo can't index
   `toLower()`, so it must be materialized. **1185 / 3717** owner emails are mixed-case, so this is
   required for case-insensitive matching.
2. **Plain** compound indexes `{ itOwnerEmailLc: 1, active: 1 }` +
   `{ portfolioOwnerEmailLc: 1, active: 1 }` (no collation).
3. **Restructure** the owner-scope `$or` so `active:{$ne:false}` is **inside each branch**, plain
   equality on `*Lc` (input `userEmail.toLowerCase()`), **no collation**.

**Scope impact:** this is **no longer a Tier-0 quick win** — it needs a **sync-writer change**
(write `*Lc` on upsert, in `planview-sync.service.ts` + `db/load-planview-applications.js` + the
load migration) + a **backfill migration** for existing docs + the `*Lc` field on
`StoredApplication`. Re-scope when picked up. The `{ active:1, lastSyncAt:-1 }` covering-index idea
(was Tier 0 B) remains valid and independent. Code changes from the collation attempt were reverted;
this doc keeps the learning.

---

## Story

As a **user (and reviewer Bernie)**, I want **data retrieval for the dashboard to be very fast at
3,656-app scale**, so that scoped and exec views feel instant — building on the solid `13-8`
baseline, without changing any number on the screen or the two-state missing-data model.

## Context / Why

`13-8` delivered a **solid, correct baseline** and is **done**: a 30-field `PORTFOLIO_PROJECTION`,
collation indexes on the owner-email fields, a 60s-TTL in-process portfolio cache keyed by scope
with a `getMaxSyncAt` freshness check, and a single-document `findOne` fast path for per-app detail.
**This story is NOT a fix of 13-8** — it is the senior-level round-2 that converts remaining
_headroom_ into speed.

It is grounded in a deep-research audit (Sonnet) that was **reviewed against the live code** — see
`_bmad-output/.../scratchpad/performance-deep-research.md`. The headroom findings were verified at
file:line:

- **Owner-scope query defeats its own index.** `getApplications` / `getApplicationById` build the
  scope filter with a **case-insensitive `$regex`** `{ $regex: '^email$', $options: 'i' }`
  (`mongo-portfolio.repository.ts:232-233, 252-254, 272-274`, and `mongo-application.repository.ts`
  `applyOwnerEmailFilter`). MongoDB `$regex` is **not collation-aware**, so the **collation indexes
  that 13-8 already created** (`mongo-portfolio.repository.ts:196-203`,
  `{ collation: { locale: 'en', strength: 2 } }` on `itOwnerEmail` / `portfolioOwnerEmail`) **cannot
  be used** → every `scope=mine` request COLLSCANs ~3,656 docs.
- **`getMaxSyncAt` runs on every warm cache hit** (`mongo-portfolio.repository.ts:107-108`) — a DB
  round-trip per request even when fully cached.
- **`getSummary` uses an unoptimised codepath** — `MongoApplicationRepository.findAll()` does
  `.find()` with **no filter and no projection** (`mongo-application.repository.ts:93-95`), the
  worst query in the codebase.
- **`getDigest` has no cache** and loads the full collection per request.
- **No HTTP compression** — the ~5.8MB portfolio payload ships uncompressed (`server.ts` has
  `cacheControlHeaders` at line 160 but no `compression`).

This is a **perf-only** story: **no change to data correctness, the rollup math (`11-1`),
`computeMaturity`/`computeBurnRate` outputs, the two-state `undefined`/monitored model (`5-6`),
owner-scoping (`3-3`), or the OpCo allowlist**. Same payloads, faster.

## Acceptance Criteria

Work is organized in three tiers. **Tier 0 is the priority** (trivial, low risk, reuses what 13-8
already built). Tier 1 and Tier 2 may each be split into their own PRs.

### Tier 0 — quick wins that reuse existing work

1. **Use the existing collation indexes instead of regex.** Replace the `$regex '^email$' i`
   owner-scope filter with **plain equality** (`{ itOwnerEmail: userEmail }` /
   `{ portfolioOwnerEmail: userEmail }`) and pass `collation: { locale: 'en', strength: 2 }` on the
   cursor, in `getApplications`, `getApplicationById`, `getMaxSyncAt`'s scoped path, and
   `mongo-application.repository.ts` `applyOwnerEmailFilter`. `explain('executionStats')` on a
   `scope=mine` query must change from **COLLSCAN → IXSCAN**, `totalDocsExamined` dropping from
   ~3,656 toward the matched-doc count. The set of apps returned for `mine` is **identical** to
   today (same case-insensitive semantics, via the collation). _(Note: a normalised lowercased
   field + compound `{ active:1, itOwnerEmailLc:1 }` index is the longer-term option — out of scope
   here unless profiling shows the collation `$or` + `active` combo is still inadequate; record the
   decision.)_

2. **Make `getMaxSyncAt` index-only — do NOT remove the freshness check.** Add a forward-only,
   idempotent index `{ active: 1, lastSyncAt: -1 }` (following
   `db/1781100000000_index_applications_env_dev.ts`) so the warm-hit freshness probe is served from
   the index (sort + limit 1, no doc fetch). The per-request `getMaxSyncAt` call **stays** — it is
   what gives correct cross-pod freshness without shared state; this AC only makes it
   sub-millisecond. `explain()` shows an index-only `IXSCAN` with `totalDocsExamined: 0`.

3. **HTTP compression.** Add `app.use(compression())` in `server.ts` **after confirming the cluster
   ingress / API gateway does not already gzip** (record the finding).
   `curl -H 'Accept-Encoding: gzip'` returns `Content-Encoding: gzip` and the portfolio payload
   drops from ~5.8MB to ~1–1.5MB.

### Tier 1 — low effort, high value

4. **Denormalise per-app derived fields at sync write-time** so downstream aggregations stay
   **exact** without re-implementing JS logic in the pipeline: persist `maturityScore`, `burnRate`
   (rate + band), a `healthy` boolean, and `monitorsCount` on each app document when the sync
   upserts it. These must be computed by the **same** `computeMaturity` / `computeBurnRate`
   functions (no divergence) and are additive (no shape change to API responses).

5. **`getSummary` via aggregation.** Replace `applicationsService.findAll()` with a
   `$match: { active: { $ne: false } }` + `$group` aggregation returning one document (total,
   green/amber/red counts, total active users). Response shape **byte-for-byte identical**; add a
   covering index for the `$match`/`$group` fields; unit test parity against the old path.

6. **`getDigest` via aggregation + cache.** Replace the full-collection load + JS `buildDigest` with
   a `$group` aggregation (counts + `$max: lastSyncAt`, using the Tier-1 denormalised fields), and
   give it a short-TTL cache (share or mirror the portfolio cache so a concurrent `/digest` +
   `/portfolio` don't double-load). Output identical; freshness honesty (`5-8`/`13-9`) preserved.

7. **LRU cap on the in-process cache.** Replace the unbounded `Map` with a size-capped LRU (TTL
   preserved) so a multi-user system with many distinct owner-scope keys can't grow memory
   unbounded. No API change.

### Tier 2 — bigger bets (gated on profiling + deployment reality)

8. **Materialised `portfolio_rollup` collection refreshed by the sync job** (`$merge`) so cold-cache
   portfolio reads become a read of a few-hundred pre-aggregated nodes instead of loading 3,656
   docs + building the tree in JS. Must be **atomic** (a partial/failed sync must not expose a
   corrupt or silently-stale rollup — carry a freshness/`lastSyncAt` marker). Pursue only if
   profiling shows the cold-start JS tree build is the dominant cost.

9. **Redis-backed cache for multi-pod coherence** — only if the deployment actually runs **multiple
   pods**. Replaces the per-pod in-process Map so a sync-completion invalidation reaches all pods.
   Adds a Redis dependency (Vault/Helm wiring). Skip if single-pod.

10. **Opportunistic cleanups:** explicit Mongo connection-pool config
    (`maxPoolSize`/`minPoolSize`/`waitQueueTimeoutMS`); drop `monitors` / `syntheticChecks` from
    `PORTFOLIO_PROJECTION` and serve them only on the detail path **(requires a UI-contract audit**
    — confirm the portfolio card needs only counts/status, not the full arrays); remove the
    `clone()` `JSON.parse(JSON.stringify(...))` deep-copy (`detail.seed.ts:404`) if no caller
    mutates the returned object.

### Global (apply to every tier)

11. **Measure before/after honestly.** For each change, capture `explain('executionStats')` (stage,
    `totalDocsExamined`, `totalKeysExamined`, `executionTimeMillis`) and server-side request timing
    at ~3,656-app scale; record numbers in the Dev Agent Record. As in `13-8`, distinguish a **real
    query/algorithmic win** from any **local-env artifact** (DB co-located with the API).
    **Benchmarking must run on the VDI / CI**, where `autocannon`/`npm` tooling is available.

12. **No correctness or model change.** Identical API response shapes; `scope=mine` matches the same
    apps; OpCo allowlist (`PORTFOLIO_OPCO_ALLOWLIST`) still applies; two-state health (unmapped
    stays `undefined`/grey, never a false GREEN; "mapped, no data" never silently green);
    `computeMaturity`/`computeBurnRate` outputs unchanged. Existing unit tests stay green; add tests
    per tier (collation parity, summary/digest aggregation parity, cache
    invalidation/scope-isolation).

## Dev Notes

- **Why the collation fix is the #1 quick win, not a normalised field:** 13-8 already created the
  collation indexes (`mongo-portfolio.repository.ts:196-203`); they're simply unreachable because
  the query uses `$regex`. Switching to equality + cursor `.collation(...)` unlocks them with a
  **query-only change** — no migration, no sync-writer change, no backfill. The
  normalised-lowercase-field + compound-index approach gets a bit more (covers `active` + email in
  one index, no collation dependency) but costs a writer change + backfill migration; defer it
  unless `explain()` shows the collation `$or`/`active` plan is still weak.
- **Keep `getMaxSyncAt`, don't delete it.** The research's "remove it" option trades cross-pod
  freshness for throughput. In a multi-pod deploy each pod relies on this probe to notice a new
  sync. The right move is to make it free via the `{ active:1, lastSyncAt:-1 }` covering index
  (AC-2), not to remove it. Removal is only acceptable if the deploy is confirmed single-pod.
- **Denormalise before aggregating.** `getSummary`/`getDigest`/the materialised rollup all need
  maturity/burn/health numbers. Re-deriving `computeMaturity` (5 boolean signals) and
  `computeBurnRate` inside a `$group` pipeline is fragile and risks drifting from the JS outputs
  (violates AC-12). Persisting those fields at sync time (AC-4) keeps a single source of truth and
  makes every aggregation trivial — do AC-4 **before** AC-5/6/8.
- **Index migrations:** forward-only + idempotent, following
  `db/1781100000000_index_applications_env_dev.ts` exactly (prefixed collection name,
  `ensureCollection`, named indexes, no drop/delete keywords so the destructive-op guard passes).
  Confirm whether `initDb`'s runtime `createIndex` and the migration end up with duplicate/divergent
  index specs on the email fields and reconcile.
- **Compression placement:** NestJS docs note production setups often compress at the reverse proxy;
  verify the ingress first (AC-3) so we don't double-compress.
- **Verified read path (unchanged contract):** `DashboardController` routes (`/dashboard/portfolio`,
  `/summary`, `/digest`, `/portfolio/apps/:id`, `/portfolio/apps/:id/detail`) and the UI client keep
  identical request/response shapes — purely server-side speedups.

## Out of scope / follow-ups

- **Refresh cadence / when data is re-synced** is `13-9` (`5-8`/`5-9` egress + async). This story
  changes how fast data _reads_, not _when_ it lands.
- **UI nav/tab-state preservation** is `13-10` (done).
- **Normalised lowercased owner-email field + compound covering index** — deferred follow-up to
  AC-1; only if profiling justifies it over the collation fix.
- **Tier 2 items (8/9/10)** are explicitly gated: don't add the materialised rollup or Redis
  speculatively — bank Tier 0/1 and re-profile first.

## References

- Deep-research audit + reviewed plan: `_bmad-output/.../scratchpad/performance-deep-research.md`
  (audit of 13-8 with file:line, prioritised tier plan, cited MongoDB docs).
- Builds on **`13-8`** (done — the baseline this extends):
  `stories/13-8-query-perf-optimization.md`.
- Read path: `apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts` (`getApplications`,
  `getApplicationById`, `getMaxSyncAt`, portfolio cache, `buildPortfolio`);
  `apps/api/src/applications/mongo/mongo-application.repository.ts` (`findAll`,
  `applyOwnerEmailFilter`); `apps/api/src/server.ts` (`compression`);
  `apps/api/src/dashboard/seed/detail.seed.ts:404` (`clone`).
- Index migration to extend: `db/1781100000000_index_applications_env_dev.ts`.
- MongoDB refs (in the research doc): case-insensitive indexes & collation, `$group`/`$facet`,
  `$merge` / on-demand materialised views, connection-pool tuning, NestJS compression.
- Must not change: `11-1` (rollup math), `5-6` (two-state model), `3-3` (owner scope),
  `PORTFOLIO_OPCO_ALLOWLIST`.

## Tasks / Subtasks

### Tier 0 (this pass — 2026-06-24)

- [ ] **A** — owner-scope `$regex '^email$' i` → plain equality +
      `.collation({locale:'en',strength:2})` applied **only when scoped**, in
      `mongo-portfolio.repository.ts` (`getApplications`, `getApplicationById`, `getMaxSyncAt`) and
      `mongo-application.repository.ts` (`applyOwnerEmailFilter` + `findByFilters` cursor). Shared
      `OWNER_EMAIL_COLLATION` const so the query collation matches the index collation exactly.
- [ ] **B** — covering index `{ active: 1, lastSyncAt: -1 }` added to `initDb` (runtime) + new
      forward-only migration `db/1781200000000_index_applications_lastsyncat_env_dev.ts`.
      `getMaxSyncAt` freshness check **kept** (not removed).
- [ ] **C** — `app.use(compression())` — **DEFERRED**: `compression` is NOT in package.json (new
      runtime dep + `@types/compression`), and the "is the ingress already compressing?" check is
      open. Needs dependency approval + `npm install` on VDI; ~1-line change once approved.

### Tier 1 / Tier 2 — NOT in this pass (separate follow-up PRs)

- [ ] Tier 1: denormalize derived fields at sync; `getSummary`/`getDigest` via `$group`; LRU cache
      cap
- [ ] Tier 2: materialised `portfolio_rollup`; Redis (if multi-pod); pool / projection / `clone()`
      cleanups

## Dev Agent Record

### Completion Notes

- **Scope:** Tier 0 **A + B** implemented. **C deferred** (dependency). Tier 1/2 are explicit
  follow-ups.
- **Collation correctness (key nuance):** collation is applied **only when owner-scoped** (the
  find/findOne options spread `...(userEmail ? { collation: OWNER_EMAIL_COLLATION } : {})`). The
  unscoped (`scope=all`) path stays collation-free so it can still use the plain `{active:1}` /
  `{active:1,opCo:1}` indexes — a collation query can only use collation-matching indexes, so
  applying it unconditionally would have _hurt_ the all-apps path.
- **Semantics preserved:** equality + `strength:2` collation = the same case-insensitive owner match
  as the old `^email$ /i` regex → `scope=mine` returns the same apps. API response shapes, OpCo
  allowlist, two-state health, and `computeMaturity`/`computeBurnRate` outputs untouched. The
  free-text `search` filter keeps its substring `$regex` (unrelated).
- **getMaxSyncAt:** freshness check kept; the new `{active:1,lastSyncAt:-1}` index makes it an
  index-only sort+limit-1.

### ⚠️ MUST verify on VDI / CI

- `npx nx test api` (incl. updated `mongo-application.repository.spec.ts`) + `nx build api` + lint.
- `explain('executionStats')` on a `scope=mine` portfolio/detail query → confirm **IXSCAN**
  (collation index), not **COLLSCAN**; `totalDocsExamined` drops from ~3,656 toward the matched
  count. Record before/after.
- Confirm `getMaxSyncAt` is index-only on `{active:1,lastSyncAt:-1}` (`totalDocsExamined: 0`).
- Add a portfolio-repo test asserting `getApplications`/`getApplicationById` pass the collation
  option (the application-repo test already locks the pattern).
- Reconcile migration-vs-runtime collation on the email indexes: the old `1781100000000` migration
  creates PLAIN `idx_itOwnerEmail`/`idx_portfolioOwnerEmail`; the collation versions come from
  `initDb` at startup — confirm both exist / no divergence in the deployed env.

### File List (this pass)

- apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts — `OWNER_EMAIL_COLLATION` const;
  equality + conditional collation in `getApplications`/`getApplicationById`/`getMaxSyncAt`;
  `{active:1,lastSyncAt:-1}` index in `initDb`
- apps/api/src/applications/mongo/mongo-application.repository.ts — `OWNER_EMAIL_COLLATION` const;
  equality in `applyOwnerEmailFilter`; conditional collation on the `findByFilters` cursor
- apps/api/src/applications/mongo/mongo-application.repository.spec.ts — updated owner-scope
  assertion (equality + collation) + new "omits collation when unscoped" test
- db/1781200000000_index_applications_lastsyncat_env_dev.ts — NEW forward-only covering-index
  migration

### Change Log

- 2026-06-24 — Tier 0 (A: collation owner-scope query; B: covering index) implemented; C
  (compression) deferred on dependency. Pending VDI verification (tests/build/lint + explain
  before/after). Tier 1/2 remain as follow-up PRs.
