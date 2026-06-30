# Portfolio Visibility Dashboard — Market & Product Research Report

> ⚠️ **Historical input (2026-06-12).** Point-in-time market/product research, captured _before_ the
> automatic `app_short_key`/`app_service_id` mapping bridge + bulk-fetch snapshot were discovered.
> Any "manual curation / namespace+app-name fallback / per-app polling" here is **superseded** — for
> the as-built model see the **PRD** (`prds/prd-operational-dashboard-halo-2026-06-13/prd.md`) +
> addendum. Left intact as a dated record.

---

## Executive Summary

This report synthesizes six domains of technical and market research against the evidence base for
the Portfolio Visibility Dashboard (internal codename: operdas1), a bespoke operational health
product designed by Anton Novikov (TPM, US Consulting / Health BU) at Mercer/MMC. The product's core
differentiator — a dual-signal model combining infrastructure health (Datadog/Komodor) with user
perception health (Pendo/Qualtrics/Salesforce) surfaced for business stakeholders — has no direct
off-the-shelf equivalent in any evaluated IDP, observability platform, or service catalog product.
The research confirms that the engineering choices made in the prototype are architecturally sound
and threshold-aligned with industry standards, but exposes four delivery-blocking dependencies: the
undefined User Perception formula, Pendo SDK version exposure, Komodor API tier access, and an
unscoped two-vendor AI observability architecture. This report provides actionable grounding for
each.

---

## Creator Intent: What the Evidence Says Anton Built

Three layers of evidence are distinguished throughout this report.

**What he said** (meeting ~2026-06-11): Phase 1 = Datadog health integration via K8s CronJob using a
cross-project API key. Phase 2 = Komodor + Pendo. No in-app cron (replica safety). Datadog-to-app
mapping stored per app in Mongo as a CI field. Planview via manual JSON export. User Perception
formula explicitly deferred until after vacation (week of 2026-06-22), pending business-operation
timing metrics from Intellify and Beacon owners.

**What he built**: A complete polished prototype that runs ahead of his own stated roadmap by at
least one phase. Perception is implemented as a live green/amber/red field everywhere (portfolio
model, summary bar, detail gauge). AI Tokens and AI Drift are fully typed, rendered, and seeded with
GPT model names and PSI scores, but declared `AIintegration: false` in `PolarisMetadata.json`.
Production infrastructure (OSS2, Vault, Helm, Okta, Apigee) is fully provisioned. The seed data is a
personal digital twin of Anton's operational reality (his email as `LocalDevelopmentUser`, his org
node, real Mercer product names).

**What he prepared but did not build**: `UptimeMetrics`, `UserSessionMetric`, `HealthStatusRecord`
interfaces are exported but never instantiated. `IncidentUpdate` war-room thread is orphaned. The
Settings tab has full UI chrome but zero click handlers. `DashboardFilters` and OpenAPI spec are
both stubs.

The consistent pattern: Anton encoded his end-state mental model into Phase 0, then described a
phased roadmap that catches up to the code over time.

---

## Comparable Products and Approaches

### 1. Datadog API Patterns for Portfolio-Level Application Health

**What the research confirms:**

Datadog does not expose a pre-computed per-application GREEN/AMBER/RED health status via any public
REST endpoint. The composite health dot visible on the APM Service Page is UI-only and is not
returned by any public API. The dashboard must compute this rollup itself.

The correct Phase 1 CronJob architecture uses two endpoints per application:

- `GET /api/v1/monitor?monitorTags=service:<shortCode>` — returns all monitors for that service. The
  `overall_state` field maps directly to the repo's `ApplicationStatus` type: `OK → GREEN`,
  `Warn → AMBER`, `Alert → RED`, `No Data → AMBER` (product decision). Rollup rule: worst state wins
  (`Alert > Warn > No Data > OK`).
  ([docs.datadoghq.com/api/latest/monitors/](https://docs.datadoghq.com/api/latest/monitors/))
- `GET /api/v1/slo?tags=service:<shortCode>` then `GET /api/v2/slo/{slo_id}/status` — returns
  `errorBudgetRemaining`, `state`, and history data that populates the `UptimeMetrics` interface
  fields (`uptime24h`, `uptime7d`, `uptime30d`, `uptime90d`) already defined in `Dashboard.ts`.
  ([docs.datadoghq.com/api/latest/service-level-objectives/](https://docs.datadoghq.com/api/latest/service-level-objectives/))

The `@datadog/datadog-api-client` npm package (TypeScript) is the correct client library. It
provides typed `v1.MonitorsApi` and `v1.SLOs` classes. The existing `libs/shared/nestjs-utils`
`ResilientHttpService` is correctly pre-staged for this use case.

**Service account key scoping:** Four permissions are sufficient: `monitors_read`, `slos_read`,
`apm_service_catalog_read`, `dashboards_read`. Service account application keys (prefixed `ddapp_`)
are preferred over personal keys. As of August 2025, new orgs have OTR (One-Time Read) mode enabled
— the secret must be captured at creation time and stored immediately in a K8s Secret.
([docs.datadoghq.com/account_management/api-app-keys/](https://docs.datadoghq.com/account_management/api-app-keys/))

**Unified Service Tagging gap:** `monitorTags=service:<name>` requires that each monitored
application has a confirmed Datadog service tag. The `shortCode` values in `applications.seed.ts`
(e.g., `SAP`, `SFDC`) may not match the `DD_SERVICE` env var set in each app's dd-trace config. The
Phase 1 prerequisite is to confirm or establish the `service:<name>` tag value for each of the 12
applications before the CronJob is written.

**Cross-org scoping:** The Cross-Organization Connections API (`/api/v2/org_connections`) supports
log and metric sharing but does not expose monitors or SLOs from child orgs as of mid-2025 (still
beta, limited to logs/metrics). If the US Health portfolio spans multiple Datadog orgs, the CronJob
must maintain one credential set per org and fan out independently.
([docs.datadoghq.com/account_management/org_settings/cross_org_visibility_api/](https://docs.datadoghq.com/account_management/org_settings/cross_org_visibility_api/))

**Software Catalog / Scorecards:** The Catalog API (`GET /api/v2/catalog/entity`) returns service
metadata but no live health status field. Scorecards evaluate pass/fail/skip per rule per service
once daily. Neither is a substitute for Monitors-based health polling. Both are additive signals for
a future Maturity or Readiness dimension.
([docs.datadoghq.com/api/latest/software-catalog/](https://docs.datadoghq.com/api/latest/software-catalog/),
[docs.datadoghq.com/software_catalog/scorecards/](https://docs.datadoghq.com/software_catalog/scorecards/))

**Industry validation:** Backstage, Cortex.io, and OpsLevel all use the identical
`GET /api/v1/monitor?monitorTags=service:<name>` pattern for portfolio-level health aggregation from
Datadog, confirming it as the established approach in 2025.
([docs.cortex.io/ingesting-data-into-cortex/integrations/datadog](https://docs.cortex.io/ingesting-data-into-cortex/integrations/datadog))

---

### 2. Pendo Metrics API for User Perception Scoring

**What the research confirms:**

Pendo is not a performance monitoring tool. Pendo's own published tech note states explicitly:
"Pendo is not designed for application performance monitoring." Page load latency (LCP, FCP, TTI,
TTFB) does not exist in Pendo's data model unless the engineering team manually instruments
`load_time_ms` as a custom Track Event. Even then, Pendo's aggregation API cannot compute averages
on numeric track event properties — statistical summaries require export to a data warehouse.
([support.pendo.io/hc/en-us/community/posts/9170285694491](https://support.pendo.io/hc/en-us/community/posts/9170285694491-Tech-Note-Should-I-use-Pendo-for-performance-monitoring-of-my-application))

**What Pendo can reliably supply for the Perception formula:**

- Active user counts (DAU/WAU/MAU) via `POST /api/v1/aggregation` against `pageEvents` source;
  unique `visitorId` counts available on any SDK version
- NPS scores via `aggregation` against `pollEvents` source (`quantitativeResponse` 0–10,
  `qualitativeResponse` text); two separate poll IDs required per survey
- Product Engagement Score (PES) via dedicated API endpoint: PES = (Adoption + Stickiness + Growth)
  / 3; available for any app with Core Events defined
  ([pendo.io/pendo-blog/introducing-the-product-engagement-score-api](https://www.pendo.io/pendo-blog/introducing-the-product-engagement-score-api-bring-the-power-of-pes-to-the-rest-of-your-business/))
- Session counts: available only on web SDK v2.282.0+ deployed after March 2025; older SDKs do not
  produce session data
  ([support.pendo.io/hc/en-us/articles/35771557376411](https://support.pendo.io/hc/en-us/articles/35771557376411-Web-analytics))

**Pendo App Health (beta, 2025):** Portfolio-level view showing NPS, PMF score, CSAT, UX-Lite,
visitor and account retention per app. This is the closest existing Pendo feature to what the
dashboard's Perception column attempts. However it is UI-only (no documented API), excludes all
infrastructure and performance signals, and shows side-by-side metrics rather than a formula-derived
single score.
([support.pendo.io/hc/en-us/articles/47667283513371](https://support.pendo.io/hc/en-us/articles/47667283513371-App-health-beta))

**Data export licensing:** Pendo Data Sync (Snowflake, S3, GCS) and webhook/API export are paid
add-ons to base licensing. Raw Pendo telemetry does not flow freely into a custom dashboard without
confirming this add-on is contracted.

**Rate limit opacity:** Pendo does not publish rate limit thresholds. 429 responses are returned on
breach with no backoff hints. For a multi-app portfolio, batch queries should be routed through
Pendo Data Sync rather than the aggregation API to avoid throttling.

**Practical Perception formula architecture:** The meeting named Pendo as the source but Pendo
cannot supply page-load timing without additional instrumentation. The defensible architecture is a
two-source weighted composite: Pendo provides user sentiment and engagement signals (NPS, active
user count, PES adoption component); Datadog provides performance and reliability signals (p95
latency, error rate, Apdex score). A backend aggregation layer computes the formula. This is a
scoping decision requiring dev effort and a data pipeline, not a configuration exercise.

---

### 3. Komodor Kubernetes Operational Dashboard

**What the research confirms:**

Komodor's publicly documented API surface (confirmed via Port Ocean integration, Terraform provider,
and Backstage plugin) exposes two entity types relevant to Phase 2:

- **komodorService:** `uid`, `kind`, `cluster`, `namespace`, `service` (workload name), `status`
  (e.g., `healthy`), `lastDeploy.endTime`, `lastDeploy.startTime`, `lastDeploy.status`, deep-link
  URL. The canonical identifier is a pipe-delimited composite:
  `WORKLOAD_KIND|CLUSTER_NAME|NAMESPACE_NAME|WORKLOAD_NAME`.
  ([docs.port.io/build-your-software-catalog/sync-data-to-catalog/kubernetes-stack/komodor/](https://docs.port.io/build-your-software-catalog/sync-data-to-catalog/kubernetes-stack/komodor/))
- **komodorHealthMonitoring:** `id`, `komodorUid`, `checkType` (e.g., `restartingContainers`),
  `status` (open/closed), `severity` (e.g., `medium`), `createdAt`, `lastEvaluatedAt`,
  `supportingData` (container restart counts and exit reasons).

**Integration pattern:** Komodor does not expose outbound webhooks for health state changes to
external consumers. The Phase 2 adapter must use REST polling (periodic GET calls), not an
event-driven pattern. Port Ocean and Backstage plugin both use this polling approach — it is the
validated industry pattern.
([github.com/komodorio/backstage-plugin-komodor](https://github.com/komodorio/backstage-plugin-komodor))

**Komodor-Datadog relationship:** The two systems are complementary, not redundant. Datadog answers
whether a service is degraded (error rate, latency, APM traces). Komodor answers why (what
deployment or config change preceded the degradation). Komodor receives Datadog monitor alerts as
inbound timeline events via Datadog's Webhook integration. Komodor does not transfer metric time
series to Datadog.
([docs.datadoghq.com/integrations/komodor/](https://docs.datadoghq.com/integrations/komodor/))

**Product direction risk:** As of late 2025, Komodor is investing in autonomous AI remediation
("Klaudia") and MCP-based agent extensibility. The product is optimizing for SRE autonomous
workflows, not BI/dashboard consumption. The Phase 2 adapter should be a thin extraction layer
designed to tolerate API schema additions without breaking.
([komodor.com/blog/komodor-introduces-autonomous-self-healing-capabilities](https://komodor.com/blog/komodor-introduces-autonomous-self-healing-capabilities-for-cloud-native-infrastructure-and-operations/))

**API access uncertainty:** Public review sources show conflicting information about whether
Komodor's API is available on all plan tiers ("no API" vs. confirmed API via Terraform provider).
API access may require an enterprise plan or sales engagement. This must be confirmed before Phase 2
sprint planning begins — it is a gating dependency.

**Inbound events opportunity:** Komodor's `POST https://api.komodor.com/mgmt/v1/events` endpoint
allows the dashboard to push business-operation timing events (User Perception signals) back into
Komodor service timelines, enabling SREs to see correlated business impact events alongside K8s
deployment events. This is an optional but high-value reciprocal integration.

---

### 4. AI/LLM Observability: Token Cost Tracking and Model Drift Monitoring

**What the research confirms:**

No single platform in 2025-2026 provides both per-feature token cost breakdown
(`DashboardDetailAiTokens`) and statistical drift scoring with PSI/JS/KS (`DashboardDetailAiDrift`).
These two tabs require two separate vendor tracks.

**Token cost tracking (AI Tokens tab):**

- **Datadog LLM Observability:** Span-level cost data with `model_name`, `model_provider`, `ml_app`
  as out-of-box tags; promotable custom cost tags for feature/team attribution.
  Path-of-least-resistance given Datadog is already in the stack. Starts at ~$160/month for 100K LLM
  spans.
  ([docs.datadoghq.com/llm_observability/monitoring/cost/](https://docs.datadoghq.com/llm_observability/monitoring/cost/))
- **Langfuse:** `cost_details{input, output}` and `usage_details{input, output}` per observation;
  per-model breakdown via `modelId` dimension; fully open-source self-hosted option available
  (preferred for HIPAA/data-residency reasons).
  ([langfuse.com/docs/observability/features/token-and-cost-tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking))
- **Azure APIM `llm-emit-token-metric` policy:** Best path if GPT models run through Azure AI
  Foundry; emits token metrics to Application Insights with 5 configurable custom dimensions;
  10-dimension-per-metric hard limit constrains granularity.
  ([learn.microsoft.com/en-us/azure/api-management/llm-emit-token-metric-policy](https://learn.microsoft.com/en-us/azure/api-management/llm-emit-token-metric-policy))

**Statistical drift scoring (AI Drift tab):**

- **Arize AX (commercial over Phoenix OSS):** GraphQL API returns PSI scores per model and
  per-feature JS/KS scores. PSI thresholds follow universal convention: < 0.10 stable, 0.10–0.25
  moderate, ≥ 0.25 significant — exactly matching the seed data values (`0.04` green, `0.18` amber).
  ([arize.com/blog-course/population-stability-index-psi/](https://arize.com/blog-course/population-stability-index-psi/))
- **WhyLabs + LangKit:** Supports PSI, Hellinger, KL Divergence, Jensen-Shannon algorithms per
  feature. Profile-based architecture (data summarized locally before sending) is designed for
  regulated data environments. No native token cost tracking.
  ([docs.whylabs.ai/docs/drift-algorithms/](https://docs.whylabs.ai/docs/drift-algorithms/))

**Schema validation:** Anton's `featureDrift[]{name, status, score, method}` shape (where `method`
is `'JS'` or `'KS'` and score is a string-formatted float) is structurally compatible with what
Arize AX, WhyLabs, and Evidently return. The seed data PSI values (`0.18` amber, `0.04` green) and
JS scores (`0.34` red, `0.22` amber, `0.08` green) precisely match industry-standard thresholds. No
schema rework is needed when real vendor data is integrated.

**OpenTelemetry/OpenInference:** Both Arize Phoenix and Langfuse consume OpenInference-formatted
spans (`llm.token_count.prompt`, `llm.token_count.completion`, `llm.model_name`, `llm.provider`). An
OTel collector architecture allows the team to switch cost vendors without re-instrumenting
application code. This reduces vendor lock-in and should be the recommended integration strategy.

**Healthcare/HIPAA note:** LangSmith cloud and Arize cloud would likely require BAA agreements and
data-residency review before production prompts from a US Health application can be sent to their
endpoints. Self-hosted Langfuse or Arize Phoenix are the lower-risk paths.

---

### 5. Internal Developer Portals and Service Catalogs as Comparables

**What the research confirms:**

The portfolio dashboard's two-level org-node/application tree with owner, tier, health, and incident
count is structurally identical to the canonical service catalog data model used by every major IDP:
Backstage (Domain/System/Component), Port (Team/Service), Datadog IDP (Team/Service). The structural
choice requires no justification to a technical reviewer.

**However, all evaluated IDPs are uniformly engineer-facing:**

- **Backstage:** Health data does not flow automatically; the Datadog plugin embeds dashboard URLs
  but collects zero native health metrics. A health rollup across the hierarchy requires custom
  plugin development. Self-hosted Backstage requires 3-12 dedicated engineers and $2M+ TCO over 3
  years.
  ([backstage.io/docs/plugins/observability/](https://backstage.io/docs/plugins/observability/))
- **Port:** Ingests 8 Datadog resource types natively (Monitors, Services, SLOs, SLO History,
  Service Metrics, Service Dependencies, Teams, Users) via API with webhook-based real-time sync.
  Scorecards track compliance over time. However, Port's content and workflows are entirely
  developer/platform-engineer-facing; no documentation addresses TPM or executive stakeholder UX.
  ([docs.port.io/build-your-software-catalog/sync-data-to-catalog/apm-alerting/datadog/](https://docs.port.io/build-your-software-catalog/sync-data-to-catalog/apm-alerting/datadog/))
- **Datadog IDP:** Natively ties ownership, on-call coverage, SLOs, monitors, RUM, and synthetic
  monitoring to each service entity. Closest off-the-shelf analog to the health dimension, but
  surfaces inside Datadog's own UI aimed at engineers, not a purpose-built stakeholder-facing
  surface.
  ([datadoghq.com/product/internal-developer-portal/](https://www.datadoghq.com/product/internal-developer-portal/))

**The business stakeholder gap is universal:** No IDP product addresses TPM or business-stakeholder
personas in its documented UX patterns. The User Perception dimension — business-operation timing as
a proxy for perceived health — has no direct analog in any evaluated IDP. This is the most
defensible differentiator for the bespoke dashboard.

**Market context:** Gartner's 2025 Market Guide notes consolidation toward commercial turnkey IDPs
driven by Backstage's maintenance burden. Spotify Portal for Backstage went GA October 2025 as
managed SaaS. For a healthcare-focused portfolio visibility tool with a non-technical stakeholder
audience, no commercial IDP is currently positioned to replace the proposed dashboard's value
proposition.

---

### 6. Business-Perception / UX Operational Scoring Approaches

**What the research confirms:**

No vendor ships a ready-made perception score that consumes Pendo page loads + Qualtrics NPS +
Salesforce feature-health in a single formula. Every major vendor (Dynatrace, Pendo, Gainsight,
Citrix, Catchpoint) treats composite UX scoring as customer-configured. The team must author its own
formula; this is normal industry practice with well-established templates to draw from.

**Apdex — the closest industry standard for latency-based perception:**

Formula: `Apdex = (Satisfied + Tolerating/2) / Total`, producing a 0–1 score. Satisfied = response ≤
T, Tolerating = T to 4T, Frustrated = > 4T or on error. Bands: ≥ 0.94 Excellent (green), 0.85–0.93
Good (green), 0.70–0.84 Fair (amber), < 0.70 Poor (red). Supported natively by Datadog APM with
configurable T thresholds per business transaction. Since Datadog APM is already in the stack, Apdex
is available immediately for any instrumented app — no new tooling required.
([apdex.org/wp-content/uploads/2020/09/Apdex_Technical_Specification.pdf](https://www.apdex.org/wp-content/uploads/2020/09/Apdex_Technical_Specification.pdf))

**Dynatrace User Experience Score — most production-ready vendor framework:**

Weighted sub-signals per session: User action (weight 3), Rage click (weight 2), Error (weight 1),
Crash (weight 5000). Thresholds recalibrate dynamically every 7 days using 30-day data. Bands:
Excellent 71-100 (green), Fair 41-70 (amber), Poor 1-40 (red). Requires RUM browser agent or mobile
SDK. For apps without front-end agents, Dynatrace Business Observability (Grail + OpenPipeline)
captures business events from API traffic without full browser instrumentation, then creates SLOs on
those metrics.
([docs.dynatrace.com/docs/observe/digital-experience/rum-concepts/scores-and-ratings/user-experience-score](https://docs.dynatrace.com/docs/observe/digital-experience/rum-concepts/scores-and-ratings/user-experience-score))

**Catchpoint DEX Score — useful three-component formula precedent:**

DEX = average of Endpoint Score (device CPU/RAM), Network Score (RTT, packet loss), Application
Score (errors, timeouts, load times). For non-instrumented enterprise apps, Catchpoint recommends
OS-level monitoring + API monitoring + multi-layered collection. The three-component
equally-weighted average is directly replicable: component 1 = infrastructure health (Datadog),
component 2 = API/business-operation timing (Apdex), component 3 = user satisfaction (NPS from
Qualtrics or feature adoption from Pendo).
([catchpoint.com/blog/catchpoint-digital-experience-score-is-an-industry-first](https://www.catchpoint.com/blog/catchpoint-digital-experience-score-is-an-industry-first))

**Composite SLO burn rate pattern (Nobl9/Datadog):**

Composite SLOs aggregate child SLOs with configurable weights. Burn rate:
`Burn Rate = Error Rate / (1 − SLO Target)`. Portfolio alert fires when burn rate exceeds 2x for 1
hour or remaining budget drops below 10%. Maps to green (burn rate < 1x), amber (1-2x), red (> 2x).
Implementable in Datadog using composite monitors or a custom pipeline pulling Datadog SLO APIs.
([nobl9.com/resources/shd-burnrate](https://www.nobl9.com/resources/shd-burnrate))

**IETF Health Check API draft — the `/ops/feature-health` contract spec:**

The IETF Internet-Draft `draft-inadarei-api-health-check-06` defines `application/health+json` with
status values `pass`/`warn`/`fail` and a `checks` object using `{componentName}:{measurementName}`
keys. This is the correct standard to adopt for the Salesforce feature-health endpoint contract
referenced in `detail.seed.ts:860`. The team should define which Salesforce features are components,
what measurement represents each component's health, the pass/warn/fail thresholds, and the endpoint
URL pattern.
([datatracker.ietf.org/doc/html/draft-inadarei-api-health-check-06](https://datatracker.ietf.org/doc/html/draft-inadarei-api-health-check-06))

**For apps without instrumentation — the Gainsight precedent:**

Gainsight validates that health scores can be built from accessible operational data without direct
product telemetry: Salesforce support case volume, case resolution time, CSAT scores, API call
volume, and NPS survey results are validated proxy metrics for user perception health in enterprise
B2B contexts.
([gainsight.com/blog/3-ways-to-structure-your-customer-health-score-no-usage-data-required/](https://www.gainsight.com/blog/3-ways-to-structure-your-customer-health-score-no-usage-data-required/))

**Recommended starting Perception formula template** (based on Catchpoint DEX + composite SLO
precedents):

```
Perception Score = (0.50 × Apdex_normalized) + (0.30 × NPS_normalized) + (0.20 × FeatureAdoption_normalized)
```

Where each component normalizes to 0–100. Thresholds: Green ≥ 75, Amber 50–74, Red < 50. Starting
weights to be calibrated after baseline data is collected. For apps without Pendo (no Feature
Adoption signal), fall to a two-signal formula or mark the field `Incomplete` until instrumentation
is added.

---

## Implications for the Product Brief

### Positioning

**This is not an IDP.** The brief should explicitly position the dashboard as a business-stakeholder
health layer that sits alongside, not competing with, IDPs. IDPs serve engineers and platform teams;
this dashboard serves TPMs, business operations leaders, and COO-level sponsors. The IDP answers "is
this service production-ready by engineering standards?"; the dashboard answers "are users of these
health apps experiencing degraded business operations?" when framing to Rami Assaad (the named COO
sponsor), this distinction preempts the "why not just use Backstage/Port?" challenge.

**The User Perception dimension is the primary differentiator.** No IDP, no observability platform,
and no vendor service catalog currently models business-operation timing or user-perception health
as a first-class signal for a non-technical stakeholder audience. Datadog RUM comes closest but
surfaces inside Datadog's engineer-facing UI. This is the genuine market gap the dashboard fills and
should be positioned as bespoke IP.

**The AI observability tabs are forward scope, not current scope.** `PolarisMetadata.json` declaring
`AIintegration: false` combined with fully rendered mock tabs means the UI contracts are in place
and proven, but no vendor API is connected. The brief must call this out explicitly as Phase 2+
scope to avoid stakeholder confusion about whether AI cost monitoring is live.

### Differentiators

1. **Dual-signal health model** (infrastructure health + user perception health) in a single
   portfolio view — no off-the-shelf product covers both for a business-stakeholder audience
2. **NOC wall optimization** (1920px+ primary breakpoint) — deliberate design for 24/7 operations
   staff, not a typical IDP or reporting tool use case
3. **Sev-1 incident command shell** — the three-step wizard (Identify → Notify → Confirm) with
   PagerDuty/Slack/Zoom integration points in the same surface as portfolio health visibility
4. **AI observability contracts** (AI Tokens + AI Drift tabs with PSI-aligned thresholds) —
   infrastructure is in place for a capability no current enterprise operational dashboard in this
   space has implemented

### Scope Guidance

**Phase 1 prerequisites before coding begins:**

- Confirm or establish the `service:<name>` Datadog Unified Service Tag for each of the 12 seeded
  applications — the CronJob's `monitorTags` filter depends on this
- Verify whether the US Health portfolio is single-org or multi-org in Datadog — multi-org requires
  per-org credential sets and fan-out logic
- Confirm Pendo web SDK version across all US Health apps — session count data (specifically named
  in the meeting) requires v2.282.0+; if older, fall back to unique `visitorId` counts from
  `pageEvents` aggregation
- Confirm Pendo Data Sync licensing — required for any batch export to the dashboard backend
- Confirm Komodor API tier access — conflicting public information about API availability by plan;
  this must be validated before Phase 2 sprint planning

**Perception formula — what Anton needs to decide:**

Anton owns the formula definition. The research surface suggests a practical V1 path: ship the
Perception field as Apdex-only (available immediately from existing Datadog APM, no new
instrumentation) for Phase 1, then layer in Pendo NPS and PES components in Phase 2 as data
pipelines are established. The continuous 0-100 SVG gauge already in the detail page and the
three-band summary column represent two inconsistent output encodings — one of these should be
designated canonical before the formula is defined.

**AI tabs — two-vendor architecture required:**

The brief must acknowledge a two-track integration: one vendor for token cost (Datadog LLM
Observability, Langfuse self-hosted, or Azure APIM policy, depending on where GPT models run) and
one vendor for statistical drift scoring (Arize AX or WhyLabs). OTel/OpenInference instrumentation
as the neutral contract layer reduces lock-in risk. For HIPAA compliance, self-hosted options
(Langfuse, Arize Phoenix OSS) should be evaluated before cloud-hosted alternatives.

**Two disjoint application datasets require explicit reconciliation decision:**

The flat `applications` collection (12 enterprise SaaS apps: SAP, Workday, ServiceNow, etc.) and the
portfolio tree (`FIBER`, `Beacon`, `Intellify`, `VIP`, etc.) share no IDs, no field schemas, and
have no join anywhere in the codebase. The brief must specify whether Anton intends to unify these
into one collection, keep them separate for different purposes, or replace the flat collection
entirely with the portfolio tree once Datadog integration is live.

**`/ops/feature-health` contract specification:**

The IETF `application/health+json` draft is the correct foundation for the per-app feature-health
endpoint contract referenced in `detail.seed.ts:860` and `docs/dashboard-architecture.md:624`. The
brief should include this as a required API interface specification so the Salesforce app team and
the dashboard team can develop independently.

### Risks

| Risk                                                                                  | Severity | Evidence                                                                    |
| ------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| Komodor API access may require plan upgrade                                           | High     | Conflicting public documentation; gating for all Phase 2 K8s signals        |
| Pendo session count requires SDK v2.282.0+ (March 2025)                               | High     | Confirmed in Pendo changelog; fallback degrades to proxy metric             |
| Pendo Data Sync is a paid add-on, not included in base license                        | High     | Confirmed in Pendo support docs; blocks all batch Pendo data pipelines      |
| User Perception formula is undefined — Perception field shows color with no grounding | High     | Anton explicitly deferred; code renders it live anyway                      |
| No single AI observability vendor covers both tabs                                    | Medium   | Confirmed across all evaluated platforms; two-vendor architecture required  |
| Cross-org Datadog visibility (beta, logs/metrics only) may block multi-org portfolios | Medium   | Cross-org monitors/SLOs not supported as of mid-2025                        |
| Datadog service tag names may not match `shortCode` values in seed data               | Medium   | `DD_SERVICE` is set by the monitored app, not the dashboard                 |
| AI observability vendor BAA/data-residency review required for US Health prompts      | Medium   | LangSmith cloud and Arize cloud would require review before production      |
| MSSQL config keys in schema with no repository — unknown planned entity               | Low      | `API_MSSQL_PW`, `API_MSSQL_DB_URL` in config schema; no MSSQL module exists |
| `prototype/demo.html` referenced in docs but absent from repo                         | Low      | `mvp-implementation-plan.md:542` — deleted, never committed, or renamed     |

---

## Open Questions

The following questions are unresolved by the current evidence base and require explicit decisions
before the respective phases can proceed:

1. **User Perception formula:** Which business-operation metrics feed the perception score (Pendo
   PES, Pendo NPS, Datadog Apdex, Salesforce feature-health endpoint, Qualtrics CSAT, or a
   composite)? What are the green/amber/red threshold boundaries? Is the canonical output a
   continuous 0-100 gauge or a direct three-band classification? The SVG gauge and summary table
   currently encode two different answers.

2. **Pendo instrumentation coverage for Mercer Wealth and Career apps:** Which apps in the full
   portfolio have Pendo installed? Which run SDK v2.282.0+? What is the fallback perception signal
   for apps without Pendo (Apdex-only, Salesforce support CSAT, or field marked `Incomplete`)?

3. **Two disjoint application datasets:** Are the flat `applications` collection and the portfolio
   tree intended to coexist, be unified, or is the flat collection a deprecated scaffold? No join or
   ID mapping exists between them anywhere in the codebase.

4. **Datadog org topology:** Is the US Health app portfolio instrumented in a single Datadog org or
   spread across multiple orgs? Single-org requires one credential set; multi-org requires per-org
   fan-out and multiplies the CronJob complexity.

5. **Komodor API tier:** Does MMC's current Komodor plan include API access, or does Phase 2 require
   a plan upgrade or enterprise contract negotiation?

6. **MSSQL data source:** What entity did Anton plan to store in SQL? Candidates include Planview
   project data, historical uptime time-series, or audit logs. The config schema declares the keys
   but no repository exists.

7. **AI observability vendor selection:** Which vendor covers the AI Tokens tab (Datadog LLM
   Observability, Langfuse self-hosted, or Azure APIM policy)? Which vendor covers the AI Drift tab
   (Arize AX, WhyLabs, or Evidently)? Are the GPT models running through Azure AI Foundry (which
   would make the APIM policy the path of least resistance)?

8. **AI tab app scope:** Are the AI Tokens and AI Drift tabs intended to render for all monitored
   applications, or only for apps with known AI sub-features (currently only FIBER-branded apps are
   seeded)? The tab exists on the generic detail page template, implying it would render for any app
   detail view.

9. **`Rami Assaad` (COO in portfolio seed root):** Is this a real MMC executive? If so, the
   dashboard was designed for C-level presentation, which raises the reliability and polish bar
   significantly beyond an internal ops tool.

10. **Upstream design document referencing React and PostgreSQL/TimescaleDB:**
    `mvp-implementation-plan.md:549` references an earlier design doc with different technology
    choices not in the repo. Does this document contain additional scope, stakeholder requirements,
    or UX decisions that shaped Anton's design but are not reflected in the committed artifacts?
