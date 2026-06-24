import { Injectable } from '@nestjs/common';

import { DatadogClient } from './datadog-client';
import InMemoryDatadogSnapshot from './datadog-snapshot';
import {
    DatadogMonitor,
    DatadogMonitorState,
    DatadogSloSummary,
    DatadogSnapshot,
    DatadogSyntheticCheck,
} from './datadog.types';
import SEED_APPLICATIONS from '../applications/seed/applications.seed';

/** Tag key this mock org carries the CAST key / shortCode on (mirrors the real org). */
const APP_SHORT_KEY = 'app_short_key';

/** Worst monitor state by deterministic bucket: 0 OK, 1 Warn, 2 Alert, 3 No Data. */
const WORST_STATE_BY_BUCKET: DatadogMonitorState[] = ['OK', 'Warn', 'Alert', 'No Data'];

/**
 * Deterministic, offline stand-in for Datadog, used when no DATADOG_API_KEY is set.
 * Lets the whole pipeline (sync -> rollup -> persist -> read) run end-to-end with
 * varied, realistic data and zero Datadog access. Switch to RealDatadogClient by
 * setting the key — no other code changes (see DatadogModule).
 *
 * Bulk-fetch parity: loadSnapshot() pre-builds monitors + an SLO for EVERY seeded
 * application's shortCode, tagged `app_short_key:<shortCode>`, using the same
 * deterministic hash the old per-app mock used. So resolving an app via
 * snapshot.monitorsForTag('app_short_key', app.shortCode) yields exactly the monitors
 * (and SLO) the previous getMonitorsByServiceTag/getSloSummaryByServiceTag returned.
 */
@Injectable()
export default class MockDatadogClient implements DatadogClient {
    private cachedSnapshot: DatadogSnapshot | null = null;

    /**
     * Builds the offline snapshot from canned seed data. For each distinct seeded
     * identifier (shortCode, plus any explicit datadogServiceId override) it emits a
     * monitor set and — for ~4 in 5 — an SLO, all tagged `app_short_key:<key>`.
     * @returns {Promise<DatadogSnapshot>} the canned snapshot
     */
    async loadSnapshot(): Promise<DatadogSnapshot> {
        if (!this.cachedSnapshot) {
            this.cachedSnapshot = MockDatadogClient.buildSnapshot();
        }
        return this.cachedSnapshot;
    }

    /**
     *
     */
    private static buildSnapshot(): DatadogSnapshot {
        const keys = MockDatadogClient.seededKeys();

        const monitors: DatadogMonitor[] = [];
        const sloByTag = new Map<string, DatadogSloSummary>();
        const syntheticsByTag = new Map<string, DatadogSyntheticCheck[]>();

        keys.forEach((key) => {
            monitors.push(...MockDatadogClient.monitorsFor(key));
            const slo = MockDatadogClient.sloFor(key);
            if (slo) {
                sloByTag.set(`${APP_SHORT_KEY}:${key}`.toLowerCase(), slo);
            }
            const synthetics = MockDatadogClient.syntheticsFor(key);
            if (synthetics.length) {
                syntheticsByTag.set(`${APP_SHORT_KEY}:${key}`.toLowerCase(), synthetics);
            }
        });

        return new InMemoryDatadogSnapshot(
            InMemoryDatadogSnapshot.indexMonitors(monitors),
            sloByTag,
            syntheticsByTag
        );
    }

    /**
     * The distinct app_short_key values to populate: every seed shortCode plus any
     * explicit datadogServiceId override (deduped, blanks dropped). This is the mock's
     * canned data source.
     * @returns {string[]} distinct seeded identifiers
     */
    private static seededKeys(): string[] {
        const keys = new Set<string>();
        SEED_APPLICATIONS.forEach((app) => {
            if (app.datadogServiceId) keys.add(app.datadogServiceId);
            if (app.shortCode) keys.add(app.shortCode);
        });
        return [...keys];
    }

    /**
     * Deterministic 2-4 monitors for a key, first monitor driving the worst-state
     * rollup, each tagged both `app_short_key:<key>` (so the resolver finds them) and
     * the legacy `service:<key>` tag. Identical state/count to the old mock.
     * @param {string} key - the app_short_key value
     * @returns {DatadogMonitor[]} the canned monitors
     */
    private static monitorsFor(key: string): DatadogMonitor[] {
        const seed = MockDatadogClient.hash(key);
        const bucket = seed % 4; // 0 OK, 1 Warn, 2 Alert, 3 No Data
        const worst: DatadogMonitorState = WORST_STATE_BY_BUCKET[bucket] ?? 'OK';
        const count = 2 + (seed % 3); // 2-4 monitors
        // Deterministic last-change timestamp (no wall clock) so the breakdown is stable.
        const modified = new Date((1_700_000_000 + seed) * 1000).toISOString();
        return Array.from({ length: count }, (_, i) => {
            const state: DatadogMonitorState = i === 0 ? worst : 'OK';
            return {
                id: seed * 10 + i,
                name: `${key} monitor ${i + 1}`,
                overall_state: state, // first monitor drives the worst-state rollup
                tags: [`${APP_SHORT_KEY}:${key}`, `service:${key}`],
                message:
                    state === 'OK'
                        ? `${key} monitor ${i + 1} is healthy.`
                        : `${key} monitor ${i + 1} is in ${state}. {{#is_alert}}Investigate {{host.name}}.{{/is_alert}}`,
                overall_state_modified: modified,
            };
        });
    }

    /**
     * Deterministic SLO summary (or null) for a key. ~1 in 5 keys has no SLO (error
     * budget "not available"). Identical numbers to the old getSloSummaryByServiceTag.
     * @param {string} key - the app_short_key value
     * @returns {DatadogSloSummary | null} the canned SLO, or null
     */
    private static sloFor(key: string): DatadogSloSummary | null {
        const seed = MockDatadogClient.hash(key);
        if (seed % 5 === 0) return null; // ~1 in 5 apps has no SLO
        const target = 99.5;
        const uptime30d = Number((99 + (seed % 100) / 100).toFixed(2)); // 99.00 - 99.99
        return {
            sloId: `mock-slo-${seed}`,
            target,
            errorBudgetRemainingPct: Number(
                Math.max(0, Math.min(100, ((uptime30d - target) / (100 - target)) * 100)).toFixed(1)
            ),
            uptime24h: Math.min(100, Number((uptime30d + 0.3).toFixed(2))),
            uptime7d: Math.min(100, Number((uptime30d + 0.1).toFixed(2))),
            uptime30d,
        };
    }

    /**
     * Deterministic 0-2 Synthetic checks for a key, tagged `app_short_key:<key>` so the
     * resolver finds them. ~1 in 3 keys has none (no synthetic coverage), mirroring that
     * not every app has synthetic tests.
     * @param {string} key - the app_short_key value
     * @returns {DatadogSyntheticCheck[]} the canned synthetic checks (possibly empty)
     */
    private static syntheticsFor(key: string): DatadogSyntheticCheck[] {
        const seed = MockDatadogClient.hash(key);
        const count = seed % 3; // 0-2 synthetic checks
        const paused = seed % 4 === 0;
        return Array.from({ length: count }, (_, i) => ({
            publicId: `mock-syn-${seed}-${i}`,
            name: `${key} synthetic ${i + 1}`,
            type: i % 2 === 0 ? 'browser' : 'api',
            status: paused ? 'paused' : 'live',
            // Paused tests have no window data -> null, never a misleading 0% (two-state model).
            uptime: paused ? null : Number((99 + (seed % 100) / 100).toFixed(2)),
        }));
    }

    /**
     * Stable string hash (same algorithm the per-app mock used) so canned data is
     * deterministic and unchanged across the bulk-fetch refactor.
     * @param {string} value - input string
     * @returns {number} a stable hash in [0, 100000)
     */
    private static hash(value: string): number {
        let h = 0;
        for (let i = 0; i < value.length; i += 1) {
            h = (h * 31 + value.charCodeAt(i)) % 100000;
        }
        return h;
    }
}
