export type ApplicationStatus = 'GREEN' | 'AMBER' | 'RED';
export type ApplicationEnvironment = 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';

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
}
