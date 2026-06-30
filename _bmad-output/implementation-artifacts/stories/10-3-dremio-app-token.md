# Story 10.3: Dremio application service token (replace the personal PAT for the PlanView sync)

Status: blocked

## Story

As the **team**, I want a **dedicated Dremio application (service) token** for the live PlanView
sync, so that the catalog refresh runs **as the application** — not on Iader's personal PAT and not
via a manual copy of local data into the dev DB.

## Context / Why

`epic-10` shipped the live Dremio REST client (`DremioPortfolioClient`) behind `USE_REAL_PLANVIEW`,
upsert-by-key (commit `001010e`, done 2026-06-22). But today the dev sync is **manual and
personal**: Iader syncs Dremio locally **with his own PAT** and copies the data from his local DB
into the dev DB. Surfaced in the **2026-06-24 Bernie/Saule sync** as an access roadblock to clear
early.

This is an **access/ops** story (provision + wire a credential), not a code redesign — the client
already supports a Bearer token.

## Acceptance Criteria

1. A **dedicated, read-only Dremio service token** (application identity, not a personal PAT) is
   provisioned by Mercer for dev (and later prod).
2. The token is stored in **Vault** and wired into the deploy env (cf. the env-var wiring pattern),
   consumed by `PlanviewSyncService` / `DremioPortfolioClient`.
3. The PlanView sync runs **as the app** end-to-end (no personal PAT, no manual local→dev DB copy),
   preserving the existing **upsert-by-key** behaviour (re-sync must not drop Datadog enrichment).
4. Freshness/`lastSyncAt` semantics unchanged.

## Dev Notes

- Client already takes a Bearer PAT (`POST /api/v3/sql` → poll → page). This story only changes
  **whose** credential it uses and **where** it comes from (Vault, not a dev's machine).
- Blocked by: **Mercer Dremio service account / token provisioning** — push Nemi/Prashant; Bernie
  can help with the request/template. Pairs with the dev egress ask (`5-8`) since the deployed pod
  also needs network reach.

## References

- Builds on `epic-10` (`10-1`/`10-2`, done): `stories/10-1-spike-dremio-live-source.md`,
  `stories/10-2-dremio-portfolio-client.md`.
- Live source research:
  `_bmad-output/planning-artifacts/research/planview-live-source-research-2026-06-18.md`.
- Meeting origin: 2026-06-24 Saule/Bernie/Iader sync.

## Dev Agent Record

### File List

- (no app code expected) — credential provisioning + Vault/Helm env wiring; verify
  `DremioPortfolioClient` / `PlanviewSyncService` read the token from env.
