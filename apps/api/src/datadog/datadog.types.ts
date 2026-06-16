export type DatadogMonitorState = 'OK' | 'Warn' | 'Alert' | 'No Data';

export interface DatadogMonitor {
    id: number;
    name: string;
    overall_state: DatadogMonitorState;
    tags: string[];
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
}
