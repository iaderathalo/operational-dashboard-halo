import {
    DatadogMonitor,
    DatadogSloSummary,
    DatadogSnapshot,
    snapshotTagKey,
} from './datadog.types';

/**
 * Concrete, immutable {@link DatadogSnapshot} backed by two pre-built indexes.
 * Both RealDatadogClient and MockDatadogClient construct one of these from their
 * own bulk data, so the LOCAL lookup semantics (case-insensitive `${tagKey}:${tagValue}`
 * matching) are identical on the live and offline paths — mock parity by construction.
 *
 * Lookups are pure Map reads: no HTTP, no allocation beyond the returned slice copy.
 */
export default class InMemoryDatadogSnapshot implements DatadogSnapshot {
    /**
     * @param {Map<string, DatadogMonitor[]>} monitorsByTag - lowercased `${tagKey}:${tagValue}` -> monitors carrying that tag
     * @param {Map<string, DatadogSloSummary>} sloByTag - lowercased `${tagKey}:${tagValue}` -> the SLO summary tagged with it
     */
    constructor(
        private readonly monitorsByTag: Map<string, DatadogMonitor[]>,
        private readonly sloByTag: Map<string, DatadogSloSummary>
    ) {}

    monitorsForTag(tagKey: string, tagValue: string): DatadogMonitor[] {
        // Return a defensive copy so a caller cannot mutate the shared index bucket.
        const hit = this.monitorsByTag.get(snapshotTagKey(tagKey, tagValue));
        return hit ? [...hit] : [];
    }

    sloSummaryForTag(tagKey: string, tagValue: string): DatadogSloSummary | null {
        return this.sloByTag.get(snapshotTagKey(tagKey, tagValue)) ?? null;
    }

    /**
     * Builds the monitor index from a flat list of monitors. A monitor is indexed
     * under EACH of its tags (a monitor with N tags appears in N buckets), so a
     * lookup by any one of its tags finds it. Tag strings without a value
     * (`foo` with no colon, or a trailing-colon `foo:`) are indexed under the whole
     * lowercased string as-is, matching how a resolver would look them up.
     * @param {DatadogMonitor[]} monitors - every monitor from the bulk fetch
     * @returns {Map<string, DatadogMonitor[]>} the `${tagKey}:${tagValue}` -> monitors index
     */
    static indexMonitors(monitors: DatadogMonitor[]): Map<string, DatadogMonitor[]> {
        const index = new Map<string, DatadogMonitor[]>();
        for (const monitor of monitors) {
            const tags = Array.isArray(monitor.tags) ? monitor.tags : [];
            // De-duplicate within a single monitor so a monitor tagged twice with the
            // same tag is not listed twice under that bucket.
            const seen = new Set<string>();
            for (const tag of tags) {
                const key = tag.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                const bucket = index.get(key);
                if (bucket) bucket.push(monitor);
                else index.set(key, [monitor]);
            }
        }
        return index;
    }
}
