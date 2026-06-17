/* eslint-disable max-lines, max-lines-per-function */
import {
    DashboardDetailTimelineTone,
    HealthSnapshot,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import { PortfolioApp, PortfolioAppContext, PortfolioNode } from '../../models/portfolio.model';

export type DetailTabId =
    | 'overview'
    | 'health'
    | 'perception'
    | 'ai-tokens'
    | 'ai-drift'
    | 'cost'
    | 'incidents'
    | 'contacts'
    | 'settings';

export type IssueType = 'Availability / Outage' | 'Performance / Perception Degradation' | 'Both';

type HeatmapTone = 'g' | 'a' | 'r' | 'x';

export const DETAIL_TABS: ReadonlyArray<{ id: DetailTabId; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'health', label: 'Health' },
    { id: 'perception', label: 'Perception' },
    { id: 'ai-tokens', label: 'AI Tokens' },
    { id: 'ai-drift', label: 'AI Drift' },
    { id: 'cost', label: 'Cost' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'settings', label: 'Settings' },
];

export const ISSUE_TYPES: ReadonlyArray<IssueType> = [
    'Availability / Outage',
    'Performance / Perception Degradation',
    'Both',
];

export const HEALTH_STATUS_LABELS: Record<PortfolioApp['health'], string> = {
    green: 'GREEN',
    amber: 'AMBER',
    red: 'RED',
    undefined: 'UNDEFINED',
};

export const PERCEPTION_STATUS_LABELS: Record<PortfolioApp['perception'], string> = {
    green: 'GREEN',
    amber: 'AMBER',
    red: 'CRITICAL',
    undefined: 'UNDEFINED',
};

const HEADER_HEALTH_LABELS: Record<PortfolioApp['health'], string> = {
    green: 'Healthy',
    amber: 'Degraded',
    red: 'Critical',
    undefined: 'Undefined',
};

const HEADER_PERCEPTION_LABELS: Record<PortfolioApp['perception'], string> = {
    green: 'Experience Stable',
    amber: 'Perception Slow',
    red: 'Perception Critical',
    undefined: 'Perception Undefined',
};

const USERS_TIMELINE = [
    20, 25, 30, 40, 55, 70, 85, 90, 88, 82, 78, 75, 80, 85, 90, 92, 88, 82, 75, 60, 45, 35, 28, 22,
    20, 25, 32, 45, 58, 72, 86, 92, 95, 90, 85, 78, 72, 68, 65, 62, 60, 58, 55, 50, 48, 42, 38, 35,
];

const RESPONSE_LATENCY_SERIES = [
    {
        label: 'P50',
        tone: 'accent',
        values: [
            12, 14, 13, 12, 15, 16, 18, 17, 16, 18, 20, 18, 17, 15, 16, 14, 13, 12, 13, 15, 16, 18,
            17, 15,
        ],
    },
    {
        label: 'P90',
        tone: 'amber',
        values: [
            24, 26, 25, 28, 32, 35, 38, 36, 34, 37, 42, 45, 43, 40, 38, 34, 32, 30, 29, 31, 34, 36,
            35, 32,
        ],
    },
    {
        label: 'P99',
        tone: 'red',
        values: [
            45, 48, 46, 50, 55, 58, 62, 60, 58, 61, 68, 72, 70, 66, 63, 58, 55, 53, 52, 56, 60, 63,
            61, 58,
        ],
    },
] as const;

const ERROR_RATE_VALUES = [
    8, 10, 9, 12, 11, 15, 18, 16, 15, 14, 12, 10, 9, 11, 13, 17, 15, 14, 12, 10, 9, 8, 7, 6,
];

const PERFORMANCE_TREND_SERIES = [
    {
        label: 'Report Generation',
        tone: 'red',
        values: [14, 15, 18, 20, 26, 32, 40, 48, 55, 62, 68, 70],
    },
    {
        label: 'Dashboard Load',
        tone: 'amber',
        values: [8, 9, 10, 12, 15, 18, 20, 22, 24, 23, 22, 21],
    },
    { label: 'Census File Upload', tone: 'green', values: [6, 6, 6, 7, 7, 7, 6, 6, 6, 6, 6, 6] },
] as const;

const TIMELINE_AXIS = ['Feb 27', 'Feb 28', 'Mar 01', 'Mar 02', 'Mar 03', 'Mar 04', 'Mar 05'];

export const cloneCheckedItems = <T extends { checked: boolean }>(items: readonly T[]): T[] =>
    items.map((item) => ({ ...item }));

const createScaledBars = (values: readonly number[]): number[] => {
    const max = Math.max(...values);

    return values.map((value) => Number(Math.max(8, (value / max) * 100).toFixed(1)));
};

const createTimelineBars = (pattern: string): Array<'g' | 'a' | 'r'> =>
    pattern.split('').map((tone) => tone as 'g' | 'a' | 'r');

const HEALTH_STATUS_TONE: Record<string, DashboardDetailTimelineTone> = {
    GREEN: 'g',
    AMBER: 'a',
    RED: 'r',
};

const MONTH_ABBR = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

const MAX_TIMELINE_AXIS_TICKS = 7;

/**
 * Formats a YYYY-MM-DD day key into a compact axis label (e.g. "Jun 10").
 * @param {string} dayKey ISO date prefix (YYYY-MM-DD).
 * @returns {string} Short month/day label.
 */
const formatTimelineAxisLabel = (dayKey: string): string => {
    const [, month, day] = dayKey.split('-');
    return `${MONTH_ABBR[Number(month) - 1] ?? month} ${day}`;
};

/**
 * Picks at most a few evenly spaced items from a chronological list and labels
 * them, so the axis stays readable however many runs there are.
 * @param {readonly T[]} items Chronological items (oldest first).
 * @param {Function} label Maps an item to its axis label.
 * @returns {string[]} Down-sampled axis labels.
 */
const downsampleAxis = <T>(items: readonly T[], label: (item: T) => string): string[] => {
    if (items.length <= MAX_TIMELINE_AXIS_TICKS) {
        return items.map(label);
    }

    const step = (items.length - 1) / (MAX_TIMELINE_AXIS_TICKS - 1);
    return Array.from({ length: MAX_TIMELINE_AXIS_TICKS }, (_, index) =>
        label(items[Math.round(index * step)])
    );
};

/**
 * Lines up the append-only Health series as one bar per Crawler run, oldest to
 * newest, with a matching down-sampled axis. Same-day runs are labelled by time
 * (HH:MM), multi-day series by date. Unknown statuses fall to amber so an
 * unmapped run never paints a false green (PRD FR-3).
 * @param {readonly HealthSnapshot[]} points Health records, any order.
 * @returns {object} Timeline bars and axis labels for the Health row.
 */
export const buildHealthTimeline = (
    points: readonly HealthSnapshot[]
): { bars: DashboardDetailTimelineTone[]; axis: string[] } => {
    const ordered = [...points].sort((left, right) =>
        left.recordedAt.localeCompare(right.recordedAt)
    );

    const bars = ordered.map((point) => HEALTH_STATUS_TONE[point.status] ?? 'a');

    const sameDay =
        ordered.length > 0 &&
        ordered.every(
            (point) => point.recordedAt.slice(0, 10) === ordered[0].recordedAt.slice(0, 10)
        );

    const axis = downsampleAxis(ordered, (point) =>
        sameDay
            ? point.recordedAt.slice(11, 16)
            : formatTimelineAxisLabel(point.recordedAt.slice(0, 10))
    );

    return { bars, axis };
};

const createHeatmapRows = (): Array<{
    label: string;
    cells: Array<{ tone: HeatmapTone; title: string }>;
}> => {
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

const FEATURE_DEFINITIONS: ReadonlyArray<{
    name: string;
    status: PortfolioApp['health'];
    current: string;
    currentMs: number;
    baseline: string;
    baseMs: number;
    delta: string;
    amberMs: number;
    redMs: number;
    critical: boolean;
    timeout: string;
    detail: string;
    spark: readonly number[];
}> = [
    {
        name: 'Report Generation',
        status: 'red',
        current: '47.2s',
        currentMs: 47200,
        baseline: '8.1s',
        baseMs: 8100,
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
        baseMs: 2300,
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
        baseMs: 2900,
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
        baseMs: 300,
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
        baseMs: 800,
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

const createFeatureCards = () =>
    FEATURE_DEFINITIONS.map((feature) => {
        const maxThreshold = feature.redMs * 1.5;
        const markerPct = Number(Math.min(98, (feature.currentMs / maxThreshold) * 100).toFixed(1));
        const amberPct = Number(((feature.amberMs / maxThreshold) * 100).toFixed(1));
        const redPct = Number(((feature.redMs / maxThreshold) * 100).toFixed(1));

        return {
            ...feature,
            sparkHeights: createScaledBars(feature.spark),
            markerPct,
            amberPct,
            redPct,
        };
    });

export const PEOPLE = {
    currentUser: { initials: 'JM', name: 'J. Martinez', role: 'Operations Analyst' },
    onCall: [
        { initials: 'MR', name: 'M. Rivera', role: 'Primary On-Call · SRE' },
        { initials: 'AF', name: 'A. Fernandez', role: 'Secondary On-Call · SRE Lead' },
    ],
    onCallRotation: 'Weekly · Next handoff: Mon Mar 09 09:00 UTC',
    escalation: [
        { initials: 'L1', name: 'L. Chen', role: 'IT Ops Manager' },
        { initials: 'L2', name: 'M. Johansson', role: 'VP Infrastructure' },
        { initials: 'L3', name: 'S. Patel', role: 'CIO' },
    ],
    team: [
        { initials: 'DT', name: 'D. Thompson', role: 'App Owner · Director, CRM Ops' },
        { initials: 'PG', name: 'P. Gupta', role: 'Tech Lead · Sr. Engineer' },
        { initials: 'KW', name: 'K. Williams', role: 'DBA · Database Engineer' },
    ],
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
} as const;

const DETAIL_TEMPLATE = {
    name: 'Mercer FIBER',
    businessUnit: 'US Consulting',
    environment: 'Production',
    tier: 1,
    owner: 'Anton Novikov',
    ownerRole: 'TPM',
    health: 'green' as PortfolioApp['health'],
    healthLabel: HEADER_HEALTH_LABELS.green,
    perception: 'amber' as PortfolioApp['perception'],
    perceptionLabel: HEADER_PERCEPTION_LABELS.amber,
    perceptionScore: 72,
    perceptionSince: '2026-03-05 09:17 UTC',
    perceptionDuration: '5h 43m',
    uptime: { value: '99.99%', trend: 'up' as const, trendText: '▲ 0.02% vs 7d avg' },
    slaTarget: '99.95%',
    errorBudget: {
        remaining: '18 min',
        total: '22 min',
        used: '4 min',
        pct: 82,
        burnRate: '0.6 min/day',
        breach: 'Never (at current rate)',
    },
    activeUsers: { value: '3,812', trend: 'up' as const, trendText: '▲ 12% vs avg', peak: '4,102' },
    openIncidents: { count: 1, trend: 'neutral' as const, trendText: 'Sev-3 · investigating' },
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
        ...series,
        bars: createScaledBars(series.values),
    })),
    errorRateBars: createScaledBars(ERROR_RATE_VALUES),
    performanceTrendSeries: PERFORMANCE_TREND_SERIES.map((series) => ({
        ...series,
        bars: createScaledBars(series.values),
    })),
    features: createFeatureCards(),
    heatmapRows: createHeatmapRows(),
    healthChecks: [
        { name: 'HTTPS Endpoint (beacon.mecer.com/api)', ok: true, time: '142ms' },
        { name: 'Database Connectivity (primary)', ok: true, time: '2ms' },
        { name: 'API Response Time < 2s', ok: true, time: '1.1s' },
        { name: 'Queue Depth < 1000', ok: false, time: '1,247' },
        { name: 'Disk Space > 20%', ok: true, time: '68% free' },
        { name: 'Memory Usage < 85%', ok: true, time: '72%' },
        { name: 'TLS Certificate Valid', ok: true, time: '33 days' },
    ],
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
            color: 'amber' as const,
            text: 'Perception: Report Generation response time at 6x baseline',
        },
        { time: '14:45', color: 'amber' as const, text: 'Perception changed GREEN → AMBER' },
        {
            time: '14:30',
            color: 'accent' as const,
            text: 'Feature health poll completed (5 features)',
        },
        { time: '14:15', color: 'green' as const, text: 'Health check: all 7 checks passing' },
        { time: '14:00', color: 'grey' as const, text: 'User count: 3,812 (peak today: 4,102)' },
        {
            time: '12:00',
            color: 'green' as const,
            text: 'Scheduled maintenance window completed',
        },
        { time: '09:00', color: 'grey' as const, text: 'On-call handoff: M. Rivera → T. Okonkwo' },
    ],
    incidentMetricCards: [
        {
            label: 'Mean Time to Detect',
            value: '4.2 min',
            trend: 'up' as const,
            trendText: '▲ 1.1 min vs Q3 (improved)',
        },
        {
            label: 'Mean Time to Resolve',
            value: '38 min',
            trend: 'down' as const,
            trendText: '▼ 5 min vs Q3 (slower)',
        },
        {
            label: 'Mean Time Between Failures',
            value: '12.4 days',
            trend: 'up' as const,
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
            impact: 'Report generation queue backed up, affecting ~200 finance users',
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
            resolution: 'Certificate renewed via automated pipeline. Verified in all environments.',
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
            rootCause: 'Runaway background job consuming DB connections. Killed and rescheduled.',
            resolution: '',
            timeline: [],
            actions: [],
        },
    ],
    contacts: {
        amsSupport: [
            { label: 'Maintenance', value: 'Managed by AMS (SS)' },
            { label: 'Application Engineering', value: 'Managed by AMS' },
            { label: 'Application Support', value: 'Managed by AMS' },
            { label: 'Database Services', value: 'Managed by AMS' },
            { label: 'IT Controls', value: 'Managed by BU' },
        ],
        escalationPath: 'Undefined',
        team: [
            {
                label: 'Portfolio Owner',
                value: 'Anton Novikov',
                secondary: 'anton.novikov02@marsh.com',
            },
            {
                label: 'Technical Contact',
                value: 'Taylor Okonkwo',
                secondary: 'taylor.okonkwo@marsh.com',
            },
            { label: 'POD Name', value: 'FIBER Core Delivery' },
            {
                label: 'POD Lead',
                value: 'Priya Gupta',
                secondary: 'priya.gupta@marsh.com',
            },
            {
                label: 'IT Owner',
                value: 'Anton Novikov',
                secondary: 'anton.novikov02@marsh.com',
            },
            {
                label: 'Business Owner',
                value: 'Jorie Blackwell',
                secondary: 'Email unavailable',
            },
        ],
    },
    shared: {
        teamsChannel: 'TBD',
        email: 'TBD',
        vendor: 'TBD',
    },
    aiTokens: {
        status: 'amber' as PortfolioApp['health'],
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
                color: 'amber' as const,
                trend: 'neutral' as const,
                trendText: 'of 2.1M budget',
            },
            {
                label: 'Cost MTD',
                value: '$48.72',
                color: 'green' as const,
                trend: 'neutral' as const,
                trendText: '$6.96/day',
            },
            {
                label: 'Projected',
                value: '$208.80',
                color: 'amber' as const,
                trend: 'neutral' as const,
                trendText: 'of $250.00 budget',
            },
            {
                label: 'Requests',
                value: '12,847',
                color: 'green' as const,
                trend: 'neutral' as const,
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
        status: 'amber' as PortfolioApp['health'],
        summary: 'One critical model is approaching retraining threshold.',
        attentionCount: 1,
        models: [
            {
                id: 'fiber-ai-assistant-v3',
                name: 'FIBER AI Assistant v3',
                isCritical: true,
                status: 'amber' as PortfolioApp['health'],
                accuracy: '92.3%',
                baselineAccuracy: '96.1%',
                accuracyDelta: '-3.8%',
                metricType: 'Answer Accuracy',
                psi: '0.18',
                staleDays: '51 days',
                stalenessPct: 85,
                stalenessTone: 'amber' as PortfolioApp['health'],
                lastTrained: '2026-02-15',
                predictionReference: 4.2,
                predictionCurrent: 8.7,
                featureDrift: [
                    {
                        name: 'query_embedding',
                        status: 'red' as PortfolioApp['health'],
                        score: '0.34',
                        method: 'JS',
                    },
                    {
                        name: 'journey_step_dist',
                        status: 'amber' as PortfolioApp['health'],
                        score: '0.22',
                        method: 'JS',
                    },
                    {
                        name: 'report_category',
                        status: 'amber' as PortfolioApp['health'],
                        score: '0.11',
                        method: 'JS',
                    },
                    {
                        name: 'context_window_len',
                        status: 'green' as PortfolioApp['health'],
                        score: '0.08',
                        method: 'KS',
                    },
                    {
                        name: 'retrieval_relevance',
                        status: 'green' as PortfolioApp['health'],
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
                status: 'green' as PortfolioApp['health'],
                accuracy: '94.7%',
                baselineAccuracy: '95.1%',
                accuracyDelta: '-0.4%',
                metricType: 'Extraction Accuracy',
                psi: '0.04',
                staleDays: '12 days',
                stalenessPct: 20,
                stalenessTone: 'green' as PortfolioApp['health'],
                lastTrained: '2026-03-26',
                predictionReference: 4.2,
                predictionCurrent: 4.5,
                featureDrift: [
                    {
                        name: 'medical_plan_fields',
                        status: 'green' as PortfolioApp['health'],
                        score: '0.05',
                        method: 'JS',
                    },
                    {
                        name: 'dental_plan_fields',
                        status: 'green' as PortfolioApp['health'],
                        score: '0.03',
                        method: 'JS',
                    },
                    {
                        name: 'vision_plan_fields',
                        status: 'green' as PortfolioApp['health'],
                        score: '0.02',
                        method: 'JS',
                    },
                    {
                        name: 'summary_of_benefits',
                        status: 'green' as PortfolioApp['health'],
                        score: '0.04',
                        method: 'JS',
                    },
                    {
                        name: 'doc_layout_structure',
                        status: 'green' as PortfolioApp['health'],
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
        status: 'red' as PortfolioApp['health'],
        monthlyBudget: '$38K',
        metricCards: [
            {
                label: 'MTD Spend',
                value: '$45.2K',
                color: 'red' as const,
                trend: 'neutral' as const,
                trendText: 'of $38K budget',
            },
            {
                label: 'Projected',
                value: '$64.5K',
                color: 'red' as const,
                trend: 'down' as const,
                trendText: '19% over budget',
            },
            {
                label: 'Daily Burn',
                value: '$6,457',
                color: 'green' as const,
                trend: 'neutral' as const,
                trendText: 'Current rolling average',
            },
            {
                label: 'Budget Used',
                value: '119%',
                color: 'red' as const,
                trend: 'down' as const,
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
        endpoint: 'https://salesforce.corp.com/ops/feature-health',
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
            status: 'amber' as PortfolioApp['health'],
            statusLabel: 'Scheduled',
            canCancel: true,
        },
        {
            date: 'Mar 05',
            time: '11:30 - 12:00',
            desc: 'Config update deployment',
            status: 'green' as PortfolioApp['health'],
            statusLabel: 'Completed',
            canCancel: false,
        },
    ],
};

export const findAppContext = (
    id: string,
    node: PortfolioNode,
    path: PortfolioNode[] = []
): PortfolioAppContext | null => {
    const matchingApp = (node.apps || []).find((app) => app.id === id);

    if (matchingApp) {
        return {
            app: matchingApp,
            path: [...path, node],
        };
    }

    return (
        (node.children || [])
            .map((child) => findAppContext(id, child, [...path, node]))
            .find((context): context is PortfolioAppContext => context !== null) || null
    );
};

export const createFallbackApp = (id: string): PortfolioApp => ({
    id,
    name: 'Unknown Application',
    health: 'undefined',
    perception: 'undefined',
    uptime: null,
    users: 0,
    totalInternalUsers: 0,
    totalExternalUsers: 0,
    activeUsers: null,
    incidents: 0,
    lastIncident: 'N/A',
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

const resolveTier = (app: PortfolioApp | undefined): number => {
    if (!app) {
        return DETAIL_TEMPLATE.tier;
    }

    return app.uptime !== null && app.uptime >= 99.95 ? 1 : 2;
};

const createOverviewMetrics = (
    uptimeValue: string,
    perception: PortfolioApp['perception'],
    usersValue: string,
    incidentCount: number,
    activeDriftModels: number
) => [
    {
        label: 'Uptime (30d)',
        value: uptimeValue,
        color: 'green' as const,
        trend: DETAIL_TEMPLATE.uptime.trend,
        trendText: DETAIL_TEMPLATE.uptime.trendText,
    },
    {
        label: 'Perception Score',
        value: DETAIL_TEMPLATE.perceptionScore,
        color: perception,
        trend: 'down' as const,
        trendText: '▼ 8 pts from baseline',
    },
    {
        label: 'Active Users',
        value: usersValue,
        color: 'green' as const,
        trend: DETAIL_TEMPLATE.activeUsers.trend,
        trendText: DETAIL_TEMPLATE.activeUsers.trendText,
    },
    {
        label: 'Open Incidents',
        value: incidentCount,
        color: incidentCount > 0 ? 'amber' : 'green',
        trend: 'neutral' as const,
        trendText: buildIncidentTrendText(incidentCount),
    },
    {
        label: 'Error Budget',
        value: DETAIL_TEMPLATE.errorBudget.remaining,
        color: 'green' as const,
        trend: 'neutral' as const,
        trendText: `of ${DETAIL_TEMPLATE.errorBudget.total} remaining`,
    },
    {
        label: 'AI Tokens',
        value: `${DETAIL_TEMPLATE.aiTokens.tokenPct}%`,
        color: DETAIL_TEMPLATE.aiTokens.status,
        trend: 'down' as const,
        trendText: `${DETAIL_TEMPLATE.aiTokens.costMtd} of ${DETAIL_TEMPLATE.aiTokens.costBudget}`,
    },
    {
        label: 'AI Drift',
        value: `${activeDriftModels}/${DETAIL_TEMPLATE.aiDrift.models.length}`,
        color: DETAIL_TEMPLATE.aiDrift.status,
        trend: 'down' as const,
        trendText: activeDriftModels > 0 ? 'Models drifting' : 'All stable',
    },
    {
        label: 'Infra Cost MTD',
        value: '$45.2K',
        color: DETAIL_TEMPLATE.infraCost.status,
        trend: 'down' as const,
        trendText: '▲ 8.1% vs last month',
    },
];

export const createDetailView = (context: PortfolioAppContext | null) => {
    const app = context?.app;
    const scope = context?.path[context.path.length - 1];
    const health = app?.health || DETAIL_TEMPLATE.health;
    const perception = app?.perception || DETAIL_TEMPLATE.perception;
    const usersValue =
        app?.activeUsers !== null && app?.activeUsers !== undefined
            ? app.activeUsers.toLocaleString()
            : 'Undefined';
    const incidentCount = app?.incidents ?? DETAIL_TEMPLATE.openIncidents.count;
    const uptimeValue =
        app?.uptime !== null && app?.uptime !== undefined ? `${app.uptime.toFixed(2)}%` : 'Undefined';
    const activeDriftModels = DETAIL_TEMPLATE.aiDrift.models.filter(
        (model) => model.status !== 'green'
    ).length;

    return {
        ...DETAIL_TEMPLATE,
        name: app?.name || DETAIL_TEMPLATE.name,
        businessUnit: scope?.name || DETAIL_TEMPLATE.businessUnit,
        owner: scope?.owner || DETAIL_TEMPLATE.owner,
        ownerRole: scope?.role || DETAIL_TEMPLATE.ownerRole,
        tier: resolveTier(app),
        health,
        healthLabel: HEADER_HEALTH_LABELS[health],
        perception,
        perceptionLabel: HEADER_PERCEPTION_LABELS[perception],
        uptime: {
            ...DETAIL_TEMPLATE.uptime,
            value: uptimeValue,
        },
        activeUsers: {
            ...DETAIL_TEMPLATE.activeUsers,
            value: usersValue,
        },
        openIncidents: {
            ...DETAIL_TEMPLATE.openIncidents,
            count: incidentCount,
            trendText: buildIncidentTrendText(incidentCount),
        },
        aiDrift: {
            ...DETAIL_TEMPLATE.aiDrift,
            attentionCount: activeDriftModels,
        },
        overviewMetrics: createOverviewMetrics(
            uptimeValue,
            perception,
            usersValue,
            incidentCount,
            activeDriftModels
        ),
    };
};

export type DetailViewModel = ReturnType<typeof createDetailView>;
