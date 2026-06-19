import { HealthSnapshot } from '@operational-dashboard/shared-api-model/model/dashboard';

import InMemoryHealthSnapshotRepository from './in-memory-health-snapshot.repository';

const snap = (over: Partial<HealthSnapshot>): HealthSnapshot => ({
    applicationId: 'app-1',
    status: 'GREEN',
    uptimePct: 99.9,
    datadogMapped: true,
    monitorCount: 3,
    resolutionPath: 'primary',
    recordedAt: '2026-06-14T00:00:00.000Z',
    ...over,
});

describe('InMemoryHealthSnapshotRepository', () => {
    it('returns the most recent snapshots first, windowed by limit, scoped to the app', async () => {
        const repo = new InMemoryHealthSnapshotRepository();
        await repo.insertSnapshot(
            snap({ recordedAt: '2026-06-14T00:00:00.000Z', status: 'GREEN' })
        );
        await repo.insertSnapshot(
            snap({ recordedAt: '2026-06-14T00:05:00.000Z', status: 'AMBER' })
        );
        await repo.insertSnapshot(snap({ recordedAt: '2026-06-14T00:10:00.000Z', status: 'RED' }));
        await repo.insertSnapshot(
            snap({ applicationId: 'other-app', recordedAt: '2026-06-14T09:00:00.000Z' })
        );

        const recent = await repo.findRecentByApplicationId('app-1', 2);

        expect(recent).toHaveLength(2);
        expect(recent[0].status).toBe('RED'); // newest
        expect(recent[1].status).toBe('AMBER');
        expect(recent.every((s) => s.applicationId === 'app-1')).toBe(true);
    });

    it('returns an empty array for an unknown application', async () => {
        const repo = new InMemoryHealthSnapshotRepository();
        expect(await repo.findRecentByApplicationId('nope', 10)).toEqual([]);
    });
});
