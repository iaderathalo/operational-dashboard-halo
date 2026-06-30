# Datadog Watchdog "emerging risk" feed — SPIKE result (2026-06-22)

Story: `11-3-watchdog-emerging-risk-feed.md` (E11-S3). Read-only probe, no config changes. Probe
script: `scripts/datadog-watchdog-probe.js` (gitignored, local). Keys never printed.

## TL;DR — **NO-GO** for the Watchdog-direct feed

Watchdog signals **are entitled and high-volume** for this org, but the **app-join coverage is
effectively 0% (ceiling ~2-3%)** via the dual-tag bridge. That is far below a usable threshold for a
leadership-facing per-app / per-BU feed. **Recommendation: build the "emerging risks" feed from
signals we already join cleanly — the E9 anomaly engine (`calendar_shift(-7d)`) plus monitor
state-change transitions — and do NOT fork E9.**

## (a) Entitlement — YES

- Endpoint used: **`POST /api/v2/events/search`** with `filter.query = "source:watchdog"`.
  - 24h window → **HTTP 200**, full first page (100 events).
  - 7d window → **HTTP 200**, paginates (more than 100; cursor present).
- Secondary documented check: **`GET /api/v2/security_monitoring/signals`** with
  `filter[query]=source:watchdog` → HTTP 200 but **0 results**. This org routes Watchdog exclusively
  through the **Events** stream, not Security Signals. (No 403 on either — our existing API/APP key
  already has the read scope; no new license required.)
- No `403`/not-entitled anywhere. Watchdog is native AIOps and reachable with the current key.

## (b) Volume — HIGH (not the constraint)

- Watchdog events over the last **24h**: first page already full (≥100).
- Over **7d**: paginated well past 100 per page across the bounded pull; sampled **800 events**
  across 8 bounded pages and the cursor was still non-empty. Volume is ample — if anything, it is a
  firehose that would need curation, exactly as the story anticipated.

## (c) App-join coverage — **TOO LOW** (this is the gate)

Joined Watchdog items to our **3,656** apps (Mongo `applications.shortCode` == `app_short_key`;
`app_service_id` also checked).

| Sample                                 | events examined | carry `app_short_key` at all | joinable to OUR apps           |
| -------------------------------------- | --------------- | ---------------------------- | ------------------------------ |
| 7d, 400 events (4 pages, newest-first) | 400             | 12 (3.0%)                    | **0 (0.0%)**                   |
| 7d, 800 events (8 pages, newest-first) | 800             | 19 (**2.4%**)                | **0 (0.0%)**                   |
| 24h, 100 events (oldest-first window)  | 100             | 6 (6.0%)                     | 6 (6.0%) — one app (`mgmsrch`) |

Key facts behind the table:

- **The bridge tag is mostly absent.** Only ~**2-3%** of Watchdog events carry `app_short_key` /
  `app_service_id` at all. That is a hard ceiling on join coverage regardless of how clever the join
  is — Watchdog auto-detects on raw APM `service`s, most of which were never tagged with our app
  bridge.
- **`app_service_id` is unusable from our side anyway.** Our Mongo `applications` documents carry
  **no** `serviceId` / `appServiceId` field (0 of 3,656), so the `app_service_id` half of the bridge
  matches nothing even when Watchdog emits it. Only the `app_short_key` half can match today.
- **Realized join is 0% in the steady-state sample.** Of the distinct tagged keys in the 800-event
  pull (`mvisio`, `oview4`), **none** are in our app set. The lone 6% in the small oldest-first
  window came from one genuinely-joinable app (`MGMSRCH` = MARSH GLOBAL MSEARCH, confirmed present
  in Mongo) — i.e. the join logic is correct, but matches are rare outliers, not a stream.

Net: **join coverage ≈ 0% realized, ~2-3% theoretical ceiling.** This mirrors the known
`service`-only ~0.1% problem from phase-1: Watchdog is one more signal that does not carry our app
identity.

## GO / NO-GO

**NO-GO** on consuming Watchdog directly as the emerging-risk feed source. Acceptance Criterion #3
("items that cannot be joined to an app are excluded, never mis-attributed") would empty the feed to
near-zero, and #1 explicitly rescopes to the existing-signal fallback when no viable joined source
exists. That condition is met.

## Recommended path (fallback the story pre-authorized)

Derive the **portfolio "emerging risks / what changed" feed** from signals we already join cleanly:

1. **E9 anomaly engine (`E9-S2`, `calendar_shift(-7d)`)** — reuse, do **not** fork. E9 already
   computes the per-app `-7d` baseline shift keyed on `app_short_key`, which is our clean bridge.
   The "what's quietly degrading" item = an app whose `-7d` health/burn trend crossed a threshold.
2. **Monitor state-change transitions** — from the monitors we already pull per `app_short_key`
   (OK→Warn→Alert in the sync window). These are already app-joined and already in the sync cadence
   (AC #4 satisfied for free).
3. This story then owns only the **portfolio feed / presentation layer**: roll the above up per app
   and per BU, render in plain language ("what changed, since when"), link each item to its app +
   monitor for drill-down, and show an honest "no emerging risks detected" when empty (AC #2, #3,
   #5).

Watchdog stays a **possible future enrichment** only if/when the upstream APM services get the
`app_short_key` tag at emission — a Datadog-side tagging change outside this repo, and out of scope
here (read-only consumer).

## Reproduce

```
node scripts/datadog-watchdog-probe.js
```

Read-only; bounded calls (well under ~1600 req/h); reads keys from `.env`; never prints them.
