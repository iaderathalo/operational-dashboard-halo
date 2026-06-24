/* eslint-disable max-lines, max-lines-per-function */
import LOCAL_DEVELOPMENT_USER from '@operational-dashboard/shared-api-model/model/common/LocalDevelopmentUser';
import {
    ApplicationMonitor,
    ApplicationStatus,
    DashboardDetailContactEntry,
    DashboardDetailContacts,
    DashboardDetailHealthCheck,
    DashboardDetailMonitor,
    DashboardDetailPeople,
    DashboardDetailResponse,
    DashboardDetailStatus,
    DashboardDetailView,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import { PortfolioAppContext, PortfolioSyntheticCheck } from '../portfolio.model';

type HeatmapTone = 'g' | 'a' | 'r' | 'x';

type FeatureDefinition = {
    name: string;
    status: DashboardDetailStatus;
    current: string;
    currentMs: number;
    baseline: string;
    delta: string;
    amberMs: number;
    redMs: number;
    critical: boolean;
    timeout: string;
    detail: string;
    spark: readonly number[];
};

const HEADER_HEALTH_LABELS: Record<DashboardDetailStatus, string> = {
    green: 'Healthy',
    amber: 'Degraded',
    red: 'Critical',
    undefined: 'Not monitored',
};

const HEADER_PERCEPTION_LABELS: Record<DashboardDetailStatus, string> = {
    green: 'Experience Stable',
    amber: 'Perception Slow',
    red: 'Perception Critical',
    undefined: 'Not monitored',
};

const USERS_TIMELINE = [
    20, 25, 30, 40, 55, 70, 85, 90, 88, 82, 78, 75, 80, 85, 90, 92, 88, 82, 75, 60, 45, 35, 28, 22,
    20, 25, 32, 45, 58, 72, 86, 92, 95, 90, 85, 78, 72, 68, 65, 62, 60, 58, 55, 50, 48, 42, 38, 35,
];

const RESPONSE_LATENCY_SERIES = [
    {
        label: 'P50',
        tone: 'accent' as const,
        values: [
            12, 14, 13, 12, 15, 16, 18, 17, 16, 18, 20, 18, 17, 15, 16, 14, 13, 12, 13, 15, 16, 18,
            17, 15,
        ],
    },
    {
        label: 'P90',
        tone: 'amber' as const,
        values: [
            24, 26, 25, 28, 32, 35, 38, 36, 34, 37, 42, 45, 43, 40, 38, 34, 32, 30, 29, 31, 34, 36,
            35, 32,
        ],
    },
    {
        label: 'P99',
        tone: 'red' as const,
        values: [
            45, 48, 46, 50, 55, 58, 62, 60, 58, 61, 68, 72, 70, 66, 63, 58, 55, 53, 52, 56, 60, 63,
            61, 58,
        ],
    },
];

const ERROR_RATE_VALUES = [
    8, 10, 9, 12, 11, 15, 18, 16, 15, 14, 12, 10, 9, 11, 13, 17, 15, 14, 12, 10, 9, 8, 7, 6,
];

const PERFORMANCE_TREND_SERIES = [
    {
        label: 'Report Generation',
        tone: 'red' as const,
        values: [14, 15, 18, 20, 26, 32, 40, 48, 55, 62, 68, 70],
    },
    {
        label: 'Dashboard Load',
        tone: 'amber' as const,
        values: [8, 9, 10, 12, 15, 18, 20, 22, 24, 23, 22, 21],
    },
    {
        label: 'Census File Upload',
        tone: 'green' as const,
        values: [6, 6, 6, 7, 7, 7, 6, 6, 6, 6, 6, 6],
    },
];

const TIMELINE_AXIS = ['Feb 27', 'Feb 28', 'Mar 01', 'Mar 02', 'Mar 03', 'Mar 04', 'Mar 05'];

const FEATURE_DEFINITIONS: FeatureDefinition[] = [
    {
        name: 'Report Generation',
        status: 'red',
        current: '47.2s',
        currentMs: 47200,
        baseline: '8.1s',
        delta: '5.8x',
        amberMs: 12000,
        redMs: 24000,
        critical: true,
        timeout: '0.2%',
        detail: 'Critical workflow degradation',
        spark: [
            8, 9, 8, 10, 9, 12, 15, 20, 28, 35, 42, 47, 47, 47, 46, 48, 47, 45, 47, 48, 47, 47, 47,
            47,
        ],
    },
    {
        name: 'Dashboard Load',
        status: 'amber',
        current: '6.8s',
        currentMs: 6800,
        baseline: '2.3s',
        delta: '3.0x',
        amberMs: 3000,
        redMs: 6000,
        critical: true,
        timeout: '0.5%',
        detail: 'Slower than normal during peak windows',
        spark: [2, 2, 2, 3, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 7, 7, 7, 7, 7, 6, 7, 7, 7, 7],
    },
    {
        name: 'Census File Upload',
        status: 'green',
        current: '3.1s',
        currentMs: 3100,
        baseline: '2.9s',
        delta: '1.1x',
        amberMs: 4400,
        redMs: 8700,
        critical: false,
        timeout: '0.0%',
        detail: 'Operating within target envelope',
        spark: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    },
    {
        name: 'Load Session',
        status: 'green',
        current: '0.4s',
        currentMs: 400,
        baseline: '0.3s',
        delta: '1.3x',
        amberMs: 500,
        redMs: 900,
        critical: false,
        timeout: '0.0%',
        detail: 'Minor variance, no user impact',
        spark: [
            0.3, 0.3, 0.3, 0.4, 0.3, 0.4, 0.3, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.3, 0.4, 0.4,
            0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4,
        ],
    },
    {
        name: 'Save Session',
        status: 'green',
        current: '0.9s',
        currentMs: 900,
        baseline: '0.8s',
        delta: '1.1x',
        amberMs: 1200,
        redMs: 2400,
        critical: false,
        timeout: '0.0%',
        detail: 'Steady across recent samples',
        spark: [
            0.8, 0.8, 0.9, 0.8, 0.9, 0.8, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.8, 0.9, 0.9,
            0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9,
        ],
    },
];

const CURRENT_USER =
    process.env.BYPASS_AUTH === 'true'
        ? {
              email: LOCAL_DEVELOPMENT_USER.email,
              initials: LOCAL_DEVELOPMENT_USER.initials,
              name: LOCAL_DEVELOPMENT_USER.name,
              role: LOCAL_DEVELOPMENT_USER.role,
          }
        : {
              email: 'j.martinez@marsh.com',
              initials: 'JM',
              name: 'J. Martinez',
              role: 'Operations Analyst',
          };

const PEOPLE: DashboardDetailPeople = {
    currentUser: CURRENT_USER,
    sev1Notify: [
        { name: 'D. Thompson', role: 'Dir, CRM Ops', checked: true },
        { name: 'M. Rivera', role: 'On-Call SRE', checked: true },
        { name: 'L. Chen', role: 'IT Operations Manager', checked: true },
        { name: 'M. Johansson', role: 'VP Infrastructure', checked: true },
        { name: 'NOC Bridge Line', role: '+1 (555) 000-9999', checked: true },
        { name: 'S. Patel', role: 'CIO (executive escalation)', checked: false },
    ],
    sev1Channels: [
        { label: 'Microsoft Teams: Incident Response', checked: true },
        { label: 'PagerDuty: CRM Escalation Policy', checked: true },
        { label: 'Email: crm-stakeholders@corp.com', checked: true },
        { label: 'SMS blast to extended team', checked: false },
    ],
};

const createScaledBars = (values: readonly number[]): number[] => {
    const max = Math.max(...values);

    return values.map((value) => Number(Math.max(8, (value / max) * 100).toFixed(1)));
};

const createTimelineBars = (pattern: string): Array<'g' | 'a' | 'r'> =>
    pattern.split('').map((tone) => tone as 'g' | 'a' | 'r');

const createHeatmapRows = (): DashboardDetailView['heatmapRows'] => {
    const days = [
        'Mar 05',
        'Mar 04',
        'Mar 03',
        'Mar 02',
        'Mar 01',
        'Feb 28',
        'Feb 27',
        'Feb 26',
        'Feb 25',
        'Feb 24',
        'Feb 23',
        'Feb 22',
        'Feb 21',
        'Feb 20',
    ];

    return days.map((day, dayIndex) => ({
        label: day,
        cells: Array.from({ length: 24 }, (_, hour) => {
            let tone: HeatmapTone = 'g';

            if (dayIndex === 0 && hour >= 9 && hour <= 11) tone = 'r';
            else if (dayIndex === 0 && hour >= 12) tone = 'a';
            else if (dayIndex === 2 && hour >= 14 && hour <= 15) tone = 'a';
            else if (dayIndex === 5 && hour >= 2 && hour <= 3) tone = 'a';
            else if (dayIndex === 7 && hour === 10) tone = 'r';
            else if (hour <= 5 && dayIndex > 5) tone = 'x';

            return {
                tone,
                title: `${day} ${hour}:00-${hour + 1}:00`,
            };
        }),
    }));
};

const createFeatureCards = (): DashboardDetailView['features'] =>
    FEATURE_DEFINITIONS.map((feature) => {
        const maxThreshold = feature.redMs * 1.5;
        const markerPct = Number(Math.min(98, (feature.currentMs / maxThreshold) * 100).toFixed(1));
        const amberPct = Number(((feature.amberMs / maxThreshold) * 100).toFixed(1));
        const redPct = Number(((feature.redMs / maxThreshold) * 100).toFixed(1));

        return {
            name: feature.name,
            status: feature.status,
            current: feature.current,
            baseline: feature.baseline,
            delta: feature.delta,
            amberMs: feature.amberMs,
            redMs: feature.redMs,
            critical: feature.critical,
            timeout: feature.timeout,
            detail: feature.detail,
            sparkHeights: createScaledBars(feature.spark),
            markerPct,
            amberPct,
            redPct,
        };
    });

const buildIncidentTrendText = (count: number): string => {
    if (count <= 0) {
        return 'No active incidents';
    }

    if (count > 1) {
        return 'Sev-2 · investigating';
    }

    return 'Sev-3 · investigating';
};

const resolveTier = (uptime: number): number => (uptime >= 99.95 ? 1 : 2);

/**
 * Maps remaining error-budget percentage to a status colour: greener with more
 * headroom, red when nearly exhausted, grey when there is no SLO to measure.
 * @param {number | null} pct - remaining error budget percentage, or null
 * @returns {string} detail status colour
 */
const resolveErrorBudgetColor = (pct: number | null): DashboardDetailStatus => {
    if (pct == null) {
        return 'undefined';
    }

    if (pct < 5) {
        return 'red';
    }

    if (pct < 20) {
        return 'amber';
    }

    return 'green';
};

const createOverviewMetrics = (
    uptimeValue: string,
    perception: DashboardDetailStatus,
    usersValue: string,
    incidentCount: number,
    activeDriftModels: number,
    errorBudgetValue: string,
    errorBudgetColor: DashboardDetailStatus,
    errorBudgetTrendText: string
): DashboardDetailView['overviewMetrics'] => [
    {
        label: 'Uptime (30d)',
        value: uptimeValue,
        color: 'green',
        trend: 'up',
        trendText: '▲ 0.02% vs 7d avg',
        source: 'datadog',
    },
    {
        label: 'Perception Score',
        value: 72,
        color: perception,
        trend: 'down',
        trendText: '▼ 8 pts from baseline',
        source: 'placeholder',
    },
    {
        label: 'Active Users',
        value: usersValue,
        color: 'green',
        trend: 'up',
        trendText: '▲ 12% vs avg',
        source: 'planview',
    },
    {
        label: 'Open Incidents',
        value: incidentCount,
        color: incidentCount > 0 ? 'amber' : 'green',
        trend: 'neutral',
        trendText: buildIncidentTrendText(incidentCount),
        source: 'placeholder',
    },
    {
        label: 'Error Budget',
        value: errorBudgetValue,
        color: errorBudgetColor,
        trend: 'neutral',
        trendText: errorBudgetTrendText,
        source: 'datadog',
    },
    {
        label: 'AI Tokens',
        value: '87%',
        color: 'amber',
        trend: 'down',
        trendText: '$48.72 of $250.00 budget',
        source: 'placeholder',
    },
    {
        label: 'AI Drift',
        value: `${activeDriftModels}/2`,
        color: 'amber',
        trend: 'down',
        trendText: activeDriftModels > 0 ? 'Models drifting' : 'All stable',
        source: 'placeholder',
    },
    {
        label: 'Infra Cost MTD',
        value: '$45.2K',
        color: 'red',
        trend: 'down',
        trendText: '▲ 8.1% vs last month',
        source: 'placeholder',
    },
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const NO_DATA_TEXT = 'No data';
const TBD_TEXT = 'TBD';

// Distinguishes the two missing-data causes for Datadog-sourced metrics: an app
// that isn't mapped in Datadog ("Not monitored") vs a mapped app whose metric has
// no value yet ("No data"). Keeps a missing signal from reading as an outage.
const missingDatadog = (datadogMapped?: boolean): string =>
    datadogMapped ? NO_DATA_TEXT : 'Not monitored';

const getText = (value?: string | null): string => String(value || '').trim();

const getDisplayText = (value?: string | null, fallback = NO_DATA_TEXT): string => {
    const text = getText(value);

    return text || fallback;
};

const getOptionalText = (value?: string | null): string | undefined => {
    const text = getText(value);

    return text || undefined;
};

const MONITOR_STATUS_TONE: Record<ApplicationStatus, DashboardDetailStatus> = {
    GREEN: 'green',
    AMBER: 'amber',
    RED: 'red',
};

/**
 * Strip Datadog template noise ({{...}}) + HTML tags and trim a message for display.
 * @param message
 */
const cleanMonitorMessage = (message: string): string =>
    message
        .replace(/\{\{[^}]*\}\}/g, ' ') // Datadog template conditionals/vars
        .replace(/<[^>]+>/g, ' ') // HTML the message body carries (e.g. <br />)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);

/**
 * Format an ISO last-change timestamp as "YYYY-MM-DD HH:MM UTC", else Undefined.
 * @param iso
 */
const formatLastTriggered = (iso: string | null): string => {
    if (!iso) return NO_DATA_TEXT;
    const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    return m ? `${m[1]} ${m[2]} UTC` : iso;
};

/**
 * Map the persisted per-app monitor breakdown to the detail view shape (#2).
 * @param monitors
 */
const buildMonitorCards = (monitors?: ApplicationMonitor[]): DashboardDetailMonitor[] =>
    (monitors ?? []).map((monitor) => ({
        name: monitor.name,
        status: MONITOR_STATUS_TONE[monitor.status] ?? 'undefined',
        message: cleanMonitorMessage(monitor.message),
        lastTriggered: formatLastTriggered(monitor.lastTriggeredAt),
        inMaintenance: Boolean(monitor.inMaintenance),
    }));

/**
 * Value cell for a synthetic check (12-4): its 30-day uptime %, or why it has none.
 * @param {PortfolioSyntheticCheck} check - the synthetic check
 * @returns {string} the value-cell text
 */
const synthCheckValue = (check: PortfolioSyntheticCheck): string => {
    if (check.uptime != null) return `${check.uptime.toFixed(2)}%`;
    return check.status === 'paused' ? 'paused' : 'no data';
};

/**
 * Maps the app's resolved synthetic checks (12-4) to Health Check Breakdown cards.
 * `ok` = the check is live and reporting data (paused / no-data read as not-ok); the
 * 30-day uptime % and lifecycle status are carried through for the UI.
 * @param {PortfolioSyntheticCheck[]} [checks] - the app's synthetic checks
 * @returns {DashboardDetailHealthCheck[]} the Health Check Breakdown cards
 */
const buildHealthCheckCards = (checks?: PortfolioSyntheticCheck[]): DashboardDetailHealthCheck[] =>
    (checks ?? []).map((check) => ({
        name: check.name,
        ok: check.status === 'live' && check.uptime != null,
        time: synthCheckValue(check),
        uptime: check.uptime,
        status: check.status,
    }));

const createContactEntry = (
    label: string,
    value?: string | null,
    secondary?: string | null,
    missingSecondaryText?: string
): DashboardDetailContactEntry => {
    const normalizedValue = getDisplayText(value);
    const normalizedSecondary = getOptionalText(secondary);

    return {
        label,
        value: normalizedValue,
        ...(normalizedSecondary || (missingSecondaryText && normalizedValue !== NO_DATA_TEXT)
            ? {
                  secondary: normalizedSecondary || missingSecondaryText,
              }
            : {}),
    };
};

const createDashboardContacts = (app: PortfolioAppContext['app']): DashboardDetailContacts => ({
    amsSupport: [
        { label: 'Maintenance', value: getDisplayText(app.amsSupport?.maintenance) },
        {
            label: 'Application Engineering',
            value: getDisplayText(app.amsSupport?.applicationEngineering),
        },
        {
            label: 'Application Support',
            value: getDisplayText(app.amsSupport?.applicationSupport),
        },
        {
            label: 'Database Services',
            value: getDisplayText(app.amsSupport?.databaseServices),
        },
        { label: 'IT Controls', value: getDisplayText(app.amsSupport?.itControls) },
    ],
    escalationPath: NO_DATA_TEXT,
    team: [
        createContactEntry(
            'Portfolio Owner',
            app.portfolioOwnerName,
            app.portfolioOwnerEmail,
            'Email unavailable'
        ),
        createContactEntry(
            'Technical Contact',
            app.technicalContact,
            app.technicalContactEmail,
            'Email unavailable'
        ),
        createContactEntry('POD Name', app.podName),
        createContactEntry('POD Lead', app.podLead, app.podLeadEmail, 'Email unavailable'),
        createContactEntry('IT Owner', app.itOwner, app.itOwnerEmail, 'Email unavailable'),
        createContactEntry(
            'Business Owner',
            app.businessOwner,
            app.businessOwnerEmail,
            'Email unavailable'
        ),
    ],
});

/**
 * Creates the full dashboard detail payload returned to the UI.
 * @param {object} context - portfolio application context resolved from the tree
 * @returns {object} detail-screen payload
 */
const createDashboardDetailResponse = (context: PortfolioAppContext): DashboardDetailResponse => {
    const { app, path } = context;
    const scope = path[path.length - 1];
    const usersValue = app.users.toLocaleString();
    const uptimeValue =
        app.uptime != null ? `${app.uptime.toFixed(2)}%` : missingDatadog(app.datadogMapped);
    const uptimeReason = app.datadogMapped ? 'No SLO reported yet' : 'Not mapped in Datadog';
    const incidentCount = app.incidents;
    const activeDriftModels = 1;

    // Error budget + SLA target are live from the Crawler (errorBudgetRemainingPct,
    // slaTarget on Application); render them honestly as a percentage rather than
    // the old fabricated "18 min / 22 min" figures.
    const errorBudgetPct = app.errorBudgetRemainingPct ?? null;
    const errorBudgetRemaining =
        errorBudgetPct != null
            ? `${errorBudgetPct.toFixed(1)}%`
            : missingDatadog(app.datadogMapped);
    const slaTargetValue =
        app.slaTarget != null ? `${app.slaTarget}%` : missingDatadog(app.datadogMapped);
    const errorBudgetTrendText =
        app.slaTarget != null ? `SLA target ${app.slaTarget}%` : 'No SLO data';

    const view: DashboardDetailView = {
        name: app.name,
        businessUnit: scope?.name || 'Unknown Business Unit',
        environment: 'Production',
        tier: resolveTier(app.uptime),
        owner: scope?.owner || 'Unknown Owner',
        ownerRole: scope?.role || 'Unknown Role',
        health: app.health,
        healthLabel: HEADER_HEALTH_LABELS[app.health],
        perception: app.perception,
        perceptionLabel: HEADER_PERCEPTION_LABELS[app.perception],
        perceptionScore: 72,
        perceptionSince: '2026-03-05 09:17 UTC',
        perceptionDuration: '5h 43m',
        uptime: {
            value: uptimeValue,
            trend: 'up',
            trendText: app.uptime != null ? '▲ 0.02% vs 7d avg' : uptimeReason,
        },
        slaTarget: slaTargetValue,
        errorBudget: {
            remaining: errorBudgetRemaining,
            total: 'error budget',
            used:
                errorBudgetPct != null
                    ? `${(100 - errorBudgetPct).toFixed(1)}%`
                    : missingDatadog(app.datadogMapped),
            pct: errorBudgetPct != null ? Math.round(errorBudgetPct) : 0,
            burnRate: missingDatadog(app.datadogMapped),
            breach: missingDatadog(app.datadogMapped),
        },
        activeUsers: {
            value: usersValue,
            trend: 'up',
            trendText: '▲ 12% vs avg',
            peak: '4,102',
        },
        openIncidents: {
            count: incidentCount,
            trend: 'neutral',
            trendText: buildIncidentTrendText(incidentCount),
        },
        timelineAxis: TIMELINE_AXIS,
        timelineIncidents: [
            { sev: 3, pos: '18%', color: 'var(--amber)', title: 'Sev-3: Queue depth warning' },
            { sev: 3, pos: '62%', color: 'var(--grey)', title: 'Sev-3: Certificate renewal' },
        ],
        healthTimelineBars: createTimelineBars(
            'ggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg'
        ),
        perceptionTimelineBars: createTimelineBars(
            'ggggggggggggggggggggggggggggggggggggrrrrrrrrrrraaaaaaaaaaaaaaaaaaaa'
        ),
        healthRangeTimelines: [
            {
                label: '24-Hour',
                bars: createTimelineBars('gggggggggggggggggggggggggggggggggggggggggggggggg'),
            },
            {
                label: '7-Day',
                bars: createTimelineBars('ggggggggggggggggggggggggggggggggggggaagggggggggggggggg'),
            },
            {
                label: '30-Day',
                bars: createTimelineBars(
                    'ggggggggggggggggggggggaagggggggggggggggggggggggggggggaaaggggggggg'
                ),
            },
        ],
        userTimelineBars: createScaledBars(USERS_TIMELINE),
        responseLatencySeries: RESPONSE_LATENCY_SERIES.map((series) => ({
            label: series.label,
            tone: series.tone,
            bars: createScaledBars(series.values),
        })),
        errorRateBars: createScaledBars(ERROR_RATE_VALUES),
        performanceTrendSeries: PERFORMANCE_TREND_SERIES.map((series) => ({
            label: series.label,
            tone: series.tone,
            bars: createScaledBars(series.values),
        })),
        features: createFeatureCards(),
        heatmapRows: createHeatmapRows(),
        healthChecks: buildHealthCheckCards(app.syntheticChecks),
        monitors: buildMonitorCards(app.monitors),
        healthEvents: [
            {
                time: 'Mar 05 12:00',
                event: 'Maintenance ended',
                fromLabel: 'Amber',
                toLabel: 'Green',
                source: 'Manual',
                duration: '30 min',
            },
            {
                time: 'Mar 05 11:30',
                event: 'Scheduled maintenance',
                fromLabel: 'Green',
                toLabel: 'Amber',
                source: 'Manual',
                duration: '—',
            },
            {
                time: 'Feb 28 03:12',
                event: 'HTTP check timeout',
                fromLabel: 'Green',
                toLabel: 'Amber',
                source: 'Datadog',
                duration: '4 min',
            },
        ],
        activityLog: [
            {
                time: '15:00',
                color: 'amber',
                text: 'Perception: Report Generation response time at 6x baseline',
            },
            { time: '14:45', color: 'amber', text: 'Perception changed GREEN → AMBER' },
            { time: '14:30', color: 'accent', text: 'Feature health poll completed (5 features)' },
            { time: '14:15', color: 'green', text: 'Health check: all 7 checks passing' },
            { time: '14:00', color: 'grey', text: `User count: ${usersValue} (peak today: 4,102)` },
            { time: '12:00', color: 'green', text: 'Scheduled maintenance window completed' },
            { time: '09:00', color: 'grey', text: 'On-call handoff: M. Rivera → T. Okonkwo' },
        ],
        incidentMetricCards: [
            {
                label: 'Mean Time to Detect',
                value: '4.2 min',
                color: 'green',
                trend: 'up',
                trendText: '▲ 1.1 min vs Q3 (improved)',
            },
            {
                label: 'Mean Time to Resolve',
                value: '38 min',
                color: 'red',
                trend: 'down',
                trendText: '▼ 5 min vs Q3 (slower)',
            },
            {
                label: 'Mean Time Between Failures',
                value: '12.4 days',
                color: 'green',
                trend: 'up',
                trendText: '▲ 2.1 days vs Q3',
            },
        ],
        incidents: [
            {
                dateHeader: 'March 5, 2026',
                sev: 3,
                title: 'Queue depth exceeded threshold',
                status: 'investigating',
                meta: 'Opened: 09:42 UTC · Duration: 5h 18m (ongoing) · Assigned: J. Smith · INC-4521',
                impact: `Report generation queue backed up, affecting ~${Math.max(200, Math.round(app.users * 0.65))} users`,
                rootCause:
                    'Under investigation — suspected DB query plan regression after weekend maintenance',
                resolution: '',
                timeline: [
                    { time: '09:42', text: 'Opened by automated alert (queue depth > 1000)' },
                    { time: '09:44', text: 'Acknowledged by J. Smith' },
                    {
                        time: '09:48',
                        text: 'Update: Queue backed up due to slow DB query on report_gen table',
                    },
                    {
                        time: '10:15',
                        text: 'Update: Identified query plan regression. Testing forced plan rebuild.',
                    },
                ],
                actions: ['Open in ServiceNow', 'Add Update'],
            },
            {
                dateHeader: 'March 1, 2026',
                sev: 3,
                title: 'TLS certificate renewal warning',
                status: 'resolved',
                meta: 'Opened: 14:00 UTC · Resolved: 14:22 UTC · Duration: 22 min · INC-4498',
                impact: 'No user impact. Preventive alert.',
                rootCause: '',
                resolution:
                    'Certificate renewed via automated pipeline. Verified in all environments.',
                timeline: [],
                actions: [],
            },
            {
                dateHeader: 'February 21, 2026',
                sev: 1,
                title: 'Complete outage during storage failover',
                status: 'closed',
                meta: 'Opened: 10:15 UTC · Resolved: 10:32 UTC · Duration: 17 min · INC-4412 · PIR completed',
                impact: 'All users (3,400+) unable to access CRM for 17 minutes during peak hours.',
                rootCause:
                    'Storage array firmware bug caused failover to take 4x longer than expected.',
                resolution: 'Vendor patch applied. Failover testing scheduled monthly.',
                timeline: [],
                actions: ['View PIR'],
            },
            {
                dateHeader: 'February 10, 2026',
                sev: 2,
                title: 'API response times >5s average',
                status: 'closed',
                meta: 'Opened: 16:30 UTC · Resolved: 17:45 UTC · Duration: 1h 15m · INC-4389',
                impact: '~800 users experienced slow page loads. No complete outage.',
                rootCause:
                    'Runaway background job consuming DB connections. Killed and rescheduled.',
                resolution: '',
                timeline: [],
                actions: [],
            },
        ],
        contacts: createDashboardContacts(app),
        shared: {
            teamsChannel: TBD_TEXT,
            email: TBD_TEXT,
            vendor: TBD_TEXT,
        },
        aiTokens: {
            status: 'amber',
            provider: 'OpenAI',
            model: 'GPT 5.2',
            periodLabel: 'April 2026',
            daysElapsed: 7,
            daysTotal: 30,
            tokenPct: 87,
            costMtd: '$48.72',
            costBudget: '$250.00',
            inputTokens: '1,402K',
            outputTokens: '445K',
            metricCards: [
                {
                    label: 'Tokens Used',
                    value: '1.8M',
                    color: 'amber',
                    trend: 'neutral',
                    trendText: 'of 2.1M budget',
                },
                {
                    label: 'Cost MTD',
                    value: '$48.72',
                    color: 'green',
                    trend: 'neutral',
                    trendText: '$6.96/day',
                },
                {
                    label: 'Projected',
                    value: '$208.80',
                    color: 'amber',
                    trend: 'neutral',
                    trendText: 'of $250.00 budget',
                },
                {
                    label: 'Requests',
                    value: '12,847',
                    color: 'green',
                    trend: 'neutral',
                    trendText: '1,835/day avg',
                },
            ],
            byModel: [
                { name: 'GPT 5.2', tokens: '1,204K', requests: 8200, cost: '$38.20' },
                { name: 'GPT-5 Mini', tokens: '412K', requests: 3100, cost: '$8.42' },
                { name: 'GPT 4.1 Nano', tokens: '231K', requests: 1547, cost: '$2.10' },
            ],
            byFeature: [
                { name: 'FIBER AI Assistant', tokens: '1,335K', requests: 2100, cost: '$28.42' },
                { name: 'RFP Creator', tokens: '355K', requests: 5927, cost: '$15.43' },
                { name: 'Document Uploader', tokens: '157K', requests: 4820, cost: '$4.87' },
            ],
            anomalies: [
                {
                    date: 'Apr 5',
                    tokens: '312K',
                    multiplier: '2.3x',
                    cause: 'Load test with production prompts',
                },
            ],
            dailyTokenBars: createScaledBars([180, 195, 190, 210, 205, 312, 200]),
        },
        aiDrift: {
            status: 'amber',
            summary: 'One critical model is approaching retraining threshold.',
            attentionCount: activeDriftModels,
            models: [
                {
                    id: 'fiber-ai-assistant-v3',
                    name: 'FIBER AI Assistant v3',
                    isCritical: true,
                    status: 'amber',
                    accuracy: '92.3%',
                    baselineAccuracy: '96.1%',
                    accuracyDelta: '-3.8%',
                    metricType: 'Answer Accuracy',
                    psi: '0.18',
                    staleDays: '51 days',
                    stalenessPct: 85,
                    stalenessTone: 'amber',
                    lastTrained: '2026-02-15',
                    predictionReference: 4.2,
                    predictionCurrent: 8.7,
                    featureDrift: [
                        { name: 'query_embedding', status: 'red', score: '0.34', method: 'JS' },
                        { name: 'journey_step_dist', status: 'amber', score: '0.22', method: 'JS' },
                        { name: 'report_category', status: 'amber', score: '0.11', method: 'JS' },
                        {
                            name: 'context_window_len',
                            status: 'green',
                            score: '0.08',
                            method: 'KS',
                        },
                        {
                            name: 'retrieval_relevance',
                            status: 'green',
                            score: '0.03',
                            method: 'KS',
                        },
                    ],
                    dataQuality: {
                        completeness: '97.2%',
                        schemaConformance: '100%',
                        freshnessLag: '45s',
                    },
                    accuracyTrendBars: createScaledBars([
                        96.1, 96.0, 95.8, 95.5, 95.2, 94.8, 94.5, 94.1, 93.6, 93.0, 92.5, 92.3,
                    ]),
                },
                {
                    id: 'doc-uploader-v2',
                    name: 'Document Uploader v2',
                    isCritical: false,
                    status: 'green',
                    accuracy: '94.7%',
                    baselineAccuracy: '95.1%',
                    accuracyDelta: '-0.4%',
                    metricType: 'Extraction Accuracy',
                    psi: '0.04',
                    staleDays: '12 days',
                    stalenessPct: 20,
                    stalenessTone: 'green',
                    lastTrained: '2026-03-26',
                    predictionReference: 4.2,
                    predictionCurrent: 4.5,
                    featureDrift: [
                        {
                            name: 'medical_plan_fields',
                            status: 'green',
                            score: '0.05',
                            method: 'JS',
                        },
                        {
                            name: 'dental_plan_fields',
                            status: 'green',
                            score: '0.03',
                            method: 'JS',
                        },
                        {
                            name: 'vision_plan_fields',
                            status: 'green',
                            score: '0.02',
                            method: 'JS',
                        },
                        {
                            name: 'summary_of_benefits',
                            status: 'green',
                            score: '0.04',
                            method: 'JS',
                        },
                        {
                            name: 'doc_layout_structure',
                            status: 'green',
                            score: '0.06',
                            method: 'KS',
                        },
                    ],
                    dataQuality: {
                        completeness: '99.8%',
                        schemaConformance: '100%',
                        freshnessLag: '12s',
                    },
                    accuracyTrendBars: createScaledBars([
                        95.1, 95.0, 95.1, 95.0, 94.9, 94.8, 94.8, 94.7, 94.7, 94.7, 94.7, 94.7,
                    ]),
                },
            ],
            events: [
                {
                    date: '2026-03-27',
                    text: 'Document Uploader v2: Retrained & deployed (accuracy +0.3%)',
                },
                {
                    date: '2026-02-16',
                    text: 'FIBER AI Assistant v3: Retrained & deployed (accuracy +2.1%)',
                },
                { date: '2026-01-05', text: 'FIBER AI Assistant v3: Retrained — drift recovery' },
            ],
        },
        infraCost: {
            status: 'red',
            monthlyBudget: '$38K',
            metricCards: [
                {
                    label: 'MTD Spend',
                    value: '$45.2K',
                    color: 'red',
                    trend: 'neutral',
                    trendText: 'of $38K budget',
                },
                {
                    label: 'Projected',
                    value: '$64.5K',
                    color: 'red',
                    trend: 'down',
                    trendText: '19% over budget',
                },
                {
                    label: 'Daily Burn',
                    value: '$6,457',
                    color: 'green',
                    trend: 'neutral',
                    trendText: 'Current rolling average',
                },
                {
                    label: 'Budget Used',
                    value: '119%',
                    color: 'red',
                    trend: 'down',
                    trendText: 'Over budget',
                },
            ],
            byCategory: [
                { category: 'Servers', mtd: '$18.9K', pct: 42 },
                { category: 'Database', mtd: '$9.5K', pct: 21 },
                { category: 'Core APIs', mtd: '$7.2K', pct: 16 },
                { category: 'Knowledge Fabric', mtd: '$5.8K', pct: 13 },
                { category: 'Licenses', mtd: '$3.8K', pct: 8 },
            ],
            byDataCenter: [
                { name: 'Dallas', mtd: '$27.1K', pct: 60 },
                { name: 'AWS US', mtd: '$18.1K', pct: 40 },
            ],
            efficiency: {
                costPerUser: '$11.85/mo',
                costPerTransaction: '$0.0042',
                costPerUptimeHour: '$88.12',
            },
            anomalies: [
                {
                    date: 'Apr 5',
                    dailySpend: '$12,890',
                    multiplier: '2.4x',
                    cause: 'Auto-scaling spike during load test',
                },
            ],
            monthlyTrendBars: createScaledBars([32, 33, 35, 34, 36, 38, 39, 41, 40, 42, 42, 45]),
        },
        settings: {
            endpoint: `https://${app.id}.corp.com/ops/feature-health`,
            pollInterval: 60,
            notificationPreferences: [
                {
                    label: 'Perception transitions (G→A, A→R) — Microsoft Teams: US Consulting Ops',
                    checked: true,
                },
                { label: 'Perception RED — PagerDuty escalation', checked: true },
                { label: 'Health transitions — PagerDuty + Microsoft Teams', checked: true },
                { label: 'Perception threshold warnings (approaching AMBER)', checked: false },
                { label: 'Daily perception summary email to app owner', checked: true },
            ],
        },
        maintenanceWindows: [
            {
                date: 'Mar 08',
                time: '02:00 - 04:00',
                desc: 'Database index rebuild',
                status: 'amber',
                statusLabel: 'Scheduled',
                canCancel: true,
            },
            {
                date: 'Mar 05',
                time: '11:30 - 12:00',
                desc: 'Config update deployment',
                status: 'green',
                statusLabel: 'Completed',
                canCancel: false,
            },
        ],
        overviewMetrics: createOverviewMetrics(
            uptimeValue,
            app.perception,
            usersValue,
            incidentCount,
            activeDriftModels,
            errorBudgetRemaining,
            resolveErrorBudgetColor(errorBudgetPct),
            errorBudgetTrendText
        ),
    };

    return clone({
        view,
        people: PEOPLE,
    });
};

export default createDashboardDetailResponse;
