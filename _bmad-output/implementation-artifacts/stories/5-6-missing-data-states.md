# Story 5.6: Missing-data states — "Not monitored" vs "No data"

Status: done

## Story

As a dashboard viewer, I want missing Datadog values labelled by **cause** (not monitored vs no
value yet), so that I am not misled by an ambiguous "Unavailable" (which reads like an outage on a
health dashboard) or by fabricated zeros.

## Context / Why

Missing Datadog metrics were rendered as **"Unavailable"/"Undefined"**, which (a) reads as an
outage/error and (b) collapses two genuinely different causes into one. A UX-research pass (parallel
web research → synthesis: NN/g, IBM Carbon, Shopify Polaris, GitLab Pajamas, WCAG/WAI, plus
Datadog/Grafana/New Relic docs) recommended **dropping "Unavailable"** and modelling two
source-aligned states that mirror Datadog's own vocabulary, distinguishing the cause and never
fabricating values. We already carry the signal to do this (`datadogMapped` / `resolutionPath`).

## Acceptance Criteria

1. Replace "Unavailable"/"Undefined" everywhere with two states:
   - **"Not monitored"** — app not mapped in Datadog
     (`datadogMapped === false || resolutionPath === 'unmapped'`).
   - **"No data"** — mapped, but the metric has no value yet.
2. **Portfolio table** cells (Uptime, Active Users, Last Incident): show a muted **"—"** (not a
   word, for scannability) + a provenance **tooltip** carrying the reason ("Not monitored in
   Datadog" / "No SLO data yet").
3. **App detail** (Overview + Health tab): Uptime / SLA Target / Error Budget / Burn Rate / Breach
   and the Health/Perception labels render the **state word**; the Uptime card shows a **one-line
   reason** instead of a fabricated trend.
4. Generic non-Datadog missing fields (dates, contacts, escalation path) fall back to a neutral
   **"No data"**.
5. **Never** render `0` / `0%` / blank for a missing metric; missing styling stays muted/neutral
   (not red, not resembling a real value).
6. Demo mode updated for consistency.

## Dev Notes

- **Backend `detail.seed.ts`:** `missingDatadog(datadogMapped)` → `'No data'` if mapped else
  `'Not monitored'`; applied to uptime, slaTarget, errorBudget (remaining/used/burnRate/breach).
  Health/Perception undefined labels → "Not monitored". Generic fallback constant renamed to
  `NO_DATA_TEXT = 'No data'`. Uptime card `trendText` shows the reason ("Not mapped in Datadog" /
  "No SLO reported yet") instead of a fake trend.
- **Backend `mongo-portfolio.repository.ts`:** `lastIncident` placeholder → "—".
- **Frontend `portfolio-page.component.ts`:** `formatUptime`/`formatActiveUsers` → "—";
  `uptimeProvenance`/ `healthProvenance` tooltips distinguish "Not monitored in Datadog" vs "No SLO
  data yet"; health/perception table labels → "Not monitored".
- **Frontend `detail-page.data.ts`:** demo labels/fallbacks updated to the same vocabulary.
- Validated live: unmapped app → "Not monitored" across health/uptime/SLA/error-budget;
  mapped-but-no-SLO app → "No data"; **0 occurrences of "Unavailable"** in either detail.

## Wording divergence (recorded)

The backlog (E5-S7) originally specified "No Datadog mapping — health data unavailable" and a "live
· Datadog · synced N min ago" tooltip. This story **supersedes that wording** with the
research-backed two-state model ("Not monitored" / "No data"); the provenance tooltip remains.

## References

- UX research (this session): `ux-empty-state-label-research` workflow synthesis (NN/g, Carbon,
  Polaris, GitLab Pajamas, WAI, Datadog/Grafana/New Relic docs).
- Refines: E5-S7 / 5-2 (live-vs-placeholder), 5-3 (provenance UI), E2-S3 (surface unmapped apps).
- Roadmap origin: DATADOG-NEXT-STEPS.md (live-vs-placeholder).

## Dev Agent Record

### File List

- apps/api/src/dashboard/seed/detail.seed.ts
- apps/api/src/dashboard/mongo/mongo-portfolio.repository.ts
- apps/ui/src/app/features/dashboard/pages/portfolio-page/portfolio-page.component.ts
- apps/ui/src/app/features/dashboard/pages/detail-page/detail-page.data.ts
