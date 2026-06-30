# Story 11.3: SPIKE + build — Watchdog "emerging risk / what changed" feed

Status: backlog

## Story

As a **leadership stakeholder**, I want a short, plain-language **"emerging risks / what changed"**
feed driven by Datadog Watchdog auto-detected anomalies (joined to our apps), so that I can see what
is _quietly degrading_ before it becomes an incident — without reading raw alerts.

## Context / Why

Watchdog is **built-in** Datadog AIOps — it auto-detects anomalies in APM metrics against a learned
baseline with **no setup and no new integration** (verified: Datadog Watchdog docs + AIOps blog).
That makes it the rare predictive signal we can add under our constraints (no RUM, no paid add-ons).
Presented as a curated, plain-English feed (not a firehose of alerts), it is the form of AIOps that
informs executives without overwhelming them.

**Why this is spike-gated:** we have not confirmed programmatic Watchdog access for this org, the
response volume, or how Watchdog items **join to our apps** (same `app_short_key` / `app_service_id`
bridge, or only via `service` — which we already know is a ~0.1% join). Per project discipline (cf.
`8-1`/`8-3`), we **probe read-only before we promise**. This story is also adjacent to **E9**
(perception): E9 builds the per-app `calendar_shift(-7d)` engine; this feed is the **portfolio-level
anomaly stream** — keep the logic in E9's engine where they overlap, do **not** fork it.

## Probe steps (read-only; gates the build)

1. Confirm programmatic access to Watchdog signals for this org (entitlement + endpoint), volume
   over 24h/7d, and that no new license is required. Probe stays read-only and never prints keys
   (reuse the `scripts/datadog-*-probe.js` pattern).
2. Measure **app-join coverage**: of the Watchdog items returned, how many map to one of our apps
   via `app_short_key` / `app_service_id` (vs unjoinable). Record the %.
3. Go/no-go written to `_bmad-output/planning-artifacts/research/`. If join coverage is too low,
   fall back to deriving the feed from signals we already have (anomaly trips from the E9 engine +
   monitor state changes) instead of Watchdog.

## Acceptance Criteria

1. The spike result (entitlement, volume, join coverage %, go/no-go + chosen source) is recorded;
   the build proceeds only if a viable joined source exists, else the story is rescoped to the
   existing-signal fallback.
2. If GO: an **"emerging risks" feed** surfaces the top recent anomalies/changes per app and rolled
   up by BU, in plain language (what changed, since when), reusing existing color/provenance
   conventions.
3. Every feed item links to its app (and monitor/Watchdog source) for drill-down; items that cannot
   be joined to an app are excluded, never mis-attributed.
4. The feed stays within rate limits — pulled in the bulk sync cadence, not per-app on render.
5. Missing/empty → honest "no emerging risks detected", never a fabricated signal.

## Dev Notes

- **Spike first:** read-only probe script under `scripts/`; reuse the coverage-probe pattern from
  `8-1`/`8-3`.
- **Source of truth:** Datadog Watchdog (native, no integration). Join via the dual-tag bridge;
  quantify before build.
- **Do not fork E9:** where the signal is the `-7d`/anomaly trend, reuse the `E9-S2` baseline
  engine; this story owns the _portfolio feed/presentation_ layer.
- **Key files (build phase):** `apps/api/src/datadog/real-datadog-client.ts` (Watchdog read), the
  sync service, `apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`, and a UI feed
  component on the portfolio page.

## Out of scope / follow-ups

- The per-app perception **pill** stays in `E9-S3`; this feed is complementary, not a replacement.
- Watchdog _configuration_ (tuning what Watchdog watches in Datadog itself) is out of scope —
  read-only consumer only.

## References

- Phase-2 epic: `phase-2-exec-value-backlog-2026-06-21.md` → **E11-S3**.
- Research origin: `platform-enhancement-research-2026-06-21.md` (Overall #3) — Datadog Watchdog
  docs + AIOps blog.
- Adjacent: **E9** (perception engine — reuse, don't duplicate); probe pattern from `8-1`/`8-3`.

## Spike result (2026-06-22)

Read-only probe `scripts/datadog-watchdog-probe.js` run against this org. Full write-up:
`_bmad-output/planning-artifacts/research/datadog-watchdog-spike-2026-06-22.md`.

- **Entitlement: YES.** `POST /api/v2/events/search` with `source:watchdog` returns HTTP 200; our
  existing key already has the scope, no new license. (Watchdog routes via Events here, not Security
  Signals — that endpoint is 200 but empty.)
- **Volume: HIGH.** ≥100 events/24h; 800+ over 7d across bounded paging (still more). Not the limit.
- **App-join coverage: ~0% realized, ~2-3% ceiling.** Only ~2.4% of Watchdog events carry
  `app_short_key`/`app_service_id` at all; of the distinct tagged keys in an 800-event sample,
  **none** matched our 3,656 apps (one rare exception, `MGMSRCH`, confirmed the join logic works but
  matches are outliers, not a stream). `app_service_id` is moot anyway — our Mongo apps carry no
  `serviceId`/`appServiceId` to match on.
- **GO/NO-GO: NO-GO** on consuming Watchdog directly. Per AC #1, the story is **rescoped to the
  existing-signal fallback.**

**Recommendation (do NOT fork E9):** build the emerging-risk feed from the **E9 `-7d` anomaly engine
(`E9-S2`)** + **monitor state-change transitions** — both already joined on `app_short_key` and
already in the sync cadence. This story owns the portfolio feed/presentation (roll up per app & BU,
plain-language "what changed / since when", drill-down link per item, honest empty state). Watchdog
is deferred to a future enrichment, contingent on upstream APM services emitting `app_short_key`
(Datadog-side, out of scope).

## Dev Agent Record

### File List

- scripts/datadog-watchdog-probe.js (spike; read-only)
- apps/api/src/datadog/real-datadog-client.ts (build; Watchdog read)
- apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts (+ spec)
- apps/ui/src/app/features/dashboard/pages/portfolio-page/ — emerging-risk feed component
