# Phase-2 Backlog — Operational Dashboard (Datadog Enrichment)

_Generated: 2026-06-18 | PRD:
`_bmad-output/planning-artifacts/prds/prd-operational-dashboard-halo-2026-06-13/prd.md`_ _Source
research: `_bmad-output/planning-artifacts/research/datadog-enrichment-research-2026-06-16.md` (was
repo-root `DATADOG-NEXT-STEPS.md`)_ _Mapping + discovery: Iader | Build lead: Bernardo_

---

## Context

Phase 1 (Live Health) is **delivered**: Health + Uptime are live from Datadog for mapped apps (651 /
3656), with the health timeline, monitor drill-down, downtime suppression, error-budget/SLA, and
live-vs-placeholder provenance all shipped (see Phase-1 backlog E1–E5). This Phase-2 backlog is the
**next-up enrichment roadmap** — progressively replacing the remaining placeholder data with
Datadog-sourced data and adding depth. It supersedes the untracked `DATADOG-NEXT-STEPS.md` working
doc.

**Today the sync already brings, per app, with zero new integration:** every monitor (state,
message, groups, last-triggered, matching downtimes) and every relevant SLO (uptime + error budget),
bridged by the dual tag `app_short_key` (primary) / `app_service_id` (fallback). Everything in
**E7** is derivable from this. **E8** needs new Datadog v2 calls that carry **entitlement / join
caveats** — each gated behind a spike. **E9** (perception) needs a per-app source decision first.

**None of these are committed scope yet** — this is the prioritized backlog. Epic numbering
continues the project sequence (Phase-1 used E1–E6) to avoid the `epic-5` name collision in
`sprint-status.yaml`.

### Sequencing at a glance

- **E7 — Datadog signal depth** _(low-risk, no new integration)_ — do first; pure logic / UI /
  wiring over data already synced.
- **E8 — Catalog & incidents enrichment** _(entitlement / join gated)_ — **spike before build**.
  E8-S1 gates E8-S2; E8-S3 gates E8-S4.
- **E9 — User Perception** _(RUM-free)_ — **discovery before build**. Continues/supersedes Phase-1
  E4 (discovery-only). E9-S1 gates E9-S2 gates E9-S3.

### Standing constraints (apply to all new Datadog calls)

- Metrics retained **15 months**; indexed logs ~15 days (logs are not a long-term timeline).
- `/api/v1/query` rate limit **~1600 req/h/org** → batch with `POST /api/v2/query/scalar`
  (multi-query + formulas) for any golden-signal additions.
- Keys (`DATADOG_API_KEY` / `DATADOG_APP_KEY`) come from `ConfigService` / Vault — never hardcoded.
  Probe scripts must stay read-only and never print keys.

---

## E7 — Datadog Signal Depth (low-risk, no new integration)

**Goal:** Add depth and finish wiring using data the sync **already brings** — no new Datadog
endpoints, no entitlement risk. This is the highest value-per-effort epic and should be done first.

---

### E7-S1 — Wire the 24h / 7d / 30d range buttons to the Health timeline row

**Owner:** Bernardo / Iader | **Blocked by:** nothing (E5-S1 delivered the timeline)

**As a** stakeholder, **I can** switch the detail-page Health timeline between 24h / 7d / 30d, **so
that** I can see the app's health trend over the window I care about instead of a fixed view.

**Acceptance Criteria:**

- The detail page exposes an `activeHealthRange` (`'24h' | '7d' | '30d'`) bound to the existing
  range buttons over the HEALTH row; the buttons are no longer inert for that row.
- The health-history read path supports the selected range — either a backend `?range=` param on
  `GET /dashboard/portfolio/apps/{id}/health-history` (preferred; keep `?limit=` working) or a
  client-side window over already-fetched snapshots, whichever is simpler given the snapshot
  cadence.
- Bucketing respects the range (per-hour within a day, per-day across days) consistent with the
  current per-run bucketing.
- An app with no snapshots in the selected window shows the existing honest empty state, not an
  error.
- Default range is unchanged from today's behavior; switching range re-renders without a full page
  reload.

**FR refs:** FR-3 (extension)

> **Origin:** This is the "⚠️ minor pending item" from the research doc and the only roadmap item
> that was **not tracked in BMAD at all**. It is the natural finish to the delivered E5-S1 timeline.

---

### E7-S2 — Derived observability maturity scorecard

**Owner:** Bernardo | **Blocked by:** nothing (data already synced; `has-owner` enriches once E8-S4
lands)

**As a** stakeholder, **I can** see a per-app observability **maturity scorecard**, **so that** I
can tell at a glance which apps are well-instrumented — the differentiator that Backstage / Cortex /
OpsLevel / Port build on top of.

**Acceptance Criteria:**

- A derived score is computed per app from signals **already available locally**: `has-monitor`,
  `has-SLO`, `SLO-passing`, `mapped` (and `has-owner` once E8-S4 provides ownership).
- The computation is pure local logic over the existing snapshot/sync data — **no new Datadog
  call**.
- The score and its component signals are surfaced per app (portfolio column and/or detail card),
  with the component breakdown visible (not just a single opaque number).
- An unmapped app scores honestly (low / "not instrumented"), never a misleading high score.
- Unit tests cover the score derivation for: fully instrumented, partially instrumented, unmapped.

**FR refs:** new (derived metric)

_Key files:_ `libs/shared/api/src/model/dashboard/Application.ts` (score + component fields), the
sync rollup that already computes health,
`apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts` (`toPortfolioApp` projection), UI
portfolio/detail render.

---

### E7-S3 — Replace / drop remaining placeholder Overview & table cells

**Owner:** Bernardo / Iader | **Blocked by:** partially E8-S2 (incidents) — can ship incrementally

**As a** stakeholder, **I can** trust that every visible Overview/table cell is either real or
clearly marked, **so that** the demo stays honest as new sources land.

**Acceptance Criteria:**

- Each still-dummy cell is **replaced with real Datadog data** as its source ships
  (Incidents/Last-Incident → E8-S2; maturity → E7-S2) or **dropped/relabeled** when it cannot be
  sourced (e.g. total external users).
- **Perception stays OUT** here — it is wired only in E9-S3.
- The existing two-state missing-data treatment ("Not monitored" vs "No data", muted "—" +
  provenance tooltip, from Phase-1 `5-6`) is reused — no new visual language is introduced.
- No cell silently shows a fabricated value (no hardcoded `0` / `'Undefined'` masquerading as live).

**FR refs:** FR-4, FR-5, FR-6, FR-7 (provenance)

> **Origin:** Continuation of Phase-1 E5-S7 / sprint `5-2`. This story closes out the placeholder
> cells that depend on Phase-2 sources existing.

---

## E8 — Catalog & Incidents Enrichment (entitlement / join gated)

**Goal:** Pull ownership/on-call/links and real incidents from Datadog v2 APIs. Both carry caveats
proven during Phase-1 discovery, so **each build is gated behind a read-only spike** — we probe
before we promise.

---

### E8-S1 — SPIKE: Datadog Incident Management entitlement + app-mappability

**Owner:** Iader | **Blocked by:** nothing | **Type:** spike (read-only, time-boxed)

**As a** mapping lead (Iader), **I can** determine whether the org uses Datadog Incident Management
and whether incidents can be joined to apps, **so that** E8-S2 is committed only if it can actually
deliver real data.

**Acceptance Criteria:**

- A read-only probe confirms whether `GET /api/v2/incidents` returns data for this org (entitlement
  present) or errors / is empty.
- The probe determines whether incidents are mappable to apps — incidents do **not** natively carry
  `app_short_key`, so a candidate join is identified (monitor names/ids, `service` tag, or other
  tags) and its coverage measured.
- Findings (entitlement yes/no, viable join + coverage %, or "not feasible") are written to
  `_bmad-output/planning-artifacts/research/` and this story's notes; E8-S2 is then marked
  ready-for-dev or dropped.
- The probe never prints API/app keys and makes no writes.

**FR refs:** discovery (gates E8-S2)

_Reuse:_ the `scripts/datadog-key-coverage.js` read-only probe pattern.

---

### E8-S2 — Incidents API → fill the static incidents / last-incident fields

**Owner:** Bernardo | **Blocked by:** **E8-S1** (must confirm entitlement + join)

**As a** stakeholder, **I can** see real recent incidents on an app, **so that** the
currently-static `incidents` / "last incident" cells reflect reality.

**Acceptance Criteria:**

- The sync reads the Datadog **Incidents API** and populates the existing `incidents` count +
  `lastIncident` per app, using the join validated in E8-S1.
- Apps with no incidents show an honest zero/"none" state (reusing the missing-data treatment), not
  a fabricated value.
- The hardcoded placeholders in `toPortfolioApp` (`incidents: 0`, `lastIncident: 'Undefined'`) are
  removed in favor of the synced values; provenance marks the cells live.
- Unit tests cover: app with incidents, app with none, incident that cannot be mapped (excluded, not
  mis-attributed).

**FR refs:** replaces static incidents placeholder

> **CAVEAT (carried):** requires the **Datadog Incident Management product** and a workable
> incident→app join — both validated in E8-S1 before this is committed.

_Key files:_ `apps/api/src/datadog/real-datadog-client.ts`, the sync service,
`apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`.

---

### E8-S3 — SPIKE: `service` tag join cleanliness for the Service Catalog

**Owner:** Iader | **Blocked by:** nothing | **Type:** spike (read-only, time-boxed)

**As a** mapping lead (Iader), **I can** measure whether the `service` / `dd-service` tag is a clean
per-app bridge in this estate, **so that** E8-S4 is committed only if ownership/links can actually
be joined per app.

**Acceptance Criteria:**

- A read-only probe measures, across the app set, how many apps resolve to exactly one Datadog
  service definition via the `service` tag (and how many are 0 / ambiguous / many).
- For a sample of resolved apps, the probe confirms which catalog fields are actually populated
  (team, Slack, PagerDuty/Opsgenie, repo/docs/runbook links, tier, lifecycle).
- Findings (join coverage %, populated-field coverage, go/no-go + recommended scope) are written to
  `_bmad-output/planning-artifacts/research/` and this story's notes; E8-S4 is then marked
  ready-for-dev, scoped-down, or dropped.
- The probe never prints API/app keys and makes no writes.

**FR refs:** discovery (gates E8-S4)

> **Why:** the Phase-1 coverage probe already showed `service` is **NOT a clean per-app bridge**
> (only `app_short_key` / `app_service_id` are). This spike quantifies whether it is good enough for
> catalog enrichment specifically.

---

### E8-S4 — Service Catalog → ownership / on-call / links per app

**Owner:** Bernardo | **Blocked by:** **E8-S3** (must confirm the join is viable)

**As a** stakeholder, **I can** see who owns an app, who is on-call, and the useful links (repo /
docs / runbook), **so that** I know who to contact when it is unhealthy.

**Acceptance Criteria:**

- The sync reads `GET /api/v2/services/definitions/{service}` for apps resolvable via the validated
  join and surfaces: team/owner, Slack, PagerDuty/Opsgenie, repo/docs/runbook links, tier,
  lifecycle.
- New `Application` fields hold the catalog data; only populated fields are shown (missing fields
  reuse the missing-data treatment, never blank-looking-live).
- Ownership feeds the `has-owner` signal of the maturity scorecard (E7-S2).
- Apps without a clean service join degrade honestly ("no Datadog service definition"), not a false
  owner.
- Unit tests cover: resolved app with full definition, resolved app with partial fields, unresolved
  app.

**FR refs:** new (enrichment)

> **CAVEAT (carried):** keyed on the `service` tag, validated in E8-S3 before commitment.

_Key files:_ `apps/api/src/datadog/real-datadog-client.ts`,
`libs/shared/api/src/model/dashboard/Application.ts`, the sync service.

---

## E9 — User Perception (RUM-free) _(continues / supersedes Phase-1 E4 discovery)_

**Goal:** Give each target app a perception signal (green/amber/red) without RUM, using a single
baseline engine. Phase-1 E4 was **discovery-only** (perception was re-confirmed OUT of Phase-1 by
Raja); Phase-2 is where it gets built — but only after the per-app source is confirmed.

---

### E9-S1 — SPIKE/discovery: confirm the per-app perception source

**Owner:** Iader (with Raja) | **Blocked by:** nothing | **Type:** discovery + read-only probe

**As a** discovery lead (Iader), **I can** confirm which RUM-free source exists per target app
(starting with IntelliFi/Beacon), **so that** the baseline engine is built against a real signal.

**Acceptance Criteria:**

- For each target app, the source is determined among the three RUM-free options:
  - **(a) APM `trace.*`** — e.g. `p95:trace.<span>{service:…, resource_name:…}` (best fidelity, if
    the app is APM-instrumented),
  - **(b) log-based distribution metric** over a duration already logged (custom metric; not
    retroactive),
  - **(c) multistep API Synthetic** canary (RUM substitute; needs a Synthetics API-test license,
    runs from private locations).
- The probe confirms whether IntelliFi/Beacon have APM and/or log a duration field; Raja's input on
  the candidate business operations (census upload, report generation, save-session, dashboard load)
  and "what slow means" is recorded.
- Output: a per-app source decision + the concrete metric/query, written to
  `_bmad-output/planning-artifacts/research/` (extends the E4 perception catalog). E9-S2 is then
  marked ready-for-dev.
- Probe is read-only and never prints keys.

**FR refs:** FR-14 (discovery)

---

### E9-S2 — Single baseline engine (current vs calendar_shift(-7d) + anomalies)

**Owner:** Bernardo | **Blocked by:** **E9-S1**

**As a** developer (Bernardo), **I can** compute a perception verdict from any of the three sources
through **one** baseline engine, **so that** the source choice does not fork the logic.

**Acceptance Criteria:**

- The engine computes `current / calendar_shift(-7d)` ratio against a threshold, combined with
  `anomalies('agile', 2)`, regardless of which source (a/b/c) feeds it.
- It stays within the standing constraints (15-mo metric retention; batches via
  `POST /api/v2/query/scalar` to respect the ~1600 req/h/org limit).
- It emits a per-app verdict (`green | amber | red`) plus the underlying value/ratio for
  transparency; missing source data → honest "no data", never a fabricated green.
- Unit tests cover: within-baseline (green), degraded ratio (amber/red), anomaly trip, and
  missing-source.

**FR refs:** FR-14

---

### E9-S3 — Wire the perception pill in portfolio + detail

**Owner:** Bernardo / Iader | **Blocked by:** **E9-S2**

**As a** stakeholder, **I can** see the perception signal on the dashboard, **so that** the existing
(currently placeholder) perception pill reflects real measured experience.

**Acceptance Criteria:**

- The portfolio `perception` cell and the detail-page perception pill render the engine verdict (the
  model field + UI pill already exist — `green|amber|red|undefined`).
- The hardcoded `perception: 'undefined'` placeholder in `toPortfolioApp` is replaced by the engine
  output; provenance marks it live where present.
- Apps without a perception source show the honest missing-data state, not a default green.
- The detail page's two perception encodings (gauge vs band) are reconciled to agree (resolves the
  open Phase-1 note).

**FR refs:** FR-14

_Key files:_ `apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`,
`apps/api/src/dashboard/seed/detail.seed.ts`, UI perception components.

---

## Out of scope (unchanged from Phase 1)

`activeUsers / users` count — Synthetics measures _duration/uptime_, not _how many users_; remains
parked (no RUM / no standard logging), as in Phase 1.
