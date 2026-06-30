---
title: 'Operational Dashboard — Phase 1 (Live Health)'
status: final
created: 2026-06-13
updated: 2026-06-16
---

# PRD: Operational Dashboard — Phase 1 (Live Health)

_Working title — confirm._

## 0. Document Purpose

This PRD is for the delivery team (Bernardo, Iader) and the stakeholders returning to the project
(Anton as owner, Prashant/Nemi as points of contact, Rami as sponsor). It defines **Phase 1 only** —
the work to complete while Anton is on vacation so that, on his return, the dashboard's Health
signal runs on live Datadog telemetry instead of static data. It is capability-focused: vocabulary
is anchored in §3 Glossary, features are grouped with globally numbered FRs nested under them, and
inferences are tagged `[ASSUMPTION]` inline and indexed in §9. It builds on the finalized product
brief, addendum, creator intent dossier, and market research in `_bmad-output/planning-artifacts/`;
the Crawler solution-design lives in
`_bmad-output/planning-artifacts/architecture/crawler-solution-design-2026-06-13.md`. Technical
"how" (Datadog API shapes, perception formula template) lives in those documents and is not
duplicated here — but the **data contract** the Crawler writes and the dashboard reads is specified
in §G, because that is product-level, not implementation detail.

> **2026-06-16 reconciliation.** This PRD has been updated in place against a **working, live-tested
> implementation** plus five meeting transcripts from this session. Several Phase-1 open questions
> are now resolved and several requirements were superseded by what the build proved. The
> substantive deltas: the application→Datadog bridge is **automatic** via two identifiers already
> present on both sides (no manual Service-ID curation — see §4.2); ingestion is a **bulk-fetch
> snapshot crawler**, not per-app polling (see §4.1); the Portfolio Tree roots at **OpCo → Business
> Unit → LOB** from PlanView's own structured fields (see §4.3); **coverage reality is 651 of 3656
> apps monitored** today, and creating monitors is the **owning app team's** job, not the dashboard
> team's (see §4.2 / §7); **number-of-active-users is confirmed OUT**; and the **User-Perception
> mechanism is now defined** (thresholds still TBD with Raja/Tanu — see §4.4). Resolved open
> questions are struck through in §8 with their resolution; superseded `[ASSUMPTION]`s are annotated
> in place rather than deleted, to preserve the audit trail.

## 1. Vision

The Operational Dashboard tells TPMs and business stakeholders in the US Health portfolio whether
their applications are healthy — in their own surface, not an engineer's. A working prototype
already proves the experience on static data. Phase 1 makes the Health half real: every
application's status, history, uptime, and error budget is computed from live Datadog telemetry,
refreshed on a schedule, and read straight from the database by the dashboard.

Phase 1 is intentionally narrow. It does not attempt the User Perception score (the product's
eventual differentiator), Komodor, or Pendo. It earns trust by replacing the single most visible
piece of fiction — the Health traffic light — with ground truth, and by reorganizing the portfolio
the way the sponsor asked. Done well, it turns a convincing demo into a tool the business can
actually rely on, and sets up Phase 2 (perception, Komodor, Pendo) on solid foundations.

## 2. Target User

### 2.1 Jobs To Be Done

- **As a TPM / business stakeholder**, I want to see at a glance whether the apps in my US Health
  portfolio are healthy, and drill into what is wrong, without asking an engineer or learning
  Datadog.
- **As the delivery team (operator)**, I want to map each application to its Datadog telemetry and
  trust that the dashboard reflects live data, so I can hand a credible tool back to Anton.
- **As the sponsor (Rami)**, I want the portfolio organized by business unit so the view matches how
  the org is run.

### 2.2 Non-Users (v1)

- End customers/users of the monitored applications — they never see this dashboard.
- Engineers who already work in Datadog/Grafana — Phase 1 does not replace their tools; it
  aggregates a business-facing read on top.
- Anyone needing User Perception data — deferred to Phase 2.

### 2.3 Key User Journeys

- **UJ-1. Tara, a TPM in US Health, catches a degraded app before the business escalates.**
  - **Persona + context:** Tara owns delivery outcomes for several US Health apps; she is not
    technical and does not have Datadog access.
  - **Entry state:** authenticated via Okta SSO, viewing the dashboard on her browser (and on the
    NOC wall).
  - **Path:** she sees the portfolio as an OpCo → BU → LOB tree → IntelliFi shows **amber** Health
    under its Mercer LOB → she drills into IntelliFi → sees the health timeline dipped in the last
    few hours, uptime down from 99.9% to 98.1%, error budget partly burned.
  - **Climax:** she knows _which_ app is degraded and _that the data is live_ (a last-synced
    timestamp confirms it), without opening Datadog.
  - **Resolution:** she pings the app team with specifics instead of "is something wrong?". Realizes
    the Health half of the product's promise.

- **UJ-2. An app team stands up monitors so an unmapped application's Health goes live.**
  - **Persona + context:** Iader, on the delivery team, is operating and auditing the automatic
    application-to-Datadog bridge — he does not hand-curate identifiers.
  - **Entry state:** an as-yet-unmonitored Application shows an **unmapped/grey** state because it
    genuinely has **no Datadog monitors** (its `app_short_key` resolves to no monitors and its
    ServiceNow key is null).
    `[UPDATED 2026-06-16: this was previously framed as "Application Service ID blank in PlanView." The build proved the bridge is automatic and that the gap is missing monitors, not a missing curated ID. IntelliFi — earlier believed to lack monitors for the same reason — was actually mapped GREEN at 99.99% uptime once resolved via app_short_key. Beacon is NO LONGER the example here: the Raja sync (2026-06-16) confirmed Beacon DOES have monitoring — see Open Q12 (coordinate with Juan for Beacon's app_short_key/mapping).]`
  - **Path:** the owning app team / SRE creates Datadog monitors tagged with the standard
    `app_short_key` (and, where applicable, `app_service_id`) → the next Crawler snapshot run
    resolves those monitors automatically via the dual-tag bridge, with **no curation step** and no
    dashboard-team code change.
  - **Climax:** the Application's Health flips from unmapped/grey to a live green/amber/red status
    with real uptime and error budget.
  - **Resolution:** the portfolio's mapped-coverage moves closer to complete as **teams add
    monitors**; the dashboard _surfaces_ monitoring coverage, it does not create it. Unmapped apps
    remain explicitly visible as data-quality gaps. Realizes part of UJ-1's promise for every app.

## 3. Glossary

- **Application** — A monitored software product in the portfolio (e.g. IntelliFi, Beacon, FIBER,
  VIP). Has metadata from PlanView and, when monitored, telemetry from Datadog.
- **Portfolio Tree** — The hierarchical view of the portfolio. In Phase 1 it roots at **Operating
  Company (OpCo) → Business Unit → Line of Business (LOB) → Applications**, derived from PlanView's
  own structured fields.
  `[UPDATED 2026-06-16: previously rooted directly at Business Unit; the build preserves PlanView's full OpCo/BU/LOB hierarchy. See §4.3.]`
- **Operating Company (OpCo)** — The top-level grouping node of the Portfolio Tree, taken from
  PlanView's `OpCo` field (e.g. Mercer, Marsh, Oliver Wyman, Guy Carpenter, CIS, MMC).
- **Business Unit (BU)** — A mid-level grouping node beneath OpCo, derived from PlanView's
  structured portfolio fields (e.g. `BusinessDeliveryPortfolioName`).
  `[UPDATED 2026-06-16: no longer the tree root and no longer a hardcoded "US Consulting" bucket — it is read from the source's structured identifiers.]`
- **Line of Business (LOB)** — The grouping node beneath Business Unit, also derived from PlanView's
  structured fields; Applications hang beneath their LOB. Rami's requirement was explicitly "group
  by LOB, not TPM."
- **Health** — The infrastructure/operational signal for an Application, expressed as a **Health
  Status**. One of the two signals the product shows (the other, User Perception, is out of Phase 1
  build scope).
- **Health Status** — A green / amber / red classification of an Application's current operational
  state, computed from Datadog monitors. A **mapped** Application with no monitor data resolves to
  amber (No Data); an **unmapped** Application (no resolvable Datadog identifier / no monitors) is a
  distinct grey state — see Glossary "Unmapped".
- **Unmapped** — The state of an Application that has no resolvable Datadog telemetry — its
  `app_short_key`/`app_service_id` match no monitors (typically because the app simply has no
  monitors yet). Rendered distinctly **(grey)**, never green and never a false amber. Distinct from
  No Data (which is a mapped Application returning no monitor data).
  `[UPDATED 2026-06-16: redefined from "no curated Service ID / no namespace+name fallback" to "no monitors resolvable via the automatic dual-tag bridge."]`
- **Health Timeline** — The historical record of an Application's Health Status over a time window.
- **Uptime** — The proportion of a window an Application was available, derived from Datadog SLO
  history (24h / 7d / 30d).
- **Error Budget** — The remaining allowance of unreliability against a target, derived from Datadog
  SLOs.
- **The Crawler** — The scheduled job that pulls telemetry from Datadog as a **bulk-fetch snapshot**
  and writes computed Health results to the database, resolving every Application from that snapshot
  with purely local lookups (zero per-app Datadog calls). A Kubernetes CronJob triggers it on a
  schedule; nobody runs it by hand. The dashboard reads only the database, never Datadog directly.
  `[UPDATED 2026-06-16: snapshot model, see §4.1.]`
- **app_short_key** — The **primary** bridge identifier. A Datadog tag whose value equals the
  Application's PlanView CAST key (`castKey`, == shortCode). Present on ~646 apps. Validated as the
  primary per-app bridge. `[NEW 2026-06-16.]`
- **app_service_id** — The **fallback** bridge identifier. A Datadog tag whose value equals the
  Application's PlanView ServiceNow key (`serviceNowKey`, format `SNSVC#######`). Present on ~387
  apps; null for some apps (e.g. IntelliFi), which is why a ServiceNow-key-only view wrongly looked
  monitor-less — those apps resolve via the **primary** `app_short_key` instead.
  `[NEW 2026-06-16; the Raja-sync re-confirmed live that the ServiceNow key is "often null," which is exactly why `app_service_id`is only the fallback and`app_short_key` is primary.]`
- **Datadog Monitor** — A Datadog-side check whose state contributes to an Application's computed
  Health Status. Created and owned by the **application's own team / SRE**, not by the dashboard
  team.
- **Demo Mode / Real Mode** — The prototype's toggle between dummy portfolio data (Demo) and live
  PlanView project data filtered by IT owner (Real).
- **User Perception** — The product's second signal: how long the 2–4 operations users _really_
  perform take versus a baseline (the "bank analogy": an app can be up yet feel broken when a key
  operation is far slower than baseline). **Mechanism now defined; thresholds/values still TBD**
  with Raja + Tanu. Out of Phase 1 build scope except for discovery (§4.4).

## 4. Features

### 4.1 Live Health Ingestion ("the Crawler")

**Description:** A scheduled job, the Crawler, pulls health telemetry from Datadog as a **single
bulk-fetch snapshot** per run, then computes Health Status / Uptime / Error Budget for every
Application from that snapshot using **purely local lookups — zero Datadog HTTP per Application** —
and writes the results to the database. The dashboard reads only from the database, fully decoupled
from ingestion. The Crawler runs as a single scheduled execution — deliberately **not** an in-app
background timer, because the application runs in multiple replicas whose near-aligned clocks would
fire duplicate, concurrent writes against the same database. A Kubernetes CronJob (`apps/crawler`)
triggers `POST /api/v1/internal/sync/datadog` (shared-secret guarded) on a schedule; nobody runs it
by hand, and the dashboard reads only Mongo. Realizes UJ-1, UJ-2.

`[BUILD/BRANCH STATE 2026-06-16: the sync logic + internal token-guarded endpoint `POST
/api/v1/internal/sync/datadog`live in`apps/api`and are DONE/validated; committed on branch`feature/datadog-live-health`(commit`fc8f6da`), excluding `apps/crawler`+ local-dev-only files. The separate`apps/crawler` K8s CronJob (the auto-trigger) is BUILT but HELD OUT of the commit/branch pending Bernardo's (Bernie's) validation that a CronJob is the right trigger approach (Open Q4-bis). Scale throughout is 3656 apps / 651 mapped.]`

`[UPDATED 2026-06-16: ingestion changed from per-app polling to a bulk-fetch snapshot. The build proved per-app polling issued ~3656+ Datadog calls/run and tripped 429 rate limits (live: 13 failures, only 521/651 mapped). One run now: page GET /api/v1/monitor once for ALL monitors (indexed by every tag); page GET /api/v1/slo once (keeping only app_short_key / app_service_id-tagged SLOs); fetch each kept SLO's 24h/7d/30d history under bounded concurrency (6) with 429 backoff honoring Retry-After; then resolve every app locally. Live result: 3656/3656 fetched, 0 errors, 651 mapped, ~157s. Implementation: apps/api/src/datadog/{datadog-snapshot.ts, real-datadog-client.ts (loadSnapshot), datadog-sync.service.ts (local resolve), datadog-client.ts, datadog.types.ts}.]`

`[ASSUMPTION: the prototype's two-signal model and detail fields (uptime, error budget, timeline) are kept; Phase 1 fills them with live data rather than redesigning them.]`

**Functional Requirements:**

#### FR-1: Scheduled health ingestion (bulk-fetch snapshot)

The Crawler runs on a configurable interval, retrieves telemetry from Datadog as **one bulk-fetch
snapshot per run** (all monitors paged once; SLOs paged once, keeping only
`app_short_key`/`app_service_id`-tagged SLOs; each kept SLO's 24h/7d/30d history fetched under
bounded concurrency with 429 backoff), then resolves and computes Health for every Application from
that snapshot with **no per-Application Datadog calls**, and writes the results to the database.
**Consequences (testable):**

- A single Crawler execution per scheduled tick regardless of how many dashboard replicas are
  running (no duplicate concurrent writes).
- The interval is configurable without code changes; a value in the 5–15 minute range is acceptable
  for the PoC.
- The number of Datadog HTTP calls per run scales with the **monitor/SLO catalog size**, not with
  the Application count — resolving an Application issues **zero** Datadog requests.
  `[UPDATED 2026-06-16: replaces the prior per-app retrieval, which tripped Datadog 429s.]`
- 429 responses during the bounded-concurrency SLO-history fetch are retried honoring `Retry-After`.
- A Crawler run that starts while telemetry for some Applications is unavailable still completes and
  persists results for the Applications it could resolve.

#### FR-2: Compute overall Health Status per Application

For each mapped Application, the system derives a green/amber/red Health Status from its Datadog
Monitors using a worst-state-wins rollup. **Consequences (testable):**

- Given monitor states, the rollup resolves to the most severe (red > amber > green).
- **No Data is AMBER (product decision):** a _mapped_ Application whose Datadog Monitors return no
  data resolves to amber. This is distinct from **Unmapped** (FR-10), which applies to an
  Application with no resolvable Datadog identifier and renders in its own grey state. An
  Application is either mapped (green / amber / red, including No-Data→amber) or Unmapped — never
  both. (Datadog API shape: see brief addendum.)
- The dashboard read surfaces `healthStatus` **only for mapped Applications** (gated on
  `datadogMapped`), so an unmapped Application stays **grey**, never a false amber.
  `[UPDATED 2026-06-16: hardening proven in the build.]`
- An **unknown / unrecognized** monitor state rolls up to **AMBER** as a fail-safe (never silently
  green). A non-array Datadog monitors body **throws** rather than being laundered into AMBER, so a
  Datadog outage cannot masquerade as a degraded-but-known signal.
- The Health Status shown in the dashboard equals the value computed from Datadog at the last
  successful sync — never a static seed value.

#### FR-3: Health Timeline

The system records and displays an Application's Health Status history over a time window.
**Consequences (testable):**

- The detail view renders a timeline reflecting status changes observed across Crawler runs.
- The window respects Datadog's ~2-week retention limit; older history is not fabricated. Longer
  history, where shown, is built from the Crawler's own accumulated records, not back-filled from
  Datadog.

#### FR-4: Uptime

The system computes and displays per-Application Uptime derived from Datadog **SLO history**.
**Consequences (testable):**

- Uptime is sourced from each mapped SLO's **24h / 7d / 30d** history windows, populated from live
  data.
  `[UPDATED 2026-06-16: the snapshot crawler fetches 24h/7d/30d SLO history; ~190 of the 651 mapped apps carry real SLO-backed uptime today.]`
- The dashboard read surfaces `uptime30d` for mapped Applications; windows that an Application's
  SLOs cannot source are shown as "not available," never fabricated.
- **90d caveat (Open Q9, still open):** Datadog's ~2-week retention and the 24h/7d/30d SLO windows
  cannot directly source a 90-day figure. Phase 1 either omits 90d uptime or derives it from
  Crawler-written history; decide before story authoring. Windows that cannot be sourced are shown
  as "not available," never fabricated.

#### FR-5: Error Budget

The system computes and displays per-Application Error Budget derived from Datadog SLOs.
**Consequences (testable):**

- When an Application has a corresponding Datadog SLO, remaining Error Budget is shown; when it does
  not, the field is explicitly "not available," not zero or blank.
- An SLO with a target of **100% (or ≥100)** is guarded — it cannot produce a divide-by-zero or
  nonsensical error-budget figure.
  `[UPDATED 2026-06-16: error-budget target<100 guard proven in the build.]`

#### FR-6: Dashboard reads Health from the database

The dashboard renders Health exclusively from database values written by the Crawler, never by
calling Datadog directly. **Consequences (testable):**

- With the Crawler stopped, the dashboard still serves the last persisted Health data (degrades to
  stale, not broken).
- No dashboard request path calls the Datadog API synchronously.

#### FR-7: Ingestion observability and freshness

The system records the outcome and timestamp of each Crawler run and exposes data freshness to the
user. **Consequences (testable):**

- The last successful sync time is visible to the user (supports UJ-1's "the data is live"
  confidence).
- Failed or partial runs are recorded with enough detail for the operator to diagnose.
- Each run record carries, per Application, the resolution path used: `primary` (resolved via
  `app_short_key`) | `fallback` (resolved via `app_service_id`) | `unmapped` (supports FR-9
  auditing). `[UPDATED 2026-06-16: the paths now name the concrete bridge identifiers.]`

**Feature-specific NFRs:** Crawler writes must be idempotent (a re-run for the same window does not
corrupt or double-count). The `applyHealthUpdate` write path persists via a Mongo `$set` of only the
health fields, so a crawler write **never clobbers** `name` / `tier` / `statusOverride`. Datadog
credentials are stored as a Kubernetes secret, never in code or config. The internal sync endpoint
is shared-secret guarded with a **timing-safe** token comparison.
`[UPDATED 2026-06-16: write-path and auth hardening proven in the build.]`

### 4.2 Application-to-Datadog Mapping _(automatic dual-tag bridge)_

**Description:** The application→Datadog bridge is **automatic**, not manually curated. Two
identifiers already present on **both** sides connect each Application to its telemetry: Datadog tag
**`app_short_key`** == PlanView CAST key (`castKey`, == shortCode), and Datadog tag
**`app_service_id`** == PlanView ServiceNow key (`serviceNowKey`, format `SNSVC#######`). The
resolver tries `app_short_key` first (**primary**; uses `shortCode`, or a `datadogServiceId`
override when set) and falls back to `app_service_id` (**fallback**; uses `serviceNowKey`). No
stored per-app service ID, no manual curation step, and **no namespace+app fallback**. Unmapped
Applications are surfaced honestly so coverage is truthful. Realizes UJ-2.

`[UPDATED 2026-06-16: this section previously assumed manual curation of a blank Application Service ID plus a namespace+name fallback. The build replaced both with the automatic dual-tag bridge. Validated exhaustively by a brute-force coverage probe over all 104 Datadog tag namespaces × all PlanView id fields: only `app_short_key`↔`castKey`(646 apps) and`app_service_id`↔`serviceNowKey`(387 apps) are valid per-app bridges (cardinality ≈ one value per app). Everything else —`business_unit`(7 values),`team`, `service`, `servicenow_chg`(CHANGE tickets) — is group-level or coincidental and MUST NOT be used as an app bridge. Correction proven live: Intellify (and apps like it) were wrongly believed monitor-less because only the ServiceNow key was being checked, and that key is null for them; Intellify actually HAS monitors under`app_short_key` (live: GREEN, 99.99% uptime).]`
`[UPDATED 2026-06-16 (Raja sync): Beacon is no longer cited as "has no monitors." Beacon monitoring DOES exist — coordinate with Juan for Beacon's `app_short_key`/mapping (Open Q12). The general point stands for genuinely unmonitored apps: where monitors are absent, the owning team must create them.]`

**Functional Requirements:**

#### FR-8: Automatic application↔Datadog bridge (no manual curation)

The system resolves each Application to its Datadog telemetry **automatically** from identifiers
already on both sides: `app_short_key` (primary, == `shortCode` or a `datadogServiceId` override)
then `app_service_id` (fallback, == `serviceNowKey`). No operator step is required to map an
Application. **Consequences (testable):**

- An Application whose `shortCode` matches a Datadog `app_short_key` tag is resolved on the next
  Crawler run with **no human action**.
- When `app_short_key` does not resolve, the system tries `app_service_id` == `serviceNowKey`; if
  neither resolves, the Application is Unmapped (FR-10).
- Only `app_short_key`↔`castKey` and `app_service_id`↔`serviceNowKey` are used as bridges;
  group-level tags (`business_unit`, `team`, `service`, `servicenow_chg`, etc.) are never used to
  map an Application.
  `[UPDATED 2026-06-16: replaces FR-8's prior "operator sets Application Service ID" requirement; an optional `datadogServiceId` override exists for edge cases but is not the mapping mechanism.]`

#### FR-9: Fallback bridge identifier

When `app_short_key` does not resolve an Application, the system attempts resolution via the
`app_service_id` tag (== PlanView `serviceNowKey`). **Consequences (testable):**

- An Application with no `app_short_key` match but a valid `app_service_id` == `serviceNowKey` still
  yields a Health Status from monitors/SLOs carrying that tag.
- The fallback path is distinguishable from the primary path in the Crawler run records (FR-7) —
  each Application's resolution path is recorded as `primary` (app_short_key) | `fallback`
  (app_service_id) | `unmapped` — so coverage quality is auditable.
  `[UPDATED 2026-06-16: the fallback is the `app_service_id` tag, not a namespace+application-name combination.]`

#### FR-10: Surface unmapped Applications

The system makes Applications it cannot resolve in Datadog explicitly visible as a data-quality
state, rather than showing them as healthy. **Consequences (testable):**

- An unresolved Application renders in a distinct **grey** Unmapped state, never green and never a
  false amber (the dashboard read gates `healthStatus` on `datadogMapped`).
- The set of Unmapped Applications is enumerable for the operator.
- An Application being Unmapped reflects **missing monitors**, which is the owning app team's /
  SRE's gap to close (see §4.2 coverage reality), not a mapping defect the dashboard team fixes.
  `[UPDATED 2026-06-16.]`

#### Coverage reality (2026-06-16)

**651 of 3656 Applications** have Datadog monitors today: GREEN 561, AMBER 49, RED 41; ~190 carry
real SLO-backed uptime. The remaining ~3000 Applications simply **have no monitors** — they resolve
to Unmapped/grey. **Creating monitors is the owning application team's / SRE's job, NOT the
dashboard team's.** The dashboard **surfaces** monitoring coverage; it does not create it. Mapping
coverage therefore grows as teams instrument their apps, not as the dashboard team curates
identifiers. `[NEW 2026-06-16: this is the honest denominator behind SM-2; see §7.]`

### 4.3 OpCo → BU → LOB Portfolio Tree

**Description:** Per Rami ("group by LOB, not TPM"), the Portfolio Tree is reorganized to a
**Business-aligned hierarchy rooted at Operating Company**: root → **Operating Company** (Mercer /
Marsh / Oliver Wyman / Guy Carpenter / CIS / MMC) → **Business Unit** → **Line of Business** →
Applications. The grouping is derived from **PlanView's own structured fields** that the loader
preserves (`OpCo`, `BusinessDeliveryPortfolioName`), **not** a hardcoded taxonomy and **not**
regex-bucketing. Realizes UJ-1.
`[UPDATED 2026-06-16: was "root becomes Business Unit; scattered LOBs merged into a single 'US Consulting' bucket." That single-bucket model and an earlier regex-bucketing spike were throwaways — replaced by the source's structured identifiers.]`
`[ASSUMPTION: this reorganization applies to the Real-Mode data shaping; the Demo prototype tree serves as the target shape.]`

**Principle:** use the source's structured identifiers; **no business logic / taxonomy in the
repository.**

**Functional Requirements:**

#### FR-11: OpCo-rooted, BU/LOB-nested tree

The Portfolio Tree presents **Operating Company** as the top-level node, then **Business Unit**,
then **Line of Business**, with Applications grouped beneath their LOB. **Consequences (testable):**

- The root level shows Operating Companies (Mercer / Marsh / Oliver Wyman / Guy Carpenter / CIS /
  MMC), not person/TPM names.
- Beneath each OpCo, nodes are Business Units and then LOBs, reflecting the org structure rather
  than a TPM grouping. `[UPDATED 2026-06-16: previously the root was Business Unit.]`

#### FR-12: Grouping derived from PlanView structured fields

The tree's OpCo / BU / LOB nodes are derived from PlanView's own structured fields (e.g. `OpCo`,
`BusinessDeliveryPortfolioName`) that the loader preserves — not from a hardcoded mapping table and
not from name-pattern bucketing. **Consequences (testable):**

- An Application is placed under the OpCo / BU / LOB indicated by its PlanView structured fields,
  with no per-Application hardcoding and no regex bucketing in the repository.
- Changing how an Application is grouped is done at the **source** (PlanView fields), not by editing
  a taxonomy in code.
  `[UPDATED 2026-06-16: supersedes the prior "LOB normalization table maps scattered values into 'US Consulting'." Open Q10 (table storage) is therefore moot — there is no normalization table; the source fields are authoritative.]`

#### FR-13: Real-Mode visibility of assigned projects

In Real Mode, the tree populates from PlanView project data filtered by IT owner; development can
impersonate an IT owner (Anton or Jory) to view assigned projects. **Consequences (testable):**

- With impersonation of a known IT owner, the tree is non-empty and shows that owner's assigned
  Applications.
- IT-owner context is supplied as an explicit input (query param or impersonation header/claim —
  confirm mechanism) and is the only input to the filter; Phase 1 applies no fallback to the
  authenticated user's identity.
- Without a valid IT-owner context, the Real-Mode list is empty (expected) rather than erroring.
  `[ASSUMPTION: Phase 1 keeps IT-owner filtering as-is; a real per-user RBAC model is deferred.]`

### 4.4 User Perception Scenario Discovery _(mechanism defined; discovery of values only — no build)_

**Description:** A documented catalog of the business scenarios that define User Perception for
IntelliFi and Beacon, produced with the business (Raja, with Tanu as the IntelliFi-specifics
contact) while Anton is out. The **mechanism is now defined** (below); the **values** (which
operations, baselines, thresholds) remain discovery. Phase 1 **defines**, it does not build.

**Defined mechanism (the "bank analogy").** Per Application, identify the **2–4 operations users
_really_ perform** (IntelliFi: upload census file; generate a specific report). For each operation,
identify the **backing API** and set a **response-time threshold** against a **baseline**. If actual
response time is **far above** baseline (e.g. baseline 8.1s, actual 47s), perception is
**`critical`** _even when Health is green_ — an app can be up yet feel broken. The perception screen
shows, per operation: **operation / current response time / baseline / ok-vs-critical**. It lives in
a **separate tab, after Overview + Health**.
`[NEW 2026-06-16: mechanism defined this session; thresholds/baselines/operation selection are still TBD, owned by Raja + Tanu.]`

**Functional Requirements:**

#### FR-14: Perception Scenario Catalog

The team produces a written catalog of candidate User Perception scenarios per target Application,
each with its operation, **its backing API**, the metric, an expected baseline, draft thresholds (ok
vs. critical), and a candidate data source. **Consequences (testable):**

- A catalog exists covering IntelliFi and Beacon, including at least the known candidates (IntelliFi
  census-file upload time, report-generation time; dashboard load time; Beacon "save session" time),
  each tied to its backing API.
- Each entry names a candidate data source (e.g. operation-timing logged to Datadog vs. Pendo) and
  flags the open Datadog-logs-vs-Pendo decision.
- Each entry follows the defined mechanism: operation → backing API → baseline → threshold →
  ok/critical, independent of Health (a green-Health app can still be `critical` on perception).
- The catalog is an input to Phase 2; **no perception computation, score, or UI is built in
  Phase 1.**
  `[ASSUMPTION: FR-14 is a documentation deliverable owned by Iader + Raja (+ Tanu for IntelliFi specifics), not an engineering change — included here so Phase 1's parallel discovery work is tracked.]`

**Notes:**
`[NOTE FOR PM: the detail page already renders a continuous 0–100 perception gauge AND a three-band light (detail-page.data.ts has perceptionScore alongside perception:'amber') — these two encodings disagree; the catalog work should recommend a single canonical encoding for Phase 2. Tracked as Open Q5.]`

## 5. Non-Goals (Explicit)

- **Not building User Perception** — no score, formula, computation, or new UI in Phase 1 (discovery
  catalog only).
- **Not integrating Komodor** — Phase 2 (and gated on confirming API-tier access).
- **Not integrating Pendo** — Phase 2 (page-load and active-user metrics).
- **Not computing number of active users — confirmed OUT.** Datadog exposes no such metric (no
  standard cross-app logging, no Datadog RUM license). Anand's direction: **discard that card and
  replace it with a meaningful one** sourced from what Datadog actually exposes.
  `[UPDATED 2026-06-16: resolves Open Q2 as OUT.]`
- **Not building the AI Tokens / AI Drift tabs** — forward scope; drift is
  acknowledged-but-undefined.
- **Not wiring the Sev-1 incident wizard backend**, and **no action that changes infrastructure** —
  Phase 1 is informational only (see §Constraints).
- **Not becoming another Grafana/Datadog** — this is a business-stakeholder read, not an engineer's
  observability console.
- **Not automating PlanView ingestion** — the project-metadata export stays manual (JSON via
  Dremio).

## 6. MVP Scope

### 6.1 In Scope

- Live Health Status, Health Timeline, Uptime, and Error Budget from Datadog via the **bulk-fetch
  snapshot** Crawler (§4.1).
- **Automatic** Application-to-Datadog dual-tag bridge with fallback and unmapped-visibility (§4.2).
- **OpCo → BU → LOB** Portfolio Tree derived from PlanView structured fields (§4.3).
- User Perception scenario discovery catalog for IntelliFi and Beacon (§4.4, documentation only;
  mechanism defined, values TBD).
- Dev-region deployment; branches + PRs.

**Phase-1 priority & delivery status (Anand).** The immediate priority was **Overview + Health tabs
from REAL Datadog data** for the US Consulting apps (Fiber, Beacon, VIP, IntelliFi) — "something
real" for Anand's demo to Rami. **Delivered** this session (live: 3656/3656 fetched, 0 errors, 651
mapped). `[NEW 2026-06-16.]`

**Card flexibility (Anand → devs).** The devs have full flexibility to choose the Overview/Health
cards from whatever Datadog actually exposes (uptime, incidents-in-last-30-days, etc.). Bernardo
(senior) decides the key cards; the first sliver shows what Datadog gives and is fine-tuned later.
The retired number-of-active-users card is replaced under this latitude. `[NEW 2026-06-16.]`

**Live-vs-placeholder cards — the distinction is per COLUMN, not per app (Raja sync 2026-06-16).**
Raja confirmed live-vs-dummy at the **card level**: on the Overview, only **Health** and **Uptime**
are live from Datadog (for mapped apps); the other ~7 cards are still dummy. Each portfolio row is
assembled in `toPortfolioApp` (`apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`): Health
(`datadogMapped && healthStatus`) and Uptime (`uptime30d`) are LIVE; **Perception** (`'undefined'`),
**Active Users** (`null`), **Incidents** (`0`), **Last Incident** (`'Undefined'`) are HARDCODED
placeholders; **Total Internal/External Users** come from PlanView (real, but a different source —
not Datadog). **DIRECTIVE (from Raja):** _replace the dummy cards with real Datadog-sourced data
where available, and drop/replace the ones we cannot source_ (e.g. total external users → no clean
source; **Perception is explicitly OUT of scope, re-confirmed**). The model already carries
`datadogMapped` / `resolutionPath` (`primary|fallback|unmapped`) / `lastSyncStatus`
(`ok|error|unmapped`) / `lastSyncAt` to drive a provenance UI, and the UI already has a
`.metric-muted` grayed-out style — so the honest near-term move is a **legend + grayed-out
placeholders + a "live · Datadog · synced N min ago" provenance tooltip** on Health/Uptime, while
sourcing the rest from the §8 enrichment roadmap (Incidents via the Incidents API, etc.).
`[NEW 2026-06-16: N3.]`

**Immediate task (Anand via Raja).** For the Anand meeting, focus on **ONE good-data app — IntelliFi
— as the demoable proof** (pull more cards if possible, but IntelliFi alone is a decent start). The
live demo was validated with Raja end-to-end: Health + Uptime are live from Datadog for mapped apps
(confirmed on IntelliFy and "High Value Care Analysis Platform"/HVCAP; ~3 apps in Anton's portfolio
return data) — earlier this was dummy, now it comes from Datadog itself. The tag bridge was
re-confirmed live in the demo: `app_short_key` works; the ServiceNow key is often null (hence
`app_service_id` is the fallback). `[NEW 2026-06-16: N1/N2/N5.]`

### 6.2 Out of Scope for MVP

- Komodor, Pendo, perception computation, number-of-users, AI tabs, Sev-1 backend, infrastructure
  actions (see §5).
- **Creating Datadog monitors** for unmonitored apps — that is the owning app team's / SRE's job;
  the dashboard surfaces coverage, it does not create it (§4.2 coverage reality).
  `[NEW 2026-06-16.]`
- Stage/prod deployment —
  `[NOTE FOR PM: blocked on onboarding the Okta prod/non-prod groups to the developer portal; Phase 1 stays in dev region.]`
- Real per-user RBAC — IT-owner impersonation is retained as-is for Phase 1.
- Final polling-interval tuning — a reasonable PoC value now, tuned later.

## 7. Success Metrics

**Primary**

- **SM-1: Health is live.** 100% of in-scope US Health Applications show Health Status / Uptime /
  Error Budget computed from Datadog at the last sync, with zero static seed values behind the
  Health signal. Validates FR-1–FR-6.
  `[NOTE FOR PM: the authoritative in-scope Application list — the SM-1/SM-2 denominator — must be established with Prashant/Nemi; the prototype's applications seed is generic, not the US Health portfolio. Tracked as Open Q11.]`
- **SM-2: Mapping coverage.** Every in-scope Application is either resolved to Datadog telemetry
  (via the automatic `app_short_key` → `app_service_id` bridge) or explicitly shown as Unmapped/grey
  — no Application shows a fabricated green. Validates FR-8–FR-10.
  `[UPDATED 2026-06-16: coverage today is 651/3656 mapped (GREEN 561, AMBER 49, RED 41; ~190 with SLO-backed uptime); the ~3000 unmapped lack monitors, which their owning teams must create — see §4.2 coverage reality. SM-2 measures honesty of the mapped/unmapped split, not a target mapped-percentage.]`

**Secondary**

- **SM-3: Tree reorganized.** The Portfolio Tree roots at **Operating Company** and nests **BU →
  LOB** from PlanView structured fields (Rami's "group by LOB, not TPM"). Validates FR-11, FR-12.
  `[UPDATED 2026-06-16: was "business-unit-rooted, scattered LOBs merged into 'US Consulting'."]`
- **SM-4: Perception catalog delivered.** A scenario catalog for IntelliFi and Beacon exists and is
  ready to feed Phase 2. Validates FR-14.

**Counter-metrics (do not optimize)**

- **SM-C1: Coverage not at the expense of correctness.** Do not inflate SM-2 by guessing mappings —
  a wrong mapping that shows a confident green is worse than an honest Unmapped. Counterbalances
  SM-2.
- **SM-C2: Freshness honesty.** Do not hide staleness to look live — if the Crawler is failing, the
  last-synced timestamp must reveal it. Counterbalances SM-1.

## 8. Open Questions

_Resolved items (2026-06-16) are struck through with their resolution; still-open items keep their
original numbering._

1. ~~**Perception formula/thresholds**~~ — **PARTIALLY RESOLVED (2026-06-16): mechanism now
   defined** (operation → backing API → baseline → threshold → ok/critical, independent of Health;
   see §4.4). The remaining open part is the **values** — which 2–4 operations, their baselines,
   thresholds, and source (Datadog operation-timing logs vs. Pendo). Owner: **Raja + Tanu** (Tanu =
   IntelliFi specifics). Feeds FR-14 / Phase 2.
2. ~~**Number-of-active-users mechanism**~~ — **RESOLVED OUT (2026-06-16):** Datadog has no such
   metric (no RUM license); Anand: discard the card and replace it with a meaningful one. See §5.
3. ~~**Actual Application Service ID values**~~ — **RESOLVED / MOOT (2026-06-16):** no per-app
   Service ID needs supplying. Mapping is the automatic `app_short_key` (== `castKey`/`shortCode`) →
   `app_service_id` (== `serviceNowKey`) bridge; identifiers already exist on both sides. See §4.2.
4. **Datadog org topology** — single org or multiple? Multi-org needs per-org credentials and
   changes the Crawler's reach. Owner: team — _checkable now_.
5. **Canonical perception encoding** — continuous 0–100 gauge vs. three-band light on the _detail_
   page (it currently has both). Owner: Anton. _2026-06-16 note: the dedicated Perception tab's
   encoding is now defined as a per-operation table (operation / current / baseline /
   ok-vs-critical, §4.4); this Q remains for the detail-page gauge-vs-light conflict._
6. **AI Tokens / AI Drift tab scope** — all Applications or only AI-featured ones? Owner: Anton.
7. **Demo vs. Real consolidation** — does Real Mode supersede Demo once Health is live, or do both
   persist? Owner: Anton.
8. **Final polling interval** — tune after observing Datadog load and data change rates.
9. **90d uptime source** — omit, or derive from Crawler-written history (Datadog SLO history is
   24h/7d/30d and ~2-week retention can't supply 90d directly)? Owner: team — decide before story
   authoring. Affects FR-4.
10. ~~**LOB normalization table storage**~~ — **RESOLVED / MOOT (2026-06-16):** there is no
    normalization table. The tree is derived from PlanView's structured OpCo/BU/LOB fields; no
    taxonomy lives in the repo. See §4.3 / FR-12.
11. **Authoritative in-scope Application list** — the SM denominator; establish with Prashant/Nemi.
    Owner: Prashant/Nemi. Affects SM-1/SM-2. _2026-06-16 note: the full universe is 3656 apps, of
    which 651 are monitored today; the in-scope Phase-1 demo set is the US Consulting apps
    Fiber/Beacon/VIP/IntelliFi._
12. ~~**Does Beacon need monitors created?**~~ — **RESOLVED / SUPERSEDED (2026-06-16, Raja sync):**
    Beacon monitoring **DOES exist** (the earlier "Beacon has no monitors / must create monitors"
    assumption was WRONG). Remaining action is a **coordination** task, not a build gap:
    **coordinate with Juan** (owns Beacon monitoring) for Beacon's `app_short_key` / mapping so the
    bridge resolves it. Owner: Iader ↔ Juan. Supersedes UJ-2's old Beacon example and the §4.2
    "Beacon genuinely has no monitors" note (N4).
13. **Polaris deployment for the demo link** — Raja needs a **deployed (non-localhost)** link for
    the Anand meeting; deploy is a `repository_dispatch` "devops-trigger" into the Polaris/MMC
    unified pipeline (api/ui images via Helm to AWS). Iader must push `feature/datadog-live-health`
    and run the deploy **with Bernie** (who owns the know-how), then tag Raja/Prashant. **Risk:**
    Iader has not deployed Polaris before → real dependency on Bernie. Owner: Iader ↔ Bernardo
    (N7). See §B.

### 8.1 Engineering enrichment roadmap — "what else to show" _(2026-06-16 research; Item I)_

`[NEW 2026-06-16.]` Beyond Phase 1's Health + Uptime, a research pass cross-referenced what the
Datadog API exposes against what the sync already has wired. This roadmap currently lives in the
(untracked) repo-root file `DATADOG-NEXT-STEPS.md` and is recorded here so it is reflected in BMAD.
**Priority order (value/effort):**

1. **Health-timeline endpoint + render (FR-3) — half-built.** The sync already **writes** a
   `HealthSnapshot` per app each run (append-only `health_snapshots`); only the read endpoint
   (`GET .../applications/{id}/health-history`) and the `detail-page` render are pending. Zero new
   integration — natural next branch.
2. **Monitor drill-down — near-free, same endpoint.** `/api/v1/monitor` (with `group_states=all`)
   already returns `message`, `last_triggered_ts`, `state.groups[]`; surfacing them turns "something
   is red" into "this monitor/endpoint failed at this time, with this message."
3. **Downtimes API — suppress false RED.** `GET /api/v2/downtime?current_only=true` (or
   `with_downtimes=true`) to avoid false RED during maintenance windows. Plain key, Monitors-read
   only.
4. **Derived maturity SCORECARD — differentiator.** A per-app score derived from data already
   pulled: `has-monitor` / `has-SLO` / `SLO-passing` / `mapped` (+ `has-owner` if #5 lands). Pure
   logic, no new integration — the Backstage/Cortex/OpsLevel/Port-style layer.
5. **Service Catalog — ownership / on-call / links. ⚠️ CAVEAT.**
   `GET /api/v2/services/definitions/{service}` → team, Slack, PagerDuty/Opsgenie, repo/docs/runbook
   links, tier. Keyed on the **`service` tag, which our coverage probe showed is NOT a clean per-app
   join in this org** — **probe before promising**.
6. **Incidents API — fill the static `incidents` field. ⚠️ CAVEAT.** `GET /api/v2/incidents` →
   populates the existing-but-static `incidents` / `lastIncident` fields. CAVEAT: needs the
   **Incident Management product** and incidents that are mappable (no native `app_short_key`).

**User-perception technical path (still DISCOVERY; perception is OUT of the Phase-1 build).** Three
**RUM-free** sources, all landing as a normal metric and all feeding **one baseline engine**
(current vs `calendar_shift(-7d)` ratio, + `anomalies('agile',2)`): **(a)** APM `trace.*` metrics
(best fidelity, where the app is APM-instrumented); **(b)** a **log-based distribution metric** over
an already-logged duration field (not retroactive); **(c)** a **multistep API Synthetic test**
(canary; needs the Synthetics **API-test** license, NOT RUM/browser). Constraints: metrics retained
**15 months**; `/api/v1/query` ~**1600 req/h/org** (batch via `POST /api/v2/query/scalar` if golden
signals are added). This is the technical backing for the §4.4 mechanism — feeds Phase 2, builds
nothing in Phase 1.

> **Live-vs-placeholder ties in here:** the dummy Overview cards (§6.1, N3) stop being placeholders
> as these items land — **Incidents** via #6, **Perception** once a source is chosen above; until
> then they are grayed-out/provenance-tooltipped, which is the honest interim state.

## 9. Assumptions Index

- §4.1 — The prototype's two-signal model and detail fields are kept; Phase 1 fills them with live
  data rather than redesigning.
- ~~§4.2 / FR-8 — Manual mapping curation (seeded/edited collection or minimal admin path) is
  acceptable for Phase 1; no full management UI.~~ **SUPERSEDED (2026-06-16):** mapping is automatic
  via the `app_short_key` → `app_service_id` dual-tag bridge; no curation. See §4.2 / FR-8.
- §4.3 — The reorganization targets Real-Mode data shaping; the Demo tree is the target shape.
- ~~§4.3 / FR-12 — A curatable mapping table is acceptable; the exact taxonomy beyond "US
  Consulting" is confirmed later.~~ **SUPERSEDED (2026-06-16):** no mapping table — OpCo/BU/LOB come
  from PlanView's structured fields; no taxonomy in the repo. See §4.3 / FR-12.
- §4.3 / FR-13 — IT-owner filtering/impersonation is retained for Phase 1; real RBAC deferred.
- §4.4 / FR-14 — The Perception Scenario Catalog is a documentation deliverable (Iader + Raja, +
  Tanu for IntelliFi specifics), not an engineering change. **2026-06-16:** the perception
  _mechanism_ is now defined (§4.4); only the _values_ remain discovery.

---

## Adapt-In Sections

## A. Cross-Cutting NFRs

- **Reliability / replica-safety:** ingestion runs as a single scheduled job; no in-app timers
  (replica concurrency). Crawler writes are idempotent and use a Mongo `$set` of only health fields,
  so a crawler write never clobbers `name`/`tier`/`statusOverride`; a manual `statusOverride` always
  wins; `currentStatus` tracks Datadog health only for **mapped** apps.
  `[UPDATED 2026-06-16: write-path safety proven in the build.]`
- **Rate-limit safety:** ingestion is a bulk-fetch snapshot (Datadog HTTP scales with catalog size,
  not app count; per-app resolve issues zero calls); SLO-history fetch runs under bounded
  concurrency (6) with 429 backoff honoring `Retry-After`.
  `[UPDATED 2026-06-16: replaces per-app polling that tripped 429s.]`
- **Observability:** every Crawler run records outcome + timestamp + per-Application resolution path
  (`primary`/`fallback`/`unmapped`); last successful sync is user-visible.
- **Performance:** dashboard read latency is unaffected by ingestion (reads come from the database,
  not Datadog).
- **Security:** Okta SSO for access; Datadog credentials in a Kubernetes secret; least-privilege
  Datadog key (read-only monitors/SLOs); the internal sync endpoint is shared-secret guarded with a
  **timing-safe** token compare. `[UPDATED 2026-06-16.]`
- **Fail-safe correctness:** a non-array Datadog monitors body throws (no laundering an outage into
  AMBER); an unknown monitor state rolls up to AMBER; an SLO target ≥100 is guarded; unmapped apps
  render grey, never a false AMBER.
- **Data freshness:** staleness is surfaced, never masked (see SM-C2).

## B. Integration & Dependencies

- **Datadog** — primary telemetry source. Ingestion is a **bulk-fetch snapshot**:
  `GET /api/v1/monitor` paged once (indexed by every tag), `GET /api/v1/slo` paged once (keeping
  only `app_short_key`/`app_service_id`-tagged SLOs), then each kept SLO's **24h/7d/30d** history
  under bounded concurrency with 429 backoff. API key provisioned; ~2-week log retention; no RUM
  license. Apps resolve from the snapshot with zero per-app calls. Detailed API shape: see brief
  addendum and the Crawler solution-design.
  `[UPDATED 2026-06-16: snapshot endpoints + mapping bridge.]`
- **Application ↔ Datadog bridge** — automatic, via tags already present on both sides:
  `app_short_key` == PlanView `castKey`/`shortCode` (primary), `app_service_id` == PlanView
  `serviceNowKey` (fallback). No stored per-app Service ID. `[NEW 2026-06-16.]`
- **PlanView Enterprise Architect** — project metadata, exported (via the Dremio database) to JSON
  and loaded to Mongo. Manual for Phase 1. The loader **preserves PlanView's structured fields**
  (`OpCo`, `BusinessDeliveryPortfolioName`, `castKey`/`shortCode`, `serviceNowKey`) used for the
  bridge and the OpCo/BU/LOB tree.
  `[UPDATED 2026-06-16: was "Application Service ID currently blank there" — that field is not the mapping mechanism.]`
- **Mongo Atlas** — system of record the dashboard reads and the Crawler writes (data contract in
  §G).
- **Crawler trigger (`apps/crawler`)** — a Kubernetes CronJob that calls
  `POST /api/v1/internal/sync/datadog` (shared-secret guarded) on a schedule; nobody runs it by
  hand; the dashboard reads only Mongo (decoupled). `[NEW 2026-06-16.]`
- **Unified pipeline / OSS2 / Helm** — the Crawler ships as a Kubernetes cronjob (reusing a prior
  project's scheduler pattern); dev region only in Phase 1.
- **Deployed demo link (Polaris / MMC unified pipeline)** — `[NEW 2026-06-16: N7.]` Raja needs a
  **demoable DEPLOYED link (not localhost)** for the Anand meeting. Deployment goes through the
  **Polaris / MMC unified pipeline**: a `repository_dispatch` **"devops-trigger"** fires the unified
  pipeline, which ships the `api` and `ui` images via **Helm to AWS**. Action on **Iader**: push the
  `feature/datadog-live-health` branch, coordinate the deploy **with Bernardo (Bernie)** — who owns
  the deployment know-how — and tag **Raja/Prashant** in the channel once a link exists.
  **Dependency/risk:** Iader has not done a Polaris deployment before, so this is a real external
  dependency on Bernie's availability (tracked as Open Q13).
- **Okta / Apigee** — authentication and gateway.
- **Prototype reference files** — `prototype/portfolio.html` and `prototype/detail.html` are the
  design references (note: `docs/mvp-implementation-plan.md` cites a `prototype/demo.html` that does
  not exist in the repo — do not point stories at it).
- **Deferred:** Komodor, Pendo (Phase 2).

## C. Operational Requirements

- Configurable Crawler interval (PoC: 5–15 min, tunable later); triggered by a K8s CronJob hitting
  the shared-secret-guarded internal sync endpoint — never run by hand.
- Single scheduled execution per tick; replica-safe by construction.
- Bulk-fetch snapshot per run with bounded SLO-history concurrency (`SYNC_CONCURRENCY`) and 429
  backoff; `SYNC_APP_SHORTCODES` scopes the run when needed (both are legitimate operational
  config). `[NEW 2026-06-16.]`
- User-visible last-sync time; recorded run outcomes (with per-Application resolution path) for
  diagnosis.
- Respect Datadog's ~2-week retention; do not depend on bespoke per-team log formats for core Health
  (use Monitors/SLOs).

## D. Constraints & Guardrails

- **Informational-only:** Phase 1 surfaces information and does not trigger any action on
  infrastructure.
  `[ASSUMPTION: recommended design principle — flag for Anton; keeps the Sev-1 wizard a notify/inform shell until requirements firm up.]`
- **Branching:** branches + PRs always; never push to main.
- **Environment:** dev region only (stage/prod blocked on Okta group onboarding).

## E. Risks & Mitigations

| Risk                                                                                                 | Mitigation                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Application Service ID blank in PlanView → unreliable mapping~~ **(RESOLVED 2026-06-16)**          | Automatic dual-tag bridge `app_short_key`→`app_service_id` (FR-8/FR-9), validated exhaustively; explicit unmapped surfacing (FR-10). No curation needed.          |
| Low monitor coverage (651/3656) reads as low product value                                           | Reframe: the dashboard **surfaces** coverage; creating monitors is the owning team's/SRE's job (§4.2). SM-2 measures honesty of the split, not a mapped-% target. |
| Per-app Datadog polling trips 429 rate limits (observed: 13 failures, 521/651)                       | **Bulk-fetch snapshot** + local resolve + bounded concurrency (6) + 429 backoff honoring Retry-After (FR-1, §A); live re-run 3656/3656, 0 errors.                 |
| Group-level tags mistaken for per-app bridges (`business_unit`, `team`, `service`, `servicenow_chg`) | Only `app_short_key`↔`castKey` and `app_service_id`↔`serviceNowKey` accepted as bridges (FR-8); proven by the 104-namespace × all-id-field probe.               |
| Datadog log retention (2 wks) and drifting per-team log formats                                      | Compute core Health from Monitors/SLOs, not raw logs (FR-2, FR-5); longer windows from Crawler history (FR-3, FR-4)                                               |
| Multiple Datadog orgs across the portfolio                                                           | Confirm topology (Open Q4); per-org credentials if needed                                                                                                         |
| Replica concurrency duplicating polls/writes                                                         | Single scheduled cronjob, idempotent `$set` writes that never clobber curated fields (FR-1, §A)                                                                   |
| Stage/prod blocked on Okta groups                                                                    | Phase 1 scoped to dev region; onboarding tracked separately                                                                                                       |
| Mapping guessed to inflate coverage → false green                                                    | SM-C1 counter-metric; Unmapped/grey is the honest default; `healthStatus` gated on `datadogMapped`                                                                |

## F. Stakeholders & Approvals

- **Anton Novikov** — creator/owner/TPM; designed the dashboard (his personal prototype → team
  project) and is now **on vacation**; owns **Mercer Intellify** and the US Consulting portfolio
  (the seed is his digital twin — his corporate account is the `LocalDevelopmentUser`, ~25 apps);
  approves Phase 1 outcomes on his return; rule: branches + PRs, never push to main. **Distinct
  person from Anand.** `[CORRECTED 2026-06-16: Anton ≠ Anand — see decision log.]`
- **Anand** — **separate** senior stakeholder the IntelliFy demo is being prepared for; via Raja,
  gave the **immediate IntelliFi task** (N2) and the Overview+Health card direction. Not the
  creator; the earlier "Anton is an auto-caption garble of Anand" reconciliation was **wrong**
  (confirmed by Iader; corroborated by his corporate email and the Raja sync distinguishing "Anton
  portfolio" from "the task from Anand").
- **Rami** — senior stakeholder/sponsor; owns the tree requirement ("group by **LOB, not TPM**") and
  the User Perception direction.
- **Prashant / Nemi** — POCs while Anton is out; own the authoritative in-scope app list (Open Q11).
  `[UPDATED 2026-06-16: no longer own Service-ID values — Open Q3 is moot under the automatic bridge.]`
- **Raja** — business contact (perception track + Anand demo); validated the live demo and gave the
  live-vs-placeholder card directive (N3) and the IntelliFi-first task (N2). **Tanu** — business
  contact for IntelliFi perception specifics. `[UPDATED 2026-06-16.]`
- **Juan** — owns **Beacon monitoring**; coordinate with him for Beacon's `app_short_key` / mapping
  (Beacon monitoring DOES exist — Open Q12). `[NEW 2026-06-16: N4.]`
- **Saule, Prashant, Nemi** — POCs.
- **Bernardo** — build lead (Phase 1), decides the key Overview/Health cards; **Iader** — dev taking
  ownership; owns the mapping-bridge **audit** (not curation) and the perception catalog.
  `[UPDATED 2026-06-16: mapping is automatic, so Iader audits coverage rather than curating identifiers.]`

## G. Data Contract _(what the Crawler writes / the dashboard reads)_

Product-level field names the data-model story must establish (types are an implementation decision;
see the Crawler solution-design). These extend the existing `Application` model.
`[UPDATED 2026-06-16: the build added datadog/health fields to the Application model; `ApplicationsService.applyHealthUpdate`persists them via the repo`updateHealth`(Mongo`$set`).]`

**Mapping inputs (already on PlanView records — not curated):**

- **shortCode** (== PlanView `castKey`) — bridges to the Datadog `app_short_key` tag (primary path,
  FR-8).
- **serviceNowKey** (format `SNSVC#######`) — bridges to the Datadog `app_service_id` tag (fallback
  path, FR-9).
- **datadogServiceId** — optional per-app override for the primary key in edge cases; not the
  mapping mechanism, usually unset.
- **OpCo / BusinessDeliveryPortfolioName** — PlanView structured fields preserved by the loader;
  source of the OpCo/BU/LOB tree (FR-11/FR-12).

**Crawler-written health fields:**

- **datadogMapped** — boolean: did the bridge resolve this Application to Datadog telemetry? The
  dashboard read **gates `healthStatus` on this** so unmapped apps stay grey, never a false amber
  (FR-2/FR-10). `[NEW 2026-06-16; replaces the prior `applicationServiceId`/`unmapped` framing.]`
- **healthStatus** — the Crawler-computed green/amber/red for mapped apps (FR-2), distinct from any
  prototype UI-side status it replaces.
- **uptime30d** — the surfaced uptime figure for mapped apps, from SLO history (FR-4); other windows
  (24h/7d) as available, "not available" otherwise.
- **errorBudgetRemaining** — remaining Error Budget, or "not available" when no SLO exists (FR-5);
  guarded for SLO target ≥100.
- **healthTimeline** — accumulated Health Status history (FR-3).
- **crawlerSyncedAt** — timestamp of the last successful Crawler write for the Application (FR-7).
- **crawlerRunStatus / resolutionPath** — per-run outcome and the `primary` (app_short_key) |
  `fallback` (app_service_id) | `unmapped` path used (FR-7, FR-9).

**Write-path invariants:** the crawler `$set` writes only health fields and never clobbers
`name`/`tier`/`statusOverride`; a manual `statusOverride` always wins over `currentStatus`;
`currentStatus` tracks Datadog health only for mapped apps. `[NEW 2026-06-16.]`

`[ASSUMPTION: these are the minimum fields Phase 1 introduces; the data-model story refines names/shape against the existing model in libs/shared.]`
