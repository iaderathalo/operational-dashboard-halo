# Story 1.4: DatadogSyncService — rollup, uptime, and error budget

Status: done

## Story

As a developer on the operational dashboard, I want a `DatadogSyncService.syncAll()` that loads ONE
bulk Datadog snapshot (Story 1.3), then resolves every Application PURELY LOCALLY against it to
compute Health Status / Uptime / Error Budget, and persists the results, so that the dashboard's
Health signal is computed from telemetry instead of static seed data — at portfolio scale (3656
apps) without per-app Datadog HTTP or 429 rate-limit failures.

## Acceptance Criteria

1. `syncAll()` first calls the injected `'DatadogClient'`.`loadSnapshot()` EXACTLY ONCE to obtain
   the bulk telemetry snapshot, then iterates Applications resolving each PURELY LOCALLY against
   that snapshot — ZERO Datadog HTTP inside the per-app loop. For each Application it looks up the
   snapshot by the app's `app_short_key` (== `shortCode`, primary bridge) and, failing that, by its
   `app_service_id` (PlanView ServiceNow key `SNSVC#######`, fallback bridge), then computes a
   Health Status via worst-state-wins rollup over the matched monitors: `Alert→RED`, `Warn→AMBER`,
   `OK→GREEN`, `No Data→AMBER`. Severity order: `RED > AMBER > GREEN`.
2. An Application that matches no monitors under EITHER bridge tag yields `healthStatus='AMBER'`,
   `datadogMapped=false`, `resolutionPath='unmapped'`, `lastSyncStatus='unmapped'`. It is never
   silently skipped and never GREEN (no false green).
3. Uptime is computed for `24h`, `7d`, `30d` from SLO history. `90d` is intentionally NOT produced
   (Datadog ~2-week retention) — left `null` / "not available", never fabricated.
4. `errorBudgetRemainingPct` is `null` (not `0`) when the Application has no Datadog SLO.
5. A partial run is tolerant: because all Datadog I/O is the single up-front `loadSnapshot()`, the
   per-app loop is local and cannot 429. If resolving/persisting ONE Application throws (e.g. a
   Mongo write error), `syncAll()` catches it, marks that app's `lastSyncStatus='error'`, and still
   completes for the rest (others `'ok'`/`'unmapped'`). (If `loadSnapshot()` itself fails the whole
   run fails fast — there is no partial snapshot to resolve against.)
6. The write is idempotent per run: `updateHealth` (`$set`) on the Application plus exactly ONE
   `healthSnapshots` insert per Application per run. Re-running does not corrupt or double-count.
7. `syncAll()` returns a summary `{ appsAttempted, appsSucceeded, appsFailed, durationMs }`.
8. The rollup is a pure, exported function unit-tested for: all-OK→GREEN, mixed Warn+OK→AMBER,
   any-Alert→RED, all-No-Data→AMBER, empty monitor set→AMBER+unmapped, error-budget with no
   SLO→null.

## Tasks / Subtasks

- [ ] Pure rollup + uptime/error-budget helpers (AC: 1, 3, 4, 8)
  - [ ] `apps/api/src/datadog/health-rollup.ts` — `rollupStatus(monitors): ApplicationStatus`
        (worst-state-wins) + `computeUptime`, `computeErrorBudget`
- [ ] Sync service (AC: 1–7)
  - [ ] `apps/api/src/datadog/datadog-sync.service.ts` — inject `'DatadogClient'`,
        `'ApplicationRepository'`, `'HealthSnapshotRepository'`, `Logger`; implement `syncAll()` as:
        `loadSnapshot()` once → loop apps → resolve LOCALLY by `app_short_key` then `app_service_id`
        → rollup/uptime/error-budget → `updateHealth` + one snapshot insert per app
- [ ] Wire into `DatadogModule` (providers + imports for the two repositories)
- [ ] Tests (AC: 8)
  - [ ] `apps/api/src/datadog/health-rollup.spec.ts` (pure, exhaustive) + a
        `datadog-sync.service.spec.ts` with mocked client + repos

## Dev Notes

**Reuse the contracts from stories 1.1–1.3 — do not duplicate persistence logic:**

- Persist via `ApplicationRepository.updateHealth(id, {...})` (Story 1.1) — `$set` only; never
  replace.
- Append history via `HealthSnapshotRepository.insertSnapshot({...})` (Story 1.2) — exactly one per
  app per run.
- Load telemetry via the injected `'DatadogClient'`.`loadSnapshot()` (Story 1.3) ONCE per run — the
  service must be agnostic to real-vs-mock and must NOT issue any other Datadog calls. All per-app
  work is local lookups against the returned `DatadogSnapshot`.

**Product decisions to encode in code (not just comments):**

- `No Data → AMBER` is a deliberate product decision (PRD FR-2) — keep it explicit and centralized
  in `rollupStatus`.
- `90d` uptime omitted in Phase 1 (PRD Open Q9) — do not invent it.
- Mapping never inflated to a false GREEN (PRD SM-C1) — unresolved → AMBER + `datadogMapped=false`.

**Mapping selection (dual-tag bridge):** match the snapshot by the app's `app_short_key` (==
`shortCode`, the PlanView CAST key) → `resolutionPath='primary'`; else by `app_service_id` (the
PlanView ServiceNow key `SNSVC#######`) → `resolutionPath='fallback'`; else
`resolutionPath='unmapped'`. A coverage probe proved these two tags are the ONLY reliable per-app
bridges (`service`/`business_unit`/`team`/`servicenow_chg` are NOT) — do not resolve on anything
else. Record `resolutionPath` on both the Application (`updateHealth`) and the snapshot, so coverage
quality is auditable (PRD FR-9, §A observability).

**Idempotency:** the per-run snapshot is append-only by design (timeline); the Application health is
overwritten via `$set`. Re-running the same tick overwrites health and appends one more snapshot —
acceptable; do not attempt dedupe of snapshots.

**Testing standards:** keep `rollupStatus`/`computeUptime`/`computeErrorBudget` PURE so they test
without mocks. For `syncAll`, mock the three injected providers.

### Project Structure Notes

- Lives in `apps/api/src/datadog/` alongside the client (1.3). `DatadogModule` must import the
  modules exporting `'ApplicationRepository'` and `'HealthSnapshotRepository'` (or re-provide those
  tokens) so DI resolves.
- Depends on 1.1, 1.2, 1.3 being in place.

### References

- PRD FR-2/FR-4/FR-5/FR-9, §4.1, SM-C1/SM-C2, Open Q9 — [Source:
  _bmad-output/planning-artifacts/prds/prd-operational-dashboard-halo-2026-06-13/prd.md]
- Crawler solution-design (rollup + compute) — [Source:
  _bmad-output/planning-artifacts/architecture/crawler-solution-design-2026-06-13.md]
- Backlog E1-S4 — [Source:
  _bmad-output/planning-artifacts/epics-stories/phase-1-backlog-2026-06-13.md]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
