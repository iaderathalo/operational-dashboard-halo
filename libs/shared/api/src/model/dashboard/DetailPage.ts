/* eslint-disable max-lines */
export type DashboardDetailStatus = 'green' | 'amber' | 'red' | 'undefined';
export type DashboardDetailTrend = 'up' | 'down' | 'neutral';
export type DashboardDetailTimelineTone = 'g' | 'a' | 'r';
export type DashboardDetailHeatmapTone = 'g' | 'a' | 'r' | 'x';
export type DashboardDetailSeriesTone = 'accent' | 'amber' | 'red' | 'green';
export type DashboardDetailActivityTone = 'accent' | 'amber' | 'green' | 'grey' | 'red';

/** Where a metric/card actually comes from, for the live-vs-placeholder cue. */
export type DashboardDetailSource = 'datadog' | 'planview' | 'placeholder';

export interface DashboardDetailMetricCard {
    label: string;
    value: string | number;
    color: DashboardDetailStatus;
    trend: DashboardDetailTrend;
    trendText: string;
    source?: DashboardDetailSource;
}

export interface DashboardDetailTimelineIncident {
    sev: number;
    pos: string;
    color: string;
    title: string;
}

export interface DashboardDetailFeature {
    name: string;
    status: DashboardDetailStatus;
    current: string;
    baseline: string;
    delta: string;
    amberMs: number;
    redMs: number;
    critical: boolean;
    timeout: string;
    detail: string;
    sparkHeights: number[];
    markerPct: number;
    amberPct: number;
    redPct: number;
}

export interface DashboardDetailActivityItem {
    time: string;
    color: DashboardDetailActivityTone;
    text: string;
}

export interface DashboardDetailRangeTimeline {
    label: string;
    bars: DashboardDetailTimelineTone[];
}

export interface DashboardDetailValueTrend {
    value: string;
    trend: DashboardDetailTrend;
    trendText: string;
}

export interface DashboardDetailErrorBudget {
    remaining: string;
    total: string;
    used: string;
    pct: number;
    burnRate: string;
    breach: string;
}

export interface DashboardDetailActiveUsers extends DashboardDetailValueTrend {
    peak: string;
}

export interface DashboardDetailOpenIncidents {
    count: number;
    trend: DashboardDetailTrend;
    trendText: string;
}

export interface DashboardDetailLatencySeries {
    label: string;
    tone: Extract<DashboardDetailSeriesTone, 'accent' | 'amber' | 'red'>;
    bars: number[];
}

export interface DashboardDetailPerformanceSeries {
    label: string;
    tone: Extract<DashboardDetailSeriesTone, 'green' | 'amber' | 'red'>;
    bars: number[];
}

export interface DashboardDetailHeatmapCell {
    tone: DashboardDetailHeatmapTone;
    title: string;
}

export interface DashboardDetailHeatmapRow {
    label: string;
    cells: DashboardDetailHeatmapCell[];
}

export interface DashboardDetailHealthCheck {
    name: string;
    ok: boolean;
    time: string;
}

export interface DashboardDetailMonitor {
    name: string;
    status: DashboardDetailStatus;
    message: string;
    lastTriggered: string;
    inMaintenance: boolean;
}

export interface DashboardDetailHealthEvent {
    time: string;
    event: string;
    fromLabel: string;
    toLabel: string;
    source: string;
    duration: string;
}

export interface DashboardDetailIncidentTimelineItem {
    time: string;
    text: string;
}

export interface DashboardDetailIncidentEntry {
    dateHeader: string;
    sev: number;
    title: string;
    status: string;
    meta: string;
    impact: string;
    rootCause: string;
    resolution: string;
    timeline: DashboardDetailIncidentTimelineItem[];
    actions: string[];
}

export interface DashboardDetailPersonCard {
    initials: string;
    name: string;
    role: string;
}

export interface DashboardDetailContactEntry {
    label: string;
    value: string;
    secondary?: string;
}

export interface DashboardDetailContacts {
    amsSupport: DashboardDetailContactEntry[];
    escalationPath: string;
    team: DashboardDetailContactEntry[];
}

export interface DashboardDetailSharedContacts {
    teamsChannel: string;
    email: string;
    vendor: string;
}

export interface DashboardDetailTokenBreakdown {
    name: string;
    tokens: string;
    requests: number;
    cost: string;
}

export interface DashboardDetailTokenAnomaly {
    date: string;
    tokens: string;
    multiplier: string;
    cause: string;
}

export interface DashboardDetailAiTokens {
    status: DashboardDetailStatus;
    provider: string;
    model: string;
    periodLabel: string;
    daysElapsed: number;
    daysTotal: number;
    tokenPct: number;
    costMtd: string;
    costBudget: string;
    inputTokens: string;
    outputTokens: string;
    metricCards: DashboardDetailMetricCard[];
    byModel: DashboardDetailTokenBreakdown[];
    byFeature: DashboardDetailTokenBreakdown[];
    anomalies: DashboardDetailTokenAnomaly[];
    dailyTokenBars: number[];
}

export interface DashboardDetailAiDriftFeature {
    name: string;
    status: DashboardDetailStatus;
    score: string;
    method: string;
}

export interface DashboardDetailAiDriftDataQuality {
    completeness: string;
    schemaConformance: string;
    freshnessLag: string;
}

export interface DashboardDetailAiDriftModel {
    id: string;
    name: string;
    isCritical: boolean;
    status: DashboardDetailStatus;
    accuracy: string;
    baselineAccuracy: string;
    accuracyDelta: string;
    metricType: string;
    psi: string;
    staleDays: string;
    stalenessPct: number;
    stalenessTone: DashboardDetailStatus;
    lastTrained: string;
    predictionReference: number;
    predictionCurrent: number;
    featureDrift: DashboardDetailAiDriftFeature[];
    dataQuality: DashboardDetailAiDriftDataQuality;
    accuracyTrendBars: number[];
}

export interface DashboardDetailAiDriftEvent {
    date: string;
    text: string;
}

export interface DashboardDetailAiDrift {
    status: DashboardDetailStatus;
    summary: string;
    attentionCount: number;
    models: DashboardDetailAiDriftModel[];
    events: DashboardDetailAiDriftEvent[];
}

export interface DashboardDetailCostCategory {
    category: string;
    mtd: string;
    pct: number;
}

export interface DashboardDetailDataCenterCost {
    name: string;
    mtd: string;
    pct: number;
}

export interface DashboardDetailCostEfficiency {
    costPerUser: string;
    costPerTransaction: string;
    costPerUptimeHour: string;
}

export interface DashboardDetailCostAnomaly {
    date: string;
    dailySpend: string;
    multiplier: string;
    cause: string;
}

export interface DashboardDetailInfraCost {
    status: DashboardDetailStatus;
    monthlyBudget: string;
    metricCards: DashboardDetailMetricCard[];
    byCategory: DashboardDetailCostCategory[];
    byDataCenter: DashboardDetailDataCenterCost[];
    efficiency: DashboardDetailCostEfficiency;
    anomalies: DashboardDetailCostAnomaly[];
    monthlyTrendBars: number[];
}

export interface DashboardDetailNotificationPreference {
    label: string;
    checked: boolean;
}

export interface DashboardDetailSettings {
    endpoint: string;
    pollInterval: number;
    notificationPreferences: DashboardDetailNotificationPreference[];
}

export interface DashboardDetailMaintenanceWindow {
    date: string;
    time: string;
    desc: string;
    status: DashboardDetailStatus;
    statusLabel: string;
    canCancel: boolean;
}

export interface DashboardDetailView {
    name: string;
    businessUnit: string;
    environment: string;
    tier: number;
    owner: string;
    ownerRole: string;
    health: DashboardDetailStatus;
    healthLabel: string;
    perception: DashboardDetailStatus;
    perceptionLabel: string;
    perceptionScore: number;
    perceptionSince: string;
    perceptionDuration: string;
    uptime: DashboardDetailValueTrend;
    slaTarget: string;
    errorBudget: DashboardDetailErrorBudget;
    activeUsers: DashboardDetailActiveUsers;
    openIncidents: DashboardDetailOpenIncidents;
    timelineAxis: string[];
    timelineIncidents: DashboardDetailTimelineIncident[];
    healthTimelineBars: DashboardDetailTimelineTone[];
    perceptionTimelineBars: DashboardDetailTimelineTone[];
    healthRangeTimelines: DashboardDetailRangeTimeline[];
    userTimelineBars: number[];
    responseLatencySeries: DashboardDetailLatencySeries[];
    errorRateBars: number[];
    performanceTrendSeries: DashboardDetailPerformanceSeries[];
    features: DashboardDetailFeature[];
    heatmapRows: DashboardDetailHeatmapRow[];
    healthChecks: DashboardDetailHealthCheck[];
    monitors: DashboardDetailMonitor[];
    healthEvents: DashboardDetailHealthEvent[];
    activityLog: DashboardDetailActivityItem[];
    incidentMetricCards: DashboardDetailMetricCard[];
    incidents: DashboardDetailIncidentEntry[];
    contacts: DashboardDetailContacts;
    shared: DashboardDetailSharedContacts;
    aiTokens: DashboardDetailAiTokens;
    aiDrift: DashboardDetailAiDrift;
    infraCost: DashboardDetailInfraCost;
    settings: DashboardDetailSettings;
    maintenanceWindows: DashboardDetailMaintenanceWindow[];
    overviewMetrics: DashboardDetailMetricCard[];
}

export interface DashboardDetailCurrentUser {
    email: string;
    initials: string;
    name: string;
    role: string;
}

export interface DashboardDetailNotifyOption {
    name: string;
    role: string;
    checked: boolean;
}

export interface DashboardDetailChannelOption {
    label: string;
    checked: boolean;
}

export interface DashboardDetailPeople {
    currentUser: DashboardDetailCurrentUser;
    sev1Notify: DashboardDetailNotifyOption[];
    sev1Channels: DashboardDetailChannelOption[];
}

export default interface DashboardDetailResponse {
    view: DashboardDetailView;
    people: DashboardDetailPeople;
}