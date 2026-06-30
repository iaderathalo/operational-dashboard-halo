# Phase-1 Backlog — Operational Dashboard (Live Health)

_Generated: 2026-06-13 | PRD:
`_bmad-output/planning-artifacts/prds/prd-operational-dashboard-halo-2026-06-13/prd.md`_ _Build
lead: Bernardo | Mapping + discovery: Iader_

---

## Sequencing Notes

> **Status update 2026-06-16:** E1, E2, and E3 are **DELIVERED and validated live** on branch
> `feature/datadog-live-health` (commit `fc8f6da`). The pipeline runs end-to-end: **651 apps mapped,
> 0 errors, ~157s, over 3656 apps**. Health + Uptime are live from Datadog for mapped apps
> (confirmed in a demo with Raja on IntelliFy and HVCAP). The notes below are retained for history
> but the original sequencing is superseded — the mapping model changed (automatic dual-tag bridge,
> not seeded service IDs) and the ingestion model changed (one bulk snapshot, not a per-app fetch
> loop). See E2/E3 below and the new epics E5/E6.

**As-built path (delivered):** E1-S1 (data model) → E1-S3 (DatadogClient) → E1-S4 (bulk snapshot
sync) → E1-S5 (internal sync endpoint) was the shortest path to "first app's health live
end-to-end," and it is done. A token-guarded `POST /api/v1/internal/sync/datadog` produces real
health data in the database. Mapping (E2) is **automatic** — no human seeding step was ever needed —
so it did not gate the slice.

**Crawler deployment (E1-S6, E1-S7):** The separate `apps/crawler` K8s CronJob is **BUILT but HELD
OUT** of the commit/branch pending Bernie's validation that a CronJob is the right auto-trigger
approach. The sync itself lives in `apps/api` and is done/validated.

**E3 (BU Tree) is delivered:** the tree is built from PlanView OpCo → BusinessDeliveryPortfolioName
(Business Unit → LOB). The old "LOB-to-BU normalization mapping table" was killed by the PRD; the
loader simply preserves the structured PlanView fields.

**E4 (Perception Discovery) is DISCOVERY-ONLY:** perception is OUT of the Phase-1 build
(re-confirmed by Raja 2026-06-16). The 3-source RUM-free technical path is recorded for the Phase-2
team.

**Live open dependencies (2026-06-16):**

1. **Deployment (highest priority):** Raja needs a demoable **DEPLOYED** link (not localhost) for
   the Anand meeting. Iader must coordinate with Bernie on the Polaris / MMC unified-pipeline deploy
   (a `repository_dispatch` "devops-trigger"; api/ui images via Helm to AWS), push
   `feature/datadog-live-health`, and tag Raja/Prashant. Iader has not run a Polaris deploy before —
   real dependency/risk. See **E6-S1**.
2. **Crawler approach:** Bernie to validate that a K8s CronJob is the right auto-trigger before
   E1-S7 lands.
3. **Beacon mapping:** Beacon monitoring **does exist** — coordinate with Juan for Beacon's
   `app_short_key` / mapping (supersedes the old "Beacon has no monitors" assumption).

**Uptime windows (delivered + nice-to-have):** Uptime is computed from SLO history; the UI shows **2
decimals** (frontend formatting, API returns raw). Making the window parametrizable (7d / 30d / 1y)
is a nice-to-have, **not committed**.

---

## E1 — Live Health Ingestion ("the Crawler")

**Goal:** Stand up the internal sync endpoint (and, pending validation, the auto-trigger CronJob) so
that every mapped application's Health Status, Uptime, and Error Budget are computed from live
Datadog data and served by the dashboard — replacing the last static seed value. **Scale: 3656 apps
in PlanView, 651 mapped to Datadog.**

**Status (2026-06-16): DELIVERED** on branch `feature/datadog-live-health` (commit `fc8f6da`),
excluding `apps/crawler` (E1-S6/E1-S7, held out) and local-dev-only files. Live result: 651 apps
mapped, 0 errors, ~157s, over 3656 apps.

---

### E1-S1 — Extend Application data model with Datadog health fields ✅ DONE (2026-06-16)

**Owner:** Bernardo | **Blocked by:** nothing

**As a** developer (Bernardo), **I can** add the Datadog-specific health fields to the shared
Application interface and the applications collection, **so that** the sync has a defined write
contract and the dashboard has a clear read contract.

**Acceptance Criteria:**

- The `Application` model gains new optional fields driven by the dual-tag bridge and provenance UI:
  `datadogMapped`, `resolutionPath` (`'primary'|'fallback'|'unmapped'`), `healthStatus`,
  `uptime24h`, `uptime7d`, `uptime30d`, `slaTarget`, `errorBudgetRemainingPct`,
  `errorBudgetBurnRate`, `lastSyncAt`, `lastSyncStatus` (`'ok'|'error'|'unmapped'`). **No
  `datadogServiceId`/`datadogNamespace`/`datadogAppName` fields are seeded per app** — the per-app
  identifier is read live from Datadog tags `app_short_key` (primary, == PlanView CAST key == app
  shortCode) and `app_service_id` (fallback, == ServiceNow key, format `SNSVC#######`).
- The existing `ApplicationStatus` type (`'GREEN' | 'AMBER' | 'RED'`) is reused — no new type is
  introduced.
- The existing `findOne` and `findAll` projections in `MongoApplicationRepository` are updated to
  include the new fields.
- A new `updateHealth` method (or equivalent) is added to the `ApplicationRepository` interface and
  its Mongo implementation, performing a `$set`-only update (no replace) on the health fields keyed
  by `_id`.
- A `statusOverride`, when present, **always wins** over synced `healthStatus` — this conditional
  logic lives in `ApplicationsService`, not in the repository.
- Unit tests cover: update writes only health fields; `statusOverride` precedence with and without
  an override.

**FR refs:** FR-2, FR-4, FR-5, FR-6, FR-7

_Note: This is the data-contract foundation; all other ingestion stories depend on it. The model
also carries the provenance fields (`datadogMapped`, `resolutionPath`, `lastSyncStatus`,
`lastSyncAt`) that drive the live-vs-placeholder UI in E5-S7._

---

### E1-S2 — Create health_snapshots collection and repository for Health Timeline ✅ WRITE PATH DONE (2026-06-16)

**Owner:** Bernardo | **Blocked by:** E1-S1

**As a** developer (Bernardo), **I can** write a new append-only `health_snapshots` Mongo collection
and repository, **so that** each sync appends a timestamped Health record per application that the
detail view can render as a timeline.

**Acceptance Criteria:**

- A new append-only `health_snapshots` collection is created on first boot (using the
  `createCollectionIfNotExists` pattern from `MongoApplicationRepository`). **DONE** — a
  HealthSnapshot is written per app every sync.
- A `HealthSnapshot` document stores: `applicationId`, `status` (`'GREEN'|'AMBER'|'RED'`),
  `uptimePct`, `datadogMapped` (boolean), `monitorCount`, `recordedAt` (ISO string), and optionally
  `rawMonitorStatuses` for audit.
- A compound index on `{ applicationId: 1, recordedAt: -1 }` is created.
- `HealthSnapshotRepository.insertSnapshot(doc)` is implemented. **DONE.**
- `HealthSnapshotRepository.findRecentByApplicationId(id, limit)` returns the most recent N
  snapshots for a given application, ordered newest-first.
- Unit tests cover insert and query.

**FR refs:** FR-3, FR-6

_Note: The **write path is DONE** (snapshot appended per app per sync). The **read endpoint + UI
render are PENDING** and are tracked as the first item of the post-Phase-1 enrichment roadmap — see
**E5-S1** (FR-3, half-built)._

---

### E1-S3 — Build the DatadogClient service inside the API (bulk snapshot loader) ✅ DONE (2026-06-16)

**Owner:** Bernardo | **Blocked by:** nothing

**As a** developer (Bernardo), **I can** load a single bulk Datadog snapshot from the API using the
existing `ResilientHttpService`, **so that** the `DatadogSyncService` can resolve every app's health
_locally_ with zero per-app Datadog HTTP.

**Acceptance Criteria:**

- A `DatadogModule` is created inside `apps/api/src/datadog/` registering a `DatadogClientService`
  (real + mock variants with parity).
- `DatadogModule` uses `ResilientHttpModule.registerAsync()` to configure the Datadog base URL,
  `DD-API-KEY` and `DD-APPLICATION-KEY` headers from `ConfigService`, and retry on 429/500/502/503
  with backoff.
- `DatadogClientService` exposes a single **`loadSnapshot()`** that returns a `DatadogSnapshot`: it
  **paginates ALL monitors and ALL relevant SLOs once**, then resolves per-kept-SLO history under
  **bounded concurrency (6)** with **429 backoff honoring `Retry-After` / `x-ratelimit-reset`**.
  There is **no** `getMonitorsByServiceTag` / `getMonitorsByNamespaceApp` per-app method — that
  per-app fetch model was removed because it tripped Datadog 429 rate limits.
- `DATADOG_API_KEY` and `DATADOG_APP_KEY` are read from `ConfigService` — never hardcoded.
- Unit tests mock `ResilientHttpService` and verify: pagination over all pages, bounded concurrency,
  429 backoff.

**FR refs:** FR-1, FR-2, FR-4, FR-5, FR-6

_Note: The mock `loadSnapshot` keeps parity with the real one for local dev. `DATADOG_API_KEY` and
`DATADOG_APP_KEY` are added to the API pod's Vault `secretEnv` at deploy time (E6-S1)._

---

### E1-S4 — Implement DatadogSyncService — local resolve, rollup, uptime, and error-budget computation ✅ DONE (2026-06-16)

**Owner:** Bernardo | **Blocked by:** E1-S1, E1-S2, E1-S3

**As a** developer (Bernardo), **I can** invoke `DatadogSyncService.syncAll()` which takes **one
bulk `DatadogSnapshot`** and resolves Health Status, Uptime, and Error Budget for every application
**purely locally** (zero Datadog HTTP inside the per-app loop), **so that** the results are ready to
be persisted without tripping rate limits.

**Acceptance Criteria:**

- `syncAll()` calls `DatadogClientService.loadSnapshot()` **once**, then for each Application
  resolves its monitors/SLOs from the in-memory snapshot by matching the **`app_short_key`** tag
  (primary, == CAST key == shortCode); when that is absent it falls back to **`app_service_id`** (==
  ServiceNow key, `SNSVC#######`). `resolutionPath` is recorded as `'primary'`, `'fallback'`, or
  `'unmapped'`. (A coverage probe proved these are the ONLY reliable per-app bridges;
  `service`/`business_unit`/`team`/`servicenow_chg` are NOT per-app bridges.)
- Health rollup is worst-state-wins on monitor `overall_state`: `Alert→RED`, `Warn/No Data→AMBER`,
  `OK→GREEN` (rule documented in code citing FR-2). Uptime + error budget come from SLO history.
- An application matching **no monitors** is `unmapped` → `healthStatus='AMBER'`,
  `datadogMapped=false`, `lastSyncStatus='unmapped'` — **never a false GREEN**.
- Uptime is computed for the supported windows from SLO history; a window not covered by available
  history is omitted (null / "not available"), **not fabricated**.
- `errorBudgetRemainingPct` is set to `null` (not `0`) when no SLO exists for the application; the
  dashboard must show "Not available" for a null value (not blank).
- A partial failure for one app completes for all remaining apps; the failed app's
  `lastSyncStatus='error'`, others `'ok'` or `'unmapped'`. **Live result: 651 mapped, 0 errors,
  ~157s, over 3656 apps.**
- The sync is idempotent for the health fields; `health_snapshots` is append-only by design (one
  record per app per run).
- Unit tests cover: primary-key match, fallback-key match, unmapped (no match), all-OK rollup, mixed
  Warn+OK, any-Alert, all-No-Data, uptime with missing history, error-budget with no SLO.

**FR refs:** FR-2, FR-4, FR-5

_Note: A `statusOverride` always wins over the synced health. The `No Data → AMBER` rule is the
canonical product decision — documented in code._

---

### E1-S5 — Add internal sync endpoint POST /api/v1/internal/sync/datadog ✅ DONE (2026-06-16)

**Owner:** Bernardo | **Blocked by:** E1-S4

**As a** developer (Bernardo), **I can** expose a guarded internal HTTP endpoint that triggers
`DatadogSyncService.syncAll()`, **so that** an auto-trigger can call it once per scheduled tick
without needing Datadog credentials or an Okta JWT.

**Acceptance Criteria:**

- `POST /api/v1/internal/sync/datadog` is registered on the existing API, protected by a
  shared-secret guard (not `OktaGuard`) that validates an `Authorization` header against
  `INTERNAL_SYNC_TOKEN` from `ConfigService`.
- A valid-token request triggers `DatadogSyncService.syncAll()` and returns `200` with:
  `{ appsAttempted, appsSucceeded, appsFailed, durationMs }`.
- A missing or wrong token returns `401`; the endpoint is unreachable without the shared secret.
- The endpoint is excluded from Swagger public docs or marked as internal-only.
- `INTERNAL_SYNC_TOKEN` is never committed to code; it is read from environment/config.

**FR refs:** FR-1, FR-6, FR-7

_Note: Once this story is done, a local curl call can trigger a real end-to-end sync — this is the
team's first verifiable milestone._

---

### E1-S6 — Build the Crawler NestJS app (bootstrap-and-exit pattern) ⏸ BUILT, HELD OUT (2026-06-16)

**Owner:** Bernardo | **Blocked by:** E1-S5 (done) | **Held out** of the commit/branch pending
Bernie's validation that a CronJob is the right auto-trigger

**As a** developer (Bernardo), **I can** create a minimal `apps/crawler` NestJS application that
calls the internal sync endpoint and exits, **so that** it can be packaged as a CronJob image.

**Acceptance Criteria:**

- `apps/crawler/src/main.ts` bootstraps the NestJS app, calls `DatadogTriggerService.trigger()`,
  logs the response summary, then calls `process.exit(0)` on success or `process.exit(1)` on
  failure.
- `DatadogTriggerService` uses `ResilientHttpService` to POST to
  `INTERNAL_API_BASE_URL + /api/v1/internal/sync/datadog` with `INTERNAL_SYNC_TOKEN` in the
  `Authorization` header.
- A 120-second timeout is set on the HTTP call.
- The Crawler app has its own `project.json` in the NX monorepo with a `build` target.
- A non-2xx or network error logs the error and exits with code 1.
- Unit tests cover: successful trigger exits 0; HTTP 401 exits 1; network error exits 1.

**FR refs:** FR-1

_Note: The Crawler is intentionally thin — it does not know about Datadog or Mongo. Shared libs:
`libs/shared/nestjs-utils` (ResilientHttpService), `libs/shared/config`. The app is **built but
excluded from `feature/datadog-live-health`** (along with local-dev-only files) until Bernie
confirms the CronJob approach._

---

### E1-S7 — Wire Crawler as a Kubernetes CronJob via Helm (dev region) ⏸ BUILT, HELD OUT (2026-06-16)

**Owner:** Bernardo | **Blocked by:** E1-S6 | **Held out** pending Bernie's validation of the
CronJob approach (mapping is automatic, so no "mapped app" prerequisite remains)

**As a** developer (Bernardo), **I can** deploy the Crawler as a K8s CronJob in the dev region, **so
that** it fires on schedule, calls the internal sync endpoint, and Health data in the database
updates automatically.

**Acceptance Criteria:**

- `deployments/helm/aws-crawler.yml` is created, modelled on `aws-db-execution.yml`, with
  `workloadKind: CronJob`, `concurrencyPolicy: Forbid`, `successfulJobsHistoryLimit: 3`,
  `failedJobsHistoryLimit: 5`, `restartPolicy: OnFailure`.
- The schedule is driven by `CRAWLER_CRON_SCHEDULE` variable (default `*/5 * * * *`).
- `INTERNAL_API_BASE_URL` is set to the K8s service DNS name of the API pod (no ingress traversal).
- `INTERNAL_SYNC_TOKEN` is injected via Vault `secretEnv`.
- `DATADOG_API_KEY` and `DATADOG_APP_KEY` are added to the API pod's Vault `secretEnv` in
  `aws-api.yml`.
- After deploy in dev, at least one successful CronJob run is observed in K8s logs with a 200
  response from the sync endpoint.
- With the CronJob stopped, the dashboard still returns the last persisted health data — degrades to
  stale, not broken.

**FR refs:** FR-1, FR-6, FR-7

_Note: The auto-trigger CronJob is **held out** pending Bernie's go-ahead. Separately, a **demoable
deployed link** (not localhost) is needed for the Anand meeting via the Polaris / MMC unified
pipeline — tracked as **E6-S1**. `INTERNAL_SYNC_TOKEN` should be a strong random secret in Vault;
`DATADOG_API_KEY` / `DATADOG_APP_KEY` go in the API pod's `secretEnv`._

---

### E1-S8 — Wire dashboard UI to read Health from the database (replace seed reads) ✅ DONE (2026-06-16)

**Owner:** Bernardo | **Blocked by:** E1-S4, E1-S5

**As a** TPM / stakeholder (Tara), **I can** see Health Status, last-sync timestamp, Uptime, and
Error Budget on the dashboard populated from live database values, **so that** I am confident the
data reflects what Datadog reported at the last sync.

**Acceptance Criteria:**

- The portfolio detail + table API responses surface: `healthStatus`, `datadogMapped`,
  `resolutionPath`, `uptime24h`, `uptime7d`, `uptime30d`, `slaTarget`, `errorBudgetRemainingPct`,
  `errorBudgetBurnRate`, `lastSyncAt`, `lastSyncStatus`. **DONE** — Health and Uptime render LIVE
  from Datadog for mapped apps (confirmed in the Raja demo on IntelliFy and HVCAP).
- **Uptime is formatted to 2 decimals in the UI** for both the portfolio table and the detail page;
  the API returns the raw value.
- The detail view shows "Not available" (not blank or zero) for `errorBudgetRemainingPct` when the
  value is null.
- The last-sync timestamp (`lastSyncAt`) is visible, supporting the "data is live" confidence in
  UJ-1.
- An application with `datadogMapped=false` renders an "unmapped" badge rather than a confident
  GREEN or RED.
- With sync paused, the API returns the last persisted values — no error, no empty response.
- _(Timeline render is OUT of this story — the `health_snapshots` read endpoint + bar render is
  PENDING in **E5-S1**.)_

**FR refs:** FR-3, FR-4, FR-5, FR-6, FR-7

_Note: The `applications` ↔ portfolio join is resolved; live-vs-placeholder is now per-COLUMN, not
per-app — see **E5-S7** for graying out the placeholder Overview cards and adding a Datadog
provenance tooltip on Health/Uptime._

---

## E2 — Application-to-Datadog Mapping (automatic dual-tag bridge) ✅ DELIVERED (2026-06-16)

**Goal:** Map every in-scope application to live telemetry **automatically** via a two-tag bridge
read from Datadog — no human seeding, no namespace fallback, no per-app curation. Each app resolves
on the Datadog tag **`app_short_key`** (primary, == PlanView CAST key == app `shortCode`) and, when
that is absent, on **`app_service_id`** (fallback, == PlanView ServiceNow key, format
`SNSVC#######`). An exhaustive coverage probe proved these are the **only** reliable per-app bridges
(`service`/`business_unit`/`team`/`servicenow_chg` are NOT per-app bridges). Apps matching no
monitors are an honest `unmapped` → AMBER (never a false GREEN), so SM-2 (mapping coverage) is
tracked. **Live result: 651 of 3656 apps mapped, 0 errors.**

> **Model change (supersedes the original E2):** the previous plan assumed an operator would seed
> `datadogServiceId` per app (because the mapping was thought to be "blank in PlanView") with a
> `namespace + appName` (kube_namespace / kube_app_name) fallback. That whole model is **dead**. The
> keys already exist in PlanView (CAST key, ServiceNow key); the sync reads Datadog tags directly
> and joins locally. There is no seed migration and no namespace fallback.

---

### E2-S1 — Automatic dual-tag bridge resolution (app_short_key primary, app_service_id fallback) ✅ DONE (2026-06-16)

**Owner:** Bernardo (impl) / Iader | **Blocked by:** E1-S4

**As a** dashboard, **I can** resolve each application to its Datadog monitors/SLOs automatically
from the two bridge tags, **so that** mapped apps get live Health with zero manual curation.

**Acceptance Criteria:**

- The sync joins each PlanView app to Datadog by the **`app_short_key`** tag (== CAST key ==
  `shortCode`); when no monitor carries that key, it falls back to **`app_service_id`** (==
  ServiceNow key, `SNSVC#######`).
- `resolutionPath` is recorded per app as `'primary'`, `'fallback'`, or `'unmapped'`;
  `datadogMapped` and `lastSyncStatus` follow.
- No seed/migration sets a per-app Datadog id; the bridge is read live from tags every sync.
- Coverage probe documented: only `app_short_key` / `app_service_id` are reliable per-app bridges;
  `service` / `business_unit` / `team` / `servicenow_chg` are not.
- Unit tests cover: primary-key match, fallback-key match, and unmapped (no match).

**FR refs:** FR-8, FR-9

_Note: The ServiceNow key is often null in practice (hence `app_service_id` is the **fallback**, not
the primary). Re-confirmed live in the Raja demo 2026-06-16._

---

### E2-S2 — One bulk snapshot + local per-app resolution (no per-app fetch) ✅ DONE (2026-06-16)

**Owner:** Bernardo | **Blocked by:** E1-S3, E2-S1

**As a** developer (Bernardo), **I can** ingest the whole Datadog picture in one bulk snapshot and
resolve every app locally, **so that** the sync scales to thousands of apps without tripping Datadog
rate limits.

**Acceptance Criteria:**

- Each sync paginates **ALL monitors and ALL relevant SLOs once**, then resolves per-kept-SLO
  history under **bounded concurrency (6)** with **429 backoff** (`Retry-After` /
  `x-ratelimit-reset`).
- The per-app loop performs **zero Datadog HTTP** — resolution is purely local against the in-memory
  snapshot.
- This replaced the earlier per-app fetch model (~1 monitor + 1 SLO + 3 history calls per app) that
  tripped Datadog 429s.
- Live validation: **651 apps mapped, 0 errors, ~157s, over 3656 apps.**
- Unit tests cover pagination over all pages, bounded concurrency, and 429 backoff.

**FR refs:** FR-1, FR-9

_Note: Rate-limit risk is **RESOLVED 2026-06-16** by the bulk-snapshot design — the old "risk: Low
at MVP scale" framing assumed the per-app loop and is no longer accurate._

---

### E2-S3 — Surface unmapped applications in portfolio and detail views ✅ DONE (2026-06-16)

**Owner:** Bernardo | **Blocked by:** E1-S8, E2-S1

**As an** operator (Iader), **I can** see which applications are unmapped at a glance, **so that**
SM-2 coverage is honest and no app fabricates a green status.

**Acceptance Criteria:**

- An application matching no monitors (`datadogMapped=false`) renders in a distinct visual state
  (grey / "Unmapped" badge) — **never green**.
- The detail view for an unmapped app shows a clear message ("No Datadog mapping — health data
  unavailable") rather than zero uptime or empty error budget.
- A count of unmapped applications is enumerable via API for coverage tracking.
- A previously-mapped app that stops matching monitors reverts to `unmapped` on the next sync — it
  does not keep the last known GREEN.

**FR refs:** FR-10

_Note: "Unmapped" is visually distinct from AMBER; it reuses the same `.metric-muted` grayed-out
treatment that drives the placeholder cards in E5-S7._

---

## E3 — Business-Unit Portfolio Tree (from PlanView structured fields) ✅ DELIVERED (2026-06-16)

**Goal:** Build the Real-Mode portfolio tree from PlanView's own structured org fields — **OpCo →
BusinessDeliveryPortfolioName** (Business Unit → Line of Business) — replacing the old owner/person
grouping, so the hierarchy matches how the organization is run.

> **Model change (supersedes the original E3):** the original plan assumed PlanView gave only flat
> person-name nodes plus a free-text LOB that had to be normalized to "US Consulting" via a curated
> **LOB-to-BU mapping table**. The PRD **killed that mapping-table idea**. PlanView already carries
> the structured `OpCo` and `BusinessDeliveryPortfolioName` fields; the loader **preserves them**
> and the tree is built directly. There is no normalization map and no "Unmapped BU" reconciliation
> step. **(Story E3-S1 "LOB-to-BU normalization mapping table" is DELETED.)**

---

### E3-S2 — Build BU-rooted portfolio tree from OpCo → BusinessDeliveryPortfolioName ✅ DONE (2026-06-16)

**Owner:** Bernardo | **Blocked by:** E1-S1

**As a** TPM / stakeholder (Tara), **I can** see the portfolio tree rooted on Business Unit (OpCo)
with Line of Business beneath it in Real Mode, **so that** the hierarchy matches the org structure
rather than individual person names.

**Acceptance Criteria:**

- The PlanView loader **preserves `OpCo` and `BusinessDeliveryPortfolioName`** on each app.
- In Real Mode, the tree is built **OpCo (Business Unit) → BusinessDeliveryPortfolioName (Line of
  Business) → app**, replacing the prior owner/person grouping — no person-name root nodes.
- No LOB-to-BU normalization map exists; grouping reads the structured fields directly.
- Demo Mode tree is unchanged (target-shape reference).
- IT-owner impersonation still works; an unknown IT-owner context returns an empty list without
  error.

**FR refs:** FR-11, FR-12, FR-13

_Note: The grouping is a transformation over the data returned by `MongoPortfolioRepository`; the
PlanView export already includes `OpCo` and `BusinessDeliveryPortfolioName`, so no re-export is
needed._

---

## E4 — User Perception Scenario Discovery _(DISCOVERY-ONLY — documentation, no Phase-1 build)_

**Goal:** Produce a written catalog of candidate User Perception scenarios for IntelliFy and Beacon
to feed Phase-2 planning. **Perception is explicitly OUT of the Phase-1 build (re-confirmed by Raja
2026-06-16)** — no score, gauge, or UI is built; this epic is documentation only.

> **Beacon update (2026-06-16):** Beacon monitoring **DOES exist** (supersedes the earlier "Beacon
> has no monitors / must create monitors" assumption). Coordinate with **Juan** for Beacon's
> `app_short_key` / mapping so Beacon resolves through the same automatic dual-tag bridge (E2).

---

### E4-S1 — Conduct scenario discovery sessions with Raja

**Owner:** Iader | **Blocked by:** nothing

**As a** discovery lead (Iader), **I can** run structured sessions with Raja (business contact) to
elicit the business operations that matter most for IntelliFy and Beacon, **so that** the perception
catalog is grounded in actual business workflows rather than technical assumptions.

**Acceptance Criteria:**

- At least one session with Raja is completed covering IntelliFy and Beacon.
- Each session produces a list of candidate business operations with Raja's understanding of what
  "slow" means in each case.
- The data-source question (Datadog APM `trace.*` / log-based distribution metric / API Synthetic
  vs. Pendo) is explicitly raised and Raja's input is recorded for each operation.
- For Beacon specifically, coordinate with **Juan** (Beacon monitoring owner) on Beacon's
  `app_short_key` / mapping so any perception work can later attach to live telemetry.
- Session notes are stored in the project documentation folder.

**FR refs:** FR-14

_Note: No code changes. Known candidates from Anton's examples are starting points: census-file
upload time, report generation (~8s baseline), Beacon save-session (~1 min threshold), dashboard
load time. Beacon monitoring exists — Juan owns it._

---

### E4-S2 — Author the Perception Scenario Catalog document

**Owner:** Iader | **Blocked by:** E4-S1

**As a** discovery lead (Iader), **I can** produce a written catalog entry for each confirmed
perception scenario, **so that** the Phase 2 team has a ready-made input to begin building the
perception signal without re-doing discovery.

**Acceptance Criteria:**

- The catalog covers IntelliFy and Beacon, with at least the four known candidate scenarios:
  census-file upload time, report-generation time, Beacon save-session time, dashboard load time.
- Each entry specifies: operation name, target application, description of the business event being
  timed, Anton's example baseline and "slow" threshold (or Raja's correction), candidate data
  source, open questions flagged.
- **The 3-source RUM-free technical path is documented** (perception remains DISCOVERY; this is the
  candidate Phase-2 mechanism, not a Phase-1 commitment):
  1. **APM `trace.*` metrics** (operation timing on existing traces),
  2. a **log-based distribution metric** (derive a latency distribution from logs), and
  3. a **multistep API Synthetic test** (scripted business operation). All three feed **ONE baseline
     engine**: current value vs. `calendar_shift(-7d)` ratio, with `anomalies('agile', 2)`.
- **Constraints recorded:** Datadog metrics are retained **15 months**; `/api/v1/query` is limited
  to **~1600 req/h/org** — the engine must stay within these.
- A recommendation on the canonical perception encoding (continuous 0–100 gauge vs. three-band
  light) is included, noting the detail page currently renders both and they disagree.
- The catalog is stored in the project's planning artifacts folder and linked from the PRD.

**FR refs:** FR-14

_Note: No perception computation, score, or UI is built in Phase 1 (re-confirmed OUT by Raja
2026-06-16). The encoding recommendation should reference `detail.seed.ts` so Phase 2 knows which
component to update._

---

## E5 — Post-Phase-1 Datadog Enrichment Roadmap ("what else to show") _(Item I — backlog)_

**Goal:** With Health + Uptime live, progressively replace the remaining placeholder/static
dashboard data with Datadog-sourced data and add depth. **Priority order is the story order below.**
This roadmap was researched 2026-06-16 and previously lived only in the untracked repo-root file
`DATADOG-NEXT-STEPS.md`; it is recorded here so it is tracked in BMAD. **None of these are committed
Phase-1 scope** — they are the prioritized next-up backlog.

> **Reconciliation 2026-06-18:** S1 (timeline), S2 (drill-down), S3 (downtimes) are **DELIVERED**
> (see commit refs on each). The still-open enrichment work — **S4 maturity scorecard, S5 incidents,
> S6 service catalog**, plus the newly-captured **24h/7d/30d range-button wiring** and the
> **perception build** — has been **migrated to the Phase-2 backlog**
> (`_bmad-output/planning-artifacts/epics-stories/phase-2-datadog-enrichment-backlog-2026-06-18.md`,
> epics **E7–E9**). The original `DATADOG-NEXT-STEPS.md` was archived to
> `_bmad-output/planning-artifacts/research/datadog-enrichment-research-2026-06-16.md` and removed
> from the repo root. S4/S5/S6 below are retained for history; the Phase-2 file is now their live
> home.

---

### E5-S1 — Health-timeline read endpoint + UI render (FR-3) ✅ DONE (2026-06-17, commit `1421ef1`)

**Owner:** Bernardo | **Blocked by:** E1-S2 (write path done)

**As a** stakeholder, **I can** see a per-app health timeline on the detail page, **so that** I can
see how an app's health trended over recent syncs.

**Acceptance Criteria:**

- A read endpoint returns the most recent N `health_snapshots` for an application (newest-first).
- The detail page renders the timeline bars from that endpoint instead of the hardcoded
  `detail.seed.ts` array.
- An app with no snapshots renders an empty/"no history yet" state, not an error.

**FR refs:** FR-3

_Note: ✅ Delivered 2026-06-17 (commit `1421ef1`). Endpoint
`GET /dashboard/portfolio/apps/{id}/health-history` (scope-guard + `?limit=`, default 500 / max
2000); the detail-page HEALTH row renders from snapshots, bucketed per run, with a "live Datadog"
note and an honest empty state. **Pending follow-up:** the 24h/7d/30d range buttons are not wired to
this row — tracked as Phase-2 **E7-S1**._

---

### E5-S2 — Monitor drill-down (message / groups / last_triggered) ✅ DONE (2026-06-17, commit `8b81cef`)

**Owner:** Bernardo | **Blocked by:** E1-S4

**As a** stakeholder, **I can** drill into the monitors behind an app's health, **so that** I can
see _why_ it is RED/AMBER.

**Acceptance Criteria:**

- The snapshot/monitor fetch includes `group_states=all` so per-group state, monitor `message`, and
  `last_triggered` are available.
- The detail view lists the contributing monitors with their state, message, and last-triggered
  time.

**FR refs:** FR-2 (extension)

_Note: ✅ Delivered 2026-06-17 (commit `8b81cef`). "Datadog Monitors" card in the Health tab: per
monitor → state + name + cleaned `message` + last-triggered. `buildMonitorBreakdown` (worst-first,
cap 50) persists `Application.monitors` from data the fetch already brings — zero new Datadog call.
Validated live._

---

### E5-S3 — Downtimes API to suppress false RED ✅ DONE (2026-06-17, commit `8b81cef`)

**Owner:** Bernardo | **Blocked by:** E1-S4

**As a** stakeholder, **I can** have scheduled maintenance windows excluded from health, **so that**
a planned downtime does not show as a false RED.

**Acceptance Criteria:**

- The sync reads the Datadog **Downtimes API** and suppresses/annotates health for apps whose
  monitors are in an active downtime.
- A suppressed app is visually distinguished from a true RED (e.g. "in maintenance").

**FR refs:** FR-2 (extension)

_Note: ✅ Delivered 2026-06-17 (commit `8b81cef`). `with_downtimes=true` on the monitors call →
`matching_downtimes` suppresses a monitor's Alert inside `rollupStatus` during a maintenance window
(no false RED); a "Maintenance" badge appears in the drill-down. (The v2 Downtimes endpoint returns
403 for this key — pivoted to the monitors-call flag instead.) Suppression with real data appears
after a re-sync with this code._

---

### E5-S4 — Derived maturity scorecard → ➡️ MIGRATED to Phase-2 **E7-S2**

**Owner:** Bernardo | **Blocked by:** E1-S4

**As a** stakeholder, **I can** see a per-app observability **maturity scorecard**, **so that** I
can see which apps are well-instrumented.

**Acceptance Criteria:**

- A derived score is computed from: has-monitor, has-SLO, SLO-passing, mapped, has-owner.
- The score (and its component signals) is surfaced per app in the dashboard.

**FR refs:** new (derived metric)

---

### E5-S5 — Incidents API to fill the static incidents field _(CAVEAT)_ → ➡️ MIGRATED to Phase-2 **E8-S2** (spike **E8-S1**)

**Owner:** Bernardo | **Blocked by:** E1-S4

**As a** stakeholder, **I can** see real recent incidents on an app, **so that** the
currently-static `incidents` / "last incident" fields reflect reality.

**Acceptance Criteria:**

- The sync reads the Datadog **Incidents API** and populates the existing incidents field per app.
- The "Last Incident" placeholder is replaced with the real most-recent incident.

**FR refs:** replaces static incidents placeholder

> **CAVEAT:** the Incidents API **requires the Datadog Incident Management product** — confirm
> entitlement before committing.

---

### E5-S6 — Service Catalog for ownership / on-call / links _(CAVEAT)_ → ➡️ MIGRATED to Phase-2 **E8-S4** (spike **E8-S3**)

**Owner:** Bernardo | **Blocked by:** E1-S4

**As a** stakeholder, **I can** see ownership, on-call, and useful links per app, **so that** I know
who to contact.

**Acceptance Criteria:**

- The sync reads the Datadog **Service Catalog** for ownership / on-call / links and surfaces them
  per app.

**FR refs:** new (enrichment)

> **CAVEAT:** the Service Catalog is **keyed on the `service` tag**, which our coverage probe showed
> is **NOT a clean per-app join** in this estate — **probe the join before promising this**.

---

### E5-S7 — Replace dummy Overview cards with Datadog-sourced data; live-vs-placeholder provenance UI

**Owner:** Bernardo / Iader | **Blocked by:** E1-S8

**As a** stakeholder, **I can** tell which Overview cards are live vs. placeholder, and have dummy
cards replaced with real Datadog data where available, **so that** the demo is honest and as
data-rich as possible (directive from Raja, 2026-06-16).

**Background — live vs. placeholder is per-COLUMN, not per-app** (in `toPortfolioApp`,
`apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts:385`):

- **LIVE from Datadog:** Health (`datadogMapped && healthStatus`), Uptime (`uptime30d`).
- **HARDCODED placeholders:** Perception (`'undefined'`), Active Users (`null`), Incidents (`0`),
  Last Incident (`'Undefined'`).
- **Real, different source (PlanView):** Total Internal / External Users.

**Acceptance Criteria:**

- Each dummy Overview card is either **replaced with real Datadog-sourced data** where a source
  exists (e.g. Incidents → E5-S5; maturity → E5-S4) or **dropped/replaced** when it cannot be
  sourced (e.g. total external users).
- **Perception stays OUT** (re-confirmed by Raja) — it is not wired to live data in this story.
- Placeholder cards are visibly **grayed out** using the existing `.metric-muted` style, with a
  **legend** distinguishing live vs. placeholder.
- Health and Uptime get a provenance tooltip: **"live · Datadog · synced N min ago"**, driven by
  `datadogMapped` / `resolutionPath` / `lastSyncAt` / `lastSyncStatus`.
- **Demo focus (from Anand via Raja):** prioritize making **IntelliFy** a complete, demoable proof;
  pull more cards if possible, but IntelliFy alone is a decent start.

**FR refs:** FR-4, FR-5, FR-6, FR-7 (provenance)

_Note: ~3 apps in Anton's portfolio return data (IntelliFy, HVCAP confirmed). Beacon can be added
once Juan supplies its `app_short_key` (E4 note)._

---

## E6 — Deployment: demoable hosted link _(dependency)_

**Goal:** Give Raja a **deployed, non-localhost** dashboard link for the Anand meeting.

---

### E6-S1 — Deploy `feature/datadog-live-health` via the Polaris / MMC unified pipeline

**Owner:** Iader (coordinating with **Bernie**) | **Blocked by:** E1 (done); Bernie's deployment
know-how

**As a** business contact (Raja), **I can** open a hosted dashboard URL (not localhost), **so that**
I can demo live Health + Uptime to Anand.

**Acceptance Criteria:**

- `feature/datadog-live-health` is pushed and deployed through the **MMC unified pipeline**: a
  `repository_dispatch` **"devops-trigger"** builds the `api` and `ui` images and deploys them via
  **Helm to AWS**.
- A working hosted URL is shared in the channel and **Raja / Prashant are tagged**.
- Health + Uptime render live on the hosted environment for at least IntelliFy.

**FR refs:** deployment dependency (UJ-1 confidence)

> **Dependency / risk:** Iader has **not run a Polaris deployment before** — Bernie owns the
> deployment know-how and must be looped in. This is the **highest-priority live dependency** for
> the Anand demo (Raja sync N7).
