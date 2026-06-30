# Platform Enhancement Research — Operational Dashboard (Phase 2+ value)

**Date:** 2026-06-21 **Audience priority:** Executives / leadership first, then app owners, then ops
**Method:** Deep-research harness — 5 search angles, 25 sources fetched (mix of primary vendor
docs + analyst/practitioner blogs), 117 claims extracted, 25 verified via 3-vote adversarial
verification (25 confirmed, 0 refuted). Synthesis assembled against the platform's actual built
state and hard constraints.

## Constraints carried into every recommendation

- **No RUM** (Real User Monitoring not available).
- **No new paid integrations / entitlement-gated APIs.**
- **Datadog `/api/v1/query` rate-limited** (~1600 req/h/org); metrics retained ~15 months. →
  anything new must ride the **existing single bulk snapshot/sync**, not per-app calls (story 1-4
  already pivoted to one bulk snapshot for this reason).
- **Incident & service-catalog joins are effectively dead** — only ~0.1% of app monitors carry a
  `service` tag (~2/3656 joinable). Treat incidents/service-catalog enrichment as parked (epics
  8-2/8-4 already NO-GO).
- **Join key** = dual-tag bridge (`app_short_key` primary, `app_service_id` fallback).
- **Already built:** BU-rooted portfolio tree (OpCo→BU→LOB), mapping w/ provenance, two-state
  missing-data model, health timeline (24h/7d/30d), 0–5 maturity scorecard, monitor drill-down,
  downtime/maintenance suppression, All/My-Applications scope toggle.

---

## OVERALL TOP 5 (ranked, exec-value-first)

### 1. Portfolio risk roll-up — aggregate health + maturity up the BU/OpCo/LOB tree, with a "where do I look" worst-offenders view ⚡ QUICK WIN

- **What:** Roll the per-app health state + 0–5 maturity score into **aggregate scores at every tree
  node** (LOB → BU → OpCo): % healthy, % monitored ("monitoring coverage"), % SLO-passing, weighted
  risk. Add a default-sorted **"Top risks / where to look"** panel (worst nodes and worst apps
  surfaced to the top).
- **Why it's #1 for leadership:** Executives don't read 3,656 rows — they need the portfolio rolled
  into "which Business Unit is on fire and where do I look." This is exactly the "5-second rule" for
  exec dashboards (answer in one glance) and the analyst-recommended portfolio KPI roll-up.
  Monitoring coverage itself becomes a leadership KPI ("42% of Mercer's apps are unmonitored") — a
  number that drives budget/staffing decisions.
- **Feasibility:** **High / quick win.** Pure local aggregation over data already synced (maturity +
  health + portfolio hierarchy). **Zero new Datadog calls** → no rate-limit impact. The tree,
  maturity scorecard, and provenance already exist; this is a roll-up layer + sort.
- **Data/source:** Existing maturity scorecard + health snapshots + PlanView OpCo→BU→LOB hierarchy.
- **Evidence:** Gartner TIME / portfolio-fitness assessment rolls apps into portfolio-level views
  (LeanIX, Korays, Gartner toolkit); exec dashboards must answer in ~5 seconds (Customer Science);
  monitoring coverage as a tracked KPI (Datadog Scorecards docs/blog).

### 2. SLO error-budget + burn-rate surfacing, rolled up to BU 💎 (medium effort, high exec legibility)

- **What:** We already paginate SLOs and resolve their history. Surface **error budget remaining (=
  1 − SLO target attainment)** and **burn rate** per app, and roll up "budget remaining" by BU.
  Color by burn-rate thresholds (fast-burn = trending to breach this window).
- **Why for leadership:** "Error budget remaining" and "trending to breach" are the rare reliability
  concepts a non-technical exec immediately groks — it reframes reliability as a **budget being
  spent**, the single most leadership-legible SRE artifact. It also gives a defensible "is this app
  actually reliable" signal beyond a binary up/down.
- **Feasibility:** **Medium.** SLO data is already pulled in the bulk snapshot; error budget =
  `1 − SLO` is a local computation; burn rate is a unitless ratio over the window. No new
  integration; stays inside the snapshot. Watch rate limits if you resolve more SLO history — keep
  it in the bulk pass.
- **Data/source:** Datadog SLO status + history (already synced).
- **Evidence (verified):** error budget = 1 − SLO target (Datadog error-budget docs; Google SRE
  Workbook); burn rate is a unitless Google-coined value; Datadog natively supports threshold-based
  error-budget and burn-rate alerts; SLOs are the foundation for data-driven reliability decisions
  and the error-budget _policy_ is the governing mechanism (Google SRE Workbook — implementing-slos,
  error-budget-policy).

### 3. RUM-free "emerging risk" feed — Watchdog anomalies + APM latency/error trend vs. baseline 💎 (medium → bigger bet)

- **What:** Two RUM-free signals, presented as a plain-language **"emerging risks / what changed"**
  feed at portfolio and app level: (a) **Datadog Watchdog** auto-detected anomalies (built-in AI, no
  setup, no new integration); (b) a **perception proxy** = APM `trace.*` latency + error-rate **now
  vs. `calendar_shift(-7d)`** with `anomalies('agile', 2)` — the exact RUM-free approach already
  scoped in epic-9.
- **Why for leadership:** Moves the dashboard from "what's broken now" to "what's quietly degrading"
  — predictive risk. Framed as a short, curated, plain-English feed (not raw alerts), it's the form
  of AIOps that informs executives without overwhelming them. Also fills the perception gap
  (currently a hardcoded `'undefined'` card) without RUM.
- **Feasibility:** **Medium for the trend proxy** (rides existing query budget; one bulk pass),
  **bigger bet for Watchdog** (confirm API access/volume under the ~1600 req/h ceiling; curate to
  avoid noise). Both are native — **no paid add-on**.
- **Data/source:** Datadog Watchdog (native); APM `trace.*` metrics (15-mo retention covers the −7d
  baseline).
- **Evidence (verified):** Watchdog is built-in AI anomaly detection requiring no setup/integration,
  computes a baseline of expected behavior, and detects anomalies in APM metrics automatically
  (Datadog Watchdog docs + AIOps blog); curated AIOps signal aids non-technical leaders (Splunk, New
  Relic C-suite, CIO).

### 4. Executive weekly digest + shareable read-only snapshot ⚡ QUICK WIN (adoption)

- **What:** A **scheduled weekly exec digest** (email/PDF: portfolio score, coverage %, top movers,
  new risks) plus a **read-only shareable snapshot link** of the portfolio view.
- **Why for leadership:** The #1 failure mode of exec dashboards isn't data — it's that **executives
  never log in**. Push a digest to where they already are (inbox); make views shareable so a VP can
  forward "look at row 3." This is the single highest-leverage adoption move.
- **Feasibility:** **Quick-ish win.** Datadog _has_ native Scheduled Reports (email) you can mirror
  conceptually; for our custom UI it's a cron + render-to-email/PDF over data we already hold. No
  new integration; no rate-limit impact (reads our own store).
- **Data/source:** Our own aggregated store (from #1/#2); Datadog Scheduled Reports as the pattern
  reference.
- **Evidence (verified):** Datadog provides native Scheduled Reports delivered to email (Datadog
  docs); digests/alerting + lowering friction drive dashboard adoption (Dataroars,
  Single-Pane-of-Glass).

### 5. TIME-model rationalization quadrant — technical fitness × business value 🎯 BIGGER BET (highest strategic ceiling)

- **What:** A portfolio **quadrant** classifying apps **Tolerate / Invest / Migrate / Eliminate**
  (Gartner TIME), plotting **technical fitness** (our health + maturity + SLO signals) against
  **business value** (PlanView attributes: user counts, criticality, OpCo).
- **Why for leadership:** This is _the_ canonical executive APM artifact — it turns the dashboard
  from "operational status" into a **rationalization / investment decision tool** (where to invest,
  what to retire). Highest strategic value to a CIO/leadership audience.
- **Feasibility:** **Bigger bet.** Technical-fitness axis is mostly in hand (maturity + health). The
  **business-value axis is the gap** — needs agreed PlanView-derived criticality/value inputs (and
  likely a short business conversation, à la Raja). No new Datadog dependency.
- **Data/source:** Technical fitness from Datadog (synced) + business value from PlanView catalog.
- **Evidence (verified):** Gartner TIME classifies apps into Tolerate/Invest/Migrate/Eliminate and
  evaluates along two dimensions — business value and technical quality/fitness (LeanIX, Korays,
  Xebia, Gartner toolkit).

---

## TOP 5 BY LENS

### (a) Product / feature value

1. **Portfolio risk roll-up + "where to look" worst-offenders view** (Overall #1). ⚡
2. **SLO error-budget & burn-rate** as a first-class, exec-legible signal (Overall #2). 💎
3. **TIME rationalization quadrant** (technical fitness × business value) (Overall #5). 🎯
4. **Emerging-risk / "what changed" feed** (Watchdog + −7d perception proxy) (Overall #3). 💎
5. **Replace the remaining placeholder cards** (Perception `'undefined'`, Active Users, Incidents,
   Last Incident) with real sourced values or an honest "Not available" — closes story 5-2 / 7-3 and
   removes the credibility risk of fake numbers in an exec view. ⚡

### (b) Data depth & accuracy

1. **Mapping-coverage as a tracked, trended KPI** — % of portfolio mapped to Datadog over time, by
   BU; turns the existing provenance/two-state model into a leadership coverage metric. ⚡
2. **Error-budget & burn-rate fields** added to the synced app model (depth from SLO history we
   already pull). 💎
3. **Maturity-score history** — snapshot the 0–5 score over time so leadership sees the portfolio
   _improving_ (or not), not just today's value. ⚡ (append-only snapshot, like health)
4. **APM `trace.*` latency/error baseline** (now vs −7d) stored per app as the RUM-free perception
   signal. 💎
5. **Data-freshness / provenance honesty** — record and display `lastSyncStatus` / `lastSyncAt`
   prominently; never show stale data as current (ties to the egress blocker 5-8: when auto-sync
   fails, say so). ⚡

### (c) Platform robustness

1. **Fix deployed-API → Datadog egress** (story 5-8) so sync is automatic, not manual — the
   foundational robustness gap; everything above assumes fresh data. 🎯 (infra/egress, Bernie/Saule)
2. **Async sync trigger** (story 5-9): endpoint returns 202 + background `syncAll` with
   `.catch → lastSyncStatus=error` + in-flight 409 guard — removes the 504 timeout failure mode. 💎
3. **Rate-limit-aware sync** — keep everything in the single bulk snapshot; honor Datadog `429` +
   rate-limit response headers with backoff (concurrency 6 + 429 backoff already in 1-4; generalize
   it). 💎
4. **Scheduled, idempotent auto-trigger** (the held-out crawler / CronJob, stories 1-6/1-7) once
   egress + Bernie's call land — UPSERT-by-key so re-sync never drops enrichment. 🎯
5. **Verify DB migrations run on deploy** (story 5-7, already ready-for-dev) — confirm `deploydb`
   actually applies, not manual loads. ⚡ (this is your current next story)

### (d) UX & adoption

1. **Executive weekly digest + shareable read-only link** (Overall #4). ⚡
2. **"5-second" exec landing view** — one screen: portfolio score, coverage %, top 5 risks;
   progressive disclosure / drill-down for everything else (avoid the "single pane of glass"
   overload trap). ⚡
3. **Color/state discipline** — consistent green/amber/red with the two-state missing-data model
   already built; never false-green an unmonitored app (already a principle — make it a documented
   UX rule). ⚡
4. **Drill-down path coherence** — portfolio → BU → app → monitor, with breadcrumb + the
   All/My-Applications scope preserved across levels. 💎
5. **Wire the 24h/7d/30d range buttons everywhere** consistently and add export (CSV/PDF) of any
   view for offline exec consumption. ⚡

---

## Quick wins vs. bigger bets (at a glance)

- **Quick wins (⚡):** portfolio risk roll-up (#1), exec digest + shareable link (#4), replace
  placeholder cards, coverage-as-KPI + maturity history, 5-second landing view, color discipline,
  range-buttons/export, verify DB migrations (5-7).
- **Medium (💎):** SLO error-budget/burn-rate (#2), perception proxy + Watchdog feed (#3), async
  sync (5-9), rate-limit-aware sync, drill-down coherence.
- **Bigger bets (🎯):** TIME rationalization quadrant (#5), fix Datadog egress (5-8), scheduled
  auto-trigger CronJob (1-6/1-7).

## Sources (verified subset)

**Primary:** Datadog Scorecards (`/internal_developer_portal/scorecards/` + `/custom_rules/`),
Datadog Watchdog (`/watchdog/` + `/watchdog/alerts/`), Datadog SLO error budget
(`/service_management/service_level_objectives/error_budget/`), Datadog API rate limits
(`/api/latest/rate-limits/`), Datadog Scheduled Reports (`/dashboards/sharing/scheduled_reports/`),
Google SRE Workbook (implementing-slos, error-budget-policy). **Analyst / practitioner:** LeanIX &
Korays (Gartner TIME), Gartner business/technical fitness toolkit, Tempo & Xebia & Lansweeper
(portfolio KPIs / rationalization), Datadog Scorecards blog, Datadog AIOps early-anomaly blog,
Splunk AIOps & golden signals, New Relic C-suite observability, CIO.com (IT/biz KPI bridge),
Customer Science (5-second rule), Pencil&Paper (dashboard UX patterns), SRE Leadership "Single Pain
of Glass," Dataroars (dashboard adoption), Rootly (AI incident response).
