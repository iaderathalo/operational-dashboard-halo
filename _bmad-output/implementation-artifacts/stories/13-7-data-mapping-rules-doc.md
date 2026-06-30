# Story 13.7: Data Mapping Rules living document — per-card source · data · calc · refresh · API

Status: done

## Story

As **the team (and the reviewer)**, I want a single **living "Data Mapping Rules" document** that
states, for every card and screen, its **source service**, the **data behind it**, **how it's
calculated** (precompute vs direct value), its **refresh frequency**, and the **API interface**
(request/response shape), so that **provenance is auditable and onboarding is fast** — anyone can
answer "where does this number come from and how fresh is it?" without reading the code.

## Context / Why

This story's **deliverable is a document, not code**. The 2026-06-23 design review explicitly asked
for a "Data Mapping Rules" doc during review: per card/screen, the source service · the data behind
it · how it's calculated (precompute vs direct value) · refresh frequency · the API interface
(request/response).

The knowledge already mostly exists and just needs to be **formalized in one place**: it is **seeded
from** the epic-12 card-sourcing research
(`card-sourcing-and-maturity-recommendations-research-2026-06-23.md`, which already carries a
per-card feasibility matrix with real source, endpoint/metric, coverage, limits, and a GO/NO-GO
verdict) and the **13-2 metric-description tooltip map** (E13-S2 — calc + source + meaning on hover
for every rendered metric). This story turns those into a durable, queryable reference table and
commits the team to **keeping it current as cards land** (a card that goes from placeholder → live
updates its row; a tooltip that ships updates the calc/source columns).

It lives alongside the existing data docs in `docs/` (`docs/datadog-planview-data-requirements.md`,
`docs/datadog-dashboard-data-elements.md`, `docs/dashboard-architecture.md`) — the established home
for data-provenance notes in this repo.

## Acceptance Criteria

1. A **single new markdown document** is created at `docs/data-mapping-rules.md` (sibling to the
   existing `docs/datadog-*.md` data docs). Its existence/path is added to the doc set; it is the
   canonical provenance reference.
2. The doc contains **one table** (or a section-per-screen with a table) where **each row is a card
   or a metric/column** and the columns are exactly: **Card / Screen · Source service · Data behind
   it · How it's calculated (precompute vs direct value) · Refresh frequency · API interface
   (request → response)** — plus a **Status** column (live / placeholder / NO-GO) so a reader can
   tell real data from dummy data at a glance.
3. **Coverage is complete** across the current surfaces. The doc must include a row for:
   - **Portfolio page** — the rollup tiles (App count, Green/Amber/Red/Undefined counts), the "Top
     risks / where to look" panel (node ranking + app ranking), and **every portfolio table
     column**: `Application`, `Health`, `Perception`, `Uptime`, `Maturity`, `Burn Rate`,
     `Total External Users`, `Total Internal Users`, `Active Users`, `Incidents`, `Last Incident` —
     flagging the **placeholder columns** (`perception`, `activeUsers`, `incidents`, `lastIncident`)
     as such, consistent with `placeholderColumns` in `portfolio-page.component.ts`.
   - **Detail page — every tab** in `DETAIL_TABS`: `overview`, `health`, `perception`, `ai-tokens`,
     `ai-drift`, `cost`, `incidents`, `contacts`, `settings` (plus the overview metric tiles and the
     Health-tab Recent Health Events / Recent Activity / Health Check Breakdown / monitors
     surfaces).
4. **Each row is grounded in the epic-12 research verdict**, not invented. Cards the research marks
   **GO NOW** (Recent Health Events, Recent Activity) cite our own store + the join key; cards
   marked **NO-GO portfolio-wide** (Response Time P50/P90/P99, Error Rate, AI Tokens, AI Drift,
   Feature Health Summary) are recorded as **placeholder / NO-GO with the blocking reason** (the
   `service`-tag gate vs. our `app_short_key` / `app_service_id` bridges) — **no fabricated "live"
   provenance** for cells that are not actually wired. PARTIAL/GO-WITH-WORK cards (Infra Cost MTD,
   Open Incidents via ServiceNow, Synthetics Health Check Breakdown) record the unblocker.
5. The **"How it's calculated" column distinguishes precompute from direct value**: e.g. Health
   derives GREEN/AMBER/RED from synced Datadog signals (precompute, two-state missing-data model —
   never a false GREEN); Maturity is `computeMaturity()` over 5 booleans (precompute); the rollup
   counts are aggregated client-side; dummy cards are labelled "static template
   (`detail-page.data.ts`)".
6. The **API interface column** names the actual endpoint/metric for each live row (e.g. the
   dashboard portfolio/detail API, `HealthSnapshot` history, Datadog timeseries/Synthetics,
   ServiceNow Table API), with a one-line request → response note; placeholder rows say "n/a —
   static" and NO-GO rows name the endpoint that _would_ serve it plus why it doesn't (coverage
   ~0.1%).
7. The doc carries a **maintenance contract** at the top: a one-paragraph "How to keep this current"
   note stating the rule — **when a card flips placeholder → live (or a 13-2 tooltip ships), update
   that row** — and a "Last updated / seeded from" line citing the epic-12 research and the 13-2
   tooltip map.
8. **No application code is changed by this story** — the only repo change is the new doc file (and,
   if desired, a one-line link to it from an existing docs index).

## Dev Notes

- **Deliverable = the doc.** Do not modify components, models, or services. The acceptance bar is a
  complete, accurate, grounded table — not new behavior.
- **Seed sources (read these, then transcribe, don't re-derive):**
  - Per-card source/endpoint/coverage/verdict:
    `_bmad-output/planning-artifacts/research/card-sourcing-and-maturity-recommendations-research-2026-06-23.md`
    (§2 per-card feasibility matrix is effectively the spine of the table).
  - Metric calc + source + meaning per rendered metric: the 13-2 tooltip map (E13-S2,
    `stories/13-2-metric-description-tooltips.md`) — reuse its wording so doc and tooltip agree.
  - Source-of-truth split + existing endpoints: `docs/datadog-planview-data-requirements.md`,
    `docs/datadog-dashboard-data-elements.md`.
- **Ground the surface inventory from code**, not memory:
  - Detail tabs: `DETAIL_TABS` / `DetailTabId` in
    `apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.data.ts` (`overview`,
    `health`, `perception`, `ai-tokens`, `ai-drift`, `cost`, `incidents`, `contacts`, `settings`).
  - Portfolio columns + which are placeholder: the `<th>` list and `placeholderColumns` in
    `apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.{html,ts}`.
  - The static dummy data still backing most detail cards lives in `detail-page.data.ts`
    (`DETAIL_TEMPLATE`) — rows for those cards must say "static template", matching the greyed-out
    treatment in the UI.
- **Honesty discipline:** mirror the project's standing principle (two-state missing-data model,
  never a false GREEN, freshness-honest). A NO-GO card must read as NO-GO in the doc; this doc is a
  trust artifact.
- **Format:** a wide markdown table is fine; if it gets unwieldy, split by screen (Portfolio /
  Detail-overview / Detail-health / …) with a small table each. Keep the same 7 columns throughout.

## Out of scope / follow-ups

- Building/wiring any of the NO-GO or PARTIAL cards to live data — those are their own stories
  (ServiceNow incidents, Synthetics, Infra Cost, LLM Recommendations) per the epic-12 backlog order
  A–E.
- The 13-2 in-app tooltips themselves (E13-S2) — this doc consumes their wording but does not
  implement them.
- Auto-generating the doc from code/annotations — out of scope; this is a hand-maintained living doc
  for now.

## References

- Phase-2 epic:
  `_bmad-output/planning-artifacts/epics-stories/phase-2-dashboard-trust-clarity-backlog-2026-06-23.md`
  → **E13-S7**.
- Seed research (epic-12 card-sourcing + maturity):
  `_bmad-output/planning-artifacts/research/card-sourcing-and-maturity-recommendations-research-2026-06-23.md`.
- Seed tooltip map: `stories/13-2-metric-description-tooltips.md` (E13-S2).
- Existing data docs the new doc sits beside: `docs/datadog-planview-data-requirements.md`,
  `docs/datadog-dashboard-data-elements.md`, `docs/dashboard-architecture.md`.
- Surface inventory (ground truth):
  `apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.data.ts`,
  `apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.{html,ts}`.

## Dev Agent Record

### File List

- docs/data-mapping-rules.md — NEW living "Data Mapping Rules" doc (the deliverable: one row per
  card/column × source · data · calc(precompute/direct) · refresh · API I/O · status); seeded from
  the epic-12 card-sourcing research + the 13-2 tooltip map, kept current as cards land

### Completion Notes

- Delivered `docs/data-mapping-rules.md` covering the full surface: portfolio rollup tiles +
  top-risks
  - every table column (placeholder columns flagged), and every detail tab (overview/health + other
    tabs) with the synced GO-NOW cards (Recent Health Events, Recent Activity) cited to our
    `HealthSnapshot` store and the NO-GO cards recorded as Sample with the `service`-tag-gate
    reason. No application code changed (doc-only, per AC8).
- **Mixed-audience design decision:** the doc is layered for business + technical readers in ONE
  file (single source of truth, no drift). Plain-language columns first (What you see · What it
  tells you · Real or sample? · How fresh) then technical columns (Source · How built · API); plus a
  plain legend (Real/Sample/Coming soon/Needs setup/Not-yet) and an exec "At a glance" summary. The
  deeper code-level detail (join keys, endpoints, calc fns, the ~0.1% tag gate) lives in a "Why some
  cards can't be real yet (for engineers)" section so business readers can stop where it turns
  technical.
- **Follow-up filed:** 13-11 in-app source legend (● live · ○ sample) — the higher-leverage half of
  "make it understandable for business" lives in the product, not a doc. Backlog.
