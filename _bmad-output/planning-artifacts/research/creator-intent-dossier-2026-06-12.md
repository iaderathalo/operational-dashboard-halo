---
title: 'Creator Intent Dossier — Anton Novikov / Operational Dashboard'
created: 2026-06-12
source: workflow wf_01e97364-567 (repo recon + transcript)
---

# Creator Intent Dossier

> ⚠️ **Historical input (2026-06-12).** Records the original design intent / point-in-time research,
> _before_ the automatic `app_short_key`/`app_service_id` mapping bridge + bulk-fetch snapshot were
> discovered. Any "manual curation / namespace+app-name fallback / per-app polling" here is
> **superseded** — for the as-built model see the **PRD**
> (`prds/prd-operational-dashboard-halo-2026-06-13/prd.md`) + addendum. Left intact as a dated
> record. (Note: this dossier correctly names **Anton Novikov** as the creator — distinct from the
> stakeholder **Anand**.)

## Intent Summary

Anton Novikov (TPM, US Consulting / Health BU) designed this dashboard as a personal prototype of
his own operational reality before it became a team project. Three layers of evidence must be kept
distinct:

WHAT HE SAID (meeting transcript, reconstructed via team memory from ~2026-06-11): Anton aligned the
team around two integration phases. Phase 1 = Datadog for health status, ingested via a K8s CronJob
calling the API (the "Qualtrics pattern") with a dedicated API key that has cross-project
visibility. Phase 2 = Komodor and Pendo. He was explicit that in-app cron must NOT be used (multiple
replicas = duplicate calls). The Datadog-to-application mapping would be stored per app in Mongo as
a CI field (manually curated at first, with namespace+app-name as fallback). Planview (project
portfolio) data is a manual JSON export for now. Critically, he left the User Perception formula
entirely undefined — he said he would get the business-operation timing metrics from Intellify and
Beacon owners after returning from vacation. He also said branches + PRs always, never push to main.

WHAT HE BUILT (repo — apps/api, apps/ui, libs): Anton built a complete, polished demo prototype that
goes well beyond what the docs describe as MVP scope. Key intentional choices:

1. Dual-signal model from day one: The PortfolioApp model
   (apps/api/src/dashboard/portfolio.model.ts:13-14) has two independent typed fields — health
   (operational/infrastructure signal) and perception (user-experience signal) — both as
   green|amber|red enums, rendered as two separate header badges. The docs defer perception to Phase
   2, but the code implements it as a first-class field everywhere.

2. The seed data is a personal digital twin: Anton placed himself as owner of the "US Consulting"
   node under Health (portfolio.seed.health.ts:14), used his own marsh.com email as the
   LocalDevelopmentUser (libs/shared/api/src/model/common/LocalDevelopmentUser.ts:8-13), named
   himself as DETAIL_TEMPLATE owner (detail-page.data.ts:321-322), and named real Mercer products
   (FIBER, Beacon, Intellify, VIP) as the monitored apps. The COO is named "Rami Assaad" —
   consistent with team memory identifying him as the sponsor.

3. AI observability is a deliberate first-class addition, not documented: The detail page has two
   dedicated tabs — AI Tokens (token budget by model: GPT-5.2, GPT-5 Mini, GPT-4.1 Nano; by feature:
   FIBER AI Assistant, RFP Creator, Document Uploader) and AI Drift (PSI scores, JS/KS drift
   methods, per-model accuracy delta, retraining history) — with fully typed contracts in
   libs/shared/api/src/model/dashboard/DetailPage.ts:166-230. PolarisMetadata.json:23 declares
   AIintegration: false, meaning Anton explicitly did not disclose this scope to the Polaris
   platform. The app names in the AI seed data (FIBER AI Assistant v3, Document Uploader v2) are too
   specific to be accidental — Anton has direct knowledge of what AI features FIBER runs in
   production.

4. The Sev-1 incident workflow is fully wired in UI but API-stubbed: The 3-step wizard (Identify ->
   Notify -> Confirm) in apps/ui/.../detail-page.component.html:1374-1541 is complete Angular, with
   ngModel bindings for on-call recipients, Slack/PagerDuty/Email/SMS channels, and a Zoom bridge
   callout. The confirmSev1() method (detail-page.component.ts:229-232) shows a hardcoded toast with
   a specific incident number — no HTTP call is made. This is a deliberate demo shell, not
   incomplete work.

5. Manual status override is fully implemented end-to-end: The StatusOverride interface
   (Application.ts:4-9), API endpoints (applications.controller.ts:55-67), service methods
   (applications.service.ts:55-78), and UI service methods (dashboard.service.ts) are all wired.
   There is no UI surface in the current Angular components to invoke it — planned for a future
   operator panel.

6. The NestJS resilient-http library (libs/shared/nestjs-utils) is completely unused in apps/api —
   it is pre-staged infrastructure intended for the Datadog polling client and future external
   integrations. The Angular-side retry interceptor IS wired, showing the creator prioritized
   frontend-to-API reliability first.

7. Production deployment infrastructure is fully provisioned: Okta groups (prod + non-prod),
   OSS2/K8s Helm config, Vault/K8s JWT auth, CORS whitelisting oss2.mrshmc.com (server.ts:58), and
   Apigee as a hard runtime dependency (app.module.ts:26-27). This is not a throwaway prototype — it
   was registered through Polaris Launchpad with app key "operdas1".

8. NOC wall was an explicit design target: docs/dashboard-architecture.md:13 lists "Browser / NOC
   Wall" as the primary end-user context, and the breakpoint table (dashboard-architecture.md:545)
   lists 1920px+ as "NOC wall optimized" — the highest-priority breakpoint. The intended audience
   includes 24/7 operations staff, not just management.

WHAT HE PREPARED BUT DID NOT BUILD (scaffolding / stubs):

- UptimeMetrics, UserSessionMetric, HealthStatusRecord interfaces (Dashboard.ts:12-37) are exported
  but never instantiated — intended write-models for a future time-series ingestion pipeline.
- IncidentUpdate interface (Incident.ts:28-35) models a full war-room comment thread but is
  completely orphaned — no API endpoint, no UI.
- The Settings tab (detail-page.component.html:1271-1371) has all UI chrome (threshold inputs, API
  endpoint, poll interval, notification checkboxes, maintenance window scheduler) but zero click
  handlers in the component — pure Phase 2 placeholder.
- DashboardFilters model and DashboardService.getApplications() with filter params are fully typed
  but unused in any component.
- The OpenAPI spec (openapi.yaml) was never updated past the template "tasks" endpoint — the entire
  dashboard/applications/incidents/teams API is contract-free.
- The Settings tab seed data includes endpoint pattern
  "https://salesforce.corp.com/ops/feature-health" (detail.seed.ts:860-871) and
  docs/dashboard-architecture.md:624 describes "/ops/feature-health" as the per-app contract
  endpoint each monitored app would eventually expose — the adapter pattern was mentally concrete
  but not built.
- MSSQL config keys (API_MSSQL_PW, API_MSSQL_DB_URL) appear in the config schema but no MSSQL
  repository exists — likely a planned SQL data source for a future entity (possibly Planview
  integration).

DIVERGENCE BETWEEN WHAT HE SAID AND WHAT HE BUILT: The meeting said Datadog and perception formula
were Phase 1/2 future work, but the code already has perception implemented as a live field and the
seed data models Datadog as the monitoringSource for all applications. Anton built ahead of his own
roadmap — the prototype reflects his end-state mental model, not the current phase.

## Planned Evolution

- Phase 0 (DONE — initial commit): Polaris Blueprint scaffold with full demo prototype. Portfolio
  tree with dual health/perception signals seeded from real Mercer org structure. Detail page with 9
  tabs including AI Tokens and AI Drift (undocumented). Sev-1 wizard UI shell. Manual status
  override API. In-memory/Mongo switchable repositories. SSO via Okta/Apigee. Production
  infrastructure provisioned (OSS2, Vault, Helm, Okta groups).
- Phase 1 (next sprint, per meeting 2026-06-11): Datadog integration for health status. Approach:
  K8s CronJob calls a new API endpoint that pulls from Datadog API using a cross-project-visibility
  API key. Datadog-to-app mapping stored per app in Mongo as a CI (service CI) field, manually
  curated initially, with namespace+app-name as fallback. No RUM license available —
  synthetic/log-based checks only, ~2-week retention. Target apps: Mercer FIBER, Beacon, Intellify,
  VIP under Health > US Consulting. The unused libs/shared/nestjs-utils ResilientHttpService is the
  intended Datadog HTTP client.
- Phase 1 (parallel): User Perception formula definition. Anton committed to getting
  business-operation timing metrics from Intellify and Beacon owners after returning from vacation
  (week of 2026-06-22). Pendo is the named source for page-load metrics and user counts. The formula
  is undefined — Anton owns this decision. Until defined, perception field remains seeded/manual.
- Phase 1 (parallel): Planview integration for project/portfolio data. Method is manual JSON export
  initially — no API client planned for Phase 1. Likely feeds the portfolio tree owner/BU metadata.
- Phase 2: Komodor integration for Kubernetes-level health (pod restarts, deployment status).
  WebSocket real-time push replacing 60s REST polling. ServiceNow bidirectional incident ticket
  sync. PagerDuty on-call resolution and automated paging. Slack/Teams/Email/SMS notification
  dispatch (the Sev-1 wizard already has the UI for these channels). Redis cache for current status
  reads.
- Phase 2: User Perception goes live once formula is defined. The /ops/feature-health contract
  endpoint pattern (per app, standardized) would be polled by the CronJob. Salesforce URL in seed
  settings (detail.seed.ts:860) suggests one app's perception data may come from a Salesforce-hosted
  telemetry API.
- Phase 2: IncidentUpdate war-room commentary thread — the contract (Incident.ts:28-35) is modelled,
  an API endpoint and UI panel need to be built. This enables the dashboard to serve as the incident
  command center.
- Phase 2: Manual status override operator UI surface — the API and service are fully implemented; a
  UI panel (likely on the portfolio page table row or detail page header) needs to be connected to
  setStatusOverride()/clearStatusOverride() in DashboardService.
- Phase 3: Fine-grained RBAC (Viewer/Operator/Admin/Super Admin). WCAG 2.1 AA accessibility audit.
  Mobile responsive layout (currently implemented partially — the portfolio page sidebar has a
  responsive drawer, but this was marked Phase 3 in the plan). Audit log search/export UI (SIEM
  logging enums need extension for incidents/applications/settings domains). Performance testing at
  500 applications.
- Future: Public status page. Kafka message bus for decoupling ingestion. OpenSearch for audit log
  indexing. Microservice split of Dashboard API, Incident API, and Uptime/Metrics Service (currently
  all in one NestJS process). Time-series ingestion pipeline populating UptimeMetrics and
  UserSessionMetric collections (currently scaffolded as unused interfaces).

## Contradictions (repo vs docs vs meeting)

- Perception is Phase 2 in docs, but is Phase 0 in code: docs/mvp-implementation-plan.md explicitly
  lists 'User Perception tracking (dual-status indicators)' as deferred to Phase 2, yet
  apps/api/src/dashboard/portfolio.model.ts:13-14 implements perception as a live field on every
  PortfolioApp, portfolio-page.component.ts:53-56 renders it, and detail-page.component.html:753
  renders an ai-drift tab alongside it. The code is ahead of the plan by at least one phase.
- AI observability is undocumented and undeclared: Neither docs/dashboard-architecture.md nor
  docs/mvp-implementation-plan.md mentions AI Tokens or AI Drift monitoring. PolarisMetadata.json:23
  declares AIintegration: false. Yet the repo contains fully typed interfaces
  (DetailPage.ts:166-230), seeded data with GPT model names and FIBER AI Assistant v3 PSI scores
  (detail-page.data.ts:526-716), and rendered Angular tab panels. Anton added an entire
  observability domain to the dashboard without documenting or declaring it.
- Datadog is Phase 2 in the plan but Phase 1 in the meeting and already the monitoringSource in
  seed: docs/mvp-implementation-plan.md:38 lists 'External health check sources (Datadog,
  AppDynamics)' as deferred to Phase 2, but the 2026-06-11 meeting (per team memory) assigned
  Datadog integration as the immediate Phase 1 task for Bernardo and Iader. All 12 application seed
  records already have monitoringSource: 'Datadog' (applications.seed.ts). The plan document is
  stale relative to the meeting decision.
- Mobile responsiveness is Phase 3 in the plan but already partially built:
  docs/mvp-implementation-plan.md:44 defers mobile responsive layout to Phase 3, but
  apps/ui/.../portfolio-page.component.ts:33-34 implements an 800px breakpoint, backdrop overlay,
  slide-out drawer, and hamburger button. Anton built responsive behavior into the initial commit
  despite deferring it in his own plan.
- The docs reference a prototype/demo.html file that does not exist:
  docs/mvp-implementation-plan.md:542 lists 'prototype/demo.html (main dashboard)' as a design
  reference, but only prototype/portfolio.html and prototype/detail.html exist in the repo. The main
  dashboard prototype was either deleted, never committed, or renamed.
- Polaris/NX version mismatch between copilot instructions and actual dependencies:
  .github/copilot-instructions.md states NX v19.4.1 and TypeScript v5.4.5, but package.json has NX
  22.0.2 and TypeScript 5.9.2. The Copilot instructions are stale template content.
- Two disjoint application datasets with no reconciliation: The flat applications collection
  (applications.seed.ts) contains 12 enterprise SaaS apps (SAP, Workday, ServiceNow, etc.) while the
  portfolio tree (portfolio.seed.health.ts, portfolio.seed.wealth.ts, etc.) contains entirely
  different Mercer-branded apps (FIBER, Beacon, Intellify, VIP, Darwin, etc.) with no shared ID
  space. The architecture doc describes a single unified application model. No join or mapping
  between these two datasets exists anywhere in the codebase.
- The meeting said perception formula is undefined, but the code implements perception as a colored
  status field: Anton told the team after vacation he would define the business-operation timing
  metrics for perception. The code, however, already renders perception as a green/amber/red
  traffic-light identical in structure to health — suggesting Anton pre-decided the output encoding
  (three-band) even though the input formula is undefined. The detail page additionally models
  perception as a 0-100 continuous gauge in an SVG element, creating a second inconsistency: the
  table/summary bar use three bands but the gauge uses a continuous scale.

## Unknowns

- User Perception formula: Anton explicitly deferred defining this. It is unknown which
  business-operation metrics feed the perception score (Pendo page-load times, Salesforce
  feature-health telemetry, real-user session data, or a composite of these), what the threshold
  boundaries are for green/amber/red classification, and whether the output is a continuous 0-100
  score (as modelled by the SVG gauge in the detail page) or a direct three-band classification.
- The upstream design document that specified React and PostgreSQL/TimescaleDB:
  docs/mvp-implementation-plan.md:549 references an earlier design doc that made different
  technology choices. That document is not in the repo. It may contain additional scope, stakeholder
  requirements, or UX decisions that shaped Anton's thinking but are not reflected in the committed
  artifacts.
- Whether 'Rami Assaad' (COO in portfolio seed root) is a real MMC executive: If real, the dashboard
  was designed to be presented to or used by C-level stakeholders, which significantly raises the
  polish and reliability bar. If a placeholder, the org hierarchy seed is illustrative only.
- The relationship between the flat applications collection and the portfolio tree: Both datasets
  model 'applications' but use different names, different app IDs, different field schemas, and have
  no join. It is unknown whether Anton intended to unify these into one collection, keep them
  separate for different purposes, or replace the flat collection entirely with the portfolio tree
  once Datadog integration is live.
- Which external integrations the NestJS ResilientHttpModule was pre-staged for: The module supports
  per-URL retry overrides, implying multiple upstream HTTP targets were envisioned. The candidates
  from the codebase are Datadog (most likely), PagerDuty, ServiceNow, and the per-app
  /ops/feature-health endpoint, but no code specifies which endpoints or configuration.
- The MSSQL data source: API_MSSQL_PW and API_MSSQL_DB_URL appear in the config schema but no MSSQL
  repository, module, or service exists. It is unknown what entity Anton planned to store in SQL —
  candidates include Planview project data, historical uptime time-series, or audit logs.
- Whether the Sev-1 incident INC number in the toast ('INC-20260305-003') corresponds to a real MMC
  incident or is arbitrary seed data, and whether the incident creation workflow was intended to
  eventually call ServiceNow to create a real ITSM ticket.
- The 'perception' data source for apps outside Mercer Health: The seed settings tab shows a
  Salesforce URL for perception data (detail.seed.ts:860), but Pendo was named in the meeting for
  page-load/user counts. Whether different app families (Health vs Wealth vs Career) would use
  different perception data sources, or whether there is a unified perception adapter contract, is
  unknown.
- Whether the AI Tokens and AI Drift tabs were scoped for all monitored applications or only for
  Mercer FIBER (which has known AI sub-features). The seed data models AI features only under
  FIBER-branded names, but the tab exists on the generic detail page template, implying it would
  render for any app detail view.
