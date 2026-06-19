import { HealthSnapshot } from '@operational-dashboard/shared-api-model/model/dashboard';

import { buildHealthTimeline } from './detail-page.data';

const snapshot = (recordedAt: string, status: HealthSnapshot['status']): HealthSnapshot => ({
    applicationId: 'app-1',
    status,
    uptimePct: null,
    datadogMapped: true,
    monitorCount: 1,
    resolutionPath: 'primary',
    recordedAt,
});

describe('buildHealthTimeline', () => {
    it('returns empty bars and axis for an empty series', () => {
        expect(buildHealthTimeline([])).toEqual({ bars: [], axis: [] });
    });

    it('emits one bar per run, oldest to newest, labelling same-day runs by time', () => {
        const { bars, axis } = buildHealthTimeline([
            snapshot('2026-06-16T16:17:00.000Z', 'AMBER'),
            snapshot('2026-06-16T15:53:00.000Z', 'GREEN'),
            snapshot('2026-06-16T17:36:00.000Z', 'RED'),
        ]);

        expect(bars).toEqual(['g', 'a', 'r']);
        expect(axis).toEqual(['15:53', '16:17', '17:36']);
    });

    it('labels a multi-day series by date', () => {
        const { bars, axis } = buildHealthTimeline([
            snapshot('2026-06-16T09:00:00.000Z', 'RED'),
            snapshot('2026-06-14T09:00:00.000Z', 'GREEN'),
            snapshot('2026-06-15T09:00:00.000Z', 'AMBER'),
        ]);

        expect(bars).toEqual(['g', 'a', 'r']);
        expect(axis).toEqual(['Jun 14', 'Jun 15', 'Jun 16']);
    });

    it('down-samples the axis to at most seven ticks while keeping every bar', () => {
        const points = Array.from({ length: 30 }, (_, index) => {
            const day = String(index + 1).padStart(2, '0');
            return snapshot(`2026-05-${day}T09:00:00.000Z`, 'GREEN');
        });

        const { bars, axis } = buildHealthTimeline(points);

        expect(bars).toHaveLength(30);
        expect(axis).toHaveLength(7);
        expect(axis[0]).toBe('May 01');
        expect(axis[axis.length - 1]).toBe('May 30');
    });
});
