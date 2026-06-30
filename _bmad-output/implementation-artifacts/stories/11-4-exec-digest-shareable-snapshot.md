# Story 11.4: Executive weekly digest + shareable read-only snapshot

Status: ready-for-dev

## Story

As a **leadership stakeholder**, I want a **scheduled weekly digest** (portfolio score, coverage %,
top movers, new risks) delivered to my inbox, and a **read-only shareable link** to the portfolio
view, so that I stay informed without logging in daily and can forward a specific view to a
colleague.

## Context / Why

The #1 failure mode of executive dashboards is not data quality — it is that **executives never log
in** (verified: dashboard-adoption + single-pane-of-glass sources). The highest-leverage adoption
move is to **push** a concise digest to where leaders already are (email) and make views
**forwardable**. Datadog ships a native **Scheduled Reports** feature (email delivery) as the
pattern reference; for our custom UI this is a cron + a render over data we already hold — **no new
integration, no rate-limit impact** (it reads our own store, populated by the existing sync and the
`11-1` roll-up).

## Acceptance Criteria

1. A **scheduled weekly digest** is generated from already-stored data: overall portfolio score,
   monitoring-coverage %, top movers (biggest week-over-week health/coverage changes), and
   newly-emerged risks; delivered to a configurable recipient list (email and/or PDF attachment).
2. The digest reads the **existing store** (sync output + `11-1` roll-up) — **no new Datadog API
   call**; the schedule is configurable (cron/interval) and the recipient list comes from
   config/Vault, never hardcoded.
3. A **read-only shareable snapshot** of the portfolio view is produced (link or exportable PDF/CSV)
   that requires no editing rights and reflects the data as of generation time (timestamped).
4. Both surfaces show **data-freshness honesty** — `lastSyncStatus` / `lastSyncAt` are stamped; if
   the last sync failed (cf. egress blocker `5-8`), the digest says so rather than presenting stale
   data as current.
5. "Top movers" requires a prior period to compare against — if no history exists yet, the digest
   degrades to a point-in-time snapshot with an honest "no prior period" note (ties to the
   maturity/roll-up history follow-up).
6. Tests cover: digest generation with data, with a failed last sync (honest staleness), and with no
   prior period.

## Dev Notes

- **Generation:** a scheduled job (API-side cron/worker) renders the digest from the Mongo store;
  reuse the roll-up/aggregate produced by `11-1` rather than recomputing.
- **Delivery:** email/PDF via the platform's existing mail path if one exists; otherwise the
  simplest supported channel. Recipients + schedule via `ConfigService` / Vault (consistent with
  `INTERNAL_SYNC_TOKEN` handling).
- **Shareable view:** a read-only route/export of the portfolio page; respect the same scope/auth
  rules — a snapshot must not leak owner-scoped (`?scope=mine`) data beyond its audience.
- **Freshness:** surface `lastSyncStatus`/`lastSyncAt` (already on the model) prominently — never
  imply live when stale.

## Out of scope / follow-ups

- Per-user subscription management UI is out of scope — a config-driven recipient list is sufficient
  for v1.
- Storing the week-over-week history that powers "top movers" overlaps the roll-up-history follow-up
  (lens (b)); if not yet present, ship the snapshot form and add movers once history accrues.

## References

- Phase-2 epic: `phase-2-exec-value-backlog-2026-06-21.md` → **E11-S4**.
- Research origin: `platform-enhancement-research-2026-06-21.md` (Overall #4) — Datadog Scheduled
  Reports docs; dashboard-adoption sources.
- Builds on `11-1` (roll-up data); freshness ties to `5-8` (egress / sync status).

## Dev Agent Record

### File List

- apps/api/src/ — scheduled digest job (cron/worker) + render
- apps/api/src/ — read-only shareable snapshot route / export
- config (recipients, schedule) via ConfigService / Vault
- apps/ui/ — read-only snapshot view (if rendered client-side)
