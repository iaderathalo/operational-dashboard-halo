# Story 3.4: Portfolio Tree collapsed by default

Status: done

## Story

As a dashboard viewer, I want the left **Portfolio Tree** to start **collapsed**, so that I'm not
faced with a fully-expanded multi-level tree on load and can drill in deliberately.

## Context / Why

Anand feedback (2026-06-18, after seeing the deployed demo): _"The tree menu on the left always
defaults to expanded mode. Can we ensure it's collapsed by default?"_ Today the tree auto-expands on
load. With ~3,656 apps across many BUs/LOBs, the expanded default is noisy.

## Acceptance Criteria

1. On initial load the Portfolio Tree shows only the **root node collapsed** (or root + its
   immediate children collapsed) — not the whole hierarchy expanded.
2. Expanding/collapsing nodes still works (`toggleTreeNode`); the chosen state persists during the
   session.
3. The currently-selected node's path may still auto-reveal so the active node is visible, but nodes
   are not bulk-expanded.
4. No change to the table/content area behavior.

## Dev Notes

- UI-only. The tree expand state is `expandedTreeNodes` (Set) in
  `apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.ts`; template at
  `portfolio-page.component.html` (`#treeTemplate`,
  `[class.open]="expandedTreeNodes.has(node.id)"`).
- Change the initialization so `expandedTreeNodes` starts empty (or only the root id) instead of
  pre-expanding; mirror `initializeExpandedSections` if section panels share the behavior.

## References

- Anand feedback 2026-06-18. Relates to E3 (portfolio tree), 3-3 (scope toggle).
