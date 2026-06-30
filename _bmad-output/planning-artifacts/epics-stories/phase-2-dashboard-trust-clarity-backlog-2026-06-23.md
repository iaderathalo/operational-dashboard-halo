# Phase-2 Backlog — Operational Dashboard (Trust, Clarity & Configurability)

_Generated: 2026-06-23 | PRD:
`_bmad-output/planning-artifacts/prds/prd-operational-dashboard-halo-2026-06-13/prd.md`_ _Source:
2026-06-23 design review_ _Mapping + discovery: Iader | Build lead: Bernardo_

---

## Context

A 2026-06-23 screen-share design review of the live dashboard validated the current direction
(maturity, real-vs-placeholder cards, two-state missing-data, Dremio/Datadog sourcing, top-risks)
and surfaced a set of **trust / clarity / configurability** improvements on the cards we **already**
render — plus one correctness concern about what "Health" actually measures. This epic captures that
feedback. It is **polish over existing real data**, not new data sourcing (that is epic-12).

Epic numbering continues the sequence (E1–E6 Phase-1, E7–E9 enrichment, E10 Dremio, E11 Exec-Value,
E12 Card-Truth) → **E13**.

### What the review validated (no action — already tracked)

Maturity 5/5 (7-2), top-risks panel (11-1), two-state NotMonitored (5-6), provenance dots (5-3),
Dremio live catalog (epic-10), OpCo→LOB tree (epic-3), Open Incidents + Infra Cost as wanted cards
(12-3/12-5), **AI Tokens & AI Drift not understood by anyone → our epic-12 NO-GO verdicts stand**,
perception out until defined with Raja/Anton (epic-4/9), burn-rate bands still pending sign-off
(11-2).

### The one correctness concern (becomes a spike)

Our `healthStatus` is a **worst-of monitor-state roll-up** (`health-rollup.ts`: GREEN = ≥1 active
monitor and all OK; empty/all-downtime → AMBER, never GREEN). The framing raised in review ("green
just means data exists") is imprecise, but the real risk holds: **GREEN depends entirely on which
monitors exist** — if an app's monitors don't probe real availability, "all OK" ≠ "app is up" (false
GREEN). Analyze before changing → **E13-S1 spike** on a concrete app (Beacon: has Datadog monitoring
AND runs locally).

### Standing constraints

- Polish only; reuse synced data + existing visual language. No new paid integration.
- Respect "never a false GREEN" (5-6 / PRD FR-2) and data-freshness honesty (5-8).
- Threshold/colour decisions are product-configurable, not hard-coded.

---

## E13 — Dashboard Trust, Clarity & Configurability

**Goal:** make every rendered metric **self-explaining, honestly named, and configurable**, fix the
Health-semantics risk, and improve information architecture + load performance — so a reviewer
trusts what the dashboard shows.

---

### E13-S1 — Health-semantics spike on an example app (Beacon) 🔬 spike — analyze first

**Owner:** Iader (spike) | **Blocked by:** Beacon runnable locally + Datadog read for Beacon's
monitors | **Status:** backlog

**As a** dashboard owner, **I can** know whether our monitor-rollup Health actually reflects real
availability for a concrete app, **so that** we either keep+explain "Health" or rename/augment it
before it misleads anyone.

**Acceptance Criteria (experiment with Beacon):**

1. Capture Beacon's `healthStatus` + the monitor list driving it + `datadogMapped`/`resolutionPath`
   from our store.
2. Classify Beacon's real Datadog monitors by **type** (metric / log / APM / synthetic /
   service-check) — do they probe availability or something tangential? (this decides whether "all
   OK" == "up").
3. Hit Beacon's **real health-check endpoint locally** (`/health` or equiv.; confirm what
   "Commodore" is) and compare against our current GREEN.
4. Force divergence: take Beacon's backend down locally → measure if/when our Datadog health flips
   (staleness/lag, false-green window).
5. **Decision recorded:** (a) keep "Health" + provenance tooltip; (b) rename to an honest label
   (e.g. "Monitoring Status"/"Datadog Signal") and/or add a real health-check signal
   (backend+frontend combined); (c) both.

**Verdict:** 🔬 spike → feeds a rename/augment story. — _Story file:_
`stories/13-1-health-semantics-spike.md`

_Key files:_ `apps/api/src/datadog/health-rollup.ts` (`stateToStatus`/`rollupStatus`);
`apps/api/src/health/` (our own Terminus health, for the pattern).

---

### E13-S2 — Metric description tooltips (calc + source + meaning on hover) ⚡ quick win

**Owner:** Bernardo / Iader | **Blocked by:** nothing | **Status:** backlog

**As a** user, **I can** hover any metric/card and read how it's calculated, where the data comes
from, and what it means, **so that** the numbers are self-explaining (a common dashboard
convention).

**Acceptance Criteria:** every rendered metric (Health, Uptime, Maturity, burn-rate, each card)
carries a hover tooltip with `how-calculated · source · meaning`; content lives in one maintainable
map (seed for the Data-Mapping doc, S7); consistent with existing provenance tooltips (5-3); no
fabricated descriptions for NO-GO/placeholder cells.

**Verdict:** ✅ GO NOW. — _Story file:_ `stories/13-2-metric-description-tooltips.md`

---

### E13-S3 — Per-metric configurable thresholds (colour settings) 💎 medium

**Owner:** Bernardo | **Blocked by:** product sign-off on default bands | **Status:** backlog

**As a** dashboard admin, **I can** configure the green/amber/red thresholds **per metric**, **so
that** colours are defined intentionally instead of assumed.

**Acceptance Criteria:** colours driven by a threshold config **per metric** (metrics are
transversal across apps), e.g. AI-Tokens <40% green / 40–80% amber / >80% red; some metrics global
(uptime); settings surface in the existing per-app Settings tab + a global default; documented
default bands; honest missing-data unaffected (never a false GREEN); tests for boundary values.

**Verdict:** ✅ GO (needs band sign-off). — _Story file:_ `stories/13-3-per-metric-thresholds.md`

> The review was explicit: configuration is **per metric**, not per app; some (uptime) are global.
> Ties into burn-rate bands (11-2) and any future card bands.

---

### E13-S4 — Information architecture: separate App Monitoring vs Perception + reorder 💎 UX

**Owner:** Bernardo / Iader | **Blocked by:** perception definition (S5) for the Perception group |
**Status:** backlog

**As a** user, **I can** see monitoring metrics grouped apart from perception metrics, with the most
important first, **so that** the table/detail reads clearly.

**Acceptance Criteria:** group "App Monitoring" vs "App Perception" (super-tab or table separator);
reorder so **Health 1st, Maturity 2nd, Uptime 3rd, burn-rate** after; **hide perception until
defined** (S5); no regression to the All/My-Applications scope or the two-state model.

**Verdict:** ✅ GO (monitoring side); Perception side gated on S5. — _Story file:_
`stories/13-4-metric-ia-grouping.md`

---

### E13-S5 — NFR tab + clarify Perception-vs-NFR with product 🧭 discovery + build

**Owner:** Iader (clarify w/ Anton + Raja) / Bernardo (build) | **Blocked by:** product decision on
what Perception is | **Status:** blocked

**As a** user, **I can** see real non-functional metrics (avg page-load time, avg upload time) in an
NFR tab, **so that** I get the performance signal Anton actually wants — distinct from subjective
perception.

**Acceptance Criteria:** record the decision — is "Perception" (a) subjective user sentiment
correlated to quantitative data via an LLM/ML model (Iader's understanding, epic-9), or (b) an
NFR/performance threshold (Anton's example: map/ upload too slow)? If NFR: a tab with sub-metrics
(avg page-load, avg upload time) against documented thresholds; evaluate overlap with **Pendo**
(does it already provide this?); educate Anton on the NFR-vs-perception distinction.

**Verdict:** 🧭 product-gated; refines epic-9 discovery. — _Story file:_
`stories/13-5-nfr-tab-perception-clarification.md`

---

### E13-S6 — Maturity breakdown made descriptive (5 sub-signals in cell/tooltip) ⚡ quick win

**Owner:** Bernardo | **Blocked by:** nothing | **Status:** backlog

**As a** user, **I can** hover the Maturity cell and see the 5 sub-signals (mapped / hasMonitor /
hasSLO / sloPassing / hasOwner) with pass/fail, **so that** I understand _why_ it's X/5, not just
the number.

**Acceptance Criteria:** maturity cell/tooltip shows the 5 booleans with state + a one-line meaning
each; reads from the existing `computeMaturity` signals object; refines 7-2's breakdown tooltip;
this is the lightweight cousin of the 12-2 recommendations tab (same signal substrate).

**Verdict:** ✅ GO NOW. — _Story file:_ `stories/13-6-maturity-breakdown-descriptive.md`

---

### E13-S7 — Data Mapping Rules living document 📄 doc

**Owner:** Iader | **Blocked by:** nothing (mostly exists in epic-12 research) | **Status:** backlog

**As a** team, **we have** a living doc that, per card/screen, states the source service, the data
behind it, how it's calculated (precompute vs direct), refresh frequency, and the API interface
(request/response), **so that** provenance is auditable and onboarding is fast.

**Acceptance Criteria:** one doc covering every card; rows = source · transform/calc · refresh
cadence · API I/O; seeded from the epic-12 card-sourcing research + the S2 tooltip map; kept current
as cards land.

**Verdict:** ✅ GO (formalize existing knowledge). — _Story file:_
`stories/13-7-data-mapping-rules-doc.md`

---

### E13-S8 — Query / load performance optimization ⚙️ perf

**Owner:** Bernardo / Iader | **Blocked by:** nothing | **Status:** backlog

**As a** user, **I can** load the portfolio + detail views quickly, **so that** the dashboard is
usable at 3,656-app scale (the review surfaced repeated slow loads).

**Acceptance Criteria:** profile the slow portfolio/detail queries; add indexes / projection /
pagination / caching as needed; measure before/after; no change to data correctness or the two-state
model.

**Verdict:** ✅ GO. — _Story file:_ `stories/13-8-query-perf-optimization.md`

---

### E13-S9 — Define + automate refresh cadence ⏱️ ops

**Owner:** Iader | **Blocked by:** intersects 1-7 (cronjob) / 5-9 (async) / 5-8 (egress) |
**Status:** backlog

**As an** operator, **I can** rely on the data refreshing on a defined cadence, **so that** it's not
a manual endpoint call (current state).

**Acceptance Criteria:** document the target refresh cadence (and the freshness contract surfaced
via `lastSyncAt`); wire it to the existing auto-trigger path (cronjob 1-7 / async 5-9) rather than
the manual endpoint; honest staleness when a sync fails (cf. 5-8).

**Verdict:** ✅ GO (decision + wiring). — _Story file:_ `stories/13-9-refresh-cadence.md`

---

### E13-S10 — Preserve navigation / tab state on Back ⚡ quick win

**Owner:** Bernardo | **Blocked by:** nothing | **Status:** backlog

**As a** user, **I can** hit Back and return to the app/tab where I was, **so that** I don't have to
re-search the app each time (this came up repeatedly in review).

**Acceptance Criteria:** Back restores the previously selected app + open tab + scroll/filter
context; no full reload of the portfolio; works with the All/My-Applications scope and the `?scope=`
query param.

**Verdict:** ✅ GO NOW. — _Story file:_ `stories/13-10-preserve-nav-state.md`

---

## Ideas parked (not committed stories)

- **Optimistic prefetching/profiling** — predictively preload data on user interaction (Iader's
  idea, e.g. preload on email entry before password). Interesting at Mercer's data scale, but
  speculative; revisit after S8 perf work.
- **Extensible maturity signals** — Iader floated adding Copilot/cost/AWS to maturity; note that
  changing the signal set changes the 0–5 scale (and S6's breakdown) — needs a deliberate product
  decision, not an ad-hoc add.

## Open questions / external unblockers

1. What did Jimmy mean by **AI Tokens** and **AI Drift**? _(owner: Jimmy, arrives Fri)_ → keeps
   epic-12 PARK frozen until answered.
2. Is **Perception** sentiment (LLM/ML) or an **NFR**? _(owner: Anton + Raja)_ → gates E13-S5 +
   epic-9.
3. What is **"Commodore"** / Beacon's real health-check endpoint? _(owner: Iader / Beacon team)_ →
   input to E13-S1.
4. Default **threshold bands** per metric for E13-S3. _(owner: product)_
