# Dashboard vs Datadog Analysis

## Purpose

This note summarizes:

- what the operational dashboard requires
- which of those needs can be met by Datadog
- where Datadog uptime scripts and telemetry are especially useful
- the concrete data elements we should extract from Datadog for the first integration pass

This analysis is based on the current dashboard requirements, UI surfaces, and architecture decisions already documented in this repository.

## Executive Summary

Datadog is a strong source for technical application health, synthetic uptime, availability trends, response latency, error rate, and health-event history.

Datadog is not the system of record for portfolio hierarchy, TPM ownership, business-unit metadata, contact directories, or formal incident workflow. Those belong in PlanView EA, directory/on-call systems, and incident-management tooling.

A practical first-pass Datadog integration should focus on:

- current health status inputs
- uptime windows for 24h, 7d, 30d, and 90d
- failing monitors and synthetic checks
- latency and error-rate trends
- recent health events and status history
- uptime-script results and raw synthetic run history

The dashboard can then derive GREEN / AMBER / RED status, summary rollups, SLA posture, and operator-facing reason text.

## Dashboard Requirement Areas

From the current dashboard requirements and UI, the main data needs are:

1. Portfolio-level health rollups.
2. Application-level health status.
3. Uptime for 24h, 7d, 30d, and 90d.
4. Application detail health checks.
5. Recent health events and status history.
6. Latency and error-rate trends.
7. Total active users and per-app user counts.
8. Incident counts and latest incident details.
9. Perception or end-user experience signals.
10. Ownership, tier, business unit, and team metadata.

Of these, Datadog is the best fit for items 2 through 6, and may partially support items 7 and 9 if RUM is available.

## What Datadog Can Realistically Provide

### Strong fit

Datadog can reliably provide or support:

- current monitor state by application
- synthetic uptime script results
- uptime history and availability windows
- downtime duration
- alert and monitor context
- latency percentiles such as p50, p95, and p99
- error-rate trends
- service throughput or request volume
- recent health changes and alert history
- regional or location-specific synthetic results
- deployment markers or tagged health context where available

### Possible fit depending on Datadog setup

Datadog may also provide:

- active-user counts if Datadog RUM is implemented
- user-impact slices by browser, geography, or device
- dependency health context
- certificate or TLS expiry checks
- infrastructure saturation context such as CPU, memory, or disk

### Weak fit or not the right source

Datadog should not be treated as the source of truth for:

- application catalog master records
- business unit hierarchy
- portfolio hierarchy
- TPM ownership
- support contacts
- formal incident record lifecycle
- manually curated override audit data

## Role of Existing Datadog Uptime Scripts

Because Datadog already has uptime scripts for the applications, those scripts are likely the fastest path to high-value dashboard integration.

The uptime scripts can directly support:

- application availability status
- recent failures by application
- downtime minute calculations
- 24h, 7d, 30d, and 90d uptime windows
- endpoint-level failure reasons
- user-facing validation of whether the primary application path is actually reachable
- geographic or location-specific outage detection when scripts run from multiple locations

If the scripts are implemented as Datadog Synthetic API or browser tests, we should extract both summary results and raw run records where possible. Raw run records give us a fallback when fixed-window uptime percentages are not directly available.

## Source Split: Dashboard Need vs System of Record

| Dashboard need | Recommended source |
| --- | --- |
| Application catalog | PlanView EA |
| Business unit and portfolio hierarchy | PlanView EA |
| TPM ownership | PlanView EA |
| Team/contact mapping | Directory or on-call tooling |
| Current technical health | Datadog |
| Synthetic uptime | Datadog |
| Latency and error rate | Datadog |
| Health events and monitor failures | Datadog |
| Active users | Datadog RUM if available, otherwise separate source |
| User perception | Separate perception source, optionally RUM-backed |
| Incident lifecycle | Local incident service or ServiceNow |

## Datadog Data Elements To Extract

## 1. Cross-System Mapping Fields

These fields are required so the dashboard can join Datadog telemetry to applications defined elsewhere.

| Data element | Priority | Why it matters |
| --- | --- | --- |
| `applicationId` or mapped internal application key | Required | Stable join to the dashboard application record |
| `applicationName` | Required | Display verification and reconciliation |
| `shortCode` if available through tags | Recommended | Human-friendly reconciliation |
| `environment` | Required | Separate production from lower environments |
| `datadogService` | Required | Primary link to APM service telemetry |
| `datadogTags` | Required | Join monitors, synthetics, and service telemetry |
| `monitorIds` | Required | Resolve current monitor state and failures |
| `syntheticTestIds` | Required | Resolve uptime-script results |
| `sloIds` | Recommended | Tie uptime and error-budget calculations to SLOs |
| `statusEvaluatedAt` | Required | Show freshness and detect stale status |
| `lastSyncedAt` | Recommended | Auditability |

## 2. Current Health Status Inputs

These are the minimum current-state signals needed to derive dashboard status.

| Data element | Priority | Why it matters |
| --- | --- | --- |
| Current monitor status | Required | Base input for GREEN / AMBER / RED |
| Current synthetic test status | Required | User-facing availability signal |
| Failing monitor list | Required | Explain degraded or down state |
| Failing synthetic list | Required | Show which uptime scripts failed |
| Alert severity | Required | Distinguish major outage from degradation |
| Critical-check indicator | Required | Needed for AMBER to RED logic |
| Open alert count by severity | Required | Dashboard summary and triage context |
| No-data or muted state | Recommended | Avoid false healthy status |
| State reason or latest monitor message | Required | Human-readable reason text |

## 3. Uptime and Availability Fields

These power the uptime widgets and summary bar.

| Data element | Priority | Why it matters |
| --- | --- | --- |
| `uptime24h` | Required | Dashboard and detail view |
| `uptime7d` | Required | Dashboard and detail view |
| `uptime30d` | Required | Summary rollup and SLA view |
| `uptime90d` | Required | Longer-term detail view |
| `downtimeMinutes24h` | Required | SLA and error-budget support |
| `downtimeMinutes7d` | Required | SLA and error-budget support |
| `downtimeMinutes30d` | Required | SLA and error-budget support |
| `downtimeMinutes90d` | Required | SLA and error-budget support |
| SLO target | Recommended | Better alignment with SLA policy |
| SLO attainment | Recommended | Faster rollups and reporting |
| Raw uptime buckets or raw run history | Recommended | Lets us recalculate uptime if needed |

## 4. Uptime Script and Synthetic Check Fields

These should be extracted specifically because Datadog uptime scripts already exist.

| Data element | Priority | Why it matters |
| --- | --- | --- |
| Synthetic test id | Required | Traceability |
| Synthetic test name | Required | Operator-readable health check |
| Test type such as API or browser | Required | Helps explain check intent |
| Target URL or endpoint | Recommended | Debugging and operator context |
| Location or region | Recommended | Detect partial outages |
| Execution timestamp | Required | Timeline and freshness |
| Pass or fail result | Required | Current availability signal |
| Response time per run | Required | Performance and degradation context |
| Failed step name | Recommended | Better triage for browser flows |
| Failure reason | Required | Explain why a script failed |
| HTTP status code | Recommended | Distinguish outage from application errors |
| TLS or certificate validation result | Optional | Early-warning availability risk |

## 5. Performance and Reliability Fields

These support the health detail page and degrade-state logic.

| Data element | Priority | Why it matters |
| --- | --- | --- |
| `latencyP50` | Required | Baseline performance trend |
| `latencyP95` or `latencyP90` | Required | Degraded user experience signal |
| `latencyP99` | Required | Tail latency and critical slowdown |
| Error rate | Required | AMBER-condition input |
| Request volume or throughput | Recommended | Context for spikes and burn rate |
| Timeout rate | Recommended | Useful for partial outage diagnosis |
| Availability by region | Recommended | Partial outage identification |
| Dependency failure indicators | Recommended | Separate app failure from downstream failure |

## 6. Health Check Breakdown Fields

The detail panel expects a named list of health checks with pass/fail state.

| Data element | Priority | Why it matters |
| --- | --- | --- |
| Check name | Required | Display in health breakdown |
| Check status | Required | Pass/fail visualization |
| Last evaluated time | Required | Freshness in the UI |
| Check source such as monitor or synthetic | Required | Operator context |
| Threshold or comparator | Recommended | Understand why it failed |
| Observed value | Recommended | Explain breach severity |
| Severity | Recommended | Prioritize response |
| Critical flag | Required | Drives transition rules |

Likely health checks modeled from Datadog include:

- HTTPS endpoint availability
- API response-time threshold
- database connectivity check if surfaced through monitor design
- queue depth threshold
- memory saturation threshold
- disk saturation threshold
- TLS certificate validity

## 7. Health Event and Status History Fields

These support the recent-events table and status timeline.

| Data element | Priority | Why it matters |
| --- | --- | --- |
| Event timestamp | Required | Timeline display |
| Event type | Required | Status change, monitor alert, recovery, mute, and similar |
| Previous status | Required | Transition history |
| New status | Required | Transition history |
| Event source | Required | Synthetic, monitor, SLO, manual override, and similar |
| Duration | Recommended | How long the degraded state lasted |
| Event message | Required | Operator-readable reason |
| Resolved timestamp | Recommended | Complete outage duration |

## 8. Alert and Incident-Adjacent Fields

These are useful even if formal incidents live outside Datadog.

| Data element | Priority | Why it matters |
| --- | --- | --- |
| Open alert count | Required | Current operational pressure |
| Alert title | Recommended | Better explanation in UI |
| Alert severity | Required | Sort and escalate appropriately |
| Alert started at | Recommended | Elapsed impact duration |
| Alert last updated at | Recommended | Freshness |
| Alert latest message | Recommended | Triage context |

These fields are helpful for context, but they do not replace a proper incident-management record.

## 9. Optional RUM and User-Impact Fields

Only extract these from Datadog if RUM is already in place and data quality is acceptable.

| Data element | Priority | Why it matters |
| --- | --- | --- |
| Current active user count | Optional | Summary bar and app card counts |
| Active-user time series | Optional | Trend charts |
| Session count | Optional | User-impact context |
| Geography split | Optional | Partial outage analysis |
| Browser or device split | Optional | Client-impact analysis |
| User-facing performance indicators | Optional | Helps support perception views |

## What the Dashboard Can Derive from Raw Datadog Data

These fields do not need to be provided by Datadog as first-class outputs if raw telemetry is available:

- final dashboard status of GREEN, AMBER, or RED
- breach reason text
- worst-current status across all active checks
- summary counts by status
- overall 30-day uptime rollup
- tier-specific SLA color result once tier comes from PlanView EA
- remaining error budget if uptime windows and SLO target are available

## Likely Gaps After Datadog Integration

Even with strong Datadog coverage, the following gaps will remain unless separate integrations are added:

- portfolio and business-unit hierarchy
- TPM and owner metadata
- support contacts and on-call rotations
- formal incident lifecycle and incident timelines
- user perception as a separate status dimension if not modeled through RUM
- manual override audit trail

## Recommended First-Pass Extraction Contract

For the first Datadog integration pass, request only the fields needed to support the dashboard already designed in this repository.

### Required first-pass payload per application

- stable application mapping key
- environment
- current monitor state
- current synthetic uptime-script state
- failing checks list
- `uptime24h`
- `uptime7d`
- `uptime30d`
- `uptime90d`
- downtime minutes for the same windows
- recent health events
- response-time percentile series
- error-rate series
- alert severity and open-alert count
- named health-check breakdown entries
- freshness timestamp

### Recommended first-pass enrichments

- raw synthetic run history
- availability by region or location
- request volume
- dependency health tags
- SLO target and error-budget fields

## Open Questions

These should be resolved before integration design is finalized:

1. What stable join key exists between the dashboard application catalog and Datadog assets?
2. Are the uptime scripts Datadog Synthetic API tests, browser tests, monitors, or a mix?
3. Can uptime percentages be queried directly, or do we need to compute them from raw runs and downtimes?
4. Is Datadog RUM implemented for any applications, and is it trustworthy enough for active-user metrics?
5. Do we need only production telemetry in phase one, or multi-environment support?
6. Are alert severities and monitor taxonomies consistent enough across applications to drive dashboard rules centrally?

## Recommendation

Start with Datadog as the source for technical health only.

Use the existing uptime scripts plus monitor and APM data to populate:

- current application health
- uptime windows
- health checks
- recent health events
- latency trends
- error-rate trends

Keep ownership, portfolio structure, contacts, and formal incident records outside the Datadog integration boundary.

That gives the dashboard a reliable technical health layer without overloading Datadog with metadata it should not own.
