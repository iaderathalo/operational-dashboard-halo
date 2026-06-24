import { ApplicationMonitor } from '@operational-dashboard/shared-api-model/model/dashboard';

/**
 * 11-1: aggregate risk roll-up carried by every tree node (root/OpCo/BU/LOB),
 * derived from descendant apps. Percentages are null when appCount is 0 so an
 * empty node never reads as a fabricated 0% (two-state missing-data model, 5-6).
 */
export interface PortfolioNodeRollup {
    appCount: number;
    healthyPct: number | null;
    coveragePct: number | null;
    sloPassingPct: number | null;
    avgMaturity: number | null;
    /** 11-2: number of apps whose burn rate is fast-burn or at-risk (rate >= 1). */
    fastBurnCount: number;
}

export interface PortfolioNode {
    id: string;
    name: string;
    role: string;
    owner: string;
    children: PortfolioNode[];
    apps: PortfolioApp[];
    rollup?: PortfolioNodeRollup; // 11-1
}

export interface PortfolioAppAmsSupport {
    maintenance?: string | null;
    applicationEngineering?: string | null;
    applicationSupport?: string | null;
    databaseServices?: string | null;
    itControls?: string | null;
}

/**
 * 11-2: burn-rate band — healthy (<1.0), fast-burn (1.0–2.0), at-risk (>2.0),
 * or unknown when SLO inputs are missing (never a false GREEN).
 */
export type BurnRateBand = 'healthy' | 'fast-burn' | 'at-risk' | 'unknown';

export interface AppBurnRate {
    /** Unitless burn rate over the 30d window, or null when SLO inputs are missing. */
    rate: number | null;
    band: BurnRateBand;
}

/** 7-2: maturity scorecard payload — score out of max with the component signals. */
export interface MaturityScore {
    score: number;
    max: number;
    signals: Record<string, boolean>;
}

/** 12-4: one synthetic health check (Datadog Synthetics) resolved for the app. */
export interface PortfolioSyntheticCheck {
    name: string;
    /** Test kind: `api` | `browser` | `mobile`. */
    type: string;
    /** Lifecycle: `live` | `paused`. */
    status: string;
    /** 30-day synthetic uptime %, or null when the window has no data (paused / errored). */
    uptime: number | null;
}

export interface PortfolioApp {
    id: string;
    name: string;
    health: 'green' | 'amber' | 'red' | 'undefined';
    perception: 'green' | 'amber' | 'red' | 'undefined';
    uptime: number | null;
    errorBudgetRemainingPct?: number | null;
    slaTarget?: number | null;
    burnRate?: AppBurnRate; // 11-2
    maturity?: MaturityScore; // 7-2
    datadogMapped?: boolean;
    resolutionPath?: 'primary' | 'fallback' | 'unmapped' | null;
    lastSyncStatus?: 'ok' | 'error' | 'unmapped' | null;
    lastSyncAt?: string | null;
    monitors?: ApplicationMonitor[];
    syntheticChecks?: PortfolioSyntheticCheck[]; // 12-4
    users: number;
    totalInternalUsers: number;
    totalExternalUsers: number;
    activeUsers: number | null;
    incidents: number;
    lastIncident: string;
    amsSupport?: PortfolioAppAmsSupport;
    portfolioOwnerName?: string | null;
    portfolioOwnerEmail?: string | null;
    technicalContact?: string | null;
    technicalContactEmail?: string | null;
    podName?: string | null;
    podLead?: string | null;
    podLeadEmail?: string | null;
    itOwner?: string | null;
    itOwnerEmail?: string | null;
    businessOwner?: string | null;
    businessOwnerEmail?: string | null;
}

export interface PortfolioAppContext {
    app: PortfolioApp;
    path: PortfolioNode[];
}
