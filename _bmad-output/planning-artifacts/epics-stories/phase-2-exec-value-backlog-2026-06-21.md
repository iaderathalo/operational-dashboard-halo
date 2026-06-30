# Phase-2 Backlog — Operational Dashboard (Executive Value)

_Generated: 2026-06-21 | PRD:
`_bmad-output/planning-artifacts/prds/prd-operational-dashboard-halo-2026-06-13/prd.md`_ _Source
research: `_bmad-output/planning-artifacts/research/platform-enhancement-research-2026-06-21.md`_
_Mapping + discovery: Iader | Build lead: Bernardo_

---

## Context

Phase 1 (Live Health) is delivered and the Datadog-enrichment roadmap (E7–E9) and live-catalog spike
(E10) are tracked. This epic is the **executive-value layer**: it turns the existing per-app signals
into the portfolio-level views, scores, and pushes that **leadership** actually acts on — "which
Business Unit is at risk, where do I look, what's degrading, where do we invest." It is grounded in
a deep-research pass (frameworks: Gartner TIME, Google SRE Workbook; vendor docs: Datadog Scorecards
/ Watchdog / SLO error budget / Scheduled Reports; plus exec-dashboard UX), constrained to what we
can build with **Datadog + PlanView** and our standing limits.

**The leverage:** four of the five stories need **zero or one** new Datadog call — they are
aggregation, scoring, and presentation over data the sync **already brings**. Audience priority is
**executives first**, then app owners, then ops. Epic numbering continues the project sequence
(E1–E6 Phase-1, E7–E9 enrichment, E10 Dremio) → **E11**.

### Sequencing at a glance

- **E11-S1 (portfolio risk roll-up)** — do first; quick win, no new Datadog calls; it is the
  substrate **S2/S4 build on**.
- **E11-S2 (error budget / burn-rate)** — layers onto S1's roll-up; data already synced.
- **E11-S4 (exec digest + shareable view)** — adoption quick win; reads S1's roll-up; no new Datadog
  calls.
- **E11-S3 (Watchdog emerging-risk feed)** — **spike before build** (entitlement + app-join
  coverage); reuse the E9 engine where it overlaps.
- **E11-S5 (TIME rationalization quadrant)** — **bigger bet**; gated on a leadership-agreed
  business-value axis.

### Standing constraints (apply to all stories)

- No RUM; no new paid integrations / entitlement-gated APIs without a spike.
- `/api/v1/query` ~1600 req/h/org; metrics retained 15 months → stay inside the **one bulk
  snapshot**; no per-app calls.
- Incident & service-catalog joins remain weak (~0.1% `service`-tag coverage) — not relied on here.
- Keys from `ConfigService` / Vault; probes read-only, never print keys.

---

## E11 — Executive Value (portfolio roll-up, reliability budget, predictive feed, adoption, rationalization)

**Goal:** Convert the per-app signals already in hand into leadership-legible portfolio views —
answer "where do I look," express reliability as a budget, surface what's quietly degrading, push a
weekly digest, and frame invest/retire decisions. Highest exec value-per-effort; mostly local logic
over synced data.

---

### E11-S1 — Portfolio risk roll-up (aggregate health, maturity & coverage up the BU tree) ⚡ quick win

**Owner:** Bernardo / Iader | **Blocked by:** nothing (data already synced) | **Status:**
ready-for-dev

**As a** leadership stakeholder, **I can** see each OpCo → BU → LOB node carry an aggregate roll-up
(% healthy, coverage %, % SLO-passing, avg maturity) plus a "where do I look" worst-offenders list,
**so that** I see portfolio risk at a glance instead of reading 3,656 rows.

**Acceptance Criteria:** node-level aggregates from descendant apps; pure local logic (no new
Datadog call); a default-sorted "Top risks" panel with a documented ordering; respects the two-state
missing-data model (unmonitored never a false GREEN) and the All/My-Applications scope; unit tests
for healthy / mixed / all-unmonitored / sort.

**FR refs:** new (exec roll-up) — _Story file:_ `stories/11-1-portfolio-risk-rollup.md`

_Key files:_ node builders `buildLobNode`/`buildBusinessUnitNode`/`buildOpCoNode`/`buildPortfolio`
in `apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`; portfolio-tree node model;
portfolio-page UI.

---

### E11-S2 — SLO error-budget & burn-rate (exec-legible reliability, rolled up to BU) 💎 medium

**Owner:** Bernardo | **Blocked by:** **E11-S1** for the BU roll-up (per-app surfacing can ship
independently) | **Status:** ready-for-dev

**As a** leadership stakeholder, **I can** see error budget remaining + burn rate per app and rolled
up by BU, **so that** reliability reads as a budget being spent and I can spot apps trending to
breach.

**Acceptance Criteria:** burn rate computed from already-synced SLO data (unitless; >1 = trending to
breach); budget + burn surfaced with documented bands; rolled up onto the S1 node aggregate; no-SLO
apps show honest missing-data (never fabricated/default-green); pure local logic inside the existing
bulk pass; unit tests for burn<1 / burn>1 / exhausted / no-SLO.

**FR refs:** new (derived reliability metric) — _Story file:_
`stories/11-2-slo-error-budget-burn-rate.md`

> **Verified basis:** error budget = `1 − SLO`; burn rate is a unitless Google-coined ratio (Datadog
> SLO docs; Google SRE Workbook). `errorBudgetRemainingPct` / `slaTarget` already exist in
> `toPortfolioApp`.

---

### E11-S3 — Watchdog "emerging risk / what changed" feed (SPIKE → build) 💎 spike-gated

**Owner:** Iader (spike) / Bernardo (build) | **Blocked by:** its own spike (entitlement + app-join
coverage) | **Status:** backlog

**As a** leadership stakeholder, **I can** see a short plain-language feed of what's quietly
degrading (Datadog Watchdog anomalies joined to our apps), **so that** I catch emerging risk before
it becomes an incident.

**Acceptance Criteria:** read-only spike records entitlement, volume, app-join coverage %, and
go/no-go (fallback to existing-signal derivation if join too low); if GO, a portfolio + BU "emerging
risks" feed in plain language with drill-down, pulled in the sync cadence (not per-app),
honest-empty when none; unjoinable items excluded, never mis-attributed.

**FR refs:** discovery + build — _Story file:_ `stories/11-3-watchdog-emerging-risk-feed.md`

> **Watchdog is built-in (no integration, no setup)** — but access/volume/join are unproven here, so
> we **probe before we promise** (cf. E8-S1/E8-S3). **Do not fork E9** — reuse the `E9-S2` baseline
> engine where the signal is the `-7d`/anomaly trend; this story owns the portfolio feed layer.

---

### E11-S4 — Executive weekly digest + shareable read-only snapshot ⚡ quick win (adoption)

**Owner:** Bernardo / Iader | **Blocked by:** **E11-S1** (reads its roll-up) | **Status:**
ready-for-dev

**As a** leadership stakeholder, **I can** get a scheduled weekly digest (score, coverage %, top
movers, new risks) and a read-only shareable link, **so that** I stay informed without logging in
daily and can forward a view.

**Acceptance Criteria:** digest generated from the existing store (no new Datadog call);
configurable schedule + recipient list via Vault/Config; read-only timestamped snapshot/export;
data-freshness honesty (`lastSyncStatus`/ `lastSyncAt`, says so when the last sync failed — cf.
`5-8`); degrades to point-in-time when no prior period exists; tests for data / failed-sync /
no-prior-period.

**FR refs:** new (adoption / distribution) — _Story file:_
`stories/11-4-exec-digest-shareable-snapshot.md`

> **Verified basis:** Datadog ships native Scheduled Reports (email) as the pattern; adoption hinges
> on pushing to the inbox (dashboard-adoption + single-pane-of-glass research). Reads our own store
> → no rate-limit impact.

---

### E11-S5 — TIME-model rationalization quadrant (technical fitness × business value) 🎯 bigger bet

**Owner:** Iader (axis definition, with Raja) / Bernardo (build) | **Blocked by:** leadership-agreed
business-value axis | **Status:** backlog

**As a** leadership stakeholder, **I can** see apps classified Tolerate / Invest / Migrate /
Eliminate on a technical-fitness × business-value quadrant, **so that** the dashboard drives
invest/retire decisions, not just operational status.

**Acceptance Criteria:** technical-fitness from existing health/maturity/SLO; business-value from
agreed PlanView attributes; both banded per a documented, signed-off formula; apps placed in the
four TIME quadrants with a transparent "why" breakdown; honest degradation on insufficient data; no
new Datadog integration; tests for each quadrant + insufficient-data.

**FR refs:** new (portfolio rationalization) — _Story file:_
`stories/11-5-time-rationalization-quadrant.md`

> **Gated:** the business-value axis must be agreed with leadership/Raja before scoring is built, or
> it encodes an arbitrary value judgment. Technical axis reuses `7-2`. May lean on epic-10 (live
> Dremio) for richer value data.

---

## Out of scope / boundaries

- Items already tracked elsewhere are **not** duplicated here: placeholder-cell cleanup
  (`5-2`/`E7-S3`), the per-app perception pill (`E9`), egress fix (`5-8`), async sync (`5-9`),
  DB-migration verify (`5-7`). This epic references them where they intersect but does not re-own
  them.
- Anything requiring RUM, a new paid integration, or a reliable `service`-tag join is out of scope
  by constraint.
