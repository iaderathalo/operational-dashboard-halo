# Story 3.5: Filter the BU tree to show only Mercer (for now)

Status: done

## Story

As a stakeholder, I want the portfolio scoped to **only the Mercer business unit** for now, so that
the demo/working view focuses on the relevant org instead of the full MMC catalog.

## Context / Why

Anand feedback (2026-06-18): _"We may need to filter out the BU — only show Mercer for now."_ The
tree is built from PlanView `OpCo → BusinessDeliveryPortfolioName` (E3). Currently all OpCos/BUs are
shown.

## Resolution (2026-06-18 — IMPLEMENTED)

- Filter in the **tree-build** (`buildPortfolio` in `mongo-portfolio.repository.ts`) via env var
  **`PORTFOLIO_OPCO_ALLOWLIST`** (comma-separated, case-insensitive; empty/unset = all OpCos).
  Configurable via config — **changing it needs a redeploy** (accepted "for now").
- Default **`Mercer`** set in `deployments/config/dev-api.config` (+ Joi schema in `app.module.ts`).
- Confirmed **"Mercer" is a real OpCo value** in the PlanView data (alongside CIS, Marsh, Guy
  Carpenter, MMC, Oliver Wyman) — so the default matches.
- Tests added in `mongo-portfolio.repository.spec.ts`; **150 api tests green**. Local default = all
  (env unset).

## Original open questions (now resolved)

- **Where to filter:** (a) PlanView loader (don't load non-Mercer), (b) the tree-build/query layer
  (server-side scope), or (c) a UI filter. Server-side (b) keeps the payload small and is
  reversible.
- **How configurable:** a hard "Mercer only" vs a configurable OpCo allowlist (env/flag) so it's
  easy to widen later. Recommended: configurable allowlist defaulting to Mercer, so "for now"
  doesn't become a hardcode.
- **Exact match value:** confirm the OpCo field value(s) that represent "Mercer" in the PlanView
  data.

## Acceptance Criteria (draft)

1. The portfolio tree + counts show only apps under the Mercer OpCo.
2. The scope is configurable (allowlist) so other OpCos can be re-enabled without a code change,
   defaulting to Mercer.
3. Counts/summary (Total Applications, status breakdowns) reflect the filtered scope.
4. Detail pages for in-scope apps still work.

## Dev Notes

- Tree build is from the PlanView structured fields in `MongoPortfolioRepository` (OpCo →
  BusinessDeliveryPortfolioName).
- Coordinate with the `?scope=mine` toggle (3-3) — this BU filter is orthogonal (org scope vs owner
  scope).

## References

- Anand feedback 2026-06-18. Relates to E3 (portfolio tree), 3-2 (BU-rooted reshape), 3-3 (scope
  toggle).
