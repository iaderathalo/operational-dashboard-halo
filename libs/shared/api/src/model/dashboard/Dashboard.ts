import { ApplicationStatus } from './Application';

export interface DashboardSummary {
    totalApplications: number;
    greenCount: number;
    amberCount: number;
    redCount: number;
    totalActiveUsers: number;
    overallUptime30d: number;
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

export interface HealthStatusRecord {
    id?: string;
    applicationId: string;
    status: ApplicationStatus;
    reason: string;
    source: 'AUTOMATIC' | 'MANUAL_OVERRIDE';
    recordedAt: string;
    metadata?: Record<string, unknown>;
}
