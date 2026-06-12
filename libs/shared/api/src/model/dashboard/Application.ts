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
}
