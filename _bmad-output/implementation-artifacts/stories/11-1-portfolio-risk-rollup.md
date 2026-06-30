# Story 11.1: Portfolio risk roll-up — aggregate health, maturity & coverage up the BU tree

Status: ready-for-dev

## Story

As a **leadership stakeholder**, I want each node of the OpCo → Business Unit → LOB tree to carry an
**aggregate risk roll-up** (% healthy, monitoring-coverage %, % SLO-passing, average maturity) plus
a **"where do I look" worst-offenders list**, so that I can see which part of the portfolio is at
risk in one glance instead of reading 3,656 app rows.

## Context / Why

Executives don't scan per-app rows — they need the portfolio rolled into "which Business Unit is on
fire, and where do I look." Every input already exists locally after a sync: per-app `healthStatus`,
the 0–5 maturity score (story `7-2`), `datadogMapped`/`resolutionPath` provenance (`5-3`/`5-6`), and
SLO-passing. This story aggregates those signals up the **already-built** tree and exposes a
default-sorted risk view — **zero new Datadog calls**, so no rate-limit impact (standing constraint:
stay inside the one bulk snapshot).

The tree is built in `mongo-portfolio.repository.ts` via `buildPortfolio` / `buildOpCoNode` /
`buildBusinessUnitNode` / `buildLobNode` (story `3-2`); roll-up aggregation slots in at those node
builders. Monitoring coverage as a tracked KPI is the analyst-recommended leadership metric (Datadog
Scorecards; Gartner portfolio-fitness roll-ups).

## Acceptance Criteria

1. Each tree node (LOB, Business Unit, OpCo) carries an **aggregate roll-up** computed from its
   descendant apps: `healthyPct`, `coveragePct` (mapped ÷ total), `sloPassingPct`, and `avgMaturity`
   (0–5), plus the **app count** the percentages are over.
2. Aggregation is **pure local logic** over already-synced data — **no new Datadog API call** is
   added.
3. A **portfolio "Top risks / where to look"** panel surfaces the worst nodes and worst apps first
   (default sort by a transparent risk ordering, e.g. lowest health/coverage weighted by app count);
   the ordering rule is documented.
4. Roll-ups respect the **two-state missing-data model** (`5-6`): an **unmonitored** app counts
   against coverage and never inflates a node to a false GREEN; "No data" is distinguished from "Not
   monitored" in the denominator logic.
5. The roll-up honors the **All / My Applications** scope toggle (`3-3`) — `?scope=mine`
   re-aggregates over the signed-in owner's apps; the detail view stays unaffected.
6. Unit tests cover: a healthy node, a mixed node, an all-unmonitored node (coverage 0%, not GREEN),
   and the weighting/sort of the worst-offenders ordering.

## Dev Notes

- **Aggregation site:** compute in the node builders `buildLobNode` → `buildBusinessUnitNode` →
  `buildOpCoNode` → `buildPortfolio` in `apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`
  (roll child aggregates upward; compute leaf values from `toPortfolioApp` outputs `healthStatus` /
  maturity / `datadogMapped` / SLO-passing).
- **Model:** add a `rollup` shape (the four metrics + app count) to the portfolio-tree node model in
  `libs/shared/api/src/model/dashboard/` consumed by the UI tree.
- **UI:** render the roll-up on each tree node (compact badges) and add the "Top risks" panel on the
  portfolio page (`apps/ui/src/app/features/dashboard/pages/portfolio-page/`), reusing existing
  card/badge styling and color discipline — no new visual language.
- **Reuse, don't reinvent:** inputs already exist on each app; this is aggregation + sort + render,
  not a new fetch.

## Out of scope / follow-ups

- Error-budget / burn-rate as a rolled-up signal is **story 11-2** (layers onto this roll-up
  mechanism).
- Trending the roll-up over time (history) is a data-depth follow-up — see backlog lens (b);
  snapshot like health.

## References

- Phase-2 epic: `phase-2-exec-value-backlog-2026-06-21.md` → **E11-S1**.
- Research origin:
  `_bmad-output/planning-artifacts/research/platform-enhancement-research-2026-06-21.md` (Overall
  #1).
- Builds on `3-2` (tree reshape), `7-2` (maturity), `5-3`/`5-6` (provenance/missing-data), `3-3`
  (scope toggle).

## Dev Agent Record

### File List

- libs/shared/api/src/model/dashboard/ (portfolio-tree node model: add `rollup`)
- apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts (+ spec) — node-builder aggregation
- apps/ui/src/app/features/dashboard/pages/portfolio-page/ — node badges + "Top risks" panel
