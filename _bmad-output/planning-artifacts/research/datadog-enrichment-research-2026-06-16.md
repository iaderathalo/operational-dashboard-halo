> **⚠️ ARCHIVED / SUPERSEDED (2026-06-18).** This is the original research doc (was repo-root
> `DATADOG-NEXT-STEPS.md`). It has been **folded into the BMAD flow** and is kept here only as the
> dated source record. The live, actionable backlog is:
> `_bmad-output/planning-artifacts/epics-stories/phase-2-datadog-enrichment-backlog-2026-06-18.md`
> (epics **E7–E9**), tracked in `_bmad-output/implementation-artifacts/sprint-status.yaml`
> (`epic-7`/`epic-8`/`epic-9`). Delivered items (#1 timeline, #2 drill-down, #3 downtimes,
> provenance) are reconciled as **done** in the Phase-1 backlog. **Do not track work from this file
> — use the Phase-2 backlog.**

---

# Datadog — Next steps: what else we can show

_Research 2026-06-16 · Operational Dashboard (Portfolio Visibility, `operdas1`)._

A cross-reference between **what the Datadog API offers** and **what we already have wired up**,
prioritized by value/effort. Today the sync brings **health** (Monitors) + **uptime/error-budget**
(SLOs), bridged by the `app_short_key` tag (fallback `app_service_id`).

> Working doc, "for now" at the repo root so it isn't lost. Not committed.

---

## Current state (what the sync already does)

- **Health** ← `GET /api/v1/monitor?monitor_tags=app_short_key:<key>` → `overall_state` →
  _worst-state-wins_ (Alert→RED, Warn/No Data→AMBER, OK→GREEN). Unmapped→AMBER (never a false
  green).
- **Uptime + error budget** ← `GET /api/v1/slo` + `GET /api/v1/slo/{id}/history` (24h/7d/30d
  windows).
- **Bulk snapshot**: one run = paginate monitors + SLOs + history with bounded concurrency and 429
  backoff; per-app resolution **100% local** (zero HTTP in the loop). Validated live: **651 apps
  mapped / 0 errors** across 3656.
- **Timeline**: the sync **already writes** a `HealthSnapshot` per app on each run
  (`healthSnapshots` collection, append-only). ✅ Already **exposed + rendered** — see #1 (done).

---

## ✅ Done — this session (2026-06-16, branch `feature/datadog-live-health`, committed)

**1. Health timeline (PRD FR-3)** — _S · high_ — ✅ **DONE** Endpoint
`GET /dashboard/portfolio/apps/{id}/health-history` (scope-guard + `?limit=`, default 500 /
max 2000) + real render in `detail-page`: the **HEALTH** row of the "Combined Status Timeline"
replaces the seed, bucketing **per run** (hourly axis if same day, by date if it spans several), a
**"live Datadog"** note, and an **honest empty** if the app has no snapshots. Back tests (137) + UI
(53) green; validated live. (The read repository `findRecentByApplicationId` already existed.) ⚠️
Minor pending: the **24h/7d/30d buttons are not wired** to the range — the Health row ignores them
for now.

**0. Fix uptime to 2 decimals (detail)** — _XS_ — ✅ **DONE** `UPTIME (30D)` showed
`99.64930725097656%`; now `app.uptime.toFixed(2)` → `99.65%` in `detail.seed.ts` (real mode; the
demo builder already rounded). `null` → `'Undefined'`.

**7. Error Budget % + SLA target (detail)** — _XS-S_ — ✅ **DONE** `detail.seed.ts`: the "Error
Budget" card + the Health tab panel now show the real `errorBudgetRemainingPct` (e.g. `93.0%`) and
the real `slaTarget` (e.g. `95%`), propagated via `PortfolioApp`/`toPortfolioApp`. Burn-rate/breach
(no real source) → `Undefined`, not fabricated.

**C. Live vs placeholder (portfolio table)** — _M_ — ✅ **DONE** Propagated
`datadogMapped/resolutionPath/lastSyncStatus/lastSyncAt` to `PortfolioApp`. Placeholder columns
(Perception · Active Users · Incidents · Last Incident) **dimmed** (`.placeholder-col`);
**provenance tooltip** on Health/Uptime (`Live · Datadog · synced Xh ago` / `Not mapped in Datadog`
/ `No SLO in Datadog`). No new integration.

**2. Monitor drill-down** — _S · high_ — ✅ **DONE** **"Datadog Monitors"** card in the Health tab:
per monitor → state + name + `message` (cleaned of `{{}}`/HTML) + last-triggered.
`buildMonitorBreakdown` (worst-first, cap 50) persists `Application.monitors` from data the fetch
already brings — **zero new call**. Validated live (Vendor Info → 2 real Synthetics). Back tests.

**3. Downtimes / maintenance** — _S · high (credibility)_ — ✅ **DONE** `with_downtimes=true` on the
monitors call → `matching_downtimes` suppresses a monitor's Alert during a maintenance window (no
false RED) inside `rollupStatus`; a **"Maintenance"** badge in the drill-down. (v2 downtime is still
403; this rides on the monitors call.) Live probe: **146 app monitors with an active downtime right
now** (some in Alert = the real suppression case) → they appear after a re-sync with this code.

**D. Provenance in the detail (Overview + Health tab)** — _M_ — ✅ **DONE** Live-vs-placeholder
dot + an **instant tooltip** on every Overview metric card and every Health tab card (green = live
Datadog: Uptime/Error Budget/Health timeline/Datadog Monitors; gray = placeholder/PlanView).
Data-driven (`source` in `DashboardDetailMetricCard`). + UI polish (title spacing, centered dots,
title↔status separation in sub-portfolios).

---

## 🟡 ~~Almost free~~ — #2 + #3 ✅ DONE (see §"Done")

Both wired on the same `/api/v1/monitor` call (zero new integration). Validated with
`scripts/datadog-monitor-downtime-probe.js` (read-only, does not print keys). Key findings that back
what was built:

- **#2:** 100% of app monitors carry `message`; by id they carry `state.groups` with
  `last_triggered_ts` (1–72 groups per app monitor, manageable). _(Persisted per-monitor; groups
  left as a future improvement.)_
- **#3:** `GET /api/v2/downtime` = **403** (the key has no scope) → pivot to `with_downtimes=true` /
  `matching_downtimes`. **146 app monitors with an active downtime** as of 2026-06-16.

---

## 🟠 New call, high value (plain key, no RUM)

**4. Maturity scorecard** — _M · very high (differentiator)_ What Backstage/Cortex/OpsLevel/Port
build on top. Derivable from data we **already bring**: `has-monitor`, `has-SLO`, `SLO-passing`,
`mapped`, (+ `has-owner` if we add #5). One column/score per app. Zero integration, just logic.

**5. Owner + on-call + links** (Service Catalog) — _M · high · ⚠️ with caveat_
`GET /api/v2/services/definitions/{service}` → team, **Slack**, **PagerDuty/Opsgenie**,
**repo/docs/runbook** links, `tier`, lifecycle. ⚠️ It's keyed by the `service`/`dd-service` tag, and
our coverage probe showed that `service` **is not a clean per-app bridge in this org**. Depends on
(a) teams having written the service definition and (b) a reliable join → **test before promising**.

**6. Active incidents** — _M · high · ⚠️ with caveat_ `GET /api/v2/incidents` → fills `incidents` +
`lastIncident` (already exist in the model, static today). ⚠️ Requires the org to **use Incident
Management** and the incidents to be mappable (they don't carry `app_short_key` natively).

---

## 🔵 User Perception (Raja's track — discovery, with a technical path)

3 possible sources, **all without RUM**, all landing as a normal metric and compared with **a single
baseline engine** (`current / calendar_shift(-7d)` > threshold, + `anomalies('agile',2)`):

| Source                                                                                                                               | When                                                         | Cost                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **(a) APM `trace.*`** — `p95:trace.<span>{service:intellifi, resource_name:census_upload}`                                           | the app is already instrumented with APM                     | best fidelity, plain metrics                                                   |
| **(b) Log-based distribution metric** over a duration field already logged ("Generated report in 12.4s")                             | no APM but logs with duration                                | custom metric only; **not retroactive**                                        |
| **(c) Multistep API Synthetic test** — a canary that uploads census / triggers a report, asserts success, measures duration + uptime | none of the others exist, or a controlled baseline is wanted | **Synthetics API-test (NOT RUM/browser)** license; runs from private locations |

> The `perception` pill **already exists in the UI model** (`green|amber|red|undefined`) → wiring
> the front-end is low effort once the formula is defined. Option (c) is the explicit RUM-substitute
> for IntelliFi/Beacon.

---

## 🟣 Live vs placeholder — the distinction is per column, not per app

What Raja is asking for ("show what is live") **is not per app — it's per column.** Each row is
assembled in `toPortfolioApp` (`mongo-portfolio.repository.ts:385`):

| Column                            | Source                                             | Live?                                                                           |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Health**                        | `datadogMapped && healthStatus` (Datadog Monitors) | ✅ live — but only if the app is mapped; otherwise it falls back to `undefined` |
| **Uptime**                        | `uptime30d` (Datadog SLO)                          | ✅ live (or `null`)                                                             |
| **Perception**                    | hardcoded `'undefined'` (`:395`)                   | ❌ dummy/placeholder                                                            |
| **Active Users**                  | hardcoded `null` (`:400`)                          | ❌ dummy                                                                        |
| **Incidents**                     | hardcoded `0` (`:401`)                             | ❌ dummy                                                                        |
| **Last Incident**                 | hardcoded `'Undefined'` (`:402`)                   | ❌ dummy                                                                        |
| **Total Internal/External Users** | PlanView (real, not Datadog)                       | real data, different source                                                     |

**And in the detail (`detail.seed.ts`)** — same problem, more pronounced. Overview cards:

| Card                                                                                                 | Source                                                                      | Live?                     |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------- |
| Uptime (30d)                                                                                         | `uptime30d` Datadog SLO                                                     | ✅ live                   |
| Health "Healthy" pill                                                                                | `healthStatus` Datadog                                                      | ✅ live                   |
| HEALTH row of the timeline                                                                           | `healthSnapshots` (#1)                                                      | ✅ live                   |
| Active Users                                                                                         | `currentUserCount` PlanView                                                 | 🟡 real, different source |
| **Error Budget**                                                                                     | hardcoded (`detail.seed.ts:483`) — **the sync already brings the real one** | ❌ dummy → **#7**         |
| **SLA target**                                                                                       | hardcoded `99.95%` — real `slaTarget`                                       | ❌ dummy → **#7**         |
| Perception Score, Open Incidents, AI Tokens, AI Drift, Infra Cost, health checks, features, heatmap… | hardcoded                                                                   | ❌ dummy                  |

This translates into **two distinct distinctions** (to be decided separately):

1. **Which metrics are live vs placeholder** (real Health/Uptime vs Perception/Active
   Users/Incidents still dummy). _The important one, to avoid overselling._
2. **Within Health**, an app **mapped** to Datadog (real green/amber/red) vs **unmapped** (today it
   shows "Undefined" but doesn't say why).

**The good news — no need to touch the integration:**

- The back-end already brings on `Application`: `datadogMapped`, `resolutionPath`
  (`primary|fallback|unmapped`), `lastSyncStatus` (`ok|error|unmapped`), `lastSyncAt`. We just need
  to **propagate them to `PortfolioApp` and render them**.
- The UI already has the "grayed out" vocabulary: `.metric-muted`
  (`portfolio-page.component.scss:510`) already dims Uptime/Active Users when they are `null`. What
  Raja asks for ("grayed out") is consistent with what already exists.

**Options (from least to most effort):**

- **A — Legend + dim placeholders (S):** gray on the dummy columns (Perception/Active
  Users/Incidents) + a note _"Dimmed = placeholder, not yet wired · Health/Uptime = live Datadog"_.
  The most honest and nearly free; reuses `metric-muted`.
- **B — "live" badge + provenance tooltip (M):** solid dot + tooltip _"Live · Datadog · synced 3 min
  ago"_ for mapped; _"Not mapped in Datadog"_ for unmapped; _"Stale"_ if the last sync failed.
  Leverages `lastSyncAt`/`resolutionPath`.
- **C — Both (M) · recommended:** global legend + dim dummy + provenance tooltip on Health.
  Impresses without overpromising.

> These columns stop being placeholders as the other items get built: **Incidents** with #6,
> **Perception** once a source is chosen (§User Perception). In the meantime, dimming them is the
> honest move.

**To answer Raja right now:** _"Yes — and in fact today only Health and Uptime are live from
Datadog; Perception, Active Users and Incidents are still placeholders. We'll dim them (grayed out)
and mark Health/Uptime as live with a last-sync tooltip."_ This way the distinction isn't _"this app
is dummy"_ but _"these cells are live, these are placeholder"_ — which is what actually happens.

---

## 🔎 What to test (with the keys — nothing stays in logs/conversation)

1. **Does the `service` tag give a clean per-app join?** → enables (or not) #5. Reuse the pattern
   from `scripts/datadog-key-coverage.js`.
2. **Do IntelliFi/Beacon have APM (`trace.*`)?** → source (a) of perception.
3. **Do they log the operation duration?** → source (b).
4. **Does the org use Incident Management and are incidents mappable?** → #6.

---

## Recommendation

- **Done (committed, branch `feature/datadog-live-health`):** #1 timeline · uptime fix · #7 error
  budget/SLA · #C live-vs-placeholder (table) · **#2 monitor drill-down · #3 downtimes · provenance
  in the detail (Overview + Health tab)**.
  - _Note #3:_ the suppression/badge with real data needs a **re-run of the sync** (the code is
    already there; there are 146 app monitors with an active downtime waiting).
- **Next — to impress Anton:** scorecard (#4) — a differentiator, comes from data we already have.
  Zero integration, just logic.
- **With caveat (test before promising):** #5 owner/on-call (the `service` tag is not a clean
  per-app bridge) · #6 incidents (does the org use Incident Management?).
- **For Raja (perception):** bring the 3-source table + the single baseline engine (turns the
  discovery into a decision).

## Out of scope (no change)

`activeUsers/users` — Synthetics measures _duration/uptime_, not _how many users_; remains parked
(no RUM / no standard logging), same as Phase 1.

## Key constraints

- Retention: metrics **15 months**; indexed logs ~15 days (logs are no good as a long-term
  timeline).
- Rate limit `/api/v1/query`: **1600 req/h/org** → batch with `POST /api/v2/query/scalar`
  (multi-query + formulas) if golden signals are added.

---

## Sources (Datadog docs)

- Monitors API — https://docs.datadoghq.com/api/latest/monitors/
- Events API — https://docs.datadoghq.com/api/latest/events/
- Downtimes API — https://docs.datadoghq.com/api/latest/downtimes/
- Incidents API — https://docs.datadoghq.com/api/latest/incidents/
- Service Definition API — https://docs.datadoghq.com/api/latest/service-definition/ · Entity model
  v3 — https://docs.datadoghq.com/internal_developer_portal/software_catalog/entity_model/
- Metrics API (query v1/v2) — https://docs.datadoghq.com/api/latest/metrics/
- APM trace metrics — https://docs.datadoghq.com/tracing/metrics/metrics_namespace/
- Synthetics API — https://docs.datadoghq.com/api/latest/synthetics/ · API tests —
  https://docs.datadoghq.com/getting_started/synthetics/api_test/ · Multistep —
  https://docs.datadoghq.com/synthetics/multistep/
- Log → metrics — https://docs.datadoghq.com/logs/log_configuration/logs_to_metrics/
- Timeshift / baseline (`calendar_shift`) —
  https://docs.datadoghq.com/dashboards/functions/timeshift/ · Anomalies —
  https://docs.datadoghq.com/dashboards/functions/algorithms/
- Rate limits — https://docs.datadoghq.com/api/latest/rate-limits/ · Metrics retention —
  https://docs.datadoghq.com/metrics/custom_metrics/historical_metrics/
