# Story 13.6: Maturity breakdown made descriptive — 5 sub-signals with pass/fail + meaning

Status: ready-for-dev

## Story

As a **dashboard user**, I want to hover the **Maturity** cell and see the **5 sub-signals** (mapped
/ hasMonitor / hasSLO / sloPassing / hasOwner) each with its **pass/fail state** and a **one-line
meaning**, so that I understand _why_ an app scores X/5 — not just the bare number.

## Context / Why

The Maturity column today shows only `score/max` (e.g. "3/5"). A user who sees "3/5" has no way to
know which two signals are missing or what each signal even means. The breakdown already exists as a
terse hover string from story `7-2` — `maturityTooltip(app)` joins `✓/✗ <noun-label>` (e.g. "✓
Mapped to Datadog · ✗ Has SLO") — but the labels are bare nouns, not meanings, and the layout is a
single run-on line. This story makes that breakdown _descriptive_: each of the 5 signals gets its
pass/fail mark **plus a one-line plain-English meaning** of what the signal asserts.

This is a **pure presentation refinement** — it reads the **existing** `computeMaturity` signals
object and adds **no new computation and no new Datadog call**. The signals already reach the UI:
the API's `computeMaturity` (`mongo-portfolio.repository.ts`) returns `{ score, max, signals }` with
`signals: { mapped, hasMonitor, hasSLO, sloPassing, hasOwner }`, `toPortfolioApp` attaches it as
`app.maturity`, and the UI model `AppMaturity.signals` already mirrors that exact 5-boolean shape.
So **no API/model change is required** — the substrate is in hand; only the render needs enriching.

It refines `7-2`'s maturity column/breakdown tooltip and is the **lightweight cousin of `12-2`**
(the recommendations tab) — both read the same maturity-signal substrate; this one just explains it
in place.

## Acceptance Criteria

1. The Maturity cell breakdown lists **all 5 sub-signals** in a stable order (`mapped`,
   `hasMonitor`, `hasSLO`, `sloPassing`, `hasOwner`), each showing its **pass/fail state** (e.g. ✓ /
   ✗) and a **one-line plain-English meaning** of what that signal asserts.
2. The breakdown reads **only** the existing `app.maturity.signals` object — **no new computation,
   no new Datadog call, no API/model change** (the `signals` field is already on the payload).
3. The cell continues to show the `score/max` summary (e.g. "3/5"); the descriptive breakdown is the
   hover/expanded detail, not a replacement for the number.
4. When `app.maturity` is absent, the breakdown degrades gracefully to a "No maturity data" message
   (as today) — it never renders a fabricated all-pass or all-fail state.
5. The meanings are short, accurate to each signal's actual rule (e.g. `sloPassing` = "uptime is
   meeting its SLA target", `mapped` = "linked to a Datadog service"), and reuse the existing
   `maturitySignalLabels` keys so labels and meanings stay in sync.
6. No new visual language: reuse the existing `.prov-cell` provenance-tooltip pattern / breakdown
   styling and the existing color discipline; the change is content + light layout only.

## Dev Notes

- **Where it renders today:** the Maturity `<td>` in
  `apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.html` carries
  `[attr.data-prov]="maturityTooltip(app)"` and prints
  `app.maturity ? app.maturity.score + '/' + app.maturity.max : '—'`. The hover bubble is the
  `.prov-cell::after { content: attr(data-prov); }` rule in `portfolio-page.component.scss`.
- **The breakdown builder:** `maturityTooltip(app)` in
  `apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.ts` (story 7-2)
  iterates `app.maturity.signals` and maps each key via `maturitySignalLabels`
  (`mapped → 'Mapped to Datadog'`, `hasMonitor → 'Has monitors'`, `hasSLO → 'Has SLO'`,
  `sloPassing → 'SLO passing'`, `hasOwner → 'Has owner'`). Add a parallel **meanings** map (one line
  each) keyed by the same 5 signal keys, and have the breakdown emit `state + label + meaning` per
  signal. Keep iteration over a fixed key order rather than `Object.entries` so order is stable (AC
  1).
- **Signals shape is already correct** (no API change): `computeMaturity` in
  `apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts` returns
  `{ score, max, signals: { mapped, hasMonitor, hasSLO, sloPassing, hasOwner } }`; `toPortfolioApp`
  assigns it to the card's `maturity`; the UI mirror is `AppMaturity` in
  `apps/ui/src/app/features/dashboard/models/portfolio.model.ts`. Confirm meanings match the actual
  rules in `computeMaturity` (e.g. `hasSLO` = `uptime30d != null`; `sloPassing` =
  `uptime30d != null && slaTarget != null && uptime30d >= slaTarget`; `hasOwner` = any of itOwner /
  portfolioOwnerName / businessOwner).
- **Layout note:** the current `.prov-cell::after` tooltip uses `white-space: nowrap`; a 5-line
  signal-with-meaning breakdown will need a multi-line treatment (e.g. allow wrapping / per-line
  rows) so the meanings are readable. Keep it within the existing `.prov-cell` pattern; do not
  invent a new tooltip component.
- **Reuse, don't reinvent:** this is the same signal data 7-2 already surfaced and 12-2 will reuse —
  enrich the existing helper + styling rather than add a new path.

## Out of scope / follow-ups

- The full **recommendations tab** (actionable "do X to raise this signal") is story `12-2`, not
  this story — here the breakdown is descriptive (what each signal means), not prescriptive.
- Changing the maturity **scoring** (adding/removing signals or reweighting) is out of scope; this
  story only explains the existing 5 signals.
- Applying the same descriptive breakdown to the node-level roll-up `avgMaturity` badge is a
  possible follow-up; this story targets the per-app Maturity cell.

## References

- Phase-2 epic:
  `_bmad-output/planning-artifacts/epics-stories/phase-2-dashboard-trust-clarity-backlog-2026-06-23.md`
  → **E13-S6**.
- Builds on `7-2` (maturity column + breakdown tooltip); lightweight cousin of `12-2`
  (recommendations tab — same signal substrate).
- Signal source of truth: `computeMaturity` in
  `apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts`.

## Dev Agent Record

### File List

- apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.ts — add
  per-signal meanings map + enrich `maturityTooltip` to emit state + label + one-line meaning in
  fixed order
- apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.html — Maturity
  `<td>` breakdown render (keep `score/max` summary)
- apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.scss — multi-line
  treatment for the `.prov-cell` breakdown so the 5 meanings are readable
