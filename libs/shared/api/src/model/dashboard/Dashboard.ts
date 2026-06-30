import { ApplicationStatus } from './Application';

export interface DashboardSummary {
    totalApplications: number;
    greenCount: number;
    amberCount: number;
    redCount: number;
    totalActiveUsers: number;
    overallUptime30d: number;
}

/**
 * 11-4: aggregate risk roll-up over a set of apps, shared by the digest. Same shape
 * as the API-side PortfolioNodeRollup so the digest reads node-level roll-ups directly.
 * Percentages are null for an empty set so it never reads as a fabricated 0% (5-6).
 */
export interface PortfolioRollup {
    appCount: number;
    healthyPct: number | null;
    coveragePct: number | null;
    sloPassingPct: number | null;
    avgMaturity: number | null;
    fastBurnCount: number;
}

/**
 * 11-4: data-freshness stamp shared by digest + snapshot. `ok` is false when ANY
 *  app's last sync errored (egress blocker 5-8) so stale data is never shown as current.
 */
export interface DigestFreshness {
    ok: boolean;
    failedCount: number;
    lastSyncAt: string | null;
    note: string | null;
}

/** 11-4: one "top mover" row — week-over-week change in a tracked metric. */
export interface DigestMover {
    appId: string;
    name: string;
    metric: 'health' | 'coverage' | 'maturity';
    from: number | null;
    to: number | null;
    delta: number;
}

/**
 * 11-4: executive weekly digest, derived purely from stored data — no new Datadog
 *  call. priorPeriod is null until week-over-week history accrues; movers is then
 *  empty and `note` says so honestly (AC#5).
 */
export interface DigestSummary {
    generatedAt: string;
    scope: 'all' | 'mine';
    rollup: PortfolioRollup;
    freshness: DigestFreshness;
    priorPeriod: string | null;
    movers: DigestMover[];
    newRisks: { appId: string; name: string; reason: string }[];
    note: string | null;
}

/**
 * 11-4: read-only, forwardable snapshot metadata. Carries the freshness stamp and
 *  the scope it was taken under, so a `mine` snapshot is self-describing (AC#3).
 */
export interface SnapshotMetadata {
    generatedAt: string;
    scope: 'all' | 'mine';
    freshness: DigestFreshness;
    appCount: number;
}

export interface UptimeMetrics {
    applicationId: string;
    uptime24h: number;
    uptime7d: number;
    uptime30d: number;
    uptime90d: number;
}

export interface UserSessionMetric {
    id?: string;
    applicationId: string;
    measuredAt: string;
    activeUserCount: number;
    source: string;
}

/** Rich projection returned by the dashboard portfolio search endpoint. */
export interface PortfolioSearchResult {
    id: string;
    name: string;
    shortCode: string;
    health: 'green' | 'amber' | 'red' | 'undefined';
    opCo: string;
    businessUnit: string;
    lob: string;
}

export interface HealthStatusRecord {
    id?: string;
    applicationId: string;
    status: ApplicationStatus;
    reason: string;
    source: 'AUTOMATIC' | 'MANUAL_OVERRIDE';
    recordedAt: string;
    metadata?: Record<string, unknown>;
}
