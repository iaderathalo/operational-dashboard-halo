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
    | 'monitorRollup'
    | 'sloRollup'
    | 'syntheticRollup'
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
        howCalculated:
            'Error-budget consumption rate over the 30-day SLO window. Below 1.0x = burning within budget; 1.0x or higher = burning faster than allowed (budget runs out before the window ends).',
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
        howCalculated:
            'Percent of the allowed downtime budget still unused: 100% = none spent, 0% = SLA breached',
        source: 'Live · Datadog SLO',
        meaning:
            'How much room the app has left to be down this month before it breaks its uptime promise. The budget = 100% − SLA target (a 99.95% target allows ~0.05% downtime).',
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
            '30-day SLO uptime %, plus the percent of the error budget still remaining (the allowed downtime budget = 100% − SLA target)',
        source: 'Live · Datadog SLO',
        meaning:
            'Uptime under the SLA target means the error budget is being spent; the burn rate shows how fast it is being consumed.',
    },
    monitors: {
        label: 'Datadog Monitors',
        howCalculated: 'List of Datadog monitors linked to this application via service tags',
        source: 'Live · Datadog',
        meaning:
            'Each monitor reflects a real-time alert rule; red/amber means a condition is failing',
    },
    monitorRollup: {
        label: 'Monitors',
        howCalculated:
            'Count of Datadog monitors in each state across all apps in the selected portfolio node, aggregated client-side from the per-app monitor breakdown',
        source: 'Live · Datadog',
        meaning:
            'No Data = a monitor exists but has no signal — it often means a silently-broken or misconfigured monitor',
    },
    sloRollup: {
        label: 'SLO / Budget',
        howCalculated:
            'Classifies each app by error-budget remaining: Healthy (≥ 25%), At-risk (< 25%), Breaching (≤ 0%), No SLO (no SLO data joined). Aggregated client-side over the selected portfolio node.',
        source: 'Live · Datadog SLO',
        meaning:
            'Shows how many apps are within their error budget, approaching exhaustion (< 25% remaining), already breached, or missing SLO data entirely',
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
            'How the app\u2019s synthetic checks (login flows, API probes) are doing; paused or no-data checks are flagged, never a false pass',
    },
    syntheticRollup: {
        label: 'Synthetics',
        howCalculated:
            'Classifies each Datadog Synthetic check by 30-day uptime: Passing (\u2265 99%), Degraded (< 99%), No Data (null uptime), Paused (lifecycle paused). Aggregated client-side over the selected portfolio node.',
        source: 'Live \u00b7 Datadog Synthetics',
        meaning:
            'Shows how many synthetic checks are healthy, underperforming, missing data, or intentionally paused across the portfolio scope',
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
