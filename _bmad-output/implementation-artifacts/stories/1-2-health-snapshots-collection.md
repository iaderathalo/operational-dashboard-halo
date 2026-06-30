# Story 1.2: Health timeline — healthSnapshots collection and repository

Status: done

## Story

As a developer on the operational dashboard, I want a `healthSnapshots` collection that records a
timestamped Health record per Application on each Crawler run, so that the detail view can render a
real Health Timeline instead of the hardcoded seed array.

## Acceptance Criteria

1. A `HealthSnapshot` model is added at `libs/shared/api/src/model/dashboard/HealthSnapshot.ts`
   with: `applicationId: string`, `status: ApplicationStatus`, `uptimePct: number | null`,
   `datadogMapped: boolean`, `monitorCount: number`,
   `resolutionPath: 'primary' | 'fallback' | 'unmapped'`, `recordedAt: string` (ISO).
2. A new `healthSnapshots` collection is created on first boot using the same
   `createCollectionIfNotExists` pattern as `MongoApplicationRepository.initDb()`. Do NOT seed it
   (it accumulates from real runs).
3. A compound index `{ applicationId: 1, recordedAt: -1 }` is created on the collection.
4. A `HealthSnapshotRepository` interface exposes
   `insertSnapshot(doc: HealthSnapshot): Promise<void>` and
   `findRecentByApplicationId(applicationId: string, limit: number): Promise<HealthSnapshot[]>`
   (newest-first).
5. Both Mongo and in-memory implementations exist, selected by the SAME mongo-url-presence factory
   used in `ApplicationsModule` (`mongoUrl ? mongo : inMemory`).
6. Unit tests cover insert and the newest-first windowed query.

## Tasks / Subtasks

- [ ] Model (AC: 1)
  - [ ] Add `HealthSnapshot.ts` in the shared dashboard model folder; reuse `ApplicationStatus`
- [ ] Repository contract + impls (AC: 2, 3, 4, 5)
  - [ ] `apps/api/src/health-snapshots/health-snapshot.repository.ts` (interface)
  - [ ] `apps/api/src/health-snapshots/mongo/mongo-health-snapshot.repository.ts` — extend
        `MongoRepository`, `collectionName = 'healthSnapshots'`, `initDb()` creates collection +
        index
  - [ ] `apps/api/src/health-snapshots/in-memory/in-memory-health-snapshot.repository.ts`
  - [ ] `apps/api/src/health-snapshots/health-snapshots.module.ts` — token
        `'HealthSnapshotRepository'` with the mongo/in-memory `useFactory` toggle; export the token
- [ ] Tests (AC: 6)
  - [ ] `*.spec.ts` for insert + `findRecentByApplicationId`

## Dev Notes

**Reuse, do not reinvent:**

- Copy the structure of `apps/api/src/applications/` (interface + `mongo/` + `in-memory/` +
  `*.module.ts`). The Mongo repo MUST `extends MongoRepository`
  (`apps/api/src/repository/mongo/mongo-repository.ts`) and use
  `this.getCollection<HealthSnapshot>(this.collectionName)` — that base class handles Vault/Atlas
  connection, the project-key prefix, and calls `initDb()` after connect.
- The module factory MUST mirror `ApplicationsModule` exactly: read
  `API_MONGODB_API_DB_URL || API_MONGODB_DB_URL`; if present use Mongo, else in-memory. This is the
  project's established repo-selection convention.
- `initDb()` override: call `createCollectionIfNotExists()` (see `MongoApplicationRepository`
  private method — replicate it) then `createIndex({ applicationId: 1, recordedAt: -1 })`. Do NOT
  seed.

**What this unblocks / who consumes it:** Story 1.4 (`DatadogSyncService`) calls `insertSnapshot`
once per app per run; Story 1.8 (deferred, UI) calls `findRecentByApplicationId` to render the
timeline.

**Testing standards:** Jest `*.spec.ts`. Mock `ConfigService`/`Logger` for the Mongo repo following
`apps/api/src/repository/mongo/mongo-repository.spec.ts`. The in-memory repo is trivially testable
without mocks.

### Project Structure Notes

- New folder `apps/api/src/health-snapshots/` mirrors `applications/` and `incidents/`. Model goes
  in the shared lib for cross-app reuse (the UI will read it later).
- Depends on Story 1.1 only for the shared `ApplicationStatus` type (already exists), so 1.2 can
  proceed in parallel with 1.1.

### References

- PRD FR-3 (Health Timeline), §A/§C — [Source:
  _bmad-output/planning-artifacts/prds/prd-operational-dashboard-halo-2026-06-13/prd.md]
- Crawler solution-design (healthSnapshots) — [Source:
  _bmad-output/planning-artifacts/architecture/crawler-solution-design-2026-06-13.md]
- Backlog E1-S2 — [Source:
  _bmad-output/planning-artifacts/epics-stories/phase-1-backlog-2026-06-13.md]
- Pattern to copy: `apps/api/src/applications/applications.module.ts`,
  `apps/api/src/applications/mongo/mongo-application.repository.ts`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
