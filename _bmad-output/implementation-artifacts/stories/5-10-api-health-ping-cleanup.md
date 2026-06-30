# Story 5.10: Point the API-live check at /health (stop the /tasks 401 console noise)

Status: done

## Story

As a developer/tester, I want the app's "is the API up?" check to hit the public `/health` endpoint
instead of the auth-guarded `/tasks`, so that the console isn't spammed with 401s and testers aren't
misled into thinking it's an access problem.

## Context / Why

`app.component.ts:147` `isAPILive()` pings `GET {apiBaseUrl}/tasks` as a connectivity check — a
leftover from the MMC template. But `/tasks` sits behind the **global OktaGuard**
(`app.module.ts:56`), so it returns **401** whenever the request has no/early/expired token. Result:
repeated `GET /api/v1/tasks 401 (Unauthorized)` + retries in the console for **all** users
(including fully-logged-in ones — confirmed on Iader's session 2026-06-18).

It's **functionally harmless**: the `isAPILive()` error handler only flips `apiUnreachable` (network
error) or `apiError` (500), so a 401 is ignored and the dashboard works. But it's console noise and
it confused a tester (Nemi reported it as a suspected access issue). There is already a
purpose-built **public** health endpoint: `apps/api/src/health/health.controller.ts` →
`@Controller('/health')` with `@AllowControllerWithNoBearer()` (Terminus), which needs no token.

## Acceptance Criteria

1. `isAPILive()` calls `GET {apiBaseUrl}/health` instead of `/tasks`.
2. The `apiUnreachable` / `apiError` flags still behave correctly against `/health`'s response
   (network error → unreachable; 5xx → error; 200 → healthy).
3. No more `/api/v1/tasks 401` entries appear in the browser console during normal navigation.

## Dev Notes

- One-line change: `apps/ui/src/app/app.component.ts:148` (`/tasks` → `/health`).
- `/health` returns the Terminus health JSON (200 when up); no `Authorization` header required.
- Verify whatever retry interceptor was hammering `/tasks` no longer fires (it should stop once the
  call succeeds).

## Out of scope / follow-up

- The leftover **task-management** feature (UI routes `/tasks`, `/tasks/add`, `/tasks/edit/:id`,
  home links, the `task-management` components/service, and the API `tasks` module) is unused by the
  Portfolio dashboard. Removing it would declutter the demo — track separately if desired, not part
  of this chore.

## References

- Surfaced 2026-06-18 from Nemi's 401 report on `/api/v1/tasks`.
- Global guard: `apps/api/src/app/app.module.ts:56` (`APP_GUARD` → `OktaGuard`).
- Public health endpoint: `apps/api/src/health/health.controller.ts:22-24`.
