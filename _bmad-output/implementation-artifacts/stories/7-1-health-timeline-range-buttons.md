# Story 7.1: Wire the 24h / 7d / 30d range buttons to the Health timeline row

Status: done

## Story

As a dashboard viewer on the app detail page, I want the **24h / 7d / 30d** buttons to actually
change the **Health** timeline row, so that I can see an app's health trend over the window I care
about instead of a fixed view.

## Context / Why

Phase-1 E5-S1 (commit `1421ef1`) shipped the live Health timeline: the detail page's HEALTH row is
rendered from real `health_snapshots` via `GET /dashboard/portfolio/apps/{id}/health-history`,
bucketed per sync run, with a "live Datadog" note and an honest empty state. The research doc
(`DATADOG-NEXT-STEPS.md`, now archived) flagged the remaining gap as a "⚠️ minor pending item":
**the 24h/7d/30d buttons are not wired to the Health row.** This was the only roadmap item not
tracked anywhere in BMAD — it is captured here as the natural finish to E5-S1.

Today the detail page already has range state for the _other_ sections —
`activeOverviewRange = '7d'` and `activePerceptionRange = '24h'` with `setOverviewRange()` /
`setPerceptionRange()` handlers (`detail-page.component.ts:61,63,149,157`) — but **no
`activeHealthRange`**, so the buttons over the HEALTH row are inert for that row.

## Acceptance Criteria

1. The detail page exposes an **`activeHealthRange`** (`'24h' | '7d' | '30d'`) with a
   `setHealthRange(range)` handler, mirroring the existing `activeOverviewRange` /
   `setOverviewRange` pattern, bound to the buttons over the HEALTH row. The buttons are no longer
   inert for that row.
2. The selected range drives which snapshots render. **Preferred:** add an optional **`?range=`**
   param to `GET /dashboard/portfolio/apps/:id/health-history` (controller
   `dashboard.controller.ts:102`, service `getHealthHistory(id, email, limit)`
   `dashboard.service.ts:93`), keeping the existing `?limit=` behavior (default 500 / max 2000)
   intact. **Acceptable simpler alternative:** window the already-fetched snapshots client-side if
   the snapshot cadence makes a backend param unnecessary — pick the simpler option and note it.
3. Bucketing respects the range, consistent with the current per-run bucketing in
   `detail-page.data.ts` (the `ordered.map(... HEALTH_STATUS_TONE ...)` build, ~`:200`): per-hour
   within a day, per-day across days.
4. An app with **no snapshots in the selected window** shows the existing honest empty state ("no
   history yet"), not an error and not a stale wider-window render.
5. Default range on first load is unchanged from today's behavior; switching range **re-renders the
   HEALTH row without a full page reload**.
6. No change to the Overview or Perception range controls.

## Dev Notes

- **Frontend:** `apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.ts` (add
  `activeHealthRange` + `setHealthRange`, mirror the overview/perception handlers) and
  `detail-page.component.html` (bind the HEALTH-row buttons). Bucketing/render logic lives in
  `detail-page.data.ts`.
- **Backend (if going the `?range=` route):** `dashboard.controller.ts` (add `@Query('range')`),
  `dashboard.service.ts` `getHealthHistory` (translate range → snapshot window/limit), read path
  `HealthSnapshotRepository.findRecentByApplicationId(id, limit)`. Keep `?limit=` working; update
  the existing controller/service specs (`dashboard.controller.spec.ts`,
  `dashboard.service.spec.ts`).
- **Reuse, don't reinvent:** the range-button UI/active-state styling and the snapshot fetch already
  exist — this story is wiring + bucketing, not new components or a new endpoint.

## Out of scope / follow-ups

- No change to the snapshot **write** path (one snapshot per app per sync) or its cadence.
- If snapshot density is too sparse for a meaningful 24h view, note it for a future cadence change —
  do not fabricate intermediate points.

## References

- Finishes Phase-1 **E5-S1** (health timeline, commit `1421ef1`).
- Phase-2 epic: `phase-2-datadog-enrichment-backlog-2026-06-18.md` → **E7-S1**.
- Origin: archived research
  `_bmad-output/planning-artifacts/research/datadog-enrichment-research-2026-06-16.md` ("⚠️ minor
  pending item: 24h/7d/30d buttons not wired").

## Dev Agent Record

### File List

- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.ts
- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.component.html
- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.data.ts
- apps/api/src/dashboard/dashboard.controller.ts (+ dashboard.controller.spec.ts) — only if
  `?range=` route
- apps/api/src/dashboard/dashboard.service.ts (+ dashboard.service.spec.ts) — only if `?range=`
  route
