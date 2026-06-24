export interface MetricDescription {
    label: string;
    howCalculated: string;
    source: string;
    meaning: string;
}

export type MetricKey =
    | 'health'
    | 'uptime'
    | 'maturity'
    | 'burnRate'
    | 'uptimeDetail'
    | 'errorBudget'
    | 'healthTimeline'
    | 'uptimeBudget'
    | 'monitors'
    | 'recentActivity'
    | 'recentHealthEvents'
    | 'healthCheckBreakdown'
    | 'recommendations';

export const METRIC_DESCRIPTIONS: Record<MetricKey, MetricDescription> = {
    health: {
        label: 'Health',
        howCalculated: 'Worst monitor status across all linked Datadog monitors',
        source: 'Live · Datadog',
        meaning: "Reflects whether the app's monitors are currently green, amber, or red",
    },
    uptime: {
        label: 'Uptime (30d)',
        howCalculated: 'Datadog SLO uptime percentage over the trailing 30 days',
        source: 'Live · Datadog SLO',
        meaning: 'Higher is better; below SLA target means the error budget is being consumed',
    },
    maturity: {
        label: 'Maturity',
        howCalculated: 'Sum of 5 binary signals: mapped, hasMonitor, hasSLO, sloPassing, hasOwner',
        source: 'Computed · Datadog + PlanView',
        meaning: 'Measures how well the app is instrumented and owned (0 = none, 5 = fully mature)',
    },
    burnRate: {
        label: 'Burn Rate',
        howCalculated: 'Error-budget consumption rate vs the 30-day SLO window (1.0x = on track)',
        source: 'Computed · Datadog SLO',
        meaning:
            'Above 1.0x means the budget is being consumed faster than allowed; above 2.0x is at-risk',
    },
    uptimeDetail: {
        label: 'Uptime (30d)',
        howCalculated: 'Datadog SLO uptime percentage over the trailing 30 days',
        source: 'Live · Datadog SLO',
        meaning: 'Higher is better; below the SLA target means the error budget is being consumed',
    },
    errorBudget: {
        label: 'Error Budget',
        howCalculated: 'Remaining error-budget minutes = (1 - slaTarget) × 30d × 60 × uptimePct',
        source: 'Computed · Datadog SLO',
        meaning: 'Time the app can be down this month before breaching its SLA',
    },
    healthTimeline: {
        label: 'Health Status Timeline',
        howCalculated: 'Aggregated Datadog monitor status sampled at each sync interval',
        source: 'Live · Datadog',
        meaning: 'Shows green/amber/red monitor state over time; gaps indicate missing syncs',
    },
    uptimeBudget: {
        label: 'Uptime & Error Budget',
        howCalculated:
            'SLO uptime % over trailing 30 days; error budget = (1 - slaTarget) × 30d × 60 × uptimePct',
        source: 'Live · Datadog SLO',
        meaning: 'Below SLA target means the error budget is being consumed',
    },
    monitors: {
        label: 'Datadog Monitors',
        howCalculated: 'List of Datadog monitors linked to this application via service tags',
        source: 'Live · Datadog',
        meaning:
            'Each monitor reflects a real-time alert rule; red/amber means a condition is failing',
    },
    recentActivity: {
        label: 'Recent Activity',
        howCalculated:
            'Sync and health-state changes for this app, read from the synced Datadog snapshots (newest first)',
        source: 'Live · synced Datadog snapshots',
        meaning: 'A running log of when this app last synced and changed health state',
    },
    recentHealthEvents: {
        label: 'Recent Health Events',
        howCalculated:
            'Health-state transitions (green/amber/red) detected between consecutive synced snapshots',
        source: 'Live · synced Datadog snapshots',
        meaning:
            'Each row is one status change: when it happened, the direction, and how long the prior state held',
    },
    healthCheckBreakdown: {
        label: 'Health Check Breakdown',
        howCalculated:
            'Datadog Synthetic tests linked to the app via app_short_key/app_service_id, each with its 30-day uptime; lowest-uptime first',
        source: 'Live · Datadog Synthetics',
        meaning:
            'How the app’s synthetic checks (login flows, API probes) are doing; paused or no-data checks are flagged, never a false pass',
    },
    recommendations: {
        label: 'Recommendations',
        howCalculated:
            'One action per failing maturity signal; deterministic projection over the 5 signals',
        source: 'Generated · mock LLM (grounded on synced Datadog + PlanView)',
        meaning:
            'Prioritized, grounded actions to raise the maturity score; never invents metric values',
    },
};

/**
 * Formats the how-calculated, source, and meaning triad into a single tooltip string.
 * @param {MetricDescription} desc - metric description entry
 * @returns {string} formatted tooltip string
 */
export function formatMetricTooltip(desc: MetricDescription): string {
    return `${desc.howCalculated} · ${desc.source} · ${desc.meaning}`;
}
