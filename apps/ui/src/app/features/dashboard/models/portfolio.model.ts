export interface PortfolioNode {
    id: string;
    name: string;
    role: string;
    owner: string;
    children: PortfolioNode[];
    apps: PortfolioApp[];
    rollup?: PortfolioRollup; // 11-1
}

export interface PortfolioApp {
    id: string;
    name: string;
    health: 'green' | 'amber' | 'red' | 'undefined';
    perception: 'green' | 'amber' | 'red' | 'undefined';
    uptime: number | null;
    slaTarget?: number | null;
    errorBudgetRemainingPct?: number | null;
    datadogMapped?: boolean;
    resolutionPath?: 'primary' | 'fallback' | 'unmapped' | null;
    lastSyncStatus?: 'ok' | 'error' | 'unmapped' | null;
    lastSyncAt?: string | null;
    users: number;
    totalInternalUsers: number;
    totalExternalUsers: number;
    activeUsers: number | null;
    incidents: number;
    lastIncident: string;
    maturity?: AppMaturity;
    burnRate?: AppBurnRate; // 11-2
}

export interface AppMaturity {
    score: number;
    max: number;
    signals: {
        mapped: boolean;
        hasMonitor: boolean;
        hasSLO: boolean;
        sloPassing: boolean;
        hasOwner: boolean;
    };
}

/**
 * 11-1: aggregate risk roll-up over a node's descendant apps. Percentages are null
 * when appCount is 0 so an empty node never reads as a fabricated 0%.
 */
export interface PortfolioRollup {
    appCount: number;
    healthyPct: number | null;
    coveragePct: number | null;
    sloPassingPct: number | null;
    avgMaturity: number | null;
    fastBurnCount: number;
}

/** 11-2: burn-rate band — healthy (<1.0), fast-burn (1.0–2.0), at-risk (>2.0), unknown. */
export type BurnRateBand = 'healthy' | 'fast-burn' | 'at-risk' | 'unknown';

export interface AppBurnRate {
    rate: number | null;
    band: BurnRateBand;
}

/** 11-4: data-freshness stamp shared by digest + shareable snapshot. */
export interface DigestFreshness {
    ok: boolean;
    failedCount: number;
    lastSyncAt: string | null;
    note: string | null;
}

/** 11-4: metadata describing a read-only shareable snapshot. */
export interface SnapshotMetadata {
    generatedAt: string;
    scope: 'all' | 'mine';
    freshness: DigestFreshness;
    appCount: number;
}

/** 11-4: a forwardable, read-only snapshot of the portfolio plus its freshness stamp. */
export interface PortfolioSnapshot {
    portfolio: PortfolioNode;
    metadata: SnapshotMetadata;
}

export interface PortfolioAppContext {
    app: PortfolioApp;
    path: PortfolioNode[];
}

export interface StatusCounts {
    green: number;
    amber: number;
    red: number;
    undefined: number;
}
