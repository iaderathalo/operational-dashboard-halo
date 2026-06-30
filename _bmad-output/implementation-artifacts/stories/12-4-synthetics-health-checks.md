# Story 12.4: SPIKE — Health Check Breakdown via Datadog Synthetics

Status: ready-for-dev

## Story

As a developer, I want to confirm whether our existing Datadog key can read Synthetic tests **and**
whether those tests carry the `app_short_key` tag (and at what coverage), so that we can decide
GO/NO-GO on a Synthetics-sourced **Health Check Breakdown** card before committing the build.

## Context / Why

E12-S4 (epics-stories backlog `phase-2-card-truth-and-recommendations-backlog-2026-06-23.md`,
§"E12-S4 — Health Check Breakdown via Synthetics") wants the Health tab to show real per-app
endpoint/uptime checks (synthetic test pass/fail + timing). The card is only honest if synthetic
tests can be **joined to our apps on `app_short_key`** — the same join key the live SLO/monitor path
already uses (`KEPT_SLO_TAG_KEYS = ['app_short_key', 'app_service_id']` in
`apps/api/src/datadog/real-datadog-client.ts:36`; `snapshotTagKey()` in
`apps/api/src/datadog/datadog.types.ts:50`).

This is the **same ~0.1% service-tag gate** that killed the APM-sourced cards (Response Time / Error
Rate, see the PARK list in the backlog) and gated ServiceNow incidents (E12-S3). APM span tags ≠
primary tags, so almost nothing resolves. **Synthetics may or may not be tagged `app_short_key`** —
they are authored objects, not auto-instrumented spans, so the coverage is genuinely unknown.
**Hence the probe.** Unlike the Dremio spike (10-1, which is blocked on external access), this probe
is **doable NOW with our existing Datadog key** — `DD-API-KEY` + `DD-APPLICATION-KEY` are already in
`.env` and already drive the other `scripts/datadog-*-probe.js` probes.

If GO → build a Synthetics client modelled on `RealDatadogClient` (paged bulk fetch, once per sync
run, indexed by `app_short_key`), feeding the Health Check Breakdown card. If the coverage is ~0.1%
like the service tags → **honest-empty**: no card, documented, same as the PARK cards.

## Probe steps (read-only; uses our existing Datadog key — no new access)

Model on the existing probe pattern (`scripts/datadog-service-join-probe.js`,
`scripts/datadog-catalog-incidents-probe.js`): read `DATADOG_API_KEY` / `DATADOG_APP_KEY` /
`DATADOG_SITE` from `.env` (gitignored), `base = https://api.${SITE}`, headers `DD-API-KEY` +
`DD-APPLICATION-KEY`, **never print key values**, handle 429 via `x-ratelimit-reset`.

1. **Entitlement — does the key have `synthetics_read`?** `GET /api/v1/synthetics/tests` (Synthetics
   list endpoint). A `200` with a `{ tests: [...] }` body = entitled; a `403` = the App Key lacks
   the `synthetics_read` scope (escalate to whoever mints the key). Record status + test count. This
   mirrors the entitlement check in `datadog-catalog-incidents-probe.js`.
2. **Tag coverage — do Synthetic tests carry `app_short_key`, and at what %?** For each test in the
   list, read its `tags` array and count how many carry an `app_short_key:<value>` tag (lowercased,
   non-empty value — same predicate as `RealDatadogClient.isKeptTag`, `real-datadog-client.ts:354`).
   Report: total tests, tests with **any** tag, tests with `app_short_key`, and distinct
   `app_short_key` values seen. Then **join against our apps** (Mongo `applications`, `shortCode`,
   exactly like `datadog-service-join-probe.js:99-122`) and report the **% of our apps that get ≥1
   synthetic test** — this is the number that decides GO vs honest-empty.
3. **Results shape (only if step 2 is non-trivial).** For a handful of tests that DO carry
   `app_short_key`, fetch `GET /api/v1/synthetics/tests/{public_id}/results` and confirm the
   per-result fields the card needs are present: pass/fail status and timing/response-time. Confirms
   the build can populate "test pass/fail + timing" without a second join. Page only as far as
   needed — this is a shape check, not a full pull.

## Acceptance Criteria

- GO/NO-GO recorded for E12-S4, with all of: (a) `GET /api/v1/synthetics/tests` HTTP status
  confirming `synthetics_read` (or the 403 if not); (b) the `app_short_key` tag **coverage %**
  across Synthetic tests; (c) the **% of our apps** that would get ≥1 health-check via the
  `app_short_key` join; (d) a note on whether `/results` carries pass/fail + timing.
- A read-only probe script committed as `scripts/datadog-synthetics-probe.js`, following the
  existing probe conventions (`.env` keys, never prints key values, 429-aware), so the result is
  reproducible.
- **Decision rule, stated up front:** if app-join coverage is in the ~0.1% range (the service-tag
  gate that killed APM/incidents), the verdict is **honest-empty** — no card, documented — not a
  build. Only a materially higher coverage is a GO.
- **If GO,** a one-paragraph build sketch: a Synthetics client modelled on `RealDatadogClient` —
  page `GET /api/v1/synthetics/tests`, keep only `app_short_key`-tagged tests, fetch per-test
  `GET /api/v1/synthetics/tests/{id}/results`, index by `${tagKey}:${tagValue}` via
  `snapshotTagKey()`, pulled **in the sync cadence (once per run, bulk), not per render** — same
  shape as the monitor/SLO paging in `real-datadog-client.ts`.
- Findings written into the probe output / research notes; backlog E12-S4 verdict updated from 🟡 to
  GO or NO-GO.

## Blockers / who

- **No external blocker for the probe** — runs now on our existing key (Iader). The only escalation
  is **if step 1 returns 403**: whoever mints the Datadog Application Key must add the
  `synthetics_read` scope.
- **Build owner if GO:** Bernardo (per E12-S4). The build itself is gated on the probe's coverage
  number, not on access.

## References

- Spec:
  `_bmad-output/planning-artifacts/epics-stories/phase-2-card-truth-and-recommendations-backlog-2026-06-23.md`
  §"E12-S4" (line ~128) and Open Question #2 (line ~179).
- Model the client on: `apps/api/src/datadog/real-datadog-client.ts` (paged bulk fetch, kept-tag
  filter, 429 backoff), `apps/api/src/datadog/datadog.module.ts` (base URL +
  `DD-API-KEY`/`DD-APPLICATION-KEY` wiring), `apps/api/src/datadog/datadog.types.ts`
  (`snapshotTagKey`, `DatadogSnapshot`).
- Model the probe on: `scripts/datadog-service-join-probe.js` (app↔tag join + coverage %),
  `scripts/datadog-catalog-incidents-probe.js` (entitlement probe shape).
- Same ~0.1% service-tag gate as the PARK cards (Response Time / Error Rate) and E12-S3 (incidents).
  Memory: [[deployed-datadog-egress-blocked]].
