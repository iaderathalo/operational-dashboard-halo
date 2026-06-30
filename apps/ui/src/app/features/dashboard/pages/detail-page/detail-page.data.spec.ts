import { HealthSnapshot } from '@operational-dashboard/shared-api-model/model/dashboard';

import {
    buildActivityFeed,
    buildHealthEvents,
    buildHealthTimeline,
    createDetailView,
    createFallbackApp,
} from './detail-page.data';
import { PortfolioAppContext } from '../../models/portfolio.model';

const snapshot = (
    recordedAt: string,
    status: HealthSnapshot['status'],
    overrides: Partial<HealthSnapshot> = {}
): HealthSnapshot => ({
    applicationId: 'app-1',
    status,
    uptimePct: null,
    datadogMapped: true,
    monitorCount: 1,
    resolutionPath: 'primary',
    recordedAt,
    ...overrides,
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

describe('buildHealthEvents', () => {
    it('returns no events for an empty series', () => {
        expect(buildHealthEvents([])).toEqual([]);
    });

    it('emits one event per status change, newest first', () => {
        const events = buildHealthEvents([
            snapshot('2026-06-16T09:00:00.000Z', 'GREEN'),
            snapshot('2026-06-16T10:00:00.000Z', 'AMBER'),
            snapshot('2026-06-16T12:00:00.000Z', 'RED'),
        ]);

        expect(events).toHaveLength(2);
        expect(events[0]).toMatchObject({ fromLabel: 'Amber', toLabel: 'Red' });
        expect(events[1]).toMatchObject({ fromLabel: 'Green', toLabel: 'Amber' });
        expect(events[0].source).toBe('Datadog');
        expect(events[1].duration).toBe('1h');
    });

    it('produces no rows when the status never changes', () => {
        const events = buildHealthEvents([
            snapshot('2026-06-16T09:00:00.000Z', 'GREEN'),
            snapshot('2026-06-16T10:00:00.000Z', 'GREEN'),
            snapshot('2026-06-16T11:00:00.000Z', 'GREEN'),
        ]);

        expect(events).toEqual([]);
    });

    it('never labels an unknown status Green', () => {
        const events = buildHealthEvents([
            snapshot('2026-06-16T09:00:00.000Z', 'GREEN'),
            snapshot('2026-06-16T10:00:00.000Z', 'UNKNOWN' as unknown as HealthSnapshot['status']),
        ]);

        expect(events[0].toLabel).toBe('Amber');
    });
});

describe('buildActivityFeed', () => {
    it('returns an empty feed for an empty series', () => {
        expect(buildActivityFeed([])).toEqual([]);
    });

    it('includes the latest sync run for a single-snapshot series', () => {
        const feed = buildActivityFeed([snapshot('2026-06-16T09:00:00.000Z', 'GREEN')]);

        expect(feed).toHaveLength(1);
        expect(feed[0].color).toBe('grey');
        expect(feed[0].text).toContain('Health sync completed');
    });

    it('surfaces health transitions and the latest sync run', () => {
        const feed = buildActivityFeed([
            snapshot('2026-06-16T09:00:00.000Z', 'GREEN'),
            snapshot('2026-06-16T10:00:00.000Z', 'RED'),
        ]);

        expect(feed.some((item) => item.text.includes('Green → Red') && item.color === 'red')).toBe(
            true
        );
        expect(
            feed.some(
                (item) => item.text.includes('Health sync completed') && item.color === 'grey'
            )
        ).toBe(true);
    });

    it('marks an unmapped app as not monitored, never green', () => {
        const feed = buildActivityFeed([
            snapshot('2026-06-16T09:00:00.000Z', 'AMBER', {
                datadogMapped: false,
                resolutionPath: 'unmapped',
            }),
        ]);

        expect(feed[0].text).toContain('not monitored');
        expect(feed[0].color).not.toBe('green');
    });
});

describe('createDetailView — user-count resolution (df-6)', () => {
    const baseApp = (overrides: Partial<PortfolioAppContext['app']>): PortfolioAppContext => ({
        app: {
            id: 'test-app',
            name: 'Test App',
            health: 'green',
            perception: 'green',
            uptime: 99.9,
            users: 0,
            totalInternalUsers: 0,
            totalExternalUsers: 0,
            activeUsers: null,
            incidents: 0,
            lastIncident: 'N/A',
            ...overrides,
        },
        path: [],
    });

    it('shows activeUsers when present', () => {
        const view = createDetailView(baseApp({ activeUsers: 500 }));
        expect(view.activeUsers.value).toBe('500');
    });

    it('falls back to totalInternalUsers + totalExternalUsers when activeUsers is null', () => {
        const view = createDetailView(
            baseApp({ activeUsers: null, totalInternalUsers: 300, totalExternalUsers: 150 })
        );
        expect(view.activeUsers.value).toBe('450');
    });

    it('shows "No data" when activeUsers is null and both totals are 0 (fallback app)', () => {
        const view = createDetailView({ app: createFallbackApp('x'), path: [] });
        expect(view.activeUsers.value).toBe('No data');
    });

    it('shows "No data" when context is null', () => {
        const view = createDetailView(null);
        expect(view.activeUsers.value).toBe('No data');
    });
});
