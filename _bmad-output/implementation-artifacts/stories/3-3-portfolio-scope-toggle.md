# Story 3.3: Portfolio scope toggle (All / My Applications)

Status: done

## Story

As a dashboard viewer, I want to switch the portfolio between **all applications** and **the
applications I own**, so that I am not limited to my own apps (most viewers, incl. stakeholders, own
none) while still being able to focus on mine when needed.

## Context / Why

The portfolio was implicitly **owner-scoped**: `getPortfolio`/`getSummary`/detail filtered by the
signed-in user's email (`itOwnerEmail` OR `portfolioOwnerEmail`). With real PlanView data there are
~809 distinct owners across 3,656 apps; a typical viewer (e.g. Iader, Raja) owns **0**, so the
dashboard looked empty. Raja's call (2026-06-17): **remove the implicit filter and show all apps**,
but keep the per-user view available without a redeploy. Chosen solution: a runtime toggle (no
config/redeploy to flip), mirroring the existing **Demo / Real Data** toggle.

## Acceptance Criteria

1. Header shows an **"All Applications / My Applications"** toggle in **real-data mode** (mirrors
   the Demo/Real Data toggle styling/pattern). Default = **All Applications**.
2. Backend accepts an optional **`?scope=mine`** query param on the dashboard endpoints; the
   controller resolves the scoping email (`scope === 'mine' ? request.user.email : undefined`). No
   param / `all` → unscoped (all apps). The `DashboardService` is a pass-through (no scoping logic).
3. "My Applications" returns only apps where the signed-in user is `itOwnerEmail` or
   `portfolioOwnerEmail`; "All Applications" returns the full tree (root labelled "All
   Applications").
4. The toggle is **disabled** on the app **detail** view (`/dashboard/app/:id`, any tab), where
   scoping does not apply (greyed, `not-allowed`, tooltip "Scope applies to the portfolio list").
5. Selection persists across reloads (localStorage) and the portfolio **reloads** when toggled.
6. No behavior change to the in-memory/Demo path (it already ignores the email).

## Dev Notes

- **Backend:** `dashboard.controller.ts` adds `@Query('scope')` to portfolio/summary/context/detail/
  health-history + a static `scopedEmail(scope, email)` helper. `dashboard.service.ts` reverted to a
  plain pass-through (an earlier config-flag approach `DASHBOARD_SCOPE_BY_OWNER` was dropped in
  favor of the per-request param so switching needs no redeploy).
- **Frontend:** new `DashboardScopeService` ('all' | 'mine', localStorage, default 'all', mirrors
  `DashboardDataModeService`); `dashboard.service.ts` appends `?scope=mine` to
  `getPortfolio`/`getSummary` when scope is 'mine'; `portfolio-page.component.ts` reloads on
  `scope$`; `app.component` renders the toggle + `isDetailRoute` disables it on the detail route.
- Validated live (local, bypass user = anton): All = 3656 apps; My = 25 (anton); 0 for a non-owner.

## Out of scope / follow-ups

- An explicit "All Applications" view is the default now; if a viewer needs the data of an app they
  don't own while in "My" mode, they switch to "All" (detail pages are always reachable, unscoped).
- Open product question: should "All" be gated by a role rather than available to every
  authenticated user? (Currently any logged-in user can see the full catalog — consistent with the
  decision.)

## References

- Decision: Raja sync 2026-06-17 ("remove the owner filter; show all").
- Related: E3 (portfolio tree), E5-S7 / 5-2 (live-vs-placeholder), E2-S3 (unmapped apps).

## Dev Agent Record

### File List

- apps/api/src/dashboard/dashboard.controller.ts (+ dashboard.controller.spec.ts)
- apps/ui/src/app/features/dashboard/services/dashboard-scope.service.ts (new)
- apps/ui/src/app/features/dashboard/services/dashboard.service.ts
- apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.ts
- apps/ui/src/app/app.component.ts / app.component.html / app.component.scss
