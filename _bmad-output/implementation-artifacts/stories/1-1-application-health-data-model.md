# Story 1.1: Extend the Application data model with Datadog health fields

Status: done

## Story

As a developer on the operational dashboard, I want the shared `Application` model and its
repositories to carry Datadog-sourced health fields plus an `updateHealth` write path, so that the
Crawler has a defined write contract and the dashboard has a defined read contract for live Health.

## Acceptance Criteria

1. The `Application` interface gains these OPTIONAL fields (all optional so existing seed/docs stay
   valid). The Datadog bridge is the dual tag derived from PlanView and stored on the app: the app
   `shortCode` IS the `app_short_key` tag value (primary), with the PlanView ServiceNow key
   (`SNSVC#######`) as the `app_service_id` tag value (fallback). No separate
   `datadogServiceId`/`datadogNamespace`/`datadogAppName` fields are introduced — the bridge keys
   are the values that already live on the app (`shortCode`) plus the ServiceNow key:
   - `healthStatus?: ApplicationStatus` — the synced status (reuse the existing `ApplicationStatus`
     type; do NOT introduce a new enum)
   - `datadogMapped?: boolean` — false when no Datadog identifier resolves
   - `uptime24h?: number | null` · `uptime7d?: number | null` · `uptime30d?: number | null` —
     percentages; `null` = "not available"
   - `slaTarget?: number | null` · `errorBudgetRemainingPct?: number | null` — `null` when no SLO
     exists
   - `lastSyncAt?: string | null` (ISO) · `lastSyncStatus?: 'ok' | 'error' | 'unmapped' | null` ·
     `resolutionPath?: 'primary' | 'fallback' | 'unmapped' | null`
2. `ApplicationRepository` gains
   `updateHealth(id: object, health: Partial<Application>): Promise<number>` — a partial update of
   ONLY the health fields, not a full-document replace.
3. The Mongo implementation performs `updateHealth` with a `$set` (via `updateOne`), NOT
   `findOneAndReplace` — so a health write never clobbers `name`, `tier`, `statusOverride`, etc. The
   `findOne` projection is extended to include every new field (otherwise the new fields are
   silently dropped from reads).
4. The in-memory implementation merges the health fields into the existing record by id and bumps
   `updatedAt`.
5. `currentStatus` continues to reflect a manual `statusOverride` when one is present; only when
   there is NO `statusOverride` does `currentStatus` track `healthStatus`. This conditional lives in
   `ApplicationsService`, not in a repository.
6. Unit tests cover: (a) `updateHealth` writes only the health fields and preserves the rest of the
   document; (b) the `statusOverride`-present vs -absent branch for `currentStatus`.

## Tasks / Subtasks

- [ ] Extend the model (AC: 1)
  - [ ] Add the optional fields to `libs/shared/api/src/model/dashboard/Application.ts`, reusing
        `ApplicationStatus`
- [ ] Extend the repository contract + implementations (AC: 2, 3, 4)
  - [ ] Add `updateHealth` to `apps/api/src/applications/application.repository.ts`
  - [ ] Implement `$set`-based `updateHealth` and extend the `findOne` projection in
        `apps/api/src/applications/mongo/mongo-application.repository.ts`
  - [ ] Implement merge-based `updateHealth` in
        `apps/api/src/applications/in-memory/in-memory-application.repository.ts`
- [ ] Status precedence (AC: 5)
  - [ ] Add a helper in `apps/api/src/applications/applications.service.ts` so `healthStatus` only
        drives `currentStatus` when no `statusOverride` exists
- [ ] Tests (AC: 6)
  - [ ] Add `apps/api/src/applications/applications.service.spec.ts` and/or a mongo repo spec
        covering partial-write + override precedence

## Dev Notes

**Files being modified — current state and what to preserve:**

- `libs/shared/api/src/model/dashboard/Application.ts` — today exports
  `ApplicationStatus = 'GREEN'|'AMBER'|'RED'`, `StatusOverride`, and `Application` (id, name,
  shortCode, description, environment, tier, businessUnit, currentStatus, currentUserCount,
  monitoringSource, teamId, statusOverride?, createdAt?, updatedAt?). **Reuse `ApplicationStatus`
  for `healthStatus`.** Keep all new fields optional.
- `apps/api/src/applications/mongo/mongo-application.repository.ts` — `updateOne` currently uses
  `findOneAndReplace` (full replace + `updatedAt`). `findOne` uses an EXPLICIT projection (only
  listed fields are returned) — **you must add every new field to that projection or reads won't
  expose them.** Collection name `applications`; ids are Mongo `ObjectId`
  (`ObjectId.createFromHexString(id)`). Add `updateHealth` as a NEW method using
  `updateOne(..., { $set: { ...health, updatedAt } })`. Do not change `updateOne`'s replace
  semantics (other callers rely on it).
- `apps/api/src/applications/in-memory/in-memory-application.repository.ts` — array of seeded apps
  with uuid ids; `updateOne` replaces by index. Add `updateHealth` that finds by id and spreads the
  health fields onto the existing object.
- `apps/api/src/applications/applications.service.ts` — has
  `updateStatusOverride`/`clearStatusOverride` that set `currentStatus = override.status`.
  **Preserve override precedence:** a Crawler health write must not silently overwrite an operator's
  manual override.

**Anti-patterns to avoid:**

- Do NOT add a new status enum — reuse `ApplicationStatus`.
- Do NOT use `findOneAndReplace` for the health write (it would wipe non-health fields).
- Do NOT forget the `findOne` projection update.

**Testing standards:** Jest (`nx test api`). Spec files live beside source as `*.spec.ts`. See
`apps/api/src/tasks/tasks.service.spec.ts` and
`apps/api/src/repository/mongo/mongo-repository.spec.ts` for established mocking patterns (mock the
repository / `ConfigService` / `Logger`).

### Project Structure Notes

- Model lives in the shared lib `@operational-dashboard/shared-api-model/model/dashboard` (barrel
  re-export in `libs/shared/api/src/model/dashboard.ts`). No new files for this story — all edits
  are to existing files.
- This story is the data-contract foundation: stories 1.2–1.6 depend on these fields/methods
  existing.

### References

- PRD §G Data Contract and FR-2/FR-4/FR-5/FR-6/FR-7 — [Source:
  _bmad-output/planning-artifacts/prds/prd-operational-dashboard-halo-2026-06-13/prd.md]
- Crawler solution-design (data model section) — [Source:
  _bmad-output/planning-artifacts/architecture/crawler-solution-design-2026-06-13.md]
- Backlog E1-S1 — [Source:
  _bmad-output/planning-artifacts/epics-stories/phase-1-backlog-2026-06-13.md]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
