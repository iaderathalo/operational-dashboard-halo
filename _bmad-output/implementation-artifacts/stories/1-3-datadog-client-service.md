# Story 1.3: DatadogClientService (config-driven, with mock fallback)

Status: done

## Story

As a developer on the operational dashboard, I want a typed Datadog client that loads ONE bulk
telemetry snapshot — all monitors + all relevant SLOs (+ resolved SLO history) in a single pass —
over the existing `ResilientHttpService`, with a base URL driven by config and a mock fallback when
no API key is set, so that the sync logic can resolve every app PURELY LOCALLY against that snapshot
— running against real Datadog (with keys) or deterministic mock data (without), with zero code
change to switch, and without per-app HTTP that trips Datadog's 429 rate limits.

## Acceptance Criteria

1. A `DatadogModule` is created under `apps/api/src/datadog/`.
2. A `DatadogClient` interface exposes a SINGLE bulk method:
   `loadSnapshot(): Promise<DatadogSnapshot>` — one pass that paginates ALL monitors and ALL
   relevant SLOs, then resolves per-kept-SLO history, returning a typed `DatadogSnapshot` (the
   in-memory telemetry the sync resolves apps against). All shapes are defined in
   `apps/api/src/datadog/datadog.types.ts`. NO per-app / per-tag fetch methods are exposed (no
   `getMonitorsByServiceTag` / `getMonitorsByNamespaceApp` / `getSlosByServiceTag`); per-app
   resolution is done locally by the sync service (Story 1.4) against the returned snapshot.
3. `RealDatadogClient.loadSnapshot()` uses `ResilientHttpService` (from
   `@operational-dashboard/shared-nestjs-utils`) configured via `ResilientHttpModule.registerAsync`
   with: base URL from `DATADOG_BASE_URL` (fallback derived from `DATADOG_SITE`, default
   `https://api.datadoghq.com`), headers `DD-API-KEY` and `DD-APPLICATION-KEY` from `ConfigService`,
   and retry on 429/5xx. It (a) paginates `GET /api/v1/monitor` (all pages) and `GET /api/v1/slo`
   (all pages) ONCE, (b) resolves `GET /api/v1/slo/{id}/history` for each kept SLO under BOUNDED
   CONCURRENCY (max 6 in flight) with explicit 429 backoff that honours `Retry-After` /
   `x-ratelimit-reset`, and (c) indexes monitors/SLOs by their `app_short_key` (primary) and
   `app_service_id` (fallback) tag values so the sync can look them up locally. It performs ZERO
   per-app requests.
4. `MockDatadogClient.loadSnapshot()` returns a deterministic, realistic canned `DatadogSnapshot` (a
   set of monitors/SLOs/history tagged with varied `app_short_key` / `app_service_id` values so
   different apps roll up to GREEN/AMBER/RED) — no network calls, same shape as the real client.
5. The injected `'DatadogClient'` is selected by a `useFactory` that returns the real client when
   `DATADOG_API_KEY` is set, else the mock — mirroring the `ApplicationsModule` mongo/in-memory
   toggle.
6. `DATADOG_API_KEY`, `DATADOG_APP_KEY`, `DATADOG_BASE_URL`, `DATADOG_SITE` are added to the Joi
   `configSchema` in `app.module.ts` as OPTIONAL (`Joi.string()` with no `.required()`), so the app
   still boots without them. Keys are read from config only — NEVER hardcoded or logged.
7. Unit tests: real client mocks `ResilientHttpService` and asserts monitor/SLO pagination (follows
   pages), header injection + retry config, bounded-concurrency history resolution (≤6 in flight),
   and 429 backoff honouring `Retry-After` / `x-ratelimit-reset`; mock client returns its canned
   `DatadogSnapshot` deterministically.

## Tasks / Subtasks

- [ ] Types (AC: 2)
  - [ ] `apps/api/src/datadog/datadog.types.ts` — `DatadogMonitor`
        (`overall_state: 'OK'|'Warn'|'Alert'|'No Data'`, `tags`…), `DatadogSlo`,
        `DatadogSloHistory`, and the bulk `DatadogSnapshot` (the resolved telemetry: all monitors +
        all kept SLOs + their history, plus the `app_short_key`/`app_service_id` lookup indexes the
        sync resolves against)
- [ ] Real client (AC: 3, 6)
  - [ ] `apps/api/src/datadog/datadog-client.ts` (interface, single `loadSnapshot()`) +
        `real-datadog-client.ts` — paginate all monitors + all SLOs once, resolve per-kept-SLO
        history under bounded concurrency (max 6) with 429 backoff (`Retry-After` /
        `x-ratelimit-reset`), index by `app_short_key` (primary) + `app_service_id` (fallback)
  - [ ] Add the four config keys to the Joi schema in `apps/api/src/app/app.module.ts`
- [ ] Mock client (AC: 4)
  - [ ] `apps/api/src/datadog/mock-datadog-client.ts` — `loadSnapshot()` returns a canned
        `DatadogSnapshot` with the same shape/tag indexing
- [ ] Module + toggle (AC: 5)
  - [ ] `apps/api/src/datadog/datadog.module.ts` — `ResilientHttpModule.registerAsync(...)`,
        provider `'DatadogClient'` with `useFactory` choosing real vs mock by `DATADOG_API_KEY`
- [ ] Tests (AC: 7)

## Dev Notes

**Reuse, do not reinvent — the resilient HTTP client already exists:**

- `ResilientHttpService` is at
  `libs/shared/nestjs-utils/src/resilient-http/nestjs/resilient-http.service.ts` (extends
  `@nestjs/axios` `HttpService`). Configure it via
  `ResilientHttpModule.registerAsync({ imports:[ConfigModule], useFactory:(cfg)=>({ axiosConfig:{ baseURL, headers:{ 'DD-API-KEY':…, 'DD-APPLICATION-KEY':… }, timeout:10000 }, resilientHttpConfig:{ /* retry on 429/5xx */ } }), inject:[ConfigService] })`.
  The module's `registerAsync` reads
  `ResilientHttpModuleOptions = { axiosConfig, resilientHttpConfig }` (see
  `ResilientHttpModuleOptions.ts`). It already adds an `x-correlation-id` interceptor.
- Datadog read endpoints need BOTH `DD-API-KEY` (org) and `DD-APPLICATION-KEY` (user/permissions).
  The client does ONE BULK PASS, not per-app/per-tag calls: paginate `GET /api/v1/monitor` (ALL
  pages) for `overall_state` + `tags`, paginate `GET /api/v1/slo` (ALL pages), then
  `GET /api/v1/slo/{id}/history` for each kept SLO under bounded concurrency (max 6 in flight) with
  429 backoff (`Retry-After` / `x-ratelimit-reset`). Monitors/SLOs are then indexed in memory by
  their `app_short_key` (primary bridge) and `app_service_id` (fallback bridge) tag values. (See
  brief addendum for the validated shapes.)
- **Why bulk, not per-app:** an earlier per-app fetch model (~1 monitor + 1 SLO + 3 history calls
  per app) tripped Datadog 429 rate limits at portfolio scale. The bulk-snapshot + local-resolve
  model fixed this — the live run mapped 651 apps / 0 errors in ~157s over 3656 apps. Per-app
  resolution (Story 1.4) issues ZERO Datadog HTTP.
- **Tag bridge:** `app_short_key` == PlanView CAST key (== app `shortCode`) is the PRIMARY per-app
  identifier; `app_service_id` == PlanView ServiceNow key (`SNSVC#######`) is the FALLBACK (the
  ServiceNow key is often null, hence the fallback). A coverage probe proved these are the ONLY
  reliable per-app bridges — `service`/`business_unit`/`team`/`servicenow_chg` are NOT per-app
  bridges; do not index or join on them.
- **Region/base URL:** the base URL depends on the org's Datadog site (`app.datadoghq.com` →
  `api.datadoghq.com`; `us5.datadoghq.com`, `.eu`, …). Keep it config-driven (`DATADOG_BASE_URL`) so
  it is set at runtime — do not hardcode a region.

**The toggle is the project's established pattern** — copy the `useFactory` shape from
`apps/api/src/applications/applications.module.ts` (there it is `mongoUrl ? mongo : inMemory`; here
it is `configService.get('DATADOG_API_KEY') ? real : mock`).

**Security:** keys come from `ConfigService` (env / Vault), never committed. `.env` is already
gitignored. Never log key values.

**What consumes this:** Story 1.4 injects `'DatadogClient'` and is agnostic to real-vs-mock.

**Testing standards:** Jest. Mock `ResilientHttpService` (its `.axiosRef`/`.get`) to assert request
shape; the mock client needs no mocks.

### Project Structure Notes

- New folder `apps/api/src/datadog/`. `DatadogModule` will also host the sync service (1.4) and
  internal controller (1.5).
- `@operational-dashboard/shared-nestjs-utils` resolves to `libs/shared/nestjs-utils/src/index.ts`
  (tsconfig path) — confirm `ResilientHttpModule`/`ResilientHttpService` are exported there; if only
  re-exported from the resilient-http barrel, import from the deep path used elsewhere.

### References

- PRD FR-1/FR-2/FR-4/FR-5/FR-6, §B Integration — [Source:
  _bmad-output/planning-artifacts/prds/prd-operational-dashboard-halo-2026-06-13/prd.md]
- Brief addendum (Datadog integration shape: endpoints, headers, key scoping) — [Source:
  _bmad-output/planning-artifacts/briefs/brief-operational-dashboard-halo-2026-06-12/addendum.md]
- Crawler solution-design (Datadog client) — [Source:
  _bmad-output/planning-artifacts/architecture/crawler-solution-design-2026-06-13.md]
- Backlog E1-S3 — [Source:
  _bmad-output/planning-artifacts/epics-stories/phase-1-backlog-2026-06-13.md]
- Pattern to copy: `apps/api/src/applications/applications.module.ts`; resilient http:
  `libs/shared/nestjs-utils/src/resilient-http/nestjs/resilient-http.module.ts`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
