import { Injectable } from '@nestjs/common';

import { HealthSnapshot } from '@operational-dashboard/shared-api-model/model/dashboard';

import { HealthSnapshotRepository } from '../health-snapshot.repository';

@Injectable()
export default class InMemoryHealthSnapshotRepository implements HealthSnapshotRepository {
    private snapshots: HealthSnapshot[] = [];

    /**
     *
     * @param snapshot
     */
    async insertSnapshot(snapshot: HealthSnapshot): Promise<void> {
        this.snapshots.push({ ...snapshot });
    }

    /**
     *
     * @param applicationId
     * @param limit
     */
    async findRecentByApplicationId(
        applicationId: string,
        limit: number
    ): Promise<HealthSnapshot[]> {
        return this.snapshots
            .filter((s) => s.applicationId === applicationId)
            .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)) // ISO strings sort chronologically
            .slice(0, limit);
    }
}
