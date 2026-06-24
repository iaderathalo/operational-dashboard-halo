export type ApplicationStatus = 'GREEN' | 'AMBER' | 'RED';
export type ApplicationEnvironment = 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';

/**
 * Per-monitor drill-down for an Application (#2). One entry per Datadog monitor the
 * Crawler resolved for the app — the "why" behind the rolled-up Health status.
 */
export interface ApplicationMonitor {
    id: number;
    name: string;
    status: ApplicationStatus;
    message: string;
    lastTriggeredAt: string | null;
    inMaintenance: boolean;
}

/**
 * One Datadog Synthetic test resolved for an Application (12-4 Health Check Breakdown).
 * Persisted on the app doc by the Crawler, like {@link ApplicationMonitor}.
 */
export interface ApplicationSyntheticCheck {
    publicId: string;
    name: string;
    /** Test kind: `api` | `browser` | `mobile`. */
    type: string;
    /** Lifecycle: `live` | `paused`. */
    status: string;
    /** 30-day synthetic uptime %, or null when the window has no data (paused / errored). */
    uptime: number | null;
}

export interface StatusOverride {
    status: ApplicationStatus;
    overriddenBy: string;
    reason: string;
    overriddenAt: string;
}

export default interface Application {
    id?: string;
    name: string;
    shortCode: string;
    description: string;
    environment: ApplicationEnvironment;
    tier: 1 | 2 | 3 | 4;
    businessUnit: string;
    currentStatus: ApplicationStatus;
    currentUserCount: number;
    monitoringSource: string;
    teamId: string;
    statusOverride?: StatusOverride;
    createdAt?: string;
    updatedAt?: string;

    // Datadog resolution identifiers + Health fields written by the Crawler.
    datadogServiceId?: string;
    datadogNamespace?: string;
    datadogAppName?: string;
    serviceNowKey?: string | null;
    healthStatus?: ApplicationStatus;
    datadogMapped?: boolean;
    uptime24h?: number | null;
    uptime7d?: number | null;
    uptime30d?: number | null;
    slaTarget?: number | null;
    errorBudgetRemainingPct?: number | null;
    lastSyncAt?: string | null;
    lastSyncStatus?: 'ok' | 'error' | 'unmapped' | null;
    resolutionPath?: 'primary' | 'fallback' | 'unmapped' | null;
    monitors?: ApplicationMonitor[];
    syntheticChecks?: ApplicationSyntheticCheck[];
}
