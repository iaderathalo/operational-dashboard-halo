# Story 11.2: SLO error-budget & burn-rate — exec-legible reliability, rolled up to BU

Status: ready-for-dev

## Story

As a **leadership stakeholder**, I want each app's **error budget remaining** and **burn rate**
surfaced (and rolled up by Business Unit), so that reliability reads as a _budget being spent_ and I
can see which apps are trending toward an SLO breach.

## Context / Why

"Error budget remaining" and "trending to breach" are the rare reliability concepts a non-technical
executive groks immediately — reliability reframed as a budget. The sync already paginates SLOs and
resolves their history, and `toPortfolioApp` already projects `errorBudgetRemainingPct` and
`slaTarget` (`mongo-portfolio.repository.ts:396-398`). This story adds the **burn-rate**
computation, presents both as a first-class exec signal, and **rolls them up** onto the tree roll-up
from story `11-1`.

Verified definitions (Datadog SLO docs; Google SRE Workbook): error budget = `1 − SLO target`;
**burn rate** is a unitless ratio (Google-coined) of how fast the budget is being consumed relative
to the SLO window — burn rate > 1 means trending to breach. All computable locally from SLO data
already in the snapshot — **no new integration**; keep any extra SLO-history resolution inside the
existing bulk pass to respect the ~1600 req/h/org limit.

## Acceptance Criteria

1. **Burn rate** is computed per app from already-synced SLO data: budget consumed over the window ÷
   allowed budget (unitless; > 1 = on track to exhaust the budget within the window). The window(s)
   used are documented.
2. Error budget remaining (existing `errorBudgetRemainingPct`) **and** burn rate are surfaced per
   app (portfolio column and/or detail card), colored by transparent burn-rate bands (e.g. healthy /
   fast-burn) — bands documented.
3. Both signals **roll up by Business Unit** onto the `11-1` node roll-up (e.g. count of apps
   fast-burning, worst budget-remaining in the node), so leadership sees reliability risk at the BU
   level.
4. Apps **without an SLO** show the honest missing-data state (`5-6`) — never a fabricated budget or
   a default-green burn rate; unmapped/unmonitored apps are excluded from the budget aggregation
   denominator, not counted as healthy.
5. Computation is **pure local logic** over existing snapshot data — **no new Datadog API call**
   beyond what the bulk sync already makes; any added SLO-history need rides the existing paginated
   pass.
6. Unit tests cover: healthy budget (burn < 1), fast-burn (> 1), exhausted budget, and no-SLO
   (missing state).

## Dev Notes

- **Compute site:** the sync rollup where SLO history is already resolved (co-locate burn rate with
  `errorBudgetRemainingPct`); persist the burn-rate field, or derive in `toPortfolioApp`
  (`apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`).
- **Model:** add `burnRate` (+ band) to `libs/shared/api/src/model/dashboard/Application.ts`; extend
  the `11-1` node `rollup` with the BU-level budget aggregates.
- **Reuse:** error-budget plumbing and SLO pagination already exist (Phase-1 `1-4`); this is one
  more derived metric
  - presentation, not a new fetch path.
- **Standing constraint:** do **not** add per-app SLO calls — burn rate must come from the
  bulk-resolved history.

## Out of scope / follow-ups

- Datadog-native burn-rate _alerting_ (notifications) is out of scope here — this is dashboard
  surfacing. The native alert capability is noted in research as a future option.
- The BU roll-up mechanism itself is delivered by `11-1`; this story extends it.

## References

- Phase-2 epic: `phase-2-exec-value-backlog-2026-06-21.md` → **E11-S2**.
- Research origin: `platform-enhancement-research-2026-06-21.md` (Overall #2) — Google SRE Workbook
  (implementing-slos, error-budget-policy); Datadog SLO error-budget docs.
- Builds on `1-4` (SLO sync), `11-1` (BU roll-up), `5-6` (missing-data).

## Dev Agent Record

### File List

- libs/shared/api/src/model/dashboard/Application.ts (`burnRate` + band)
- apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts (+ spec) — burn-rate derivation + BU
  aggregate
- apps/ui/src/app/features/dashboard/ — portfolio column / detail card render
