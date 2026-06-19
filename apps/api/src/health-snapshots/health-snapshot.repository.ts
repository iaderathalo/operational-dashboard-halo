import { HealthSnapshot } from '@operational-dashboard/shared-api-model/model/dashboard';

export interface HealthSnapshotRepository {
    /** Append one Health record (one per Application per Crawler run). */
    insertSnapshot(snapshot: HealthSnapshot): Promise<void>;

    /** Most recent N records for an Application, newest first. */
    findRecentByApplicationId(applicationId: string, limit: number): Promise<HealthSnapshot[]>;
}
