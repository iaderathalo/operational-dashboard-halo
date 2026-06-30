# Card Data-Sourcing + LLM Maturity-Recommendations — Deep Research

**Date:** 2026-06-23 **Method:** deep-research harness (5 angles, 26 sources fetched, 110 claims, 25
adversarially verified → 20 confirmed / 5 killed). **Scope:** Can we feed the 10 mockup detail-page
cards with real per-app data, and how do we build the LLM-on-demand "what's-missing-for-maturity-5"
recommendations feature. **Reconciled against:** prior spikes 8-1 / 8-3 (incidents +
service-definitions), watchdog spike 11-3, perception research. Internal codebase facts treated as
ground truth.

---

## 1. Executive summary

The hard wall across most of these cards is the **same per-app join gate we already hit for
incidents**: Datadog telemetry (APM traces, incidents, service definitions) joins to apps only via
the `service` tag, and only ~0.1% of our 3,656 apps carry a usable `service` tag. Our reliable
bridges are `app_short_key` (primary) and `app_service_id` (fallback). **Anything keyed off those
two is feasible; anything that only carries `service`/`env` is NOT.**

| Bucket                                                                          | Cards                                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| ✅ **GO NOW** (data we already sync)                                            | Recent Health Events, Recent Activity                                                |
| 🟡 **GO WITH WORK** (new client, no new infra)                                  | Health Check Breakdown (Synthetics), **Open Incidents via ServiceNow** (not Datadog) |
| 🟠 **PARTIAL** (needs a tag/entitlement first)                                  | Infra Cost MTD (needs an activated AWS cost-allocation tag)                          |
| ⛔ **NO-GO portfolio-wide** (blocked by the service-tag gate or no per-app API) | Response Time P50/P90/P99, Error Rate, AI Tokens, AI Drift, Feature Health Summary   |

**Single highest-value path:** ship the two GO-NOW cards first (zero new dependencies, immediate
truth replacing dummy data), then the **LLM Recommendations tab** (the feature you care about — it
rides entirely on data we already have), then ServiceNow incidents, then Synthetics, then Cost. The
four NO-GO cards are all gated on **Datadog tagging hygiene** (getting `service` or `app_short_key`
onto APM/monitors) — that's an org data-hygiene ask, not our code, same conclusion as 8-2/8-4/11-3.

---

## 2. Per-card feasibility matrix

| #   | Card                                | Real source                          | Endpoint / metric                                                                                                                                                                                                      | Entitlement & auth                                                                         | Per-app coverage                                                                                                                                                                                                                        | Limits                                                      | Effort                      | Verdict                                                                                                                             |
| --- | ----------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Open Incidents**                  | **ServiceNow** (NOT Datadog)         | ServiceNow Table API `GET /api/now/table/incident?sysparm_query=...` keyed on the app's ServiceNow id (== our `app_service_id`)                                                                                        | ServiceNow REST + service account (we don't have it yet)                                   | Potentially high — bounded by how well `app_service_id` is populated (often null per 2-2). Datadog path = ~0.1% (NO-GO). PagerDuty also inherits the service gate (`service_ids`/`team_ids` filters).                                   | ServiceNow rate limits per instance                         | Medium (new client + creds) | 🟡 **GO via ServiceNow**, ⛔ via Datadog                                                                                            |
| 2   | **Response Time P50/P90/P99 (24h)** | Datadog APM                          | DDSketch distribution metric `trace.<SPAN_NAME>` (e.g. `trace.http.request`) → `p50/p90/p99`; query `POST /api/v2/...` timeseries                                                                                      | `timeseries_query`; DD-API/APP keys (have)                                                 | **~0.1%.** Trace metrics carry ONLY `env, service, version, resource, http.status_code, host`. **SDK/span tags cannot be promoted to primary tags**, so `app_short_key` is not queryable on trace metrics. Same gate as incidents.      | DDSketch percentiles only aggregatable on the fixed tag set | High                        | ⛔ **NO-GO portfolio-wide.** Fallback: only `service`-tagged apps, or app-emitted span-based custom metrics tagged `app_short_key`. |
| 3   | **Error Rate (24h)**                | Datadog APM                          | error rate = `trace.<SPAN>.errors` ÷ `trace.<SPAN>.hits` (two COUNT metrics)                                                                                                                                           | same as #2                                                                                 | **~0.1%** — identical tag gate                                                                                                                                                                                                          | same                                                        | High                        | ⛔ **NO-GO portfolio-wide** (same fallback as #2)                                                                                   |
| 4   | **Recent Health Events**            | **Our own store**                    | derive from `HealthSnapshot` history (already synced, joined on `app_short_key` via `buildHealthTimeline`, FR-3) — diff consecutive statuses → events; optionally enrich w/ monitor state-transitions                  | none new                                                                                   | **~100% of mapped apps**                                                                                                                                                                                                                | none                                                        | Low                         | ✅ **GO NOW**                                                                                                                       |
| 5   | **Health Check Breakdown**          | Datadog Synthetics                   | `GET /api/v1/synthetics/tests` + per-test results `GET /api/v1/synthetics/tests/{id}/results`                                                                                                                          | needs `synthetics_read` on the key (unverified); auth have                                 | **Unknown — gated on whether synthetics carry `app_short_key`.** Open question to probe.                                                                                                                                                | API paged                                                   | Medium                      | 🟡 **GO WITH WORK** (pending the tag probe)                                                                                         |
| 6   | **Recent Activity**                 | **Our own store**                    | feed from our derived events: sync runs, health transitions, SLO burn changes, mapping changes                                                                                                                         | none new                                                                                   | **~100%**                                                                                                                                                                                                                               | none                                                        | Low                         | ✅ **GO NOW**                                                                                                                       |
| 7   | **Feature Health Summary**          | (none native)                        | no Datadog construct yields per-_feature_ (sub-component) health from tags alone                                                                                                                                       | —                                                                                          | n/a                                                                                                                                                                                                                                     | —                                                           | —                           | ⛔ **NO-GO from tags.** PARTIAL only if the app self-reports per-feature health to a metric/endpoint we ingest.                     |
| 8   | **AI Tokens (per app)**             | GitHub Copilot Metrics API / LLM-obs | Copilot Metrics REST API exposes **enterprise / org / (new) team** scope only — **no per-repo, per-seat, or per-app endpoints**. App-emitted LLM usage → Datadog LLM Observability cost metrics, only if instrumented. | GitHub PAT (org admin) / DD LLM-obs                                                        | **NO per-app for Copilot** (granularity stops at team). Per-app only for apps that self-instrument LLM-obs.                                                                                                                             | —                                                           | High                        | ⛔ **NO-GO portfolio-wide.** PARTIAL only for instrumented AI apps.                                                                 |
| 9   | **AI Drift (per app)**              | Datadog LLM-obs / ML monitoring      | drift metrics (PSI/KS/JS) exist **only for registered models that report them**, tagged `app_short_key`                                                                                                                | DD LLM-obs / model-monitoring                                                              | Rare across 3,656 apps (only true AI-product apps)                                                                                                                                                                                      | —                                                           | High                        | ⛔ **NO-GO portfolio-wide.** GO only for the handful of instrumented AI apps.                                                       |
| 10  | **Infra Cost MTD (per app)**        | Datadog CCM **or** AWS Cost Explorer | Datadog CCM `cloud_cost` data source + tag-enrichment rules, **or** AWS `GetCostAndUsage` `GroupBy=TAG`                                                                                                                | needs an **activated cost-allocation tag** = `app_short_key`; AWS CE or DD CCM entitlement | Bounded by tagging maturity; **tags backfill retroactively up to 12 months once activated** (the "no retroactive" claim was refuted 0-3). `GetCostAndUsageWithResources` is EC2-only + 14-day → unfit for MTD; use grouped MTD instead. | AWS CE per-request cost                                     | Medium-High                 | 🟠 **PARTIAL** — needs the cost-allocation tag activated first (FinOps).                                                            |

---

## 3. Feature: LLM-on-demand "Maturity Recommendations" tab

The feature you flagged as the priority. It rides **entirely on data we already sync** — no blocked
dependency except the internal LLM gateway endpoint.

### 3.1 Architecture

- **New endpoint:** `POST /api/v1/dashboard/portfolio/apps/{id}/recommendations`
  (Okta/token-guarded).
- **Flow:**
  1. Load the `StoredApplication`.
  2. Reuse `computeMaturity()` → get `{score, signals}` (the 5 booleans).
  3. **Deterministically build a grounded FACTS block** — the failing signals + the supporting data
     (monitors[], `uptime30d`, `slaTarget`, owner fields, `datadogMapped`/`resolutionPath`,
     `healthStatus`, `lastSyncStatus`/`lastSyncAt`).
  4. Call the **Lenai internal LLM gateway** with the FACTS block + a strict JSON-output contract
     (structured outputs / JSON mode).
  5. Validate against the schema; reject + retry if the model invents a value not in FACTS.
  6. **Cache** the result on the app doc (`recommendationsCache`, `generatedAt`, `basedOnSyncAt`);
     return.
- **Cache invalidation:** store the sync timestamp the recommendation was based on; mark stale +
  offer "Regenerate" when a newer sync has landed. Rate-limit the button (e.g. 1/app/min; skip
  regenerate if data unchanged).
- **Grounding/trust (consistent with our "never a false GREEN / freshness-honest" principle):**
  system prompt forbids inventing metric values, monitor names, or numbers absent from FACTS; every
  action must cite the field it used; uncertainty is marked; the response echoes `lastSyncStatus` so
  a stale sync is visible.

### 3.2 Signal → remediation map (deterministic seed; the LLM enriches with app-specific how-to)

| Failing signal | Recommended action                                                                                              | Δ   | Effort   |
| -------------- | --------------------------------------------------------------------------------------------------------------- | --- | -------- |
| `!mapped`      | Tag this app's Datadog monitors with `app_short_key=<key>` (or `app_service_id`) so it maps to the catalog      | +1  | Low      |
| `!hasMonitor`  | Create ≥1 Datadog monitor (Metric or Service Check) on the app's key endpoint/host                              | +1  | Low-Med  |
| `!hasSLO`      | Define a Datadog SLO (monitor- or metric-based) with a target, e.g. 99.9% / 30d                                 | +1  | Med      |
| `!sloPassing`  | SLO breaching (`uptime30d` < `slaTarget`) — reliability investigation: top failing monitors + error-budget burn | +1  | Med-High |
| `!hasOwner`    | Set an owner in PlanView (`itOwner`/`portfolioOwner`/`businessOwner`)                                           | +1  | Low      |

### 3.3 Strict JSON output schema

```jsonc
{
  "appId": "string",
  "generatedAt": "ISO-8601",
  "basedOnSyncAt": "ISO-8601",
  "currentScore": 0, // 0-5
  "targetScore": 5,
  "freshness": "live | stale", // echoes lastSyncStatus
  "actions": [
    {
      "id": "string",
      "signal": "mapped|hasMonitor|hasSLO|sloPassing|hasOwner|other",
      "title": "string",
      "why": "string", // why it matters, business framing
      "howTo": ["concrete Datadog/PlanView step", "..."],
      "expectedMaturityDelta": 1,
      "effort": "low|medium|high",
      "owner": "app team | SRE | catalog owner",
      "evidence": "the FACTS field this is grounded on",
      "confidence": "high|medium|low",
    },
  ],
  "notes": "string",
}
```

### 3.4 Cost / latency / model tier

- One LLM call per regenerate; ~2-4k input tokens (FACTS) + ~1-2k output. Latency a few seconds —
  acceptable for an explicit button.
- Low volume (on-demand, per-app) → use a **strong reasoning tier** on the Lenai gateway for
  quality, with **structured-output/JSON mode enforced**. Cache hard so repeat views are free.

### 3.5 UX spec for the new tab (cited precedents)

Patterns extracted from best-in-class "score + how to improve it" surfaces:

- **Datadog Service Catalog Scorecards** — rules grouped by outcome, pass/fail per service, "what's
  failing" list. [datadoghq.com/blog/scorecards, docs Scorecards]
- **Microsoft Secure Score** — single score + ranked "recommended actions" each with a point delta
  and effort. [learn.microsoft.com Secure Score]
- **GitHub Dependabot alerts** — prioritized, expandable, one-click-to-evidence + suggested
  remediation. [docs.github.com Dependabot]
- **AWS Well-Architected / Trusted Advisor** — checklist with severity + guided remediation.

**Recommended layout** (fits the existing card/tab visual language):

- Header: **maturity ring X/5** + a one-line "what's blocking 5/5".
- **Prioritized action checklist**, sorted by `expectedMaturityDelta` then `effort`. Each row: title
  · signal badge · effort chip · `+Δ` · expand → `why` + `howTo` steps + `evidence`.
- **"Generate / Regenerate"** button (the hot-model trigger) with a freshness line ("based on sync
  at <time>"), greyed when no newer data.
- **One-click-to-evidence**: each action deep-links to the Datadog monitor/SLO or the PlanView owner
  field.
- Honest empty/uncertainty states reusing the 5-6 two-state model (Not monitored / No data); never a
  false GREEN.

---

## 4. Proposed backlog (recommended order A → E)

> New epic in the style of the phase-2 backlogs. Order maximizes shipped-truth-per-dependency.

- **A. Replace mock cards from data we already have** — Recent Activity + Recent Health Events. ✅
  GO NOW, no dependency. Quick win; kills 2 dummy tabs. (follow-on to epic-5 / epic-7)
- **B. LLM Maturity Recommendations tab** — the priority feature (§3). Rides on synced data.
  **Unblocker:** Lenai gateway endpoint + auth (internal AI platform).
- **C. ServiceNow Open Incidents** — spike: does `app_service_id` join ServiceNow incidents
  materially above 0.1%? → then build a ServiceNow incident client. **Unblocker:** ServiceNow REST
  service account.
- **D. Synthetics Health Check Breakdown** — spike: key has `synthetics_read`? do synthetics carry
  `app_short_key`? → then build. **Unblocker:** quick probe with existing key.
- **E. Infra Cost MTD** — 🟠 PARTIAL. **Unblocker:** activate `app_short_key` as an AWS
  cost-allocation tag (FinOps) → then AWS `GetCostAndUsage GroupBy=TAG` or Datadog CCM. Tags
  backfill ~12 months retroactively.
- **PARK (NO-GO, all blocked by the same Datadog tagging-hygiene ask):** Response Time P50/P90/P99,
  Error Rate, AI Tokens, AI Drift, Feature Health Summary. Revisit only if the org tags APM/monitors
  with `service` or `app_short_key` (the master unblocker — same as 8-2/8-4/11-3), or for the
  handful of self-instrumented AI apps.

### Open questions / external unblockers

1. Does `app_service_id` join ServiceNow incidents above ~0.1%? _(owner: ServiceNow admin)_
2. Does the Datadog key have `synthetics_read`, and do synthetics carry `app_short_key`? _(quick
   probe, our key)_
3. Is `app_short_key` an activated AWS cost-allocation tag? _(owner: cloud/FinOps)_
4. What is the Lenai LLM gateway endpoint + auth? _(owner: internal AI platform)_
5. **Master unblocker:** get `service` or `app_short_key` onto APM/monitors → unlocks cards 1-3 from
   Datadog + perception (epic-9). _(owner: org SRE / Bernie)_

### Caveats

- ServiceNow API shape not web-verified this run (Table API documented; field-join coverage is the
  open question).
- Copilot "org-only" was refuted only because a **team-level** usage API now exists (2026-05-14) —
  still no per-app/per-repo, so the per-app NO-GO holds.
- AI Drift / Feature Health verdicts derived from the GIVEN tag constraints, not a fresh probe.

### Sources (primary unless noted)

Datadog: trace metrics namespace, DDSketch trace metrics, primary-tags-to-scope, unified service
tagging, Synthetics API, Cloud Cost Management API, Service Catalog Scorecards. AWS:
GetCostAndUsage, get-cost-and-usage-with-resources, activating/custom cost-allocation tags. GitHub:
Copilot Metrics REST API, team-level usage changelog (2026-05-14). PagerDuty: List Incidents.
ServiceNow: Table API. LLM: OpenAI Structured Outputs, Claude structured outputs; Microsoft Secure
Score, GitHub Dependabot (UX precedents).
