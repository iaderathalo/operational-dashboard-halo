import { ApplicationMonitor } from '@operational-dashboard/shared-api-model/model/dashboard';

import { PortfolioApp } from './models/portfolio.model';

/** Per-state monitor counts for the estate-wide rollup tile (US-1.4). */
export interface MonitorStateCounts {
    ok: number;
    warn: number;
    alert: number;
    noData: number;
}

/** The 4 buckets a monitor can classify into — shared by the rollup tile and the firing list. */
export type MonitorFiringState = 'ok' | 'warn' | 'alert' | 'noData';

/**
 * Classifies one monitor into its rollup bucket (US-2.4 extraction from
 * `countMonitorsByState`'s inline switch, so the tile's counts and the firing-monitors
 * list can never disagree on a single monitor's bucket).
 *
 * When a monitor carries `datadogState` it is bucketed directly (OK, Warn, Alert,
 * No Data). The legacy fallback — for persisted monitors that predate US-1.4 and
 * therefore lack `datadogState` — maps the collapsed status:
 * GREEN → ok, RED → alert, AMBER → noData.
 * AMBER deliberately maps to noData rather than warn so the No-Data signal is
 * never hidden (plan PRD FR-2: "No Data often means a silently-broken monitor").
 * @param {ApplicationMonitor} monitor - the monitor to classify
 * @returns {MonitorFiringState} the monitor's rollup bucket
 */
export function classifyMonitorState(monitor: ApplicationMonitor): MonitorFiringState {
    if (monitor.datadogState !== undefined) {
        switch (monitor.datadogState) {
            case 'OK':
                return 'ok';
            case 'Warn':
                return 'warn';
            case 'Alert':
                return 'alert';
            case 'No Data':
            default:
                return 'noData';
        }
    }

    // Legacy fallback: datadogState absent; bucket by collapsed status.
    // AMBER → noData so the No-Data signal is never hidden.
    switch (monitor.status) {
        case 'GREEN':
            return 'ok';
        case 'RED':
            return 'alert';
        default:
            // AMBER and any unknown collapsed status → noData.
            return 'noData';
    }
}

/**
 * Aggregates monitor state counts across a list of portfolio apps. Thin reduce over
 * {@link classifyMonitorState} so the bucketing logic lives in exactly one place.
 * @param apps - portfolio apps to aggregate
 * @returns estate-wide monitor state counts
 */
export function countMonitorsByState(apps: PortfolioApp[]): MonitorStateCounts {
    return apps
        .flatMap((app) => app.monitors ?? [])
        .reduce<MonitorStateCounts>(
            (counts, monitor) => {
                const state = classifyMonitorState(monitor);
                return { ...counts, [state]: counts[state] + 1 };
            },
            { ok: 0, warn: 0, alert: 0, noData: 0 }
        );
}

/**
 * One row of the US-2.4 firing-monitors list — a client-side view-model layered on
 * top of the API-sourced `ApplicationMonitor[]`, the same pattern already used for
 * `AppMaturity` / `AppBurnRate` in `portfolio.model.ts`.
 */
export interface FiringMonitorRow {
    monitorId: number;
    name: string;
    state: 'warn' | 'alert';
    /** Extracted `service:` tag, or the owning app's name when untagged — never blank. */
    service: string;
    appId: string;
    appName: string;
    lastTriggeredAt: string | null;
    /** Deep link to Datadog, or null when unavailable (pre-backfill or missing id). */
    monitorUrl: string | null;
}

/**
 * Flattens every Warn/Alert monitor across the given apps into firing-monitor rows
 * (US-2.4). Reuses {@link classifyMonitorState} so a legacy AMBER-without-`datadogState`
 * monitor is excluded here exactly as it is excluded from the tile's warn/alert counts
 * (it buckets to `noData`, never `warn`).
 * @param {PortfolioApp[]} apps - portfolio apps in the scope to drill into
 * @returns {FiringMonitorRow[]} one row per Warn/Alert monitor, unsorted
 */
export function collectFiringMonitors(apps: PortfolioApp[]): FiringMonitorRow[] {
    return apps.flatMap((app) =>
        (app.monitors ?? [])
            .map((monitor) => ({ monitor, state: classifyMonitorState(monitor) }))
            .filter(
                (entry): entry is { monitor: ApplicationMonitor; state: 'warn' | 'alert' } =>
                    entry.state === 'warn' || entry.state === 'alert'
            )
            .map(
                ({ monitor, state }): FiringMonitorRow => ({
                    monitorId: monitor.id,
                    name: monitor.name,
                    state,
                    service: monitor.service ?? app.name,
                    appId: app.id,
                    appName: app.name,
                    lastTriggeredAt: monitor.lastTriggeredAt,
                    monitorUrl: monitor.monitorUrl ?? null,
                })
            )
    );
}
