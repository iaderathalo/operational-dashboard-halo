# Story 1.6: The Crawler app (bootstrap-and-exit)

Status: in-review

> **Build/commit note (2026-06-16):** `apps/crawler` is BUILT and meets the ACs below, but is HELD
> OUT of the `feature/datadog-live-health` commit/branch (commit fc8f6da) pending Bernardo's
> (Bernie) validation that a K8s CronJob is the right auto-trigger approach (vs. an alternative
> scheduler). The sync logic + internal endpoint it calls (Story 1.5) are already committed and
> validated live. This story stays `in-review` until that approach is confirmed and the app is
> merged in.

## Story

As the operations team, I want a minimal `crawler` application that calls the internal sync endpoint
and exits, so that it can be packaged as a Docker image and run as a Kubernetes CronJob (Story 1.7,
deferred) — without an in-app timer that would double-fire across API replicas.

## Acceptance Criteria

1. A new Nx app `apps/crawler` exists with its own `project.json` (`build` + `test` targets)
   mirroring `apps/api` conventions (`@nx/js:node` style build).
2. `apps/crawler/src/main.ts` bootstraps minimally, invokes a trigger, logs the response summary,
   and calls `process.exit(0)` on success / `process.exit(1)` on any failure.
3. A `TriggerService` uses `ResilientHttpService` to `POST` `INTERNAL_API_BASE_URL` +
   `/api/v1/internal/sync/datadog` with `INTERNAL_SYNC_TOKEN` in the `Authorization` header, with a
   120s timeout.
4. A non-2xx response or network error logs the error and exits non-zero (so K8s marks the job
   failed).
5. The Crawler knows NOTHING about Datadog or Mongo — it only calls the internal endpoint (thin by
   design).
6. Unit tests: successful trigger → exit 0; HTTP 401 → exit 1; network error → exit 1.

## Tasks / Subtasks

- [ ] Scaffold the Nx app (AC: 1)
  - [ ] `apps/crawler/project.json`, `apps/crawler/tsconfig*.json`, `apps/crawler/jest.config.ts` —
        copy and adapt from `apps/api`
- [ ] Entry + trigger (AC: 2, 3, 4, 5)
  - [ ] `apps/crawler/src/main.ts` (bootstrap-and-exit)
  - [ ] `apps/crawler/src/trigger.service.ts` (uses `ResilientHttpService`, reads
        `INTERNAL_API_BASE_URL` + `INTERNAL_SYNC_TOKEN`)
- [ ] Tests (AC: 6)

## Dev Notes

**Thin by design — reuse shared libs, build nothing new:**

- HTTP via `ResilientHttpService` (`@operational-dashboard/shared-nestjs-utils`). Config constants
  via `@app/config` if needed.
- Bootstrap-and-exit: this is NOT a long-running server. After the POST resolves, exit with the
  right code. Set explicit `process.exit` because an open Nest context can keep the process alive.
- The exit code is the contract with Kubernetes (`restartPolicy: OnFailure` in the deferred Helm
  story). Non-zero on any failure.

**Why a separate app and not in-app cron (PRD §A, FR-1):** the API runs in multiple replicas; an
in-app scheduler would fire concurrently on every replica against the same DB. The Crawler is a
single scheduled execution that calls the (idempotent) endpoint once per tick.

**Deferred dependency:** Story 1.7 (Helm CronJob to dev region) packages this app — out of scope
here, but keep the app cronjob-ready (clean exit codes, all config via env: `INTERNAL_API_BASE_URL`,
`INTERNAL_SYNC_TOKEN`).

**Testing standards:** mock `ResilientHttpService`; assert exit code via a spy on `process.exit` (or
factor the trigger so the exit decision is unit-testable without actually exiting).

### Project Structure Notes

- New Nx app at `apps/crawler/` (sibling of `apps/api`, `apps/ui`). Register it in the Nx workspace
  the same way existing apps are (`project.json` is the source of truth in this repo — there is no
  `workspace.json`).
- Depends on Story 1.5 (the endpoint it calls). Can be built/tested independently with the endpoint
  mocked.

### References

- PRD FR-1, §A reliability/replica-safety, §C Operational — [Source:
  _bmad-output/planning-artifacts/prds/prd-operational-dashboard-halo-2026-06-13/prd.md]
- Crawler solution-design (the crawler app + cronjob pattern) — [Source:
  _bmad-output/planning-artifacts/architecture/crawler-solution-design-2026-06-13.md]
- Backlog E1-S6 (+ E1-S7 deferred Helm) — [Source:
  _bmad-output/planning-artifacts/epics-stories/phase-1-backlog-2026-06-13.md]
- Pattern to copy: `apps/api/project.json`; HTTP: `libs/shared/nestjs-utils`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
