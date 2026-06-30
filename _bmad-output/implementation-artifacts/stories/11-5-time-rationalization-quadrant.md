# Story 11.5: TIME-model rationalization quadrant (technical fitness × business value)

Status: backlog

## Story

As a **leadership stakeholder**, I want a portfolio **quadrant** that classifies apps **Tolerate /
Invest / Migrate / Eliminate** (Gartner TIME) by plotting **technical fitness** against **business
value**, so that the dashboard becomes an investment/rationalization decision tool — where to
invest, what to retire — not just an operational status board.

## Context / Why

The Gartner **TIME** model is _the_ canonical executive Application Portfolio Management artifact:
it evaluates each app on two dimensions — **business value** and **technical fitness/quality** — and
places it in one of four quadrants **Tolerate / Invest / Migrate / Eliminate** (verified: LeanIX,
Korays, Xebia, Gartner toolkit). This elevates the platform from "is it healthy now" to "should we
keep investing in it," the highest-strategic-value view for a CIO.

**Why backlog / bigger bet:** the **technical-fitness axis** is largely in hand (health + `7-2`
maturity + SLO signals we already compute). The **business-value axis is the gap** — it must be
defined from PlanView attributes (e.g. internal/external user counts, criticality, OpCo) and
**agreed with leadership/Raja** before it is meaningful. This story is gated on that business-value
definition; it adds **no new Datadog dependency**.

## Pre-work (gates the build)

1. **Define the business-value axis** with leadership/Raja: which PlanView attributes compose it
   (user counts, criticality/tier, OpCo strategic weight) and how they band into low/high. Record
   the agreed formula.
2. **Define the technical-fitness axis** from existing signals (maturity score + health +
   SLO-passing) and how it bands into low/high. Both axes and the quadrant thresholds are documented
   before build.

## Acceptance Criteria

1. Each app is assigned a **technical-fitness** score (from already-synced health/maturity/SLO
   signals) and a **business-value** score (from agreed PlanView attributes), each banded low/high
   per the documented formula.
2. Apps are placed into the four **TIME** quadrants (Tolerate / Invest / Migrate / Eliminate) and
   rendered as a portfolio quadrant view, filterable by OpCo / Business Unit and honoring the
   `?scope=mine` toggle.
3. The classification is **transparent** — a stakeholder can see _why_ an app landed in its quadrant
   (both axis scores and their components), consistent with the "show the breakdown" rule from
   `7-2`.
4. Apps missing a business-value input or technical signal degrade honestly (excluded or flagged
   "insufficient data"), never silently placed in a misleading quadrant.
5. No new Datadog integration is added; the technical axis reuses existing signals, the business
   axis reuses PlanView.
6. Tests cover quadrant assignment for representative apps in each of the four quadrants + an
   insufficient-data app.

## Dev Notes

- **Blocked until** the business-value axis is agreed (pre-work step 1) — do not implement scoring
  before the formula is signed off, or it will encode an arbitrary value judgment.
- **Technical axis:** reuse `7-2` maturity + `healthStatus` + SLO-passing from `toPortfolioApp`
  (`apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`).
- **Business axis:** derive from PlanView fields already loaded (user counts, OpCo, criticality if
  present); add the fields to `libs/shared/api/src/model/dashboard/Application.ts`.
- **UI:** a quadrant/scatter view on the portfolio page; reuse existing filtering + color
  discipline.

## Out of scope / follow-ups

- Automated rationalization _recommendations_ (beyond placement) are out of scope — placement +
  transparency only.
- If PlanView lacks a usable criticality/value field, that gap becomes a data follow-up (possibly
  via the live Dremio source, epic-10) before this can be fully meaningful.

## References

- Phase-2 epic: `phase-2-exec-value-backlog-2026-06-21.md` → **E11-S5**.
- Research origin: `platform-enhancement-research-2026-06-21.md` (Overall #5) — Gartner TIME
  (LeanIX, Korays, Xebia).
- Reuses `7-2` (maturity), PlanView catalog (`3-1`); may depend on epic-10 for richer business-value
  data.

## Dev Agent Record

### File List

- libs/shared/api/src/model/dashboard/Application.ts (business-value + technical-fitness fields)
- apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts (+ spec) — axis scoring + quadrant
  assignment
- apps/ui/src/app/features/dashboard/pages/portfolio-page/ — quadrant view
