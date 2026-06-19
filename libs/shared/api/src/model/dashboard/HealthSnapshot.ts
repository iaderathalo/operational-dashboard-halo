import { ApplicationStatus } from './Application';

/**
 * One point-in-time Health record for an Application, written by the Crawler on
 * each run. The detail view renders a sequence of these as the Health Timeline
 * (PRD FR-3). The collection is append-only and never seeded.
 */
export default interface HealthSnapshot {
    id?: string;
    applicationId: string;
    status: ApplicationStatus;
    uptimePct: number | null;
    datadogMapped: boolean;
    monitorCount: number;
    resolutionPath: 'primary' | 'fallback' | 'unmapped';
    recordedAt: string; // ISO timestamp of the Crawler run that produced this record
}

/**
 * Response for the Health Timeline endpoint (PRD FR-3): the raw append-only
 * series for one Application, newest first. The view layer buckets these into
 * timeline bars — the server stays presentation-agnostic and only serves the
 * series the Crawler recorded.
 */
export interface HealthHistoryResponse {
    applicationId: string;
    points: HealthSnapshot[];
}
