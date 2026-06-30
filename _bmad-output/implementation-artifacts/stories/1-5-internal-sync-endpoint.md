# Story 1.5: Internal sync endpoint (shared-secret, Okta-bypassed)

Status: done

## Story

As the Crawler (a scheduled K8s job), I want a guarded internal HTTP endpoint that triggers
`DatadogSyncService.syncAll()`, so that I can drive a sync once per tick without carrying Datadog
credentials or an Okta JWT.

## Acceptance Criteria

1. `POST /api/v1/internal/sync/datadog` is registered (the global prefix `/api/v1` is applied in
   `server.ts`, so the controller path is `internal/sync/datadog`).
2. The endpoint is protected by a shared-secret guard that compares the `Authorization` header to
   `INTERNAL_SYNC_TOKEN` (from `ConfigService`). Missing/empty/wrong token → `401`. The token is
   never hardcoded.
3. The endpoint BYPASSES the global `OktaGuard` (registered as `APP_GUARD` in `app.module.ts`) using
   the repo's existing no-bearer exemption mechanism — it must NOT require an Okta token.
4. A valid request runs `syncAll()` and returns `200` with
   `{ appsAttempted, appsSucceeded, appsFailed, durationMs }`.
5. `DatadogModule` is imported into `AppModule`.
6. `INTERNAL_SYNC_TOKEN` is added to the Joi `configSchema` (optional for local/dev; required in
   deployed environments via Vault).
7. Tests: 401 on missing/wrong token; 200 + summary on valid token (with `DatadogSyncService`
   mocked).

## Tasks / Subtasks

- [ ] READ FIRST (auth mechanism — do not guess):
      `apps/api/src/app/common/auth-guards/oktaGuard.service.ts` and
      `apps/api/src/app/common/allowControllerWithNoBearer.ts` to learn exactly how a
      controller/route is exempted from the global Okta guard. Apply that mechanism here. (AC: 3)
- [ ] Shared-secret guard (AC: 2)
  - [ ] `apps/api/src/datadog/internal-sync.guard.ts` — `CanActivate` comparing the `Authorization`
        header to `INTERNAL_SYNC_TOKEN`
- [ ] Controller (AC: 1, 3, 4)
  - [ ] `apps/api/src/datadog/internal-sync.controller.ts` — `@Controller('internal/sync')`,
        `@Post('datadog')`, the Okta exemption + the shared-secret guard, returns the summary
- [ ] Wiring (AC: 5, 6)
  - [ ] Add `DatadogModule` to `AppModule` imports; add `INTERNAL_SYNC_TOKEN` to `configSchema`
- [ ] Tests (AC: 7)

## Dev Notes

**Critical: the app has a GLOBAL Okta guard.** `apps/api/src/app/app.module.ts` registers
`{ provide: APP_GUARD, useClass: OktaGuard }`, so EVERY route requires Okta auth unless explicitly
exempted. There is an existing helper `apps/api/src/app/common/allowControllerWithNoBearer.ts` (with
a spec) — almost certainly the project's mechanism for public/no-bearer routes. **Read it and the
`OktaGuard` before implementing** and reuse that exact mechanism rather than inventing a new
`@Public()` decorator. The endpoint must be correctly exempted for deployed environments via that
mechanism.

**Why a separate shared-secret guard (not Okta):** the Crawler is a machine caller inside the
cluster; it authenticates with a shared secret, not a user JWT. Guard order: apply the Okta
exemption AND the `InternalSyncGuard` so the route is reachable without Okta but still requires the
secret.

**Routing:** `server.ts` sets `app.setGlobalPrefix('/api/v1')`. So `@Controller('internal/sync')` +
`@Post('datadog')` resolves to `POST /api/v1/internal/sync/datadog`. Keep it internal (called via
the K8s service DNS, not the ingress) — do not add it to `openapi.yaml` public docs.

**Reuse:** inject `DatadogSyncService` (Story 1.4). The controller is thin: guard → `syncAll()` →
return summary.

**Testing standards:** Nest testing module; mock `DatadogSyncService`; assert guard behavior
(401/200). See `apps/api/src/app/common/auth-guards/oktaGuard.service.spec.ts` for guard test
patterns.

### Project Structure Notes

- Controller/guard live in `apps/api/src/datadog/`. Depends on Story 1.4 (`DatadogSyncService`).
- This story delivers the milestone: with the API running locally (in-memory repos),
  `curl -XPOST localhost:8080/api/v1/internal/sync/datadog -H "Authorization: <token>"` returns the
  summary and populates health fields readable via `GET /api/v1/applications`.

### References

- PRD FR-1/FR-6/FR-7, §D Constraints — [Source:
  _bmad-output/planning-artifacts/prds/prd-operational-dashboard-halo-2026-06-13/prd.md]
- Crawler solution-design (internal endpoint + auth) — [Source:
  _bmad-output/planning-artifacts/architecture/crawler-solution-design-2026-06-13.md]
- Backlog E1-S5 — [Source:
  _bmad-output/planning-artifacts/epics-stories/phase-1-backlog-2026-06-13.md]
- Auth: `apps/api/src/app/app.module.ts` (APP_GUARD),
  `apps/api/src/app/common/auth-guards/oktaGuard.service.ts`,
  `apps/api/src/app/common/allowControllerWithNoBearer.ts`; prefix: `apps/api/src/server.ts`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
