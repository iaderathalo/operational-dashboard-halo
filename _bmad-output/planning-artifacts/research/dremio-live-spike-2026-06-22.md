# Dremio Live Source Spike — Findings (2026-06-22)

## Confirmed Configuration

| Key                           | Value                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `DREMIO_BASE_URL`             | `https://dremioprod.mrshmc.com`                                                          |
| `DREMIO_VIEW_PATH`            | `CAI.ConsolidatedApplicationInventory.dbo.vwAllApplications_Latest`                      |
| View type                     | `PHYSICAL_DATASET` (SQL Server view exposed via Dremio MSSQL source `CAI`)               |
| Underlying SQL (on dremiodev) | `SELECT * FROM "CAI-PROD".ConsolidatedApplicationInventory.dbo.vwAllApplications_Latest` |

**Note:** The dev instance (`dremiodev.mrshmc.com`) has the view definition at
`DEV.MMC.MMC_Tech.CAI.CAI-Applications` but references a source `CAI-PROD` that is not available on
dev. The production instance (`dremioprod.mrshmc.com`) has the source `CAI` pointing directly to the
SQL Server.

## REST API Flow (validated)

1. **Resolve view metadata:**
   `GET /api/v3/catalog/by-path/CAI/ConsolidatedApplicationInventory/dbo/vwAllApplications_Latest`
2. **Submit SQL:** `POST /api/v3/sql` →
   `{ "sql": "SELECT * FROM CAI.ConsolidatedApplicationInventory.dbo.\"vwAllApplications_Latest\"" }`
3. **Poll job:** `GET /api/v3/job/{id}` until `jobState === "COMPLETED"`
4. **Page results:** `GET /api/v3/job/{id}/results?offset=0&limit=500` (repeat, incrementing offset)

## Field & Row Diff vs Static File

| Metric              | Static File | Dremio API | Delta                  |
| ------------------- | ----------- | ---------- | ---------------------- |
| Total records       | 8,519       | 8,553      | +34                    |
| Fields              | 80          | 80         | 0                      |
| Active after filter | 3,656       | 3,670      | +14                    |
| InternalID overlap  | —           | 8,501      | 99.8%                  |
| Only in API         | —           | 52         | new additions          |
| Only in static      | —           | 18         | removed/status changed |
| CASTKey populated   | 99.9%       | 99.9%      | —                      |

### Required Fields — All Present ✓

- `CASTKey` — Datadog join key → `app_short_key` / `shortCode`
- `InternalID` — unique key → `planviewInternalId`
- `ProductName`, `ProductCode`, `Status`, `OpCo`, `BusinessDeliveryPortfolioName`
- `ItOwner`, `ItOwnerEmail`, `PortfolioOwnerName`, `PortfolioOwnerEmail`
- `InternalUserCount`, `ExternalUserCount`
- `DataDate`

### DataDate Semantics

- **Single distinct value:** `2026-06-20 00:00:00.000`
- The view always returns the **latest snapshot** (hence `_Latest` suffix)
- Refreshed periodically (2 days before this probe)
- Not historical — each refresh replaces the previous snapshot

## Software vs Cloud

The Dremio REST API is a **standard HTTP/JSON interface** — no special SDK or binary protocol
required. The `fetch()` calls with Bearer token + JSON payloads are all that's needed.

Arrow Flight SQL would only be needed if paging latency becomes a concern (8.5K rows pages in ~18
requests at 500/page — takes ~5 seconds total, acceptable for a scheduled sync).

## VERDICT: **GO** ✓

- All required fields present and populated
- Row parity > 99%
- Clean JSON from API (no `}{` malformation — eliminates the `normalizeRawExport` hack)
- DataDate confirms "live-ish" data (refreshed every few days)
- REST flow is simple and bounded

Proceed to Part B: build `DremioPortfolioClient`.
