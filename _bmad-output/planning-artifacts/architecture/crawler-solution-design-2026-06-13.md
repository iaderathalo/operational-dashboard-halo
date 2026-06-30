I now have all the context I need. Let me produce the solution design.

# Solution Design: The Datadog Crawler — Phase-1 Health Status Integration

**Project:** Portfolio Visibility Dashboard (`operdas1`) **Scope:** Net-new component only — the
Crawler and its Datadog integration. Everything else (portfolio tree, perception, incidents,
Komodor) is out of scope. **Status:** Ready for implementation **Grounded in:** Repo snapshot at
`ebb6317`, meeting transcript context (from memory), Phase-1 MVP plan at
`docs/mvp-implementation-plan.md`

---

## 0. Framing: What Already Exists vs What Is Net-New

The repo currently has one commit. The relevant existing building blocks are:

| Existing artifact                                        | File path                                                                      | Relevance to Crawler                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `MongoRepository` base class                             | `apps/api/src/repository/mongo/mongo-repository.ts`                            | Crawler uses the same Vault+Atlas connection pattern                                         |
| `ResilientHttpService`                                   | `libs/shared/nestjs-utils/src/resilient-http/nestjs/resilient-http.service.ts` | Wraps Axios with configurable retry + correlation-ID propagation — the Crawler's HTTP client |
| `ResilientHttpModule`                                    | `libs/shared/nestjs-utils/src/resilient-http/nestjs/resilient-http.module.ts`  | `.registerAsync()` factory provides the module to the Crawler NestJS app                     |
| `Application` interface                                  | `libs/shared/api/src/model/dashboard/Application.ts`                           | Defines the `applications` collection shape — needs new fields                               |
| `MongoApplicationRepository`                             | `apps/api/src/applications/mongo/mongo-application.repository.ts`              | Collection name `applications`; Crawler writes to the same collection                        |
| `PortfolioApp` interface                                 | `apps/api/src/dashboard/portfolio.model.ts`                                    | The `health` field on a portfolio app that the dashboard reads                               |
| `dashboardPortfolio` + `dashboardAppDetails` collections | `apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`                   | Read path for the dashboard; decoupled from `applications`                                   |
| Helm value files                                         | `deployments/helm/aws-api.yml`, `aws-db-execution.yml`                         | Template for the new `aws-crawler.yml`                                                       |
| Vault / Kubernetes service account                       | `apps/api/src/repository/mongo/mongo-repository.ts` (lines 270–315)            | Credential rotation pattern reused by Crawler                                                |

**Net-new artifacts to create:**

- `apps/crawler/` — standalone NestJS application (the Crawler)
- `deployments/helm/aws-crawler.yml` — Helm CronJob values
- New fields on the `Application` Mongo document
- A new append-only `health_snapshots` collection (Health Timeline, FR-3)
- A new internal API endpoint `POST /api/v1/internal/sync/datadog` on the existing API that the
  Crawler calls

---

## 1. The Crawler as a Kubernetes CronJob

### 1.1 Why Not an In-App Cron

The API (`apps/api`) runs at `replicaCount: ${OSS2_REPLICA_COUNT}`, which is typically 2 or more
replicas in production (see `deployments/helm/aws-api.yml` line 70). An in-app `@Cron()` from
`@nestjs/schedule` would fire simultaneously on every replica, causing N parallel Datadog API calls
and N concurrent upsert writes to Mongo for the same applications. This creates rate-limit pressure
on the Datadog API and introduces a race condition on MongoDB upserts with no winner-takes-all
guarantee.

The decision recorded in the meeting transcript ("ingestion = K8s CronJob calling an API endpoint,
the Qualtrics pattern, NOT in-app cron") resolves this cleanly: a CronJob pod runs exactly one
replica, calls the API once, exits. Kubernetes guarantees at most one concurrent execution when
`concurrencyPolicy: Forbid` is set.

### 1.2 Execution Model

```
K8s CronJob (1 pod, 1 replica)
  └─ apps/crawler (NestJS, bootstrap-and-exit pattern)
       └─ calls POST /api/v1/internal/sync/datadog  (the API)
            └─ DatadogSyncService (inside the API)
                 ├─ ONE bulk snapshot: paginate ALL monitors + ALL relevant SLOs once
                 ├─ resolve per-kept-SLO history under bounded concurrency (6) with 429 backoff
                 ├─ index everything by tag (app_short_key / app_service_id)
                 ├─ per-app resolution is PURELY LOCAL (zero Datadog HTTP in the per-app loop)
                 └─ upserts health fields to MongoDB
```

> **Status note (validated live, 2026-06-16):** this bulk-snapshot pipeline runs end-to-end at
> production scale — **651 apps mapped, 0 errors, ~157s, over 3656 apps**. The dual-tag bridge,
> worst-state-wins rollup, and per-app upsert are all built and validated. Health + Uptime are live
> from Datadog for mapped apps (confirmed on IntelliFy and HVCAP).

The Crawler is intentionally thin. Its job is to trigger the sync and report success/failure. All
business logic (rollup, mapping, write) lives inside the API where it can share the MongoRepository
infrastructure, ConfigService, and Vault credential rotation already present in
`apps/api/src/repository/mongo/mongo-repository.ts`.

### 1.3 Replica Safety

`concurrencyPolicy: Forbid` on the CronJob prevents overlapping runs. If a previous pod is still
running when the next trigger fires, the new pod is skipped, not queued. The internal endpoint is
idempotent (upserts keyed on application `_id`), so a retry after a partial failure is safe.

### 1.4 Schedule

Default: every 5 minutes (`*/5 * * * *`). Configurable via the Helm values variable
`CRAWLER_CRON_SCHEDULE`. This is deliberately conservative — each run performs one bulk snapshot
(paginate all monitors + all relevant SLOs once, then bounded-concurrency SLO-history resolution at
concurrency 6 with 429 backoff), so the request volume per run is a function of page count +
kept-SLO count, not of app count.

> **Held-out note (2026-06-16):** the `apps/crawler` K8s CronJob (auto-trigger) is **BUILT but HELD
> OUT of the commit/branch** pending Bernardo's (Bernie) validation that a CronJob is the right
> approach. The sync logic + the internal token-guarded endpoint
> (`POST /api/v1/internal/sync/datadog`) live in `apps/api` and are **DONE/validated**. Until the
> CronJob is confirmed, the sync is driven by calling the internal endpoint directly.

### 1.5 Monorepo Placement

```
apps/
  api/              (existing)
  ui/               (existing)
  crawler/          (new)
    src/
      main.ts                  — bootstrap-and-exit entry point
      crawler.module.ts        — root NestJS module
      datadog-trigger/
        datadog-trigger.service.ts   — POSTs to internal sync endpoint
        datadog-trigger.module.ts
deployments/
  helm/
    aws-crawler.yml            (new — CronJob workload kind)
```

The `apps/crawler` project is registered in `nx.json` / `project.json` with its own `build` target.
It shares `libs/shared/nestjs-utils` (for `ResilientHttpService`) and `libs/shared/config` (for
`PROJECT_NAME`). It does NOT share `libs/shared/api` models directly — the contract between Crawler
and API is a single HTTP call, not shared DTOs.

### 1.6 Helm CronJob Values (`deployments/helm/aws-crawler.yml`)

Modelled on the existing `aws-db-execution.yml`. Key differences:

```yaml
workloadKind: CronJob
cronSchedule: ${CRAWLER_CRON_SCHEDULE} # e.g. "*/5 * * * *"
concurrencyPolicy: Forbid
successfulJobsHistoryLimit: 3
failedJobsHistoryLimit: 5
restartPolicy: OnFailure
env:
  INTERNAL_API_BASE_URL: ${INTERNAL_API_BASE_URL} # e.g. http://operdas1-api-svc:8080
  INTERNAL_SYNC_TOKEN: <from Vault secretEnv> # shared secret for the internal endpoint
  DD_SERVICE: ${PROJECT_NAME}-crawler
  VAULT_NAMESPACE: $VAULT_NAMESPACE
  # ... same Vault vars as aws-api.yml
secretEnv: ${vault_secrets}
```

`INTERNAL_API_BASE_URL` points to the Kubernetes service DNS name of the API pod — no ingress
traversal, no public internet, no Okta JWT needed (the internal endpoint uses a shared-secret guard
instead, see Section 4).

---

## 2. The Datadog Client

### 2.1 Endpoints Used — Bulk Snapshot, Not Per-App

The ingestion is a **single bulk snapshot per sync**. The Datadog client paginates ALL monitors and
ALL relevant SLOs **once**, indexes them locally by tag, and then resolves each kept SLO's history
under bounded concurrency. There is **zero Datadog HTTP inside the per-app loop** — per-app
resolution is purely local against the indexed snapshot.

| Datadog endpoint                   | Purpose                         | How it is called                                                                                                                |
| ---------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/monitor`              | Fetch ALL monitors once         | Paginated full scan; results indexed by the bridge tags (`app_short_key`, `app_service_id`) parsed from each monitor's `tags[]` |
| `GET /api/v1/slo`                  | Fetch ALL relevant SLOs once    | Paginated full scan; indexed by the same bridge tags                                                                            |
| `GET /api/v1/slo/{slo_id}/history` | Fetch SLO history for kept SLOs | Resolved per-kept-SLO under **bounded concurrency (6)** with **429 backoff** honouring `Retry-After` / `x-ratelimit-reset`      |

Datadog monitors carry an `overall_state` field with values `OK`, `Warn`, `Alert`, `No Data`. SLOs
carry their threshold/target and SLI history used for uptime + error budget.

> **Why bulk, not per-app (the 429 incident):** an earlier model fetched per app (~1 monitor call +
> 1 SLO call + ~3 history calls **per app**, using `?tag_filters=service:<id>`). Over 3656 apps this
> tripped Datadog **429 rate limits** and could not complete. It was REPLACED by the one-shot bulk
> snapshot + local resolution described here. The `service` tag is also NOT a per-app bridge (see
> Section 3.1) — the dual-tag bridge is.

### 2.2 Worst-State-Wins Health Status Rollup

Each application resolves (locally, from the indexed snapshot) to zero or more Datadog monitors via
its bridge tag. The rollup rule over each monitor's `overall_state`:

```
if ANY monitor.overall_state == "Alert"    → healthStatus = "RED"
else if ANY monitor.overall_state == "Warn"    → healthStatus = "AMBER"
else if ANY monitor.overall_state == "No Data" → healthStatus = "AMBER"  (unknown = degraded)
else if ALL monitor.overall_state == "OK"      → healthStatus = "GREEN"
else → healthStatus = "AMBER"  (default-safe)
```

This is a pure function over the locally-resolved monitor set. It maps to the existing
`ApplicationStatus` type (`'GREEN' | 'AMBER' | 'RED'`) defined in
`libs/shared/api/src/model/dashboard/Application.ts`. Uptime and error budget are derived from the
kept SLO's history (Sections 2.3–2.4).

If an application matches **no monitors** in the snapshot, it is `unmapped` →
`healthStatus = "AMBER"` and `datadogMapped: false` is written to Mongo (see Section 3). An unmapped
app is **never a false green**. A `statusOverride`, when present, always wins over the synced
health.

### 2.3 Deriving Uptime

From monitor history, uptime for a window is:

```
uptime_pct = (window_minutes - alert_minutes_in_window) / window_minutes * 100
```

The sync fetches SLO history via `GET /api/v1/slo/{slo_id}/history` and stores the computed
`uptime30d`, `uptime7d`, `uptime24h` as **raw floats**. The **API returns raw**; the **UI formats to
2 decimals** (frontend) for BOTH the portfolio table and the detail page (`DetailPage.ts`'s
`DashboardDetailValueTrend.uptime`). The default window is 30d; the window could be made
parametrizable (7d / 30d / 1y) as a nice-to-have, not committed.

### 2.4 Deriving Error Budget

Using the SLO status from `GET /api/v1/slo`:

```
sla_target = slo.threshold.target          // e.g. 99.9
error_budget_total_minutes = (1 - sla_target/100) * window_minutes
error_budget_used_minutes = downtime_minutes_in_window
error_budget_remaining_pct = (error_budget_total_minutes - error_budget_used_minutes) / error_budget_total_minutes * 100
burn_rate = error_budget_used_minutes / (window_minutes * (1 - sla_target/100))
```

These map directly to `DashboardDetailErrorBudget` fields in
`libs/shared/api/src/model/dashboard/DetailPage.ts` (lines 58–65): `remaining`, `total`, `used`,
`pct`, `burnRate`, `breach`.

### 2.5 Using ResilientHttpService

The internal `DatadogClientService` (inside `apps/api`, not in the Crawler) uses
`ResilientHttpModule.registerAsync()` to get a `ResilientHttpService` instance scoped to Datadog:

```typescript
// apps/api/src/datadog/datadog.module.ts
ResilientHttpModule.registerAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({
    axiosConfig: {
      baseURL: 'https://api.datadoghq.com',
      headers: {
        'DD-API-KEY': config.get('DATADOG_API_KEY'),
        'DD-APPLICATION-KEY': config.get('DATADOG_APP_KEY'),
      },
      timeout: 10_000,
    },
    resilientHttpConfig: {
      default: {
        methods: ['GET'],
        retries: 3,
        retryDelayMs: 2000,
        responseStatusCodes: [429, 500, 502, 503],
        exponent: 2, // exponential backoff: 2s, 4s, 8s
      },
    },
  }),
  inject: [ConfigService],
});
```

The `exponent: 2` and `responseStatusCodes: [429]` are critical — Datadog returns 429 with
`Retry-After` / `x-ratelimit-reset` headers, which the backoff honours. This matters specifically
for the bounded-concurrency (6) SLO-history resolution phase of the bulk snapshot, where many
`GET /slo/{id}/history` calls run in a short window. The retry interceptor in
`libs/shared/nestjs-utils/src/resilient-http/axios/resilient-http.ts` (lines 139–175) handles this
transparently. The earlier per-app fetch model did NOT survive 3656 apps (429s); the bulk snapshot +
this backoff does — validated at 0 errors / ~157s.

### 2.6 Scoping and K8s Secret

The Datadog API key must have cross-project visibility — confirmed in the meeting transcript as a
prerequisite. The key is stored as a Vault secret injected via `secretEnv` in `aws-api.yml` (not in
the Crawler — the Crawler does not call Datadog directly). The API pod already has a Vault-connected
service account (`polarisServiceAccount`). Two new Vault secret keys are needed:

- `DATADOG_API_KEY` — standard Datadog API key
- `DATADOG_APP_KEY` — application key (required for monitor and SLO endpoints)

These are added to the existing `secretEnv` list in `deployments/helm/aws-api.yml`. No new K8s
Secret object is needed — Vault injection is already the pattern.

---

## 3. Data Model

### 3.1 The Automatic Dual-Tag Bridge (Datadog ↔ PlanView)

The per-app join between a Datadog monitor/SLO and a PlanView application is **automatic** — it is
derived from Datadog tags, NOT curated by an operator. An exhaustive coverage probe proved there are
exactly TWO reliable per-app bridges:

- **PRIMARY:** Datadog tag `app_short_key` == PlanView CAST key (== the app's `shortCode`).
- **FALLBACK:** Datadog tag `app_service_id` == PlanView ServiceNow key (format `SNSVC#######`).

The same probe proved that `service`, `business_unit`, `team`, and `servicenow_chg` are **NOT**
per-app bridges and must not be used for the join. This supersedes any earlier model that called the
mapping "blank in PlanView", "manually curated by an operator", `datadogServiceId` "set per app", or
that proposed a "namespace + app-name / `kube_namespace` / `kube_app_name`" fallback — those models
are dead.

Live-demo re-confirmation (2026-06-16): `app_short_key` resolves correctly; the ServiceNow key is
**often null**, which is exactly why `app_service_id` is the fallback rather than the primary. Note
also that Beacon monitoring **does** exist (an earlier "Beacon has no monitors" assumption was
wrong) — coordinate with Juan for Beacon's `app_short_key`/mapping.

**Resolution at scale (validated live):** over **3656 apps**, **651** resolve to Datadog via these
two tags with **0 errors**. Each app records which path matched via `resolutionPath` (`primary` |
`fallback` | `unmapped`).

The dashboard read path (portfolio tree + detail) is unchanged in shape: the Crawler/sync writes
resolved health onto the application record; the dashboard reads it back (see Section 4). The
PlanView loader preserves the fields needed both for this bridge and for the portfolio tree (OpCo →
BusinessDeliveryPortfolioName, i.e. Business Unit → LOB).

### 3.2 New Fields on the `Application` Document

These fields are added to the `Application` interface in
`libs/shared/api/src/model/dashboard/Application.ts` and written by the Crawler's sync endpoint:

The bridge is automatic, so there is **no operator-curated service-id field and no
namespace/app-name fallback field**. The join keys (`app_short_key` / `app_service_id`) come from
Datadog tags and PlanView (`shortCode` / ServiceNow key) — they are already on the data; the
application document just carries the _result_ of the resolution plus provenance:

```typescript
// additions to Application interface — written by the sync on each run:
healthStatus?: ApplicationStatus;  // 'GREEN' | 'AMBER' | 'RED' — derived from Datadog (worst-state-wins)
datadogMapped?: boolean;           // false = no monitors matched either bridge tag
resolutionPath?: 'primary' | 'fallback' | 'unmapped';  // which tag matched: app_short_key | app_service_id | none
uptime24h?: number;                // e.g. 99.87
uptime7d?: number;
uptime30d?: number;                // raw value; UI formats to 2 decimals (Section 4)
slaTarget?: number;                // e.g. 99.9
errorBudgetRemainingPct?: number;
errorBudgetBurnRate?: number;
lastSyncAt?: string;               // ISO timestamp of last sync
lastSyncStatus?: 'ok' | 'error' | 'unmapped';  // per-app outcome of the last sync
```

These provenance fields (`datadogMapped` / `resolutionPath` / `lastSyncStatus` / `lastSyncAt`) exist
specifically to drive a provenance UI — a legend plus a "live · Datadog · synced N min ago" tooltip
on the Health and Uptime cells.

The `currentStatus` field already exists and is the field surfaced to the UI. The `healthStatus`
field is the Datadog-derived value. The distinction matters because `currentStatus` may be
overridden manually (`statusOverride`). The sync endpoint sets `healthStatus` only. `currentStatus`
is then computed as:

```
if statusOverride is present → currentStatus = statusOverride.status
else → currentStatus = healthStatus ?? currentStatus  (preserve existing if no sync yet)
```

This logic lives in `ApplicationsService.updateHealthFromDatadog()` (new method).

### 3.3 New `health_snapshots` Collection (Health Timeline, FR-3)

The `DashboardDetailView` in `DetailPage.ts` (line 309) has
`healthTimelineBars: DashboardDetailTimelineTone[]` — an array of `'g' | 'a' | 'r'` values.
Currently these are hardcoded in `apps/api/src/dashboard/seed/detail.seed.ts`. Phase-1 (FR-3)
replaces this with real data.

New append-only collection: `health_snapshots`. A `HealthSnapshot` is written per app **every
sync**.

```typescript
interface HealthSnapshot {
  _id: ObjectId;
  applicationId: string; // matches Application._id as string
  status: 'GREEN' | 'AMBER' | 'RED';
  uptimePct: number;
  datadogMapped: boolean;
  resolutionPath: 'primary' | 'fallback' | 'unmapped';
  monitorCount: number;
  recordedAt: string; // ISO timestamp — the sync run time
  rawMonitorStatuses?: string[]; // ['OK','OK','Alert'] — for audit/debugging, not surfaced to UI
}
```

Index: `{ applicationId: 1, recordedAt: -1 }` for efficient timeline queries (most-recent slots for
the health timeline).

> **FR-3 status (2026-06-16):** the **write path is DONE** — a snapshot is appended to
> `health_snapshots` per app on every sync. The **read endpoint + UI render are PENDING**. Until the
> read path ships, the detail page continues to serve seed/hardcoded timeline bars. There is no
> separate "portfolio-app-id mapping table" to establish — the per-app identity is the Datadog
> dual-tag bridge of Section 3.1.

### 3.4 Idempotent Writes

The sync endpoint uses `findOneAndUpdate` with `{ upsert: false }` on the `applications` collection
— it updates only existing documents, never creates new ones (application creation remains a manual
admin action). The filter key is `_id`. The update uses `$set` on only the health fields:

```typescript
await collection.findOneAndUpdate(
  { _id: ObjectId.createFromHexString(app.id) },
  {
    $set: {
      healthStatus: derivedStatus,
      datadogMapped: wasMapped,
      resolutionPath, // 'primary' | 'fallback' | 'unmapped'
      uptime24h,
      uptime7d,
      uptime30d,
      slaTarget,
      errorBudgetRemainingPct,
      errorBudgetBurnRate,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: 'ok',
    },
  },
  { returnDocument: 'after' }
);
```

`currentStatus` is set in the same `$set` only when no `statusOverride` is present:

```typescript
// Conditional currentStatus update
if (!app.statusOverride) {
  updateFields.currentStatus = derivedStatus;
}
```

For `health_snapshots`, the insert is always a new document (`insertOne`) — the collection is
append-only. No upsert needed; each sync run produces one snapshot per application.

### 3.5 Unmapped State

An application is `unmapped` when **neither** bridge tag matches a monitor in the snapshot — i.e. no
monitor carries this app's `app_short_key` (primary) and no monitor carries its `app_service_id`
(fallback). The sync then sets `datadogMapped: false`, `resolutionPath: 'unmapped'`,
`lastSyncStatus: 'unmapped'`, and `healthStatus: 'AMBER'`. This is not an error — it means the
application has no Datadog monitor we can join to. An unmapped app is **never a false green**; the
dashboard renders a distinct "No monitoring data" badge.

There is **no namespace + app-name fallback** (`kube_namespace` / `kube_app_name`) — that model is
dead. The only join order is: try `app_short_key`, else try `app_service_id`, else `unmapped`.

---

## 4. Read Path — How the Dashboard Reads Health

### 4.1 Current Read Path (Unmodified)

The `GET /api/v1/dashboard/portfolio` endpoint in `apps/api/src/dashboard/dashboard.controller.ts`
returns the `PortfolioNode` tree from `MongoPortfolioRepository`. Each embedded `PortfolioApp`
object has a hardcoded `health: 'green' | 'amber' | 'red'` field populated from the seed data in
`apps/api/src/dashboard/seed/portfolio.seed.health.ts`.

The `GET /api/v1/dashboard/portfolio/apps/:id/detail` endpoint returns a `DashboardDetailResponse`
from `MongoPortfolioRepository.getAppDetail()`, which reads a pre-generated document from the
`dashboardAppDetails` collection. The `view.healthTimelineBars` field is currently seeded in
`apps/api/src/dashboard/seed/detail.seed.ts`.

### 4.2 Phase-1 Change: Health From Mongo Only

The design principle is: **the Crawler writes, the API reads. The dashboard never calls Datadog.**
The API endpoint that the Crawler triggers is the only place that touches Datadog.

Phase-1 read path change is minimal:

**Step 1: No mapping table to seed.** The Datadog↔PlanView join is automatic (Section 3.1, the
dual-tag bridge), and the sync has already written `healthStatus` / `uptime30d` / `datadogMapped` /
`resolutionPath` onto the application record. There is no operator-curated `datadogServiceId` and no
separate `portfolioAppId` lookup table to populate — the portfolio tree and the application records
share the PlanView identity (the CAST/`shortCode` key), so the overlay keys on that.

**Step 2: Update the portfolio read** (`toPortfolioApp` in
`apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`, around line 385) to surface the live
fields. Health is live when `datadogMapped && healthStatus`; Uptime is live from `uptime30d`. This
is an in-application overlay (no MongoDB `$lookup` needed):

```typescript
// In MongoPortfolioRepository, building each PortfolioApp (toPortfolioApp):
// Health + Uptime are LIVE from Datadog when mapped:
app.health =
  datadogMapped && healthStatus
    ? (healthStatus.toLowerCase() as PortfolioApp['health'])
    : app.health; // unmapped → existing/placeholder, never a false green
app.uptime = uptime30d; // raw; UI formats to 2 decimals
```

> **Live-vs-placeholder is per COLUMN, not per app** (`toPortfolioApp`,
> `mongo-portfolio.repository.ts:385`): **Health** (`datadogMapped && healthStatus`) and **Uptime**
> (`uptime30d`) are **LIVE from Datadog**. **Perception** (`'undefined'`), **Active Users**
> (`null`), **Incidents** (`0`), **Last Incident** (`'Undefined'`) are **HARDCODED placeholders**.
> **Total Internal/External Users** come from **PlanView** (real, different source). Raja confirmed
> this live-vs-dummy split at the card level on 2026-06-16; directive is to replace the dummy cards
> with real Datadog-sourced data where available and drop ones we cannot source (e.g. total external
> users). **Perception is explicitly OUT of Phase-1 scope.** The provenance fields drive a legend +
> grayed-out (`.metric-muted`) placeholders + a "live · Datadog · synced N min ago" tooltip on
> Health/Uptime.

**Step 3: No change to the controller or service.** `DashboardController` and `DashboardService` in
`apps/api/src/dashboard/dashboard.controller.ts` and `dashboard.service.ts` are unchanged. The
enrichment happens inside the repository.

**Step 4: Detail page health timeline (FR-3 — write DONE, read PENDING).** The snapshot **write**
path is built: every sync appends a `HealthSnapshot` per app to `health_snapshots`. The **read**
side is the pending piece: `MongoPortfolioRepository.getAppDetail()` will additionally query
`health_snapshots` for the matching `applicationId`, take the most recent N snapshots (sorted
`recordedAt: -1`), map them to `'g' | 'a' | 'r'`, and write them into the returned
`view.healthTimelineBars`. When fewer than N snapshots exist (early days), the array is left-padded
to maintain the slot width expected by the UI. This update is confined to the `getAppDetail()`
method — no controller or service change. Until this read endpoint + UI render ship, the detail page
serves seed timeline bars.

### 4.3 What Does NOT Change

- `ApplicationsController` — unchanged.
- `ApplicationsService` — gets one new method `updateHealthFromDatadog()` called by the new sync
  endpoint's service; no existing methods change.
- `DashboardController`, `DashboardService` — unchanged.
- `PortfolioRepository` interface — unchanged.
- `DashboardDetailResponse` / `DetailPage.ts` — unchanged (the existing fields are filled with real
  data; no new fields).
- The seed-once guard (`populatePortfolioIfEmpty`, `populateDetailsIfMissing`) — unchanged. Once
  seeded, health is overlaid from live data; the seed doc is not re-written.

---

## 5. New Internal Sync Endpoint

### 5.1 Route and Guard

`POST /api/v1/internal/sync/datadog`

This endpoint bypasses the Okta JWT guard. Instead it uses a shared-secret guard: the Crawler sends
a bearer token whose value is read from `INTERNAL_SYNC_TOKEN` (a Vault secret). The guard
implementation is a simple `@Injectable` `CanActivate` that reads the `Authorization` header and
compares it to `config.get('INTERNAL_SYNC_TOKEN')`. This avoids the Crawler needing an Okta service
account.

The endpoint does not appear in the public Swagger spec (`apps/api/src/assets/api/openapi.yaml`) —
it is documented only in this design and in inline code comments.

### 5.2 Module Structure

```
apps/api/src/
  datadog/
    datadog.module.ts           — imports ResilientHttpModule, provides DatadogClientService, DatadogSyncService
    datadog-client.service.ts   — calls Datadog API (monitors, SLOs, SLO history)
    datadog-sync.service.ts     — orchestrates: fetch all apps, call Datadog per app, upsert health
    datadog-sync.controller.ts  — POST /internal/sync/datadog, protected by InternalSyncGuard
    guards/
      internal-sync.guard.ts    — shared-secret CanActivate
```

`DatadogModule` is registered in `apps/api/src/app/app.module.ts` alongside the existing modules.

### 5.3 Sync Flow

```
POST /api/v1/internal/sync/datadog
  → InternalSyncGuard.canActivate()  [token check]
  → DatadogSyncService.syncAll()

      PHASE A — ONE bulk snapshot (the ONLY Datadog HTTP in the whole run):
        A1. paginate ALL monitors            [GET /api/v1/monitor, full scan]
        A2. paginate ALL relevant SLOs       [GET /api/v1/slo, full scan]
        A3. index monitors + SLOs by bridge tag (app_short_key, app_service_id)
            parsed from each entity's tags[]
        A4. resolve per-kept-SLO history     [GET /api/v1/slo/{id}/history]
            under BOUNDED CONCURRENCY (6), with 429 backoff (Retry-After / x-ratelimit-reset)

      PHASE B — per-app loop (PURELY LOCAL, zero Datadog HTTP):
        for each Application:
          1. resolve monitors/SLO from the index:
             try app_short_key (PRIMARY) → resolutionPath = 'primary'
             else try app_service_id (FALLBACK) → resolutionPath = 'fallback'
             else → unmapped (resolutionPath = 'unmapped')
          2. rollupHealthStatus(monitors)              [worst-state-wins; unmapped → AMBER]
          3. computeUptimeMetrics(sloHistory)          [raw floats]
          4. computeErrorBudget(slo, sloHistory)
          5. ApplicationRepository.updateHealthFromDatadog(appId, fields)  [$set, upsert:false]
          6. HealthSnapshotRepository.insertSnapshot(appId, status, uptime, resolutionPath)  [append-only]

  → return { synced: N, mapped: M, unmapped: U, errors: K, durationMs: D }
```

Per-app resolution does **zero** Datadog HTTP — all network I/O is the single Phase-A snapshot. Live
result over **3656 apps**: **651 mapped, 0 errors, ~157s**. The response body is logged by the
caller and emitted as structured logs (Polaris Logger); when the held-out CronJob is in use, the pod
then exits 0.

---

## 6. Failure Handling, Observability, and Config

### 6.1 Failure Modes and Handling

| Failure                                                            | Response                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datadog API returns 429 (rate limit)                               | Occurs (if at all) during the Phase-A snapshot — especially the bounded-concurrency (6) SLO-history resolution. `ResilientHttpService` backs off honouring `Retry-After` / `x-ratelimit-reset` and retries. (This is the failure that killed the old per-app model over 3656 apps; the bulk snapshot + backoff survives it — validated at 0 errors.) |
| Datadog API returns 5xx                                            | Same backoff/retry logic during the snapshot                                                                                                                                                                                                                                                                                                         |
| Datadog API returns 401/403                                        | Not retried (wrong key); the sync fails fast; when the CronJob drives it, the pod exits non-zero, K8s marks the Job failed, alert fires                                                                                                                                                                                                              |
| MongoDB write fails                                                | Error logged per-app; the per-app loop continues for remaining apps; job exits non-zero after all apps processed                                                                                                                                                                                                                                     |
| Vault credential rotation during sync                              | `MongoRepository.getDatabase()` (line 265 in `mongo-repository.ts`) already handles credential expiry and re-fetches; transparent to the sync                                                                                                                                                                                                        |
| Internal sync endpoint unreachable                                 | The caller retries with `ResilientHttpService` (3 retries, 5s delay); if still unreachable, exits non-zero; the (held-out) CronJob would retry the Job up to `backoffLimit: 3`                                                                                                                                                                       |
| App matches neither bridge tag (`app_short_key`, `app_service_id`) | `datadogMapped: false`, `resolutionPath: 'unmapped'`, `healthStatus: 'AMBER'`; not an error — logged at INFO; never a false green                                                                                                                                                                                                                    |
| `statusOverride` present on app                                    | `statusOverride` always wins — `currentStatus` not touched; `healthStatus` updated normally                                                                                                                                                                                                                                                          |

### 6.2 Observability

All Polaris Logger calls in the Crawler and in `DatadogSyncService` use the same structured format
as the rest of the API. Key events to log at INFO:

- Snapshot loaded:
  `{ event: 'datadog_snapshot_loaded', monitors: N, slos: M, sloHistoriesResolved: H, durationMs }`
- Per-app result:
  `{ event: 'app_health_synced', appId, healthStatus, datadogMapped, resolutionPath, monitorCount }`
- Sync completed:
  `{ event: 'datadog_sync_completed', synced, mapped, unmapped, errors, totalDurationMs }`
- Errors at ERROR level with the full error object (no sensitive data in error body for 429/5xx)

Datadog custom metrics (via `dd-trace` `StatsD`) emitted from `DatadogSyncService`:

- `crawler.sync.duration` (histogram) — total sync wall-clock time
- `crawler.sync.errors` (count) — apps that errored in this run
- `crawler.sync.unmapped` (count) — apps matching neither bridge tag
- `crawler.app.health_status` (gauge, tag `status:green/amber/red`) — per run

These metrics allow alerting in Datadog itself: "if `crawler.sync.errors > 0` for 2 consecutive
runs, alert the ops channel."

### 6.3 Freshness Indicator

The `lastSyncAt` ISO timestamp on each `Application` document is surfaced to the dashboard. If
`lastSyncAt` is older than 15 minutes (3 missed sync cycles), the dashboard renders a "stale data"
warning badge next to the health indicator. This logic belongs in the Angular component, not the
API.

### 6.4 Config Reference

| Env var                    | Where consumed                     | Example                        |
| -------------------------- | ---------------------------------- | ------------------------------ |
| `DATADOG_API_KEY`          | `apps/api` `DatadogClientService`  | `dd-api-key-xxx` (from Vault)  |
| `DATADOG_APP_KEY`          | `apps/api` `DatadogClientService`  | `dd-app-key-xxx` (from Vault)  |
| `DATADOG_BASE_URL`         | `apps/api` `DatadogModule`         | `https://api.datadoghq.com`    |
| `DATADOG_SYNC_WINDOW_DAYS` | `apps/api` `DatadogSyncService`    | `30`                           |
| `INTERNAL_SYNC_TOKEN`      | `apps/api` guard + `apps/crawler`  | shared secret (from Vault)     |
| `INTERNAL_API_BASE_URL`    | `apps/crawler`                     | `http://operdas1-api-svc:8080` |
| `CRAWLER_CRON_SCHEDULE`    | `deployments/helm/aws-crawler.yml` | `*/5 * * * *`                  |

Added to the Joi schema in `apps/api/src/app/app.module.ts` (the `configSchema` object, lines
17–28):

```typescript
DATADOG_API_KEY: Joi.string().optional(),          // optional = Crawler feature can be disabled
DATADOG_APP_KEY: Joi.string().optional(),
DATADOG_BASE_URL: Joi.string().default('https://api.datadoghq.com'),
DATADOG_SYNC_WINDOW_DAYS: Joi.number().integer().default(30),
INTERNAL_SYNC_TOKEN: Joi.string().optional(),
```

When `DATADOG_API_KEY` is absent, `DatadogModule` skips registration and the sync endpoint
returns 503. This allows the API to deploy without Crawler keys during local development.

---

## 7. Incremental Implementation Slice Order

This ordering gets one real application to show live health on the dashboard before everything else
is complete.

> **As-built status (2026-06-16):** Slices 1–4 are **DONE and validated live** (651/3656 apps
> mapped, 0 errors, ~157s). The dual-tag bridge needs no per-app seeding — resolution is automatic
> from Datadog tags. Slice 5 (timeline read) is **PARTIAL** (write done, read pending). Slice 6
> (CronJob) is **BUILT but HELD OUT** pending Bernie. The slices below are kept for traceability and
> reframed to the as-built model.

### Slice 1: Schema + Append-Only Snapshot Collection — DONE

**Goal:** Add the sync-result fields to the `Application` interface and stand up the append-only
snapshot collection. No per-app mapping seed is needed (the bridge is automatic).

- Modify `libs/shared/api/src/model/dashboard/Application.ts` — add optional fields: `healthStatus`,
  `datadogMapped`, `resolutionPath`, `uptime24h`, `uptime7d`, `uptime30d`, `slaTarget`,
  `errorBudgetRemainingPct`, `errorBudgetBurnRate`, `lastSyncAt`, `lastSyncStatus`. (No
  `datadogServiceId` / `datadogNamespace` / `datadogAppName` — those mapping fields are dead.)
- Create the `health_snapshots` collection init in a `HealthSnapshotRepository` (follows the
  `MongoIncidentRepository` pattern at `apps/api/src/incidents/mongo/mongo-incident.repository.ts`).

**Verifiable outcome:** application documents carry the sync-result fields; `health_snapshots`
exists and accepts append-only writes.

### Slice 2: Datadog Client — Bulk Snapshot Loader — DONE

**Goal:** `DatadogClientService` loads ONE bulk snapshot without tripping rate limits.

- Create `apps/api/src/datadog/datadog-client.service.ts` exposing a `loadSnapshot()` that paginates
  ALL monitors + ALL relevant SLOs once and resolves kept-SLO histories under bounded concurrency
  (6) with 429 backoff (`Retry-After` / `x-ratelimit-reset`). (NOT per-service
  `getMonitors(serviceId)` / `getSlos(serviceId)` calls — that per-app model is dead.)
- Create `apps/api/src/datadog/datadog.module.ts` registering `ResilientHttpModule.registerAsync()`
  as shown in Section 2.5.
- A `MockDatadogClient.loadSnapshot()` provides parity for tests/local dev.
- Write unit tests mocking the Axios calls (follows the pattern in
  `libs/shared/nestjs-utils/src/resilient-http/nestjs/resilient-http.service.spec.ts`).

**Verifiable outcome:** `loadSnapshot()` returns a tag-indexed snapshot over the full monitor/SLO
set; unit tests pass.

### Slice 3: Sync Service + Internal Endpoint — DONE (validated live)

**Goal:** `POST /api/v1/internal/sync/datadog` exists, is reachable with the shared secret, loads
one snapshot, resolves every app **locally**, computes health, writes to Mongo.

- Create `apps/api/src/datadog/guards/internal-sync.guard.ts`.
- Create `apps/api/src/datadog/datadog-sync.service.ts` with `syncAll()` — Phase A bulk snapshot,
  Phase B purely-local per-app resolve (Section 5.3).
- Create `apps/api/src/datadog/datadog-sync.controller.ts`.
- Register `DatadogModule` in `apps/api/src/app/app.module.ts`.
- Add the new Joi config keys to `configSchema`.
- Unit test `DatadogSyncService` with a mocked snapshot and `ApplicationRepository`.

**Verifiable outcome (achieved):**
`curl -X POST /api/v1/internal/sync/datadog -H 'Authorization: Bearer <token>'` runs end-to-end over
**3656 apps → 651 mapped, 0 errors, ~157s**, writing `healthStatus` / `uptime30d` / `resolutionPath`
/ `lastSyncAt` per app. Live demo confirmed Health + Uptime on **IntelliFy** and **HVCAP**.

### Slice 4: Read Path — Live Health + Uptime on Portfolio — DONE

**Goal:** The portfolio read surfaces live Health + Uptime from Mongo for mapped apps.

- Overlay live fields in `toPortfolioApp`
  (`apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts:385`): Health from
  `datadogMapped && healthStatus`, Uptime from `uptime30d` (Section 4.2). No `portfolioAppId` seed
  needed — identity is the PlanView/CAST key.
- UI formats uptime to 2 decimals (frontend) for both the portfolio table and detail page; API
  returns raw.

**Verifiable outcome (achieved):** `GET /api/v1/dashboard/portfolio` returns mapped apps (e.g.
IntelliFy, HVCAP) with live `health` and `uptime` instead of hardcoded seed values; unmapped apps
stay AMBER, never a false green.

### Slice 5: Health Timeline on Detail Page — PARTIAL (write DONE, read PENDING)

**Goal:** The detail page shows real health timeline bars from `health_snapshots`.

- Write path (DONE): every sync appends a `HealthSnapshot` per app to `health_snapshots`.
- Read path (PENDING — FR-3): add a read endpoint and modify
  `MongoPortfolioRepository.getAppDetail()` to query `health_snapshots` as described in Section 4.2
  Step 4; render in the UI.

**Verifiable outcome (pending):** `GET .../detail` returns `view.healthTimelineBars` populated from
real `health_snapshots` rows; until then the seed bars are served.

### Slice 6: Crawler CronJob — BUILT but HELD OUT (pending Bernie)

**Goal:** The sync triggers automatically via K8s.

- Create `apps/crawler/src/main.ts` — bootstrap NestJS, call the sync endpoint, await response, exit
  0/1 based on error count.
- Create `apps/crawler/src/datadog-trigger/datadog-trigger.service.ts` using `ResilientHttpService`
  to POST to `INTERNAL_API_BASE_URL`.
- Add `apps/crawler` to `nx.json` / `project.json`; create `deployments/helm/aws-crawler.yml`; wire
  the `aws-crawler` image build alongside `aws-api`.

**Status:** built, but **excluded from the commit/branch** (committed work is on
`feature/datadog-live-health`, commit `fc8f6da`, which excludes `apps/crawler` + local-dev-only
files) pending Bernardo's validation that a CronJob is the right approach. Until then, the sync is
driven by calling the internal endpoint directly.

**Verifiable outcome (when un-held):** `kubectl get cronjobs -n <ns>` shows the Crawler; after one
firing, `kubectl logs <crawler-pod>` shows `datadog_sync_completed`; mapped apps' `lastSyncAt`
updates.

### Slice 7: Scale-out, Error Budget, and the "what else to show" Roadmap

**Goal:** Coverage already spans the full portfolio; this slice tracks remaining enrichment.

- Mapping coverage is automatic and already live: **651 mapped / 3656 apps**, 0 errors. No per-app
  `datadogServiceId` seeding (dead model); unmapped apps are AMBER, never a false green.
- Populate `view.errorBudget` on the detail page from the synced application fields.
- **Enrichment roadmap (priority order, from the 2026-06-16 research — currently captured in
  repo-root `DATADOG-NEXT-STEPS.md`, to be reflected in BMAD):** (1) health-timeline endpoint +
  render (FR-3, half-built); (2) monitor drill-down (message / groups / last_triggered via
  `group_states=all`); (3) Downtimes API to suppress false RED; (4) a derived maturity **scorecard**
  (from has-monitor / has-SLO / SLO-passing / mapped / has-owner); (5) Incidents API to fill the
  existing static incidents field — CAVEAT: needs the Incident Management product; (6) Service
  Catalog for ownership / on-call / links — CAVEAT: keyed on the `service` tag, which the probe
  showed is NOT a clean per-app join here, so probe before promising.
- **Card-level live-vs-dummy directive (Raja, 2026-06-16):** only Health + Uptime are live today;
  replace the other ~7 Overview cards with real Datadog-sourced data where available and drop ones
  we cannot source (e.g. total external users). **Perception stays OUT of Phase-1 scope.**
- **User-perception technical path (DISCOVERY only, OUT of Phase-1 build):** 3 RUM-free sources —
  APM `trace.*` metrics / a log-based distribution metric / a multistep API Synthetic test — all
  feeding ONE baseline engine (current vs `calendar_shift(-7d)` ratio + `anomalies('agile',2)`).
  Constraints: metrics retained 15 months; `/api/v1/query` ~1600 req/h/org.

**Verifiable outcome:** dashboard counts reflect live Datadog health across all mapped apps; detail
page shows live error budget; the enrichment backlog is recorded in BMAD.

---

## 8. Risks and How the Design Absorbs Them

### Risk 1: Datadog API key lacks cross-project visibility

**Probability:** Medium. Per the meeting transcript, this was a known prerequisite.

**RESOLVED 2026-06-16:** the key has the visibility needed — the bulk snapshot ran end-to-end over
**3656 apps with 0 errors**, and a live demo confirmed Health + Uptime on IntelliFy and HVCAP. The
`DATADOG_API_KEY` Joi field remains `optional()` so the API still boots without it (and
`MockDatadogClient.loadSnapshot()` gives synthetic-data parity for local/test).

### Risk 2: No SLO configured in Datadog for some apps

**Probability:** High. Mature Datadog implementations often have monitors but no SLOs.

**Absorption:** The snapshot indexes monitors and SLOs independently. If an app's bridge tag matches
monitors but no SLO, uptime and error-budget fields are left `null` (not written to `$set`); the
detail page falls back to seed/mock for those fields. The app is still `datadogMapped: true`
(monitors found, health derived via worst-state-wins) even with SLOs absent. Uptime is shown as
"n/a" in the UI.

### Risk 3: Datadog service ID naming is inconsistent across apps

**Probability:** Medium (original framing). Datadog `service` tags are set per team and may not
follow a predictable convention.

**RESOLVED 2026-06-16 — superseded by the dual-tag bridge.** The join no longer uses the free-form
`service` tag at all; an exhaustive coverage probe proved `service` is NOT a per-app bridge. The
per-app identity is `app_short_key` (primary, == PlanView CAST key / `shortCode`) with
`app_service_id` (fallback, == ServiceNow key `SNSVC#######`) — both structured and automatic. There
is no operator-curated service id and no `kube_namespace`/`kube_app_name` fallback. Apps matching
neither tag are `datadogMapped: false` / `resolutionPath: 'unmapped'` — shown as "no monitoring
data", never silently wrong. (Side note: Beacon DOES have monitors — coordinate with Juan for its
`app_short_key`.)

### Risk 4: portfolio tree and application health share no identity

**Probability:** Originally framed as certain (the old seed-vs-seed split).

**RESOLVED 2026-06-16.** The portfolio tree is now built from PlanView (OpCo →
BusinessDeliveryPortfolioName, i.e. Business Unit → LOB) and the application records carry the same
PlanView identity (the CAST / `shortCode` key), so the live-health overlay keys on that shared
PlanView identity — no manually-set `portfolioAppId` bridge field and no "LOB-to-BU normalization
mapping table" (that idea was explicitly killed). The owner/person grouping that created the
original mismatch is gone.

### Risk 5: Rate limiting across all apps in a single sync run

**Probability:** Originally judged "Low at MVP scale (12 apps)". This estimate was WRONG at real
scale.

**RESOLVED 2026-06-16 — materialized, then engineered out.** The true scale is **3656 apps**,
not 12. The earlier per-app fetch model (~1 monitor + 1 SLO + ~3 history calls per app) **tripped
Datadog 429 rate limits** over 3656 apps and could not complete. It was REPLACED by the
bulk-snapshot model: ONE paginated scan of all monitors + all relevant SLOs, then per-kept-SLO
history under **bounded concurrency (6)** with **429 backoff** (`Retry-After` /
`x-ratelimit-reset`), then a purely-local per-app resolve with **zero Datadog HTTP in the loop**.
Request volume is now a function of page count + kept-SLO count, not app count. Live result: **651
mapped / 3656 apps, 0 errors, ~157s**. (The old per-app sequential-throttle idea —
`DATADOG_INTER_APP_DELAY_MS` — is obsolete; there is no per-app Datadog call to throttle.)

### Risk 6: The detail page's pre-generated documents are seeded once and persist

**Probability:** Certain — `MongoPortfolioRepository.initDb()` calls `populateDetailsIfMissing()`
which inserts detail docs only when absent. Editing `detail.seed.ts` has no effect on an
already-seeded database.

**Absorption:** The design does NOT modify the stored `dashboardAppDetails` documents. Instead,
`getAppDetail()` reads the stored document (which holds all the static/mock data: contacts, feature
tables, etc.) and overlays only the dynamic health fields in memory before returning. This means the
stored doc remains the "source of truth" for static data, and live Mongo fields override only the
health-related subset. No migration is needed to existing stored detail docs.

### Risk 7: Crawler deployment blocks or delays due to pipeline complexity

**Probability:** Low. The existing `aws-db-execution.yml` is already a batch/exit workload pattern
that maps cleanly to a CronJob.

**Absorption:** The Crawler's sync can also be triggered manually by an authenticated operator via
the `POST /api/v1/internal/sync/datadog` endpoint (with the shared secret). This allows testing and
manual refresh without a deployed CronJob. The endpoint is effectively the "run now" button. (The
CronJob itself is HELD OUT pending Bernie — see Slice 6 — so this manual trigger is the current
path.)

### Risk 8: Polaris / MMC deployment for the Anand demo (NEW 2026-06-16)

**Probability:** Medium — real dependency/risk. Iader has not done a Polaris deployment before.

**Absorption:** Raja needs a **deployed, demoable link (not localhost)** for the Anand meeting.
Deployment goes through the MMC unified pipeline: a `repository_dispatch` "devops-trigger" into the
unified pipeline ships the `api` / `ui` images via Helm to AWS. Iader must coordinate with Bernie
(who owns the deployment know-how), push the `feature/datadog-live-health` branch, and tag Raja /
Prashant in the channel. Immediate demo target (from Anand via Raja): focus on ONE good-data app —
**IntelliFy** — as the proof, pulling more cards if possible.

---

## Appendix A: File Change Summary

**New files:**

| File                                                                      | Purpose                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/crawler/src/main.ts`                                                | CronJob entry point, bootstrap-and-exit                         |
| `apps/crawler/src/crawler.module.ts`                                      | Root NestJS module                                              |
| `apps/crawler/src/datadog-trigger/datadog-trigger.service.ts`             | POSTs to internal sync endpoint                                 |
| `apps/crawler/src/datadog-trigger/datadog-trigger.module.ts`              | Module for the trigger service                                  |
| `apps/api/src/datadog/datadog-client.service.ts`                          | Wraps Datadog REST API calls                                    |
| `apps/api/src/datadog/datadog-sync.service.ts`                            | Orchestrates sync for all apps                                  |
| `apps/api/src/datadog/datadog-sync.controller.ts`                         | POST /internal/sync/datadog                                     |
| `apps/api/src/datadog/datadog.module.ts`                                  | Registers ResilientHttpModule for Datadog                       |
| `apps/api/src/datadog/guards/internal-sync.guard.ts`                      | Shared-secret CanActivate                                       |
| `apps/api/src/health-snapshots/health-snapshot.repository.ts`             | Repository interface                                            |
| `apps/api/src/health-snapshots/mongo/mongo-health-snapshot.repository.ts` | Mongo implementation, append-only collection `health_snapshots` |
| `apps/api/src/health-snapshots/health-snapshots.module.ts`                | NestJS module                                                   |
| `deployments/helm/aws-crawler.yml`                                        | Helm CronJob values, mirrors aws-db-execution.yml               |

**Modified files:**

| File                                                              | Change                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `libs/shared/api/src/model/dashboard/Application.ts`              | Add optional sync-result fields (see Section 3.2): `healthStatus`, `datadogMapped`, `resolutionPath`, uptime/error-budget, `lastSyncAt`, `lastSyncStatus`. No `datadogServiceId`/namespace/app-name fields (dead model). |
| `apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`      | Overlay live Health + Uptime in `toPortfolioApp` (line ~385); timeline read in `getAppDetail()` is PENDING (FR-3)                                                                                                        |
| `apps/api/src/applications/mongo/mongo-application.repository.ts` | Add health-update method using `$set` (upsert:false)                                                                                                                                                                     |
| `apps/api/src/app/app.module.ts`                                  | Register `DatadogModule`; add Joi config keys                                                                                                                                                                            |

> Note: the PlanView loader (separate ingestion) preserves OpCo + BusinessDeliveryPortfolioName for
> the portfolio tree and the CAST/`shortCode` + ServiceNow keys for the dual-tag bridge — there is
> no `applications.seed.ts` `datadogServiceId`/`portfolioAppId` seeding step (that was the dead
> manual-mapping model).
