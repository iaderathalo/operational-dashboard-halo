import {
    ApplicationMonitor,
    ApplicationStatus,
    ApplicationSyntheticCheck,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import {
    DatadogMonitor,
    DatadogMonitorState,
    DatadogSloSummary,
    DatadogSyntheticCheck,
} from './datadog.types';

/** Cap on stored per-app monitors so a noisy app cannot bloat its document. */
const MAX_MONITORS = 50;
/** Cap on stored per-app synthetic checks so a heavily-tested app cannot bloat its doc. */
const MAX_SYNTHETICS = 50;

const STATUS_SEVERITY: Record<ApplicationStatus, number> = { GREEN: 0, AMBER: 1, RED: 2 };

/**
 * Map one Datadog monitor state to a status. No Data -> AMBER (PRD FR-2 product decision).
 * @param state
 */
function stateToStatus(state: DatadogMonitorState): ApplicationStatus {
    if (state === 'Alert') return 'RED';
    if (state === 'OK') return 'GREEN';
    // Warn, No Data, and any unrecognised live state (Skipped/Unknown/Ignored) are
    // AMBER — fail safe rather than optimistically GREEN.
    return 'AMBER';
}

/**
 * True when a monitor is under an active maintenance window right now (#3).
 * @param monitor
 */
function isInDowntime(monitor: DatadogMonitor): boolean {
    return Array.isArray(monitor.matching_downtimes) && monitor.matching_downtimes.length > 0;
}

/**
 * Case-insensitive `service:` tag lookup that preserves the value's original casing
 * (US-2.4). Multiple `service:` tags are not expected; the first one wins. A
 * valueless `service:` tag (e.g. `"service:"`) trims to `undefined`, never a stray
 * colon in the UI.
 * @param {string[]} tags - the monitor's raw Datadog tags
 * @returns {string | undefined} the tag value, or undefined when absent
 */
function extractService(tags: string[]): string | undefined {
    const tag = (tags ?? []).find((t) => t.toLowerCase().startsWith('service:'));
    if (!tag) return undefined;
    const value = tag.slice(tag.indexOf(':') + 1).trim();
    return value || undefined;
}

/**
 * Deep link to a monitor's Datadog page (US-2.4). `site` is DATADOG_SITE (e.g.
 * `"datadoghq.com"`) — note the `app.` subdomain, distinct from the `api.` subdomain
 * the axios client is built against (`datadog.module.ts`).
 * @param {string} site - the Datadog site (e.g. `datadoghq.com`)
 * @param {number} monitorId - the monitor's numeric Datadog id
 * @returns {string} the monitor's Datadog UI URL
 */
export function buildMonitorUrl(site: string, monitorId: number): string {
    return `https://app.${site}/monitors/${monitorId}`;
}

/**
 * Worst-state-wins rollup of an Application's monitors. Monitors under an active
 * downtime are suppressed first (#3) so a planned maintenance window never paints a
 * false RED. An empty set — or one where every monitor is in downtime — is AMBER
 * (No Data semantics), never GREEN (PRD FR-2 / SM-C1).
 * @param monitors
 */
export function rollupStatus(monitors: DatadogMonitor[]): ApplicationStatus {
    const active = monitors.filter((monitor) => !isInDowntime(monitor));
    if (!active.length) return 'AMBER';
    return active
        .map((monitor) => stateToStatus(monitor.overall_state))
        .reduce(
            (worst, status) => (STATUS_SEVERITY[status] > STATUS_SEVERITY[worst] ? status : worst),
            'GREEN' as ApplicationStatus
        );
}

/**
 * Per-monitor drill-down for an app (#2): worst-state first, then by name, capped.
 * Reuses the same state->status mapping as the rollup so the breakdown and the
 * headline Health status can never disagree.
 * @param {DatadogMonitor[]} monitors - the app's resolved monitors
 * @returns {ApplicationMonitor[]} the per-monitor breakdown
 */
export function buildMonitorBreakdown(monitors: DatadogMonitor[]): ApplicationMonitor[] {
    return monitors
        .map((monitor) => ({
            id: monitor.id,
            name: monitor.name,
            status: stateToStatus(monitor.overall_state),
            datadogState: monitor.overall_state,
            message: (monitor.message ?? '').trim(),
            lastTriggeredAt: monitor.overall_state_modified ?? null,
            inMaintenance: isInDowntime(monitor),
            service: extractService(monitor.tags),
        }))
        .sort(
            (a, b) =>
                STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status] ||
                a.name.localeCompare(b.name)
        )
        .slice(0, MAX_MONITORS);
}

/**
 * Per-check drill-down for an app (12-4 Health Check Breakdown): lowest-uptime first so
 * problems surface, no-data/paused checks (null uptime) last, capped. Maps the Datadog
 * shape to the stored ApplicationSyntheticCheck verbatim — the UI decides presentation.
 * @param {DatadogSyntheticCheck[]} checks - the app's resolved synthetic tests
 * @returns {ApplicationSyntheticCheck[]} the per-check breakdown
 */
export function buildSyntheticBreakdown(
    checks: DatadogSyntheticCheck[]
): ApplicationSyntheticCheck[] {
    return checks
        .map((check) => ({
            publicId: check.publicId,
            name: check.name,
            type: check.type,
            status: check.status,
            uptime: check.uptime,
        }))
        .sort(
            (a, b) =>
                (a.uptime ?? Infinity) - (b.uptime ?? Infinity) || a.name.localeCompare(b.name)
        )
        .slice(0, MAX_SYNTHETICS);
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
 * @param monitors
 * @param slo
 * @param resolutionPath
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
