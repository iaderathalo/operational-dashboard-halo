# Phase-2 Backlog — Operational Dashboard (Card Truth + Maturity Recommendations)

_Generated: 2026-06-23 | PRD:
`_bmad-output/planning-artifacts/prds/prd-operational-dashboard-halo-2026-06-13/prd.md`_ _Source
research:
`_bmad-output/planning-artifacts/research/card-sourcing-and-maturity-recommendations-research-2026-06-23.md`_
_Mapping + discovery: Iader | Build lead: Bernardo_

---

## Context

The app **detail page** ships a rich set of mockup tabs
(`overview, health, perception, ai-tokens, ai-drift, cost, incidents, contacts, settings`) backed by
**dummy data** in `detail-page.data.ts`. This epic is the **card-truth pass**: replace dummy cards
with real per-app data **where the data is reachable**, and add the one net-new feature the product
owner prioritized — an **LLM-on-demand "what's missing for maturity 5" recommendations tab**.

It is grounded in a deep-research pass (5 angles, 26 sources, 25 claims adversarially verified)
reconciled against our prior spikes (8-1 incidents, 8-3 service-definitions, 11-3 watchdog) and the
live codebase.

**The central constraint (confirmed with Datadog primary docs):** Datadog telemetry — APM trace
metrics, incidents, service definitions — joins to apps **only via the `service` tag**, and only
**~0.1%** of our 3,656 apps carry a usable `service` tag. Our reliable bridges are `app_short_key`
(primary) + `app_service_id` (fallback). **Trace metrics carry only
`env/service/version/resource/http.status_code/host`, and SDK span tags cannot be promoted to
primary tags** — so `app_short_key` is _not queryable_ on APM. Anything keyed off our two bridges is
feasible; anything that only carries `service`/`env` is not.

### The leverage

Two cards are **GO NOW** off data the sync **already brings** (zero new dependency), and the
priority **LLM recommendations** feature rides **entirely on already-synced data** — its only
external dependency is the internal LLM gateway endpoint. The remaining GO items need one new client
each; the NO-GO cards are all blocked by the **same org tagging-hygiene ask** (get
`service`/`app_short_key` onto APM/monitors), identical to the 8-2/8-4/11-3 conclusion.

Epic numbering continues the sequence (E1–E6 Phase-1, E7–E9 enrichment, E10 Dremio, E11 Exec-Value)
→ **E12**.

### Sequencing at a glance

- **E12-S1 (synced-data cards)** — do first; ⚡ quick win, no new calls; kills two dummy tabs
  immediately.
- **E12-S2 (LLM maturity recommendations)** — the priority feature; rides on synced data; stub the
  gateway until Lenai is wired.
- **E12-S3 (Open Incidents via ServiceNow)** — **spike before build**: does `app_service_id` join
  ServiceNow incidents above ~0.1%?
- **E12-S4 (Health Check Breakdown via Synthetics)** — **probe before build**: key entitlement + do
  synthetics carry `app_short_key`?
- **E12-S5 (Infra Cost MTD)** — 🟠 PARTIAL; gated on an activated AWS cost-allocation tag (FinOps).

### Standing constraints (apply to all stories)

- No RUM; no new paid integration / entitlement-gated API without a spike.
- `/api/v1/query` ~1600 req/h/org; metrics retained 15 months → stay inside the **one bulk
  snapshot**; no per-app Datadog calls.
- APM / incident / service-catalog joins remain weak (~0.1% `service`-tag coverage) — not relied on
  here.
- Keys from `ConfigService` / Vault; probes read-only, never print keys.
- Respect the two-state missing-data model (5-6) and "never a false GREEN"; data-freshness honesty
  (`lastSyncStatus`/`lastSyncAt`, cf. 5-8).

---

## E12 — Card Truth + Maturity Recommendations

**Goal:** Replace mockup detail-page cards with real per-app data where reachable, and add an
LLM-on-demand recommendations tab that tells each app exactly what to do to raise its maturity
score. Ship truth where it's free, spike where it's gated, and honestly park what the tag gate
blocks.

---

### E12-S1 — Synced-data cards: Recent Health Events + Recent Activity ⚡ quick win

**Owner:** Bernardo / Iader | **Blocked by:** nothing (data already synced) | **Status:** backlog
(GO-NOW; promote to ready-for-dev on story-file write)

**As an** app owner, **I can** see Recent Health Events (status transitions) and a Recent Activity
feed for an app, **so that** the detail page shows real history instead of dummy rows.

**Acceptance Criteria:** Recent Health Events derived by diffing consecutive `HealthSnapshot`
statuses (already synced, joined on `app_short_key` via `buildHealthTimeline`, FR-3); Recent
Activity is a feed built from our own derived events (sync runs, health transitions, SLO-burn
changes, mapping changes); ~100% coverage of mapped apps; honest-empty when no history; no new
Datadog call; unit tests for transition-diff / empty / unmapped.

**Verdict:** ✅ **GO NOW.** — _Story file:_ `stories/12-1-synced-data-cards.md`

_Key files:_ `buildHealthTimeline` + snapshot read path; `detail-page.data.ts` (`healthEvents`,
`activityLog`).

---

### E12-S2 — LLM-on-demand "Maturity Recommendations" tab 💎 priority feature

**Owner:** Bernardo (build) / Iader (gateway + prompt) | **Blocked by:** Lenai LLM gateway
endpoint + auth (stub until then) | **Status:** backlog

**As an** app owner, **I can** press "Generate recommendations" on an app and get a prioritized,
grounded action list of exactly what to do to raise its maturity toward 5, **so that** I know the
next concrete steps, not just the score.

**Acceptance Criteria:** new endpoint `POST /api/v1/dashboard/portfolio/apps/{id}/recommendations`
(guarded); reuse `computeMaturity()` to detect failing signals; build a **deterministic FACTS
block** (failing signals + monitors / SLO / uptime / slaTarget / owners / `datadogMapped` /
`resolutionPath` / `healthStatus` / `lastSync`); call the Lenai gateway with **structured output**
against a strict JSON schema; **reject + retry** if the model emits a value absent from FACTS (no
hallucinated metrics); **cache** on the app doc keyed by `basedOnSyncAt`, mark stale + offer
regenerate when a newer sync lands; rate-limit the button; output cites the FACTS field per action
and echoes `lastSyncStatus`; tests for each failing-signal → action, the no-hallucination guard, and
cache invalidation.

**Signal → remediation seed (LLM enriches with app-specific how-to):** `!mapped` → tag monitors with
`app_short_key`/`app_service_id` (+1, low) · `!hasMonitor` → create a Datadog monitor (+1, low-med)
· `!hasSLO` → define an SLO with a target (+1, med) · `!sloPassing` → reliability investigation
(`uptime30d` < `slaTarget`) (+1, med-high) · `!hasOwner` → set a PlanView owner (+1, low).

**JSON schema + UX spec:** see source research §3.3 / §3.5. UX precedents: Datadog Scorecards,
Microsoft Secure Score, GitHub Dependabot, AWS Well-Architected. Layout: maturity ring X/5 +
prioritized action checklist (sort by Δ then effort) + expand→why/how-to/evidence +
one-click-to-evidence deep links + freshness line on the regenerate button.

**Verdict:** ✅ **GO** (rides on synced data; only the real gateway is external). — _Story file:_
`stories/12-2-maturity-recommendations-llm.md`

_Key files:_ `computeMaturity` in `mongo-portfolio.repository.ts`; new recommendations
controller/service; detail-page new tab.

---

### E12-S3 — Open Incidents via ServiceNow (SPIKE → build) 🟡 go-with-work

**Owner:** Iader (spike) / Bernardo (build) | **Blocked by:** ServiceNow REST service account; the
join-coverage spike | **Status:** backlog

**As an** app owner, **I can** see real open-incident counts + recent incidents per app, **so that**
the Incidents tab reflects production reality instead of dummy data.

**Acceptance Criteria:** read-only spike records whether `app_service_id` joins ServiceNow incidents
materially above the ~0.1% Datadog floor, plus the Table API query shape + coverage %, and a
go/no-go; if GO, a ServiceNow incident client (Table API `GET /api/now/table/incident` filtered by
the app's ServiceNow id) feeding the Incidents card, pulled in the sync cadence (not per-app on
render); honest-empty + never mis-attributed; unjoinable apps excluded.

**Verdict:** 🟡 **GO via ServiceNow** (Datadog/PagerDuty inherit the `service` gate → NO-GO). —
_Story file:_ `stories/12-3-servicenow-open-incidents.md`

> **Why ServiceNow:** incidents need a per-app key; our `app_service_id` fallback IS the ServiceNow
> id. The open question is how often it's populated (often null per 2-2) — hence spike before build.

---

### E12-S4 — Health Check Breakdown via Synthetics (PROBE → build) 🟡 go-with-work

**Owner:** Iader (probe) / Bernardo (build) | **Blocked by:** key `synthetics_read` + the
app_short_key tag probe | **Status:** backlog

**As an** app owner, **I can** see a per-app health-check breakdown (synthetic test pass/fail +
timing), **so that** the Health tab shows real endpoint/uptime checks.

**Acceptance Criteria:** read-only probe confirms the Datadog key has `synthetics_read` and whether
Synthetic tests carry `app_short_key` (records coverage %); if GO, a Synthetics client
(`GET /api/v1/synthetics/tests` + per-test results) feeds the Health Check Breakdown card joined on
`app_short_key`, in the sync cadence; honest-empty otherwise.

**Verdict:** 🟡 **GO WITH WORK** (pending the entitlement + tag probe). — _Story file:_
`stories/12-4-synthetics-health-checks.md`

---

### E12-S5 — Infra Cost MTD (per app) 🟠 partial — tag-gated

**Owner:** Iader (FinOps coordination) / Bernardo (build) | **Blocked by:** an **activated AWS
cost-allocation tag** `app_short_key` (FinOps) | **Status:** blocked

**As a** leadership stakeholder, **I can** see month-to-date infra cost per app, **so that** the
Cost tab reflects real spend.

**Acceptance Criteria:** once `app_short_key` is activated as a cost-allocation tag, source MTD via
AWS Cost Explorer `GetCostAndUsage` `GroupBy=TAG` (or Datadog CCM `cloud_cost` data source +
tag-enrichment); coverage bounded by tagging maturity (documented); use grouped MTD, **not**
`GetCostAndUsageWithResources` (EC2-only + 14-day window, unfit for MTD); honest partial-coverage
labelling.

**Verdict:** 🟠 **PARTIAL.** Bonus: AWS cost-allocation tags **backfill retroactively ~12 months**
once activated. — _Story file:_ `stories/12-5-infra-cost-mtd.md`

---

## Out of scope / PARK (NO-GO — all blocked by the same Datadog tagging-hygiene ask)

These cards cannot be sourced per-app today and are **not** built in this epic. Revisit **only** if
the org tags APM/monitors with `service` or `app_short_key` (the master unblocker — same conclusion
as 8-2/8-4/11-3), or, for the AI cards, for the handful of apps that self-instrument.

- **Response Time P50/P90/P99 (24h)** — APM DDSketch metric `trace.<SPAN>` p50/p90/p99; ⛔ ~0.1%
  join (span tags ≠ primary tags).
- **Error Rate (24h)** — APM `trace.<SPAN>.errors` ÷ `.hits`; ⛔ same gate.
- **AI Tokens (per app)** — GitHub Copilot Metrics API is enterprise/org/**team** scope only; ⛔ no
  per-app/per-repo endpoint. PARTIAL only for apps self-instrumenting LLM-obs.
- **AI Drift (per app)** — drift (PSI/KS/JS) only for registered models reporting it tagged
  `app_short_key`; ⛔ rare across 3,656 apps.
- **Feature Health Summary** — no native per-feature Datadog construct; ⛔ from tags. PARTIAL only
  if the app self-reports.

Already tracked elsewhere, not re-owned here: placeholder-cell cleanup (`5-2`/`E7-S3`), perception
pill (`E9`), egress fix (`5-8`), async sync (`5-9`).

---

## Open questions / external unblockers

1. Does `app_service_id` join ServiceNow incidents materially above ~0.1%? _(owner: ServiceNow
   admin)_ → gates **E12-S3**.
2. Does the Datadog key have `synthetics_read`, and do synthetics carry `app_short_key`? _(quick
   probe, our key)_ → gates **E12-S4**.
3. Is `app_short_key` an activated AWS cost-allocation tag? _(owner: cloud/FinOps)_ → gates
   **E12-S5**.
4. What is the Lenai LLM gateway endpoint + auth? _(owner: internal AI platform)_ → unblocks
   **E12-S2** real path.
5. **Master unblocker:** get `service`/`app_short_key` onto APM/monitors → unlocks Response Time,
   Error Rate (and perception, E9) from Datadog. _(owner: org SRE / Bernie)_
