# Datadog and PlanView EA Data Requirements

## Scope

This note translates the current dashboard architecture into the external data we should request
from:

- Datadog for per-application health and telemetry
- PlanView EA for portfolio, application, TPM, and business-unit metadata

The current architecture and MVP documents assume the dashboard can support:

- application-level GREEN / AMBER / RED health
- uptime views for 24h, 7d, 30d, and 90d
- health-check details and recent health events
- latency and error-rate trends in the application detail view
- filtering by business unit and tier
- ownership display for each application, including TPM-level ownership
- dashboard rollups for total applications, total users, and 30-day uptime

## Source-of-Truth Split

- PlanView EA should be the system of record for portfolio hierarchy, application catalog, business
  unit alignment, and TPM ownership.
- Datadog should be the system of record for technical health, availability, monitor state, and
  performance telemetry.
- The dashboard should derive the final GREEN / AMBER / RED state from Datadog signals using the
  status rules defined in the architecture.
- A stable cross-system application key is required so PlanView EA records can be joined to Datadog
  telemetry.

## Observed PlanView Export Characteristics

The current source file in this repository, `db/PlanviewData_Dremio_CAI_Applications.json`, is the
best available example of the PlanView payload we need to integrate.

- 8,519 rows and 80 columns
- Not valid JSON as stored: adjacent objects are missing commas and must be normalized before parse
- 2,971 rows currently match the first-pass live-monitoring scope of `Status = In Production`
- `ProductCode` and `InternalID` are present and unique for every sampled record
- `CASTKey` is present and unique for every sampled production record, making it the best Datadog bridge
- `CA_Application_UUID` and `ServiceNowKey` are only partially populated and contain duplicates
- `TechnicalContact` and `TechnicalContactEmail` are empty in the current sample and should not be modeled

## Shared Join Keys

These fields must exist directly in both systems or be mapped in the integration layer.

| Field                             | Priority    | Why we need it                                                 |
| --------------------------------- | ----------- | -------------------------------------------------------------- |
| `applicationId`                   | Required    | Derived from PlanView `InternalID`; canonical key in the dashboard API |
| `applicationName`                 | Required    | Derived from PlanView `ProductName` for display and reconciliation |
| `shortCode`                       | Required for production scope | Derived from PlanView `CASTKey`; preferred human-readable lookup and Datadog join |
| `environment`                     | Required    | First pass is fixed to production when `Status = In Production`; the export has no separate environment column |
| `planviewInternalId`              | Required    | Exact traceability back to PlanView `InternalID`               |
| `planviewProductCode`             | Required    | Exact traceability back to PlanView `ProductCode`              |
| `datadogTags.cast_key`            | Required    | Primary correlation tag across APM, monitors, and synthetics   |
| `datadogTags.planview_internal_id`| Required    | Stable fallback join tag when `CASTKey` is absent              |
| `datadogTags.planview_product_code` | Recommended | Audit and reconciliation tag                                  |
| `lastSyncedAt`                    | Recommended | Auditability and stale-data detection                          |

## Datadog Data Needed Per Application

### Minimum required payload

| Data item                                              | Priority | Why the dashboard needs it                                         |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------ |
| `cast_key`, `planview_internal_id`, or `planview_product_code` tags on every Datadog asset | Required | Join Datadog telemetry to the PlanView EA application record without relying on application-name matches |
| Current monitor state by application                   | Required | Drive GREEN / AMBER / RED status                                   |
| `statusEvaluatedAt`                                    | Required | Show last refresh and detect stale telemetry                       |
| Failing monitors list                                  | Required | Explain why an application is AMBER or RED                         |
| Uptime percentages for `24h`, `7d`, `30d`, `90d`       | Required | Feed uptime widgets and summary rollups                            |
| Downtime minutes for the same windows                  | Required | Support SLA and error-budget calculations                          |
| Health status change events                            | Required | Populate status history and health-event timeline                  |
| Endpoint or synthetic check results                    | Required | Validate application availability from a user-facing perspective   |
| Response latency metrics such as `p50`, `p95`, `p99`   | Required | Support performance-in-SLA evaluation and detail trends            |
| Error-rate metrics                                     | Required | Detect degraded state and explain AMBER conditions                 |
| Open alert count by severity                           | Required | Show operational pressure and likely impact                        |
| Health-check detail records                            | Required | Populate the application detail panel with named checks and values |

### Recommended telemetry

| Data item                                              | Priority    | Why it is useful                                                   |
| ------------------------------------------------------ | ----------- | ------------------------------------------------------------------ |
| Request volume or throughput                           | Recommended | Adds context to latency and error-rate spikes                      |
| Availability by region or location                     | Recommended | Helps identify partial outages                                     |
| Dependency health signals                              | Recommended | Distinguishes application failure from downstream failure          |
| Queue depth or other custom business-health metrics    | Recommended | Matches the architecture's example health checks                   |
| Memory, CPU, disk, and container saturation signals    | Recommended | Explains degraded performance before full outage                   |
| TLS or certificate check state                         | Recommended | Supports preventive health warnings                                |
| Alert title, severity, `startedAt`, and latest message | Recommended | Improves event timeline and operator triage                        |
| Raw uptime-check records or time buckets               | Recommended | Lets us recalculate uptime if fixed-window metrics are unavailable |

### Optional if Datadog RUM is available

| Data item                                      | Priority | Why it is useful                                       |
| ---------------------------------------------- | -------- | ------------------------------------------------------ |
| Current active user count                      | Optional | Feeds the summary bar and application card user counts |
| User-count history for `24h` and `7d`          | Optional | Supports trend arrows and user history charts          |
| User-impact indicators by geography or browser | Optional | Helps explain partial degradation                      |

### Health checks we should expect to model from Datadog

The architecture and prototype imply that the detail view should be able to show named health checks
such as:

- HTTPS endpoint availability
- database connectivity
- API response time threshold
- queue depth threshold
- memory saturation threshold
- disk-space threshold
- TLS certificate validity

If Datadog cannot return a normalized health-check list, the adapter should transform monitors and
SLOs into this shape.

### Datadog-derived fields the dashboard can calculate

These do not have to come from Datadog as first-class fields if the raw data is available.

- current dashboard status: `GREEN`, `AMBER`, `RED`
- breach reason text shown in the UI
- SLA attainment by tier
- remaining error budget
- status trend over the selected time window

## PlanView EA Data Needed for Portfolio, Applications, TPMs, and Business Units

### Application master data

| Data item                                 | Priority    | Why the dashboard needs it                                   |
| ----------------------------------------- | ----------- | ------------------------------------------------------------ |
| `InternalID`                              | Required    | Canonical dashboard `applicationId`                          |
| `ProductCode`                             | Required    | Immutable PlanView source key                                |
| `CASTKey`                                 | Required for production scope | Dashboard `shortCode` and primary Datadog correlation tag    |
| `ProductName`                             | Required    | Display name in grid and detail view                         |
| `LongDescription`                         | Recommended | Detail-page business context                                 |
| `BusinessDeliveryPortfolioName`           | Required    | First-pass portfolio and business-unit grouping label        |
| `DrTier`                                  | Required    | Needed for filtering and SLA target selection                |
| `Status`                                  | Required    | Filter live scope to `In Production`; retain lifecycle metadata |
| `InternalUserCount`                       | Recommended | Registered internal-user baseline for impact estimation      |
| `ExternalUserCount`                       | Recommended | Registered external-user baseline for impact estimation      |
| `PortfolioOwnerName` and `PortfolioOwnerEmail` | Recommended | Portfolio ownership display and escalation context       |
| `BusinessOwner`                           | Recommended | Business-facing owner context                                |
| `ItOwner` and `ItOwnerEmail`              | Recommended | Operational owner context                                    |
| `Hosting`                                 | Optional    | Deployment context in detail view                            |
| `DataClassification`                      | Recommended | Security and data-handling context                           |
| `OwningOrganization`                      | Recommended | Team and organization context                                |
| `CA_Application_UUID`                     | Fallback only | Secondary join hint; not complete or unique                 |
| `ServiceNowKey` and `SN_Sys_Id`           | Fallback only | ITSM correlation only, not primary telemetry join          |

### TPM ownership data

| Data item                         | Priority    | Why the dashboard needs it                        |
| --------------------------------- | ----------- | ------------------------------------------------- |
| `tpmId`                           | Required    | Stable owner key                                  |
| `tpmName`                         | Required    | Display owner name in portfolio and detail views  |
| `tpmEmail`                        | Required    | Contact and escalation workflows                  |
| `tpmEmployeeId`                   | Recommended | Matching to enterprise directory systems          |
| `tpmRole`                         | Required    | The UI explicitly shows owner role, including TPM |
| `businessUnitIds`                 | Required    | Relate TPMs to business units                     |
| `applicationIds`                  | Required    | Relate TPMs to owned applications                 |
| `managerName` or escalation owner | Recommended | Helpful for contact hierarchy and escalations     |
| `activeFlag`                      | Recommended | Exclude stale ownership assignments               |

### Business unit and portfolio hierarchy data

| Data item             | Priority    | Why the dashboard needs it                      |
| --------------------- | ----------- | ----------------------------------------------- |
| `businessUnitId`      | Required    | Stable grouping key                             |
| `businessUnitName`    | Required    | Displayed in cards, filters, and detail page    |
| `parentPortfolioId`   | Required    | Build the hierarchy tree                        |
| `parentPortfolioName` | Required    | Build labeled hierarchy paths                   |
| `portfolioLevel`      | Recommended | Distinguish BU, sub-portfolio, or domain levels |
| `executiveOwnerName`  | Recommended | Useful for leadership rollups                   |
| `deliveryLeadName`    | Recommended | Supports the portfolio tree ownership display   |
| `activeFlag`          | Recommended | Remove inactive business units from live views  |
| `displayOrder`        | Optional    | Stable ordering in the portfolio tree           |

## Recommended Output Shape by System

### Datadog should answer

- Is the application currently healthy, degraded, or down?
- Which checks or monitors are failing right now?
- What is the uptime for the last 24h, 7d, 30d, and 90d?
- Are latency and error rate within acceptable thresholds?
- When did the status last change, and why?

### PlanView EA should answer

- Which applications belong to which portfolio and business unit?
- Who is the TPM for each application?
- What tier and classification does each application have?
- Which applications are active and should appear in the live dashboard?

## Open Questions Before Integration Design

- Should `BusinessDeliveryPortfolioName` remain the first-pass grouping label, or will a separate business-unit hierarchy feed be supplied?
- Can one application map to more than one `CASTKey` or Datadog service, and if so, which one is primary?
- Will Datadog provide current active-user counts through RUM, or do we need a separate source for
  user metrics?
- Is `Status = In Production` enough to define the monitored production scope, or do we need an explicit environment field later?
- Are `PortfolioOwner` and `ItOwner` sufficient for MVP operational contacts, or do we need a directory/on-call source immediately?

## Recommendation

For the first integration pass, request only the fields needed to support the existing architecture:

- PlanView EA: `InternalID`, `ProductCode`, `CASTKey`, `ProductName`, `LongDescription`, `BusinessDeliveryPortfolioName`, `DrTier`, `Status`, ownership fields, and registered user counts
- Datadog: current health state inputs, uptime windows, failing checks, latency, error rate, and
  recent health events

That keeps ownership metadata and technical telemetry cleanly separated while still supporting the
dashboard grid, detail view, and summary rollups already described in the architecture. The join should be implemented with Datadog tags, led by `CASTKey`, rather than by application-name matching.
