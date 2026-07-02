import { ApplicationSyntheticCheck, PortfolioApp } from './models/portfolio.model';

/**
 * Synthetic check state for the portfolio rollup tile (US-4.2).
 * Mirrors the tone logic from detail-page.data.ts#syntheticCheckTone so the tile,
 * drill-down and detail card always agree on classification.
 */
export type SyntheticState = 'passing' | 'degraded' | 'noData' | 'paused';

/** Uptime threshold (%) at or above which a live check is considered passing. */
export const SYNTHETIC_GOOD_THRESHOLD = 99;

/**
 * Classifies a single synthetic check into a state.
 *
 * - **paused**: status is 'paused'.
 * - **noData**: uptime is null (no data window).
 * - **degraded**: uptime < {@link SYNTHETIC_GOOD_THRESHOLD} (99%).
 * - **passing**: uptime >= 99%.
 *
 * Single source of truth — matches `syntheticCheckTone` in detail-page.data.ts.
 * @param {ApplicationSyntheticCheck} check - synthetic check to classify
 * @returns {SyntheticState} check state
 */
export function classifySyntheticState(check: ApplicationSyntheticCheck): SyntheticState {
    if (check.status === 'paused') return 'paused';
    if (check.uptime == null) return 'noData';
    return check.uptime >= SYNTHETIC_GOOD_THRESHOLD ? 'passing' : 'degraded';
}

/** Per-state synthetic counts for the estate-wide rollup tile (US-4.2). */
export interface SyntheticStateCounts {
    passing: number;
    degraded: number;
    noData: number;
    paused: number;
}

/**
 * Aggregates synthetic state counts across a list of portfolio apps.
 * @param {PortfolioApp[]} apps - portfolio apps to aggregate
 * @returns {SyntheticStateCounts} per-state counts
 */
export function countSyntheticsByState(apps: PortfolioApp[]): SyntheticStateCounts {
    const counts: SyntheticStateCounts = {
        passing: 0,
        degraded: 0,
        noData: 0,
        paused: 0,
    };
    apps.forEach((app) => {
        (app.syntheticChecks ?? []).forEach((check) => {
            counts[classifySyntheticState(check)] += 1;
        });
    });
    return counts;
}

/** A row in the synthetics drill-down table. */
export interface SyntheticRow {
    publicId: string;
    name: string;
    type: string;
    status: string;
    uptime: number | null;
    appId: string;
    appName: string;
    state: SyntheticState;
}

/**
 * Builds the synthetics drill-down row list sorted worst-first:
 * degraded (lowest uptime) → noData → paused → passing (highest uptime).
 * @param {PortfolioApp[]} apps - portfolio apps to collect
 * @returns {SyntheticRow[]} sorted drill-down rows
 */
export function collectSynthetics(apps: PortfolioApp[]): SyntheticRow[] {
    const rows: SyntheticRow[] = [];
    apps.forEach((app) => {
        (app.syntheticChecks ?? []).forEach((check) => {
            rows.push({
                publicId: check.publicId,
                name: check.name,
                type: check.type,
                status: check.status,
                uptime: check.uptime,
                appId: app.id,
                appName: app.name,
                state: classifySyntheticState(check),
            });
        });
    });

    const stateOrder: Record<SyntheticState, number> = {
        degraded: 0,
        noData: 1,
        paused: 2,
        passing: 3,
    };

    return rows.sort((a, b) => {
        const sa = stateOrder[a.state];
        const sb = stateOrder[b.state];
        if (sa !== sb) return sa - sb;
        // Within same state, lowest uptime first; nulls after numbers.
        const ua = a.uptime ?? Infinity;
        const ub = b.uptime ?? Infinity;
        return ua - ub;
    });
}
