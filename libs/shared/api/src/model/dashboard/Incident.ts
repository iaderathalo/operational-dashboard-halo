export type IncidentSeverity = 'SEV_1' | 'SEV_2' | 'SEV_3';
export type IncidentStatus =
    | 'OPEN'
    | 'ACKNOWLEDGED'
    | 'INVESTIGATING'
    | 'MITIGATED'
    | 'RESOLVED'
    | 'CLOSED';
export type BusinessImpactLevel = 'CRITICAL' | 'HIGH' | 'SIGNIFICANT';

export default interface Incident {
    id?: string;
    incidentNumber: string;
    applicationId: string;
    severity: IncidentSeverity;
    title: string;
    description: string;
    status: IncidentStatus;
    businessImpactLevel: BusinessImpactLevel;
    estimatedUsersImpacted: number;
    reportedBy: string;
    assignedTo?: string;
    openedAt: string;
    resolvedAt?: string;
    impactSummary?: string;
}

export interface IncidentUpdate {
    id?: string;
    incidentId: string;
    authorId: string;
    message: string;
    statusChange?: string;
    createdAt?: string;
}

export interface CreateIncidentRequest {
    applicationId: string;
    severity: IncidentSeverity;
    title: string;
    description: string;
    businessImpactLevel: BusinessImpactLevel;
    estimatedUsersImpacted: number;
    reportedBy: string;
}
