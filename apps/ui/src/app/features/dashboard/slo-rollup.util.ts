import { PortfolioApp } from './models/portfolio.model';

/** Error-budget threshold (%) below which an app is considered at-risk. */
export const AT_RISK_BUDGET_THRESHOLD = 25;

/** SLO attainment state for a single app. */
export type SloState = 'healthy' | 'atRisk' | 'breaching' | 'noSlo';

/** Per-state SLO counts for the estate-wide rollup tile (US-1.1). */
export interface SloStateCounts {
    healthy: number;
    atRisk: number;
    breaching: number;
    noSlo: number;
}

/**
 * Classifies a single app into an SLO attainment state.
 *
 * - **noSlo**: no SLA target or no error-budget data joined.
 * - **breaching**: error budget <= 0%.
 * - **atRisk**: error budget > 0% but below {@link AT_RISK_BUDGET_THRESHOLD} (25%).
 * - **healthy**: error budget >= 25%.
 * @param {PortfolioApp} app - portfolio app to classify
 * @returns {SloState} SLO attainment state
 */
export function classifySloState(app: PortfolioApp): SloState {
    if (app.slaTarget == null || app.errorBudgetRemainingPct == null) {
        return 'noSlo';
    }
    if (app.errorBudgetRemainingPct <= 0) {
        return 'breaching';
    }
    if (app.errorBudgetRemainingPct < AT_RISK_BUDGET_THRESHOLD) {
        return 'atRisk';
    }
    return 'healthy';
}

/**
 * Aggregates SLO state counts across a list of portfolio apps.
 * @param {PortfolioApp[]} apps - portfolio apps to aggregate
 * @returns {SloStateCounts} per-state counts
 */
export function countSloByState(apps: PortfolioApp[]): SloStateCounts {
    const counts: SloStateCounts = { healthy: 0, atRisk: 0, breaching: 0, noSlo: 0 };
    apps.forEach((app) => {
        counts[classifySloState(app)] += 1;
    });
    return counts;
}

/** A row in the SLO drill-down table. */
export interface SloRow {
    appId: string;
    appName: string;
    slaTarget: number | null;
    uptime: number | null;
    errorBudgetRemainingPct: number | null;
    burnBand: string;
    state: SloState;
    businessUnit: string;
}

/**
 * Builds the SLO drill-down row list sorted worst-first:
 * breaching → lowest error budget → nulls (noSlo) last.
 * @param {PortfolioApp[]} apps - portfolio apps to collect
 * @param {Record<string, string>} buMap - map of appId → business-unit name
 * @returns {SloRow[]} sorted drill-down rows
 */
export function collectSloApps(apps: PortfolioApp[], buMap: Record<string, string> = {}): SloRow[] {
    return apps
        .map((app) => ({
            appId: app.id,
            appName: app.name,
            slaTarget: app.slaTarget ?? null,
            uptime: app.uptime,
            errorBudgetRemainingPct: app.errorBudgetRemainingPct ?? null,
            burnBand: app.burnRate?.band ?? 'unknown',
            state: classifySloState(app),
            businessUnit: buMap[app.id] || '',
        }))
        .sort((a, b) => {
            const stateOrder: Record<SloState, number> = {
                breaching: 0,
                atRisk: 1,
                healthy: 2,
                noSlo: 3,
            };
            const sa = stateOrder[a.state];
            const sb = stateOrder[b.state];
            if (sa !== sb) return sa - sb;
            // Within the same state, sort by error budget ascending (worst first).
            const ea = a.errorBudgetRemainingPct ?? Infinity;
            const eb = b.errorBudgetRemainingPct ?? Infinity;
            return ea - eb;
        });
}
