import { ApplicationStatus } from '@operational-dashboard/shared-api-model/model/dashboard';

import { DatadogMonitor, DatadogMonitorState, DatadogSloSummary } from './datadog.types';

const STATUS_SEVERITY: Record<ApplicationStatus, number> = { GREEN: 0, AMBER: 1, RED: 2 };

/** Map one Datadog monitor state to a status. No Data -> AMBER (PRD FR-2 product decision). */
function stateToStatus(state: DatadogMonitorState): ApplicationStatus {
    if (state === 'Alert') return 'RED';
    if (state === 'OK') return 'GREEN';
    // Warn, No Data, and any unrecognised live state (Skipped/Unknown/Ignored) are
    // AMBER — fail safe rather than optimistically GREEN.
    return 'AMBER';
}

/**
 * Worst-state-wins rollup of an Application's monitors. An empty set is AMBER
 * (No Data semantics) — never GREEN (PRD FR-2 / SM-C1).
 */
export function rollupStatus(monitors: DatadogMonitor[]): ApplicationStatus {
    if (!monitors.length) return 'AMBER';
    return monitors
        .map((monitor) => stateToStatus(monitor.overall_state))
        .reduce(
            (worst, status) => (STATUS_SEVERITY[status] > STATUS_SEVERITY[worst] ? status : worst),
            'GREEN' as ApplicationStatus
        );
}

export interface ComputedHealth {
    healthStatus: ApplicationStatus;
    datadogMapped: boolean;
    uptime24h: number | null;
    uptime7d: number | null;
    uptime30d: number | null;
    slaTarget: number | null;
    errorBudgetRemainingPct: number | null;
    resolutionPath: 'primary' | 'fallback' | 'unmapped';
}

/**
 * Assemble the persisted health fields from monitors + SLO summary. datadogMapped
 * reflects whether the Application had a resolvable Datadog identifier — Unmapped is
 * distinct from a mapped app returning No Data (PRD glossary / FR-10).
 */
export function buildHealth(
    monitors: DatadogMonitor[],
    slo: DatadogSloSummary | null,
    resolutionPath: 'primary' | 'fallback' | 'unmapped'
): ComputedHealth {
    return {
        healthStatus: rollupStatus(monitors),
        datadogMapped: resolutionPath !== 'unmapped',
        uptime24h: slo?.uptime24h ?? null,
        uptime7d: slo?.uptime7d ?? null,
        uptime30d: slo?.uptime30d ?? null,
        slaTarget: slo?.target ?? null,
        errorBudgetRemainingPct: slo?.errorBudgetRemainingPct ?? null,
        resolutionPath,
    };
}
