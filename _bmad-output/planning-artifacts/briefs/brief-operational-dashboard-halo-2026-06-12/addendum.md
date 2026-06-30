# Addendum — Operational Dashboard Product Brief

Depth for downstream documents (PRD, architecture, sprint planning), not the brief itself. Sources:
FW touch-point meeting transcript (authoritative), the creator intent dossier, and the market
research report in `_bmad-output/planning-artifacts/research/`.

## Authoritative meeting evidence (FW touch point)

**People and roles (corrected from earlier notes):**

- **Anton Novikov** — TPM, creator and owner. Built the prototype with GitHub Copilot. On
  vacation/cruise starting the meeting day; marginally reachable, possibly one day "next week."
- **Rami** — executive sponsor. Anton reviewed the portfolio view with him; **Rami** requested the
  business-unit reorganization of the tree (not Jory) and stressed user perception is the
  differentiator. The repo seed names "Rami Assaad" as COO.
- **Jory** — Anton's supervisor; appears as a node in the real-data tree (projects under Jory). NOT
  the source of the BU-reorg request.
- **Prashant** — promoted to co-host/lead while Anton is out; primary point of contact; "agent mode"
  host for Copilot.
- **Nemi** — developer; exported the PlanView metadata; secondary point of contact; "ask mode"
  person for Copilot.
- **Bernardo + Iader** — the build team; Bernardo leads initially (broad knowledge of company
  services), Iader shadows then takes ownership.
- **Raja** — business contact to engage (in parallel, while Anton is out) for defining the
  perception scenarios for IntelliFi and Beacon; gathering the User-Perception requirements.
- **Tanu** — business contact for the IntelliFi perception specifics (works with Raja on the
  IntelliFi scenarios).
- Teams channel: **"operational dashboard tech team."** Repo: `github.com/mmctech` enterprise,
  "operational dashboard"; Anton works in a branch and will open a PR.

**Concrete User Perception scenarios (Anton's own examples):**

- IntelliFi: census-file upload time; report generation time (expected ~8s; if it climbs to ~47s,
  perception is low); proposal integration time.
- Beacon: "save session" — if it takes longer than ~1 minute, users report the app is broken.
- Generic: dashboard load time on each visit.
- Method Anton proposed: log the operation duration → retrieve from Datadog → compute current
  average vs. baseline → green/amber/red. Prashant's counter: don't scrape Datadog logs for
  user-level timing when **Pendo** is the approved tool for page-load metrics; use the right tool
  per signal and let the dashboard combine them.

**Perception MECHANISM (now defined — values still TBD, discovery owned by Raja + Tanu):** Per app,
identify the 2–4 operations users _really_ do (IntelliFi: upload census file, generate a specific
report). For each, identify the backing API and set a response-time **threshold** against a
**baseline**. If actual response time is far above baseline (e.g. baseline 8.1s, actual 47s),
perception is **critical** even when Health is GREEN — the "bank analogy": the app is up, but a slow
operation makes the user's perception bad. The perception screen shows, per operation: operation
name / current response time / baseline / ok-vs-critical. It is a **separate tab, after Overview +
Health** (Phase-1 priority was Overview + Health; perception follows). The per-app operations,
baselines, and thresholds are the open discovery deliverable.

**"The crawler" (ingestion):**

- A Kubernetes cronjob reusing a prior project's scheduler pattern ("Wild Tricks"/Qualtrics-style):
  a Helm-deployed cron that spins up an image on a schedule and calls a chosen API — "zero effort,"
  no new long-running service.
- Explicitly chosen over in-app polling because apps run in multiple replicas/containers with
  near-aligned clocks → concurrent duplicate writes to the same DB. This is the recorded rationale
  for "not in-app cron."
- Polling interval is intentionally unfixed for the PoC: "every 5 or 15 minutes is fine, tune
  later."
- **Ingestion design (delivered — changed from per-app polling to a BULK-FETCH SNAPSHOT):** one run
  pages `GET /api/v1/monitor` once for _all_ monitors (indexed by every tag) and `GET /api/v1/slo`
  once (keeping only `app_short_key`/`app_service_id`-tagged SLOs), fetches each kept SLO's
  24h/7d/30d history under bounded concurrency (6) with 429 backoff (Retry-After), then resolves
  every app with **purely local lookups — zero Datadog HTTP per app**. Rationale: per-app polling
  issued ~3656+ calls/run and tripped Datadog 429 rate limits (observed: 13 failures, only 521/651
  mapped); the bulk-fetch run did 3656/3656 successfully, 0 errors, 651 mapped, ~157s. The K8s
  CronJob triggers `POST /api/v1/internal/sync/datadog` (shared-secret guarded) on a schedule —
  nobody runs it by hand; the dashboard reads only Mongo.

**Datadog mapping challenge — RESOLVED (automatic, not manual):**

- _What it looked like at the meeting:_ telemetry in Datadog seemed keyed by an **application
  service ID** (a ServiceNow-style CI) that PlanView Enterprise Architect leaves blank and the
  monitoring scripts don't carry — implying a manually-curated, per-app service-ID stored in Mongo,
  with namespace + application name as a fallback.
- _What it actually is:_ the bridge is **automatic** via two identifiers already on BOTH sides.
  Datadog tag `app_short_key` == PlanView CAST key (== the app's `shortCode`); Datadog tag
  `app_service_id` == PlanView ServiceNow key (`serviceNowKey`, format `SNSVC#######`). No manual
  curation, no stored service-ID, no namespace+app fallback. The resolver tries `app_short_key`
  (primary; = `shortCode`, or a `datadogServiceId` override) then `app_service_id` (fallback; =
  `serviceNowKey`).
- _How that was proven:_ a brute-force coverage probe over all 104 Datadog tag namespaces × all
  PlanView id fields found only `app_short_key`↔`castKey` (646 apps) and
  `app_service_id`↔`serviceNowKey` (387) to be valid per-app bridges (~one value per app).
  Everything else (`business_unit`=7 values, `team`, `service`, `servicenow_chg`=CHANGE tickets) is
  group-level or coincidental and must NOT be used.
- _Correction to a meeting assumption:_ the team believed Intellify & Beacon lacked monitors — they
  were only checking the ServiceNow key, which is null for those apps. IntelliFi actually **has**
  monitors under `app_short_key` (proven live: GREEN, 99.99% uptime). **Update 2026-06-16 (Raja
  sync, N4):** Beacon monitoring DOES exist too — the earlier "Beacon has no monitors / its owning
  team must create them" assumption was WRONG. Coordinate with **Juan** (owns Beacon monitoring) for
  Beacon's `app_short_key`/mapping. The tag bridge was re-confirmed live in the demo:
  `app_short_key` works; the ServiceNow key is often null (hence `app_service_id` is the fallback).
- Constraint (Prashant) still stands for any log-based signal: Datadog logs are retained **~2
  weeks** and teams change log formats over time — don't depend on bespoke log scraping for
  consistency. (Health uses monitors/SLOs, not log scraping, so it is unaffected.)

**Data sources and the real/demo toggle:**

- Project metadata comes from **PlanView Enterprise Architect**, exported (via the Dremio database)
  to JSON and loaded into Mongo. The flat `applications` collection is a near-copy of that JSON.
- Anton added a **demo/real toggle**: "real" shows live PlanView projects filtered by IT-owner (his
  name); "demo" shows the dummy portfolio tree. Real mode requires impersonating Anton or Jory to
  see assigned projects, else the list is empty. (This toggle was in Anton's uncommitted local
  changes at meeting time, which reconciles its absence from the single-commit repo snapshot.)
- Rami's reorg: real data was grouped by person (TPM); he wanted it grouped by LOB, with
  business-unit as the root node. The LOBs are scattered (Health North America, Health US/Canada,
  Mercer IT, Health & Benefits) and must be merged into "US Consulting." **Delivered:** the tree is
  now rooted at Operating Company (Mercer / Marsh / Oliver Wyman / Guy Carpenter / CIS / MMC) →
  Business Unit → LOB → apps, derived from PlanView's OWN structured fields (`OpCo`,
  `BusinessDeliveryPortfolioName`) which the loader now preserves — NOT a hardcoded taxonomy. (An
  earlier regex-bucketing version was a throwaway spike and was replaced; principle: use the
  source's structured identifiers, no business logic in the repository.)

**Number of users / RUM — CONFIRMED OUT:**

- Anton's decision: Datadog has no such metric, so **discard the number-of-active-users card and
  replace it with a meaningful one** from what Datadog does expose. The devs have full flexibility
  to choose the Overview/Health cards (uptime, incidents-in-last-30-days, etc.); Bernardo (senior)
  decides the key cards; first sliver shows what Datadog gives, fine-tune later.
- (Original context, now moot for Phase 1: would have come from **Pendo** where the app has it, or
  active-session counts — not straightforward from Datadog, no standard cross-app logging for
  logged-in users, and Datadog's user-level APM/RUM tool is unlicensed. Revisit only if/when Pendo
  lands in phase two.)

**Access / provisioning state (for the team to action):**

- Dev region deploys automatically from main/release branches (manual action otherwise); **stage**
  needs Okta prod/non-prod groups that are not yet onboarded to the developer portal.
- Anton granted admin on the repo and unified-pipeline access; Okta prod/non-prod groups (`p`→`np`
  naming) were requested during the call. Confirm GitHub write access (git clone + push to a branch
  → PR).

## Datadog integration shape (from market research — validated pattern)

`GET /api/v1/monitor?monitorTags=service:<id>` → `overall_state` mapping: OK→GREEN, Warn→AMBER,
Alert→RED, No Data→AMBER (product decision); rollup = worst-state-wins. SLO endpoints
(`/api/v1/slo`, `/api/v2/slo/{id}/status`) populate uptime and error-budget. Client:
`@datadog/datadog-api-client` (TypeScript) wrapped in the pre-staged `libs/shared/nestjs-utils`
ResilientHttpService. Service-account app key scoped to `monitors_read`, `slos_read`,
`apm_service_catalog_read`, `dashboards_read`; capture the secret at creation (OTR mode). Same
pattern used by Backstage, Cortex, OpsLevel. If US Health spans multiple Datadog orgs, cross-org API
covers logs/metrics only (not monitors/SLOs) — needs per-org credentials.

**As delivered (differs from the per-app sketch above):** the monitor/SLO endpoints are paged **once
per run for ALL monitors/SLOs** (a bulk snapshot indexed by tag), not queried per app with
`monitorTags=service:<id>`; apps are then matched locally by the `app_short_key`/`app_service_id`
tags. The resolver is `app_short_key` (primary) → `app_service_id` (fallback), since `service:<id>`
is not the bridge here. Implementation lives in
`apps/api/src/datadog/{datadog-snapshot.ts, real-datadog-client.ts (loadSnapshot), datadog-sync.service.ts (local resolve), datadog-client.ts, datadog.types.ts}`.
Write-path hardening shipped: timing-safe token compare on the internal endpoint; a non-array
Datadog body throws (so an outage is never laundered into AMBER); unknown monitor state → AMBER
fail-safe; error-budget guarded for target < 100; 429 backoff honoring `Retry-After`. The health
write uses Mongo `$set` so a crawler write never clobbers name/tier/`statusOverride`; a manual
`statusOverride` always wins; `currentStatus` tracks Datadog health only for MAPPED apps, and the
dashboard read gates `healthStatus` on `datadogMapped` so unmapped apps stay GREY (not a false
AMBER).

## Perception formula — recommended starting template

The creator's model is timing-of-business-scenarios vs. baseline, which is Apdex by another name.
Pragmatic V1: compute **Apdex per key scenario** from Datadog APM (native, configurable target T per
business transaction; bands ≥0.94/0.85 green, 0.70–0.84 amber, <0.70 red) — zero new
instrumentation. Layer in Pendo (NPS, PES, page-load) in phase two where apps have it.

```
Perception = 0.50 × Apdex_norm + 0.30 × NPS_norm + 0.20 × FeatureAdoption_norm   (each 0–100)
Green ≥ 75, Amber 50–74, Red < 50
```

Decision needed: canonical output encoding — the detail-page SVG gauge (continuous 0–100) and the
summary three-band light currently disagree. `/ops/feature-health` per-app contract (referenced in
`detail.seed.ts:860`): adopt IETF `draft-inadarei-api-health-check-06` (`application/health+json`,
pass/warn/fail). Precedents: Catchpoint DEX, Dynatrace UX Score, Gainsight proxy metrics,
composite-SLO burn rate.

## Recommended scoping principle

Keep V1 **informational-only** — no buttons that act on infrastructure. Rationale: the stakeholders
don't yet know precisely what they want, so an action surface (restart a service, etc.) is premature
and risky. The Sev-1 wizard in the prototype should stay a notify/inform shell until requirements
firm up. This is a recommendation, not a team decision — flag for Anton.

## AI observability (phase two+) — two-vendor architecture

No single platform covers both detail tabs. Token cost (AI Tokens): Datadog LLM Observability,
Langfuse self-hosted (HIPAA-friendlier), or Azure APIM `llm-emit-token-metric` if GPT models run via
Azure AI Foundry. Drift (AI Drift): Arize AX or WhyLabs — the seed PSI/JS thresholds already match
industry bands, so no schema rework. Instrument via OTel/OpenInference to stay vendor-neutral; US
Health prompts need BAA/data-residency review before any cloud vendor. Note: Anton verbally flagged
drift as "we don't know how to calculate" — the tab is acknowledged-but-undefined, not hidden.

## Repo-vs-docs contradictions (for whoever updates the docs)

- Perception is "phase 2" in `docs/mvp-implementation-plan.md` but live in code
  (portfolio.model.ts:13-14).
- Datadog listed phase 2 in the plan doc; the meeting makes it the immediate next step; seeds
  already say `monitoringSource: 'Datadog'`. Plan doc is stale.
- AI Tokens/AI Drift undocumented; `PolarisMetadata.json:23` declares `AIintegration: false`.
- Mobile responsiveness deferred to phase 3 in docs but partially built (800px breakpoint, drawer).
- `prototype/demo.html` referenced in docs, absent from repo.
- `.github/copilot-instructions.md` states NX 19.4.1 / TS 5.4.5; actual NX 22.0.2 / TS 5.9.2.

## Risk register

| Risk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Severity                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application-service-ID blank in PlanView / absent from scripts — blocks reliable Datadog mapping                                                                                                                                                                                                                                                                                                                                                                                       | High — **RESOLVED 2026-06-16: automatic `app_short_key`/`app_service_id` bridge.** No service-ID is blank or curated; the resolver joins Datadog tag `app_short_key` (primary, == PlanView CAST key == `shortCode`) → `app_service_id` (fallback, == PlanView ServiceNow key, `SNSVC#######`), both already present on BOTH sides. A 104-namespace × all-id-fields coverage probe proved these are the ONLY reliable per-app bridges. Live: 651/3656 apps mapped, 0 errors. |
| Perception formula undefined — field renders color with no grounding                                                                                                                                                                                                                                                                                                                                                                                                                   | High                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Number-of-active-users has no standard cross-app source; no RUM license                                                                                                                                                                                                                                                                                                                                                                                                                | High                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Komodor API access may require a plan upgrade (gates phase 2)                                                                                                                                                                                                                                                                                                                                                                                                                          | High                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Pendo session counts need SDK v2.282.0+ and a paid Data Sync add-on                                                                                                                                                                                                                                                                                                                                                                                                                    | Medium                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Datadog 2-week log retention + drifting log formats undermine log-based metrics                                                                                                                                                                                                                                                                                                                                                                                                        | Medium                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Stage deployment blocked until Okta prod/non-prod groups are onboarded                                                                                                                                                                                                                                                                                                                                                                                                                 | Medium                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AI vendor BAA/data-residency review needed (US Health)                                                                                                                                                                                                                                                                                                                                                                                                                                 | Medium                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Polaris / MMC deployment dependency (N7):** Raja needs a demoable DEPLOYED link (not localhost) for the Anand meeting. Iader must coordinate with **Bernie** to run the Polaris / MMC unified-pipeline deploy — a `repository_dispatch` "devops-trigger" into the unified pipeline (api/ui images via Helm to AWS) — push the `feature/datadog-live-health` branch, and tag Raja/Prashant in the channel. **Iader has not done a Polaris deployment before → real dependency/risk.** | High                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Beacon mapping coordination (N4):** Beacon DOES have monitors (prior "no monitors" assumption wrong); needs Juan to confirm Beacon's `app_short_key`/mapping before Beacon health is trustworthy in the dashboard.                                                                                                                                                                                                                                                                   | Medium                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| MSSQL config keys with no repository — unknown planned entity                                                                                                                                                                                                                                                                                                                                                                                                                          | Low                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Inferred full roadmap (creator's mental model)

Phase 0 (done): prototype. Phase 1 (Anton out): Datadog health/uptime/error-budget via the crawler;
automatic `app_short_key`/`app_service_id` mapping; BU-root tree reorg; perception-scenario
discovery with business. Phase 2: Komodor, Pendo (usage + perception), perception score live,
WebSocket push, number-of-users standard. Phase 3: RBAC, WCAG 2.1 AA, full mobile. Future: capacity
forecasting, incident trends, public status page, Kafka/OpenSearch, microservice split.

### Datadog enrichment roadmap — "what else to show" (Item I, 2026-06-16 research)

Priority-ordered backlog for getting more real signal out of the bulk snapshot we already ingest
(currently lives only in the untracked repo-root `DATADOG-NEXT-STEPS.md`; recorded here for BMAD):

1. **Health-timeline endpoint + render (FR-3, half-built).** The per-sync `HealthSnapshot` write to
   append-only `health_snapshots` is DONE; the read endpoint + UI render are PENDING — finish these
   first.
2. **Monitor drill-down.** Surface monitor `message` / `groups` / `last_triggered` via
   `group_states=all` on the monitor fetch.
3. **Downtimes API.** Pull scheduled downtimes to suppress false RED during maintenance windows.
4. **Derived maturity SCORECARD.** Compute per-app from has-monitor / has-SLO / SLO-passing / mapped
   / has-owner — a coverage/maturity grade with no new data source.
5. **Incidents API.** Fill the currently-static `incidents` field. CAVEAT: requires the Datadog
   Incident Management product (license dependency).
6. **Service Catalog.** Ownership / on-call / links. CAVEAT: keyed on the `service` tag, which our
   coverage probe showed is NOT a clean per-app join here — probe before promising.

### User-Perception technical path (DISCOVERY only — perception is OUT of Phase-1 build)

Three RUM-free Datadog sources, all feeding ONE baseline engine:

- **APM `trace.*` metrics** — response time per business transaction straight from APM traces.
- **Log-based distribution metric** — a custom metric derived from operation-duration logs.
- **Multistep API Synthetic test** — scripted multi-step API check timing the real user operation.

**Baseline engine (shared by all three sources):** current value vs `calendar_shift(-7d)` ratio,
combined with `anomalies('agile', 2)` for anomaly banding.

**Constraints:** Datadog metrics are retained **15 months**; `/api/v1/query` is rate-limited to
**~1600 req/h/org** — budget queries accordingly. (Note: this 15-month metrics retention is distinct
from the ~2-week LOG retention that limits any log-based signal.)

### Live vs placeholder — per COLUMN, not per app (2026-06-16)

In `toPortfolioApp` (`apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts:385`), columns
split by data provenance:

- **LIVE from Datadog:** Health (gated on `datadogMapped && healthStatus`) and Uptime (`uptime30d`).
- **HARDCODED placeholders:** Perception (`'undefined'`), Active Users (`null`), Incidents (`0`),
  Last Incident (`'Undefined'`).
- **Real, from PlanView (different source):** Total Internal / External Users.

The model already carries `datadogMapped` / `resolutionPath` (`primary|fallback|unmapped`) /
`lastSyncStatus` (`ok|error|unmapped`) / `lastSyncAt` to drive a provenance UI, and the UI already
has a `.metric-muted` grayed-out style. Plan: a legend + gray placeholders + a "live · Datadog ·
synced N min ago" provenance tooltip on Health/Uptime.

**Raja directive (2026-06-16, N3):** confirmed live-vs-dummy at the CARD level — only Health +
Uptime are live; the other ~7 Overview cards are dummy. Directive is to **replace the dummy cards
with real Datadog-sourced data where available**, and drop/replace any we cannot source (e.g., total
external users). Perception explicitly re-confirmed OUT of scope. Immediate task (Anand, via Raja):
focus on ONE good-data app — **IntelliFy** — as the demoable proof for the Anand meeting; pull more
cards if possible but IntelliFy alone is a decent start (~3 apps in Anton's portfolio return data;
IntelliFy and HVCAP confirmed). Nice-to-have (N6): make the uptime window parametrizable (7d / 30d /
1y) — not committed.
