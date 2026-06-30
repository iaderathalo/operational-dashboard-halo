# Story 10.1: SPIKE — confirm Dremio access for a live application catalog

Status: blocked

## Story

As a developer, I want to confirm whether we can query the Dremio "CAI.Applications" view
programmatically (read-only), so that we can replace the static
`PlanviewData_Dremio_CAI_Applications.json` export with a live source.

## Context / Why

Investigation (workflow `planview-data-source-research`, 2026-06-18 — full report in
`_bmad-output/planning-artifacts/research/planview-live-source-research-2026-06-18.md`) found the
app catalog is a **manual Dremio export** loaded via `db/load-planview-applications.js`. The
lowest-risk path to "live" is the **Dremio REST API** over the same CAI view, because the data is
already a Dremio dataset. This spike confirms feasibility before committing the build (10-2).

## Probe steps (read-only; needs data-platform access)

1. **Source object:** get the exact view path (likely `<space>."CAI"."Applications"`) and its
   defining SQL via `GET /api/v3/catalog/by-path/...`. Ask whoever produces the export today for the
   host, query and filters, and whether `DataDate` is a column or an export-time stamp.
2. **Connectivity + creds:** Dremio host/port (software `:9047` vs Cloud `:443`); a **read-only
   service user** with `SELECT` on the CAI space; a **PAT** minted as that user (≤180d, rotate).
   Confirm pod **egress + TLS** trust.
3. **Validate end-to-end:** run `POST /api/v3/sql` → poll `GET /api/v3/job/{id}` → page
   `GET /api/v3/job/{id}/results?offset=&limit=500`. **Diff the result vs the current static file**:
   record count, field names, and the key fields (Datadog join key e.g. CASTKey, `opCo`,
   `businessDeliveryPortfolio`, `Status`).

## Acceptance Criteria

- Go/no-go on Dremio REST access, with: host/port, exact view path + SQL, an auth method, and a
  confirmed field diff against the static export (esp. the Datadog join key). Findings written to
  the research folder.

## Blockers / who

- **blocked_by:** MMC **data-platform / Dremio admin** (host, read-only service user + PAT,
  egress/TLS, view path) and **whoever runs the current manual export** (query/filters/snapshot
  semantics).

## References

- Research: `research/planview-live-source-research-2026-06-18.md`. Memory:
  [[planview-data-source]].
- Feeds build story **10-2** (DremioPortfolioClient). Egress question overlaps **5-8**.
