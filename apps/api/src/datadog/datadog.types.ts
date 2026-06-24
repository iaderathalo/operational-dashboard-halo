export type DatadogMonitorState = 'OK' | 'Warn' | 'Alert' | 'No Data';

/**
 * A currently-active downtime matching a monitor (#3), surfaced by passing
 * `with_downtimes=true` to GET /api/v1/monitor. Non-empty => the monitor is under
 * maintenance now, so its Alert is suppressed rather than counted as a false RED.
 */
export interface DatadogDowntimeMatch {
    id?: number;
    scope?: string[];
    end?: number | null;
}

export interface DatadogMonitor {
    id: number;
    name: string;
    overall_state: DatadogMonitorState;
    tags: string[];
    // Drill-down fields (#2). Already present in the GET /api/v1/monitor response;
    // kept here so the snapshot retains them instead of trimming to overall_state.
    message?: string;
    overall_state_modified?: string;
    // Active maintenance windows (#3), present when fetched with_downtimes=true.
    matching_downtimes?: DatadogDowntimeMatch[];
}

/**
 * Aggregated SLO view for one Application — the client hides the per-window
 * history calls behind this so the sync logic stays simple. 90d is intentionally
 * absent (Datadog ~2-week retention; PRD Open Q9).
 */
export interface DatadogSloSummary {
    sloId: string;
    target: number | null;
    errorBudgetRemainingPct: number | null;
    uptime24h: number | null;
    uptime7d: number | null;
    uptime30d: number | null;
}

/**
 * One Datadog Synthetic test resolved for an Application (12-4 Health Check Breakdown).
 * Synthetic tests carry our `app_short_key:` / `app_service_id:` tags (~98.6% coverage,
 * unlike APM trace metrics), so they join exactly like monitors and SLOs. Carries the
 * test's identity, lifecycle status, and 30-day uptime.
 */
export interface DatadogSyntheticCheck {
    publicId: string;
    name: string;
    /** Test kind: `api` | `browser` | `mobile`. */
    type: string;
    /** Lifecycle: `live` | `paused`. */
    status: string;
    /** 30-day synthetic uptime %, or null when the window has no data (paused / errored). */
    uptime: number | null;
}

/**
 * Canonical, case-insensitive key for the snapshot tag index: `${tagKey}:${tagValue}`
 * lowercased. A Datadog tag string `app_short_key:IntelliFi` and a resolver lookup
 * for ('app_short_key', 'intellifi') must collapse to the same bucket, so both the
 * index build and the lookups MUST go through this helper.
 * @param {string} tagKey - the tag key (e.g. `app_short_key`)
 * @param {string} tagValue - the tag value (e.g. an app's CAST key)
 * @returns {string} the lowercased `${tagKey}:${tagValue}` index key
 */
export function snapshotTagKey(tagKey: string, tagValue: string): string {
    return `${tagKey}:${tagValue}`.toLowerCase();
}

/**
 * An immutable, in-memory result of ONE bulk Datadog fetch. The Crawler builds this
 * once per sync run (a handful of HTTP calls total) and then resolves every
 * Application against it with PURELY LOCAL lookups — no per-app HTTP. This is what
 * replaces the old one-request-per-app model that tripped Datadog 429s.
 */
export interface DatadogSnapshot {
    /**
     * Monitors carrying the given tag, matched case-insensitively on
     * `${tagKey}:${tagValue}`. A monitor with N tags is reachable under each of its
     * N tags. Returns [] when nothing matches (never throws).
     * @param {string} tagKey - tag key to match (e.g. `app_short_key`)
     * @param {string} tagValue - tag value to match (e.g. the app's CAST key)
     * @returns {DatadogMonitor[]} the matching monitors (possibly empty)
     */
    monitorsForTag(tagKey: string, tagValue: string): DatadogMonitor[];

    /**
     * The aggregated SLO summary for the SLO tagged with the given
     * `${tagKey}:${tagValue}` (case-insensitive), or null when no kept SLO carries
     * that tag. History windows were resolved during the bulk fetch.
     * @param {string} tagKey - tag key to match (e.g. `app_short_key`)
     * @param {string} tagValue - tag value to match (e.g. the app's CAST key)
     * @returns {DatadogSloSummary | null} the SLO summary, or null when unmatched
     */
    sloSummaryForTag(tagKey: string, tagValue: string): DatadogSloSummary | null;

    /**
     * The Synthetic tests carrying the given `${tagKey}:${tagValue}` (case-insensitive),
     * or [] when none. Kept tests were filtered to app_short_key/app_service_id and
     * indexed during the bulk fetch. Returns a copy; never throws.
     * @param {string} tagKey - tag key to match (e.g. `app_short_key`)
     * @param {string} tagValue - tag value to match (e.g. the app's CAST key)
     * @returns {DatadogSyntheticCheck[]} the matching synthetic checks (possibly empty)
     */
    syntheticsForTag(tagKey: string, tagValue: string): DatadogSyntheticCheck[];
}
