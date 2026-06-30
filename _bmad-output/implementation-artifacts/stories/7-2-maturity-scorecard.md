# Story 7.2: Derived observability maturity scorecard

Status: done

## Story

As a portfolio stakeholder, I want a per-app **observability maturity scorecard** derived from the
signals we already sync, so that I can tell at a glance which apps are well-instrumented — the
differentiator that Backstage / Cortex / OpsLevel / Port build on top of.

## Context / Why

With Health + Uptime live, the sync already brings — per app, with **zero new Datadog calls** —
whether an app has monitors, has an SLO, whether the SLO is passing, and whether it is mapped to
Datadog at all. A maturity score is pure local logic over data already in hand, making it the
highest value-per-effort enrichment. (Once the Service Catalog lands in Phase-2 **E8-S4**,
`has-owner` enriches the score; until then it is computed from the four available signals.)

The portfolio projection `MongoPortfolioRepository.toPortfolioApp`
(`mongo-portfolio.repository.ts:385`) already surfaces the inputs: `datadogMapped` (`:399`),
`healthStatus` (`:392`), `uptime30d`/`errorBudgetRemainingPct`/ `slaTarget` (`:396-398`), and
`monitors` (`:403`). The score is derived from these — no new fetch.

## Acceptance Criteria

1. A derived maturity score is computed per app from the signals already available locally:
   **has-monitor**, **has-SLO**, **SLO-passing**, **mapped** (and **has-owner** once E8-S4 provides
   ownership).
2. The computation is **pure local logic** over existing snapshot/sync data — **no new Datadog API
   call** is added.
3. The score **and its component signals** are surfaced per app (portfolio column and/or detail
   card); the component breakdown is visible, not just one opaque number (a stakeholder can see
   _why_ an app scores low).
4. An **unmapped** app scores honestly (low / "not instrumented") — never a misleading high score,
   consistent with the "never a false GREEN" rule from Phase-1.
5. Missing inputs reuse the existing two-state missing-data treatment (Phase-1 `5-6`) rather than
   showing a fabricated value.
6. Unit tests cover the score derivation for: fully instrumented, partially instrumented, and
   unmapped apps.

## Dev Notes

- **Model:** add the score + component fields to the shared model
  `libs/shared/api/src/model/dashboard/Application.ts` (and the `PortfolioApp` shape consumed by the
  UI).
- **Derivation:** compute in the sync rollup (where health is already computed) or as a derived
  projection in `toPortfolioApp` (`apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts:385`)
  — keep it co-located with the signals it reads (`datadogMapped`, `healthStatus`, `uptime30d`,
  `slaTarget`, `errorBudgetRemainingPct`, `monitors`). Prefer deriving once in the sync and
  persisting if other views need it; otherwise project on read.
- **UI:** render the score + breakdown in the portfolio table and/or the detail Overview, reusing
  existing card styling and the provenance/missing-data conventions — no new visual language.
- **Reuse, don't reinvent:** all inputs already exist on the stored application; this is scoring
  logic + a render, not a new integration.

## Out of scope / follow-ups

- `has-owner` is included in the formula but stays unsatisfiable until **E8-S4** (Service Catalog)
  lands — compute around its absence; do not block this story on it.
- Exact weighting / banding (e.g. 0–4 points vs a letter grade) is an implementation choice — keep
  it simple and transparent; surface the components regardless.

## References

- Phase-2 epic: `phase-2-datadog-enrichment-backlog-2026-06-18.md` → **E7-S2**.
- Supersedes Phase-1 stub **E5-S4** (migrated).
- Enriched later by **E8-S4** (Service Catalog → `has-owner`).
- Origin: archived research
  `_bmad-output/planning-artifacts/research/datadog-enrichment-research-2026-06-16.md` (#4 "Maturity
  Scorecard").

## Dev Agent Record

### File List

- libs/shared/api/src/model/dashboard/Application.ts
- apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts (+ spec)
- apps/api/src/dashboard/ sync rollup (where health is computed) — if derived at sync time
- apps/ui/src/app/features/dashboard/pages/portfolio-page/ and/or detail-page render
