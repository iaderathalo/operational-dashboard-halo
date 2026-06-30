# Story 5.8: Deployed API pod cannot reach Datadog (egress / proxy)

Status: blocked

## Story

As an operator, I want the deployed dev API pod to be able to call the Datadog API, so that the
internal sync (`syncAll`) actually loads live Health/Uptime data in dev instead of failing.

## Context / Why

Triggering `POST /api/v1/internal/sync/datadog` against the deployed dev URL returns **504** at the
gateway, or **500** with an axios error. Investigation (2026-06-18, via
`scripts/datadog-logs-probe.js`) shows the sync is **failing**, not merely slow: the API pod
**cannot reach `api.datadoghq.com`**. Every Datadog HTTP call in `syncAll()` either times out at the
client's 10s limit or fails to connect.

Locally the sync works (651 apps mapped) because the dev machine has internet egress; the EKS pod
does not. The "data" currently visible on the deployed dashboard was **loaded manually** — the
auto-sync has never succeeded in dev. This is an **infra/egress** issue, not application code.
(Async-202, previously considered, would only move the same failure into the background — tracked
separately as 5-9.)

## Evidence

- **Logs (24h):** 5× `Internal Datadog sync triggered`, **0× `Datadog sync complete`**, 0×
  failure-summary.
- **Errors (today, pod `operational-dashboard-api-…`):**
  - `timeout of 10000ms exceeded` + `500 POST /api/v1/internal/sync/datadog (14067ms)`
  - `AggregateError at AxiosError.from (…/axios…)` +
    `500 POST /api/v1/internal/sync/datadog (4149ms)`
- **Client config** (`apps/api/src/datadog/datadog.module.ts`): `baseURL https://api.datadoghq.com`,
  `timeout: 10000`, **no proxy**.
- **Deploy config:** no `HTTPS_PROXY` / `NO_PROXY` set anywhere in `deployments/`.
- No `@Cron`/boot hook calls `syncAll()` — the repeated boot/bootstrap logs are **pod restarts**,
  not self-calls.

## Acceptance Criteria

1. The deployed dev API pod can establish HTTPS to the Datadog API (whichever egress path the
   platform supports).
2. A manual `POST /api/v1/internal/sync/datadog` produces a `Datadog sync complete` log with a real
   summary (`appsAttempted/appsSucceeded/...`) — no `timeout`/`AggregateError`.
3. Mapped apps show live Health/Uptime sourced from an actual sync run (not the manual load).
4. The egress path is captured in deploy config/docs so it survives redeploys.

## Proposed approaches (to confirm with DevOps — see message to Bernie/Saule)

1. **Egress proxy** — set `HTTPS_PROXY` + `NO_PROXY` on the API pod to the standard MMC forward
   proxy. axios honors the env proxy automatically; smallest change if such a proxy exists.
2. **Egress allowlist** — allow outbound 443 to `api.datadoghq.com` from the pod (NetworkPolicy / SG
   / firewall).
3. **Datadog PrivateLink / internal endpoint** — point `DATADOG_BASE_URL` at the
   PrivateLink/internal Datadog endpoint, avoiding the public internet.

## Dev Notes

- The cluster already ships logs/metrics to Datadog (these very logs are queryable), so an egress
  path exists — ideally reuse whatever the Datadog agent uses.
- Blocked on the platform team for the supported egress pattern + the proxy URL / allowlist /
  PrivateLink target.

## References

- Root-caused with `scripts/datadog-logs-probe.js` (read-only Logs API probe).
- Blocks the demo's "live data" story; relates to `5-5` (deploy), `1-7` (CronJob, also needs this
  egress), `5-7` (migrations, separate). Robustness follow-up: `5-9` (async sync trigger).
