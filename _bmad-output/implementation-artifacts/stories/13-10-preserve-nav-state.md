# Story 13.10: Preserve navigation / tab state on Back — return to the app, tab & filter context you left

Status: ready-for-dev

## Story

As a **dashboard user (reviewer/operator)**, I want **Back to return me to the app I was looking at,
the detail tab I had open, and the portfolio node/scroll/filter context I came from**, so that I
don't have to **re-find and re-search the app every single time I drill in and back out** (this came
up repeatedly in review).

## Context / Why

Today the round-trip throws away everything. Opening an app calls
`router.navigate(['/dashboard/app', app.id])` (`openAppDetail` in `portfolio-page.component.ts`),
and the detail "← Back to Dashboard" button calls `goBack()` → `router.navigate(['/dashboard'])`
(`detail-page.component.ts`). That lands back on the bare `/dashboard` URL, which re-runs
`loadPortfolio()` and resets `currentNode`, `breadcrumbPath`, `expandedTreeNodes`, the active
section panels, and scroll — so the reviewer is dropped at the root of a 3,656-app tree and has to
drill down and search the app again.

On the detail side the **open tab is held only in component memory** (`activeTab: DetailTabId`, set
by `setTab`) — it is never reflected in the URL, so even a browser Back / refresh loses which tab
was open.

Nothing about the _current_ node, scope, or tab survives in the route. The portfolio always lives at
the single URL `/dashboard` (`dashboard-routing.module.ts`:
`{ path: '', component: PortfolioPageComponent }`), and scope is a localStorage-backed runtime
toggle in `DashboardScopeService` that is sent to the API as `?scope=mine` (story `3-3`) but is
**not** part of the browser URL the user navigates between.

The fix is to make the **return context recoverable from the route**, not from volatile component
state: carry the selected node id (and active detail tab) in the URL so Back restores it, and avoid
a full portfolio reload on return. This is the analyst-flagged "⚡ quick win" in the backlog
(E13-S10).

## Acceptance Criteria

1. **Back restores the app + tab.** From an app detail view, Back returns the user to the portfolio
   node they drilled in from with the previously **selected app context visible** and, when
   re-entering that app, the **same detail tab** (`activeTab` / `DetailTabId`) re-opens instead of
   defaulting to `overview`.
2. **Back restores the portfolio context.** The previously **selected tree node** (`currentNode` /
   `breadcrumbPath`), its **expanded sections/tree branches**, and the **scroll position** are
   restored — the user is not dropped at the `root` ("All Applications") node.
3. **No full portfolio reload on Back.** Returning from detail does **not** re-trigger a fresh
   `getPortfolio()` round-trip / `loadPortfolio()` rebuild of the whole tree purely to navigate
   back; the already-loaded tree state is reused (a scope/mode _change_ may still reload, per
   `3-3`).
4. **Scope is honored.** Restoration works for both **All** and **My Applications** scope; the
   `?scope=` value (story `3-3`, `DashboardScopeService`) in effect when the user drilled in is the
   one they return to, and Back never silently flips scope.
5. **Mechanism is route/URL-driven, not just in-memory.** The selected node id and active tab are
   carried in the route (route param or query param, e.g. the detail route gains the originating
   node + `?tab=`), so the restored context survives the browser Back button and is not lost on a
   component re-instantiation.
6. **Deep-link safe.** Opening a detail URL directly (no prior in-app navigation, e.g. pasting a
   link) still works: an unknown/absent return-node falls back to the existing root-load behavior,
   and an unknown/absent tab falls back to `overview` — no error, no blank screen.
7. **No new visual language.** Reuses the existing back button, breadcrumb, tree, and tab bar — this
   is navigation-state plumbing, not a UI redesign.
8. Unit tests cover: Back restoring the originating node + tab; a deep-linked detail URL with no
   return node falling back to root + `overview`; and restoration under `?scope=mine` not flipping
   scope.

## Dev Notes

- **Where state is lost today (read these first):**
  - `apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.ts` —
    `openAppDetail()` navigates away with only the app id; `navigateToNode()` / `loadPortfolio()`
    reset `currentNode`, `breadcrumbPath`, `expandedTreeNodes`, `expandedSections` on every
    `/dashboard` land.
  - `apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.ts` — `activeTab` is
    in-memory only (`setTab`); `goBack()` does `router.navigate(['/dashboard'])`, a hard reset.
  - `apps/ui/src/app/features/dashboard/dashboard-routing.module.ts` — single `''` portfolio route +
    `app/:id` detail route; no place currently carries return/tab state.
- **Proposed mechanism (grounded in what the app already uses — query params + the existing scope
  service):**
  - **Active tab → URL query param** on the detail route (e.g. `/dashboard/app/:id?tab=health`).
    Read it in `ngOnInit` to seed `activeTab` and write it in `setTab` via
    `router.navigate([], { queryParamsHandling: 'merge' })` (the app already reads query params and
    strips `?`/`#` in `app.component.updateHeaderContext`). This makes the open tab survive browser
    Back and refresh (AC 1, 5, 6).
  - **Originating node → carried into the detail navigation and back** so `goBack()` returns to that
    node instead of root. Pass the current node id when calling `openAppDetail()` (e.g.
    `?from=<nodeId>`), and in `goBack()` navigate to `/dashboard` re-selecting that node via the
    existing `navigateToNode(id)` / `findNode(id)` / `getPath(id)` machinery rather than resetting
    to `data.id` (AC 1, 2).
  - **Avoid the full reload:** `loadPortfolio()` is driven by `mode$` / `scope$` subscriptions; a
    plain Back should re-select the node on the already-loaded `this.data` tree (no new
    `getPortfolio()`), reserving the reload for an actual mode/scope change (AC 3). A small **UI
    nav-state service** (mirroring the existing `DashboardScopeService` / `DashboardDataModeService`
    singleton pattern) is an acceptable alternative for holding `lastNodeId` + scroll if route
    params prove awkward — prefer the URL approach for AC 5 but a `providedIn: 'root'` service is
    the established pattern here.
  - **Scope:** do **not** re-derive scope from the URL — keep reading it from
    `DashboardScopeService` so All/My behavior (story `3-3`) is unchanged; just ensure Back doesn't
    trip a scope reload (AC 4).
- **Scroll restoration:** capture the table/tree scroll offset (the `.table-scroll` container in
  `portfolio-page.component.html`) before navigating away and reapply it on return; keep it
  best-effort so a missing offset degrades gracefully (AC 2, 6).
- **Reuse, don't reinvent:** node lookup (`findNode`/`getPath`/`navigateToNode`), tab list
  (`DETAIL_TABS`/ `DetailTabId` in `detail-page.data.ts`), and the scope service all already exist —
  this story wires routing state through them, it does not add data fetching or new endpoints.

## Out of scope / follow-ups

- Persisting **column sort / in-table free-text filter** state across the round-trip beyond node +
  tab + scroll — there is no live portfolio search/filter input wired today (only `.table-scroll`);
  a richer filter-state restore is a follow-up if/when those controls land.
- A full **shareable deep-link** of the exact portfolio node (beyond Back restoration) overlaps the
  read-only snapshot route (`/dashboard/snapshot`, story `11-4`) and is not re-solved here.
- Browser-level `scrollPositionRestoration` router config tuning is a follow-up if per-route scroll
  needs centralizing.

## References

- Phase-2 backlog:
  `_bmad-output/planning-artifacts/epics-stories/phase-2-dashboard-trust-clarity-backlog-2026-06-23.md`
  → **E13-S10** ("Preserve navigation / tab state on Back", ⚡ quick win, owner Bernardo; surfaced
  in the 2026-06-23 design review).
- Builds on `3-3` (All/My scope toggle + `?scope=`, `DashboardScopeService`) and the portfolio tree
  nav (`navigateToNode`/`findNode`/`getPath`) and detail tab model (`DETAIL_TABS`/`DetailTabId`).
- Related: `11-4` (read-only `/dashboard/snapshot` route) for the broader deep-link discussion.

## Dev Agent Record

### File List

- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.ts (+
  detail-page.component.html) — read/write active tab via `?tab=`; `goBack()` returns to originating
  node instead of root
- apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.ts (+ .html) —
  carry current node id into `openAppDetail`; restore node/expanded/scroll on return without a full
  `loadPortfolio` reload; capture `.table-scroll` offset
- apps/ui/src/app/features/dashboard/dashboard-routing.module.ts — detail route carries
  return-node + tab state (query params)
- apps/ui/src/app/features/dashboard/services/dashboard-scope.service.ts — referenced (scope read on
  Back; unchanged behavior, story 3-3)
- (optional) apps/ui/src/app/features/dashboard/services/ — small `providedIn: 'root'` nav-state
  service if route params are insufficient for `lastNodeId`/scroll (mirrors `DashboardScopeService`
  pattern)
- Specs: detail-page and portfolio-page component spec files — Back restores node + tab; deep-link
  fallback to root + `overview`; `?scope=mine` not flipped
