# Work-Scope Reconciliation — Raja's draft vs. what we've built

**Date:** 2026-06-25 · **Author:** Iader · **Status:** working analysis for today's 2pm demo
**Inputs:** `docs/Platform Dashboard_Work details_Draft.pdf` (Raja's work-scope draft, written with
Anand — _draft / amendable, to be discussed in today's demo_) + the 2026-06-25 Teams thread
(Justin's Dremio warning).

---

## 1) What the new draft says

A leadership-oriented reframe of the dashboard. Every measure is judged on **Need** (valuable?) ·
**Availability** (have the data?) · **Feasibility** (can we render it?) — the same lens we've used
for our GO/PARTIAL/NO-GO verdicts. Then **Epic 0 + five epics**, sequenced by value-to-effort:

- **Epic 0 — Foundation (service tagging).** _Gates everything, done first._ Clean, consistent
  `service` tags so the rest can join. (Inferred from the roadmap + Epic-2 engineering note; its
  section is the page-2 diagram.)
- **Epic 1 — Reliability core** (leadership headline): SLO attainment + error budget (1.1), active
  incidents by severity (1.2), MTTR trend (1.3), monitor/alert rollup (1.4), + common tile
  states/refresh.
- **Epic 2 — Service health matrix** (engineer drill-down for Epic 1): per-service
  throughput/error-rate/p50-p95-p99 latency (2.1), slowest endpoints (2.2), top error services
  (2.3), firing-monitors list (2.4).
- **Epic 3 — Delivery velocity / DORA**: deploy frequency (3.1), change failure rate (3.2), lead
  time (3.3), combined DORA panel (3.4). _New data domain — deployment events + CI/CD._
- **Epic 4 — Experience & depth** (engineer enrichment, _not_ leadership headline): RUM / Core Web
  Vitals (4.1), synthetic journeys (4.2), error-log volume + deploy markers (4.3), service
  dependency map (4.4).
- **Epic 5 — Cost & efficiency** (built last): Datadog usage tile (5.1, available now), cloud spend
  (5.2, gated on Cloud Cost Management license).

---

## 2) ⚠️ Two strategic flags before anything else

### A. Dremio may be decommissioned (Justin, 2026-06-25)

> "I would avoid building anything new against Dremio just in case the data team goes ahead with the
> decommissioning."

- **Impact:** our live PlanView/CAI catalog source (**epic-10**, built & committed) reads Dremio. If
  it's decommissioned, that source dies.
- **Reassurance we can give:** the loader is **source-agnostic by design** — `USE_REAL_PLANVIEW`
  flag + upsert-by-`InternalID`; only the client class is Dremio-specific. Swapping to a successor
  source is contained.
- **Actions:** (1) **pause** the Dremio service-token chase (10-3) — don't sink effort into
  prod-hardening a source that may go away; (2) **confirm with the Data team** whether/when it's
  real (Justin saw no formal comms); (3) **identify the successor** source for the CAI catalog and
  point the loader at it.

### B. "Service" vs "Application" + the tagging gate (this is Epic 0, and it's bigger than a "foundation story")

The draft is written around **services** (`checkout-api`, `payment-service`) — classic Datadog/APM
framing. Our entire build is keyed on **applications** (PlanView CAI, ~3,656 apps, `app_short_key`).
In **this org we measured the coverage**:

- `app_short_key` (primary) + `app_service_id` (fallback) are the **only reliable per-entity
  bridges**.
- `service` tags are **~0.1% populated** on our apps' monitors (8-2 / 8-4 probes).

**So Epic 0 is not quick wiring — it's an org-wide data-hygiene program.** Everything that needs
`service`/APM joins (Epic 2 in full, the APM parts of Epic 4) is blocked until that lands. We have
the exact numbers to bring to the sequencing discussion. The open architecture decision: **is the
dashboard's unit the application (PlanView) or the service (Datadog/APM)?** Our
maturity/portfolio/tree layer is the _application-governance_ answer; their Epic 1/2 is the
_service-reliability_ answer — they can coexist, but the unit needs an explicit call.

---

## 3) Mapping — their user stories vs. our build

Legend: ✅ Have · 🟡 Partial · 🆕 Gap (new, buildable) · ⛔ Blocked (access/license/tagging)

| Their story                                         | Status | Where we are / the enabler                                                                                                             |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **E0** Service-tag foundation                       | ⛔     | **Master gate.** ~0.1% `service`-tag coverage measured. Org data-hygiene, not our code.                                                |
| **1.1** SLO attainment + error budget               | 🟡     | We have `errorBudgetRemainingPct` + **burn-rate** (11-2). Need per-SLO attainment tile + colors + editable critical-SLO list + window. |
| **1.2** Active incidents by severity                | ⛔     | Datadog incidents join only via `service` (~0.1%) → needs **ServiceNow** (12-3, access pending; Nemi's Unified-Pipeline path).         |
| **1.3** MTTR trend                                  | ⛔     | Needs incident start/resolve times → **ServiceNow** (same as 1.2).                                                                     |
| **1.4** Monitor/alert rollup (OK/Warn/Alert/NoData) | ✅     | Per-app monitor states already synced. Global rollup tile = small lift.                                                                |
| **1.X** Tile states + scheduled refresh             | 🟡     | Two-state / provenance done (5-3/5-6). Scheduled refresh is **manual today** (13-9 / 1-7, blocked by egress 5-8).                      |
| **2.1** Per-service matrix (tput/error/latency)     | ⛔     | APM trace metrics carry **no `app_short_key`**; ~0.1% `service`. Gated on E0.                                                          |
| **2.2** Slowest endpoints                           | ⛔     | APM. Gated on E0.                                                                                                                      |
| **2.3** Top error-producing services                | ⛔     | APM. Gated on E0.                                                                                                                      |
| **2.4** Firing-monitors list                        | ✅     | Monitor drill-down exists (commit 8b81cef): name/state/message/last-triggered.                                                         |
| **3.1** Deploy frequency                            | 🆕     | New domain. Candidate source = **Unified Pipeline / ServiceNow change tickets** (Nemi's hint).                                         |
| **3.2** Change failure rate                         | 🆕     | Deploys × incidents (both via ServiceNow/UP).                                                                                          |
| **3.3** Lead time for changes                       | 🆕     | CI/CD; **CI Visibility license uncertain** (their own note). Main effort/uncertainty in Epic 3.                                        |
| **3.4** Combined DORA panel                         | 🆕     | Composite of 3.1–3.3 + MTTR (1.3).                                                                                                     |
| **4.1** RUM / Core Web Vitals                       | ⛔     | Needs RUM (licensing/instrumentation). We've been deliberately **RUM-free** (epic-9).                                                  |
| **4.2** Synthetic journey tile                      | ✅✅   | **We built this** — 12-4 Synthetic Health Check Breakdown, ~98.6% coverage, real 30-day uptime. Strongest match.                       |
| **4.3** Error-log volume + deploy markers           | 🟡     | Logs reachable (probe exists); deploy markers need deployment events (Epic 3 overlap).                                                 |
| **4.4** Service dependency map                      | ⛔     | APM traces + `service` tags. Gated on E0.                                                                                              |
| **5.1** Datadog usage tile                          | 🆕     | New but **easy / no extra license** (Datadog usage API). Buildable now.                                                                |
| **5.2** Cloud spend                                 | ⛔     | = our **12-5**; needs Cloud Cost Management license / FinOps cost-allocation tag. They acknowledge the gate.                           |

---

## 4) What we built that is NOT in their draft (make sure it survives the reframe)

These are differentiators — map them in explicitly or they risk being read as out-of-scope:

- **Maturity scorecard (7-2) + breakdown (13-6) + on-demand recommendations (12-2).** Position as
  the _"are we getting better or worse?"_ governance layer — literally Epic 1's stated goal.
- **Portfolio risk roll-up + "Top Risks" (11-1)** and the **OpCo→BU→LOB tree (3-x)** — the
  leadership navigation/aggregation that their per-tile epics don't describe.
- **Exec digest / shareable snapshot (11-4)**, **TIME rationalization quadrant (11-5, backlog)**.
- **Provenance / two-state health (5-3/5-6)**, **query performance (13-8/13-12)**.
- **AI application metrics (epic-14)** — Anand's separate ask (Justin + Raja + Iader); **not in this
  draft**. Decide where it lives (its own epic, or inside Epic 4 experience).

---

## 5) Talking points for today's 2pm demo

1. **Affirm the direction** — it's well-structured and matches our Need/Availability/Feasibility
   lens.
2. **Bring the receipts on Epic 0:** measured ~0.1% `service`-tag coverage → Epic 2 and the APM
   parts of Epic 4 are blocked until an org-wide tagging effort. Sequence realistically.
3. **Propose the realistic near-term slice** (high Need × high Feasibility, mostly already in hand):
   Epic 1 error budget (1.1) + monitor rollup (1.4/2.4) ✅, Epic 4 **synthetics (4.2)** ✅, Epic 5.1
   Datadog usage 🆕(easy). That's a credible leadership-grade v1 we can largely show **today**.
4. **Make ServiceNow / Unified Pipeline the priority enabler** — it unlocks **two** leadership
   epics: incidents/MTTR (Epic 1) _and_ DORA deployment events (Epic 3). Ties to Nemi's DevOps/UP
   guidance (12-3).
5. **Raise the Dremio decommission** (per Justin): pause 10-3, confirm with the Data team, find the
   successor source; reassure that our loader is source-agnostic.
6. **Settle the service-vs-application unit** — the core architecture decision underneath the whole
   scope.
7. **Map our delivered work in** (maturity, recommendations, roll-ups, digest, provenance) so it's
   not dropped; and agree where **AI metrics (epic-14)** sits.
