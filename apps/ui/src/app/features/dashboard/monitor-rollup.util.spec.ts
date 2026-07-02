import { ApplicationMonitor } from '@operational-dashboard/shared-api-model/model/dashboard';

import { PortfolioApp } from './models/portfolio.model';
import {
    classifyMonitorState,
    collectFiringMonitors,
    countMonitorsByState,
} from './monitor-rollup.util';

/**
 * Minimal PortfolioApp builder for monitor-rollup tests.
 * @param monitors - optional monitors to attach
 */
function makeApp(monitors?: ApplicationMonitor[]): PortfolioApp {
    return {
        id: 'test-id',
        name: 'Test App',
        health: 'green',
        perception: 'green',
        uptime: null,
        users: 0,
        totalInternalUsers: 0,
        totalExternalUsers: 0,
        activeUsers: null,
        incidents: 0,
        lastIncident: '',
        monitors,
    };
}

/**
 *
 * @param overrides
 */
function makeMonitor(overrides: Partial<ApplicationMonitor> & { id: number }): ApplicationMonitor {
    return {
        name: 'Monitor',
        status: 'GREEN',
        message: '',
        lastTriggeredAt: null,
        inMaintenance: false,
        ...overrides,
    };
}

describe('countMonitorsByState', () => {
    it('returns all-zero counts for an empty apps list', () => {
        expect(countMonitorsByState([])).toEqual({ ok: 0, warn: 0, alert: 0, noData: 0 });
    });

    it('returns all-zero counts when apps have no monitors', () => {
        expect(countMonitorsByState([makeApp(), makeApp()])).toEqual({
            ok: 0,
            warn: 0,
            alert: 0,
            noData: 0,
        });
    });

    it('returns all-zero counts when monitors array is empty', () => {
        expect(countMonitorsByState([makeApp([])])).toEqual({
            ok: 0,
            warn: 0,
            alert: 0,
            noData: 0,
        });
    });

    it('buckets datadogState OK -> ok', () => {
        const app = makeApp([makeMonitor({ id: 1, datadogState: 'OK', status: 'GREEN' })]);
        expect(countMonitorsByState([app])).toEqual({ ok: 1, warn: 0, alert: 0, noData: 0 });
    });

    it('buckets datadogState Warn -> warn', () => {
        const app = makeApp([makeMonitor({ id: 1, datadogState: 'Warn', status: 'AMBER' })]);
        expect(countMonitorsByState([app])).toEqual({ ok: 0, warn: 1, alert: 0, noData: 0 });
    });

    it('buckets datadogState Alert -> alert', () => {
        const app = makeApp([makeMonitor({ id: 1, datadogState: 'Alert', status: 'RED' })]);
        expect(countMonitorsByState([app])).toEqual({ ok: 0, warn: 0, alert: 1, noData: 0 });
    });

    it('buckets datadogState No Data -> noData', () => {
        const app = makeApp([makeMonitor({ id: 1, datadogState: 'No Data', status: 'AMBER' })]);
        expect(countMonitorsByState([app])).toEqual({ ok: 0, warn: 0, alert: 0, noData: 1 });
    });

    it('sums monitors across multiple apps', () => {
        const apps = [
            makeApp([
                makeMonitor({ id: 1, datadogState: 'OK', status: 'GREEN' }),
                makeMonitor({ id: 2, datadogState: 'Warn', status: 'AMBER' }),
            ]),
            makeApp([
                makeMonitor({ id: 3, datadogState: 'Alert', status: 'RED' }),
                makeMonitor({ id: 4, datadogState: 'No Data', status: 'AMBER' }),
                makeMonitor({ id: 5, datadogState: 'OK', status: 'GREEN' }),
            ]),
        ];
        expect(countMonitorsByState(apps)).toEqual({ ok: 2, warn: 1, alert: 1, noData: 1 });
    });

    it('legacy fallback: GREEN status -> ok when datadogState absent', () => {
        const app = makeApp([makeMonitor({ id: 1, status: 'GREEN' })]);
        expect(countMonitorsByState([app])).toEqual({ ok: 1, warn: 0, alert: 0, noData: 0 });
    });

    it('legacy fallback: RED status -> alert when datadogState absent', () => {
        const app = makeApp([makeMonitor({ id: 1, status: 'RED' })]);
        expect(countMonitorsByState([app])).toEqual({ ok: 0, warn: 0, alert: 1, noData: 0 });
    });

    it('legacy fallback: AMBER status -> noData (not warn) when datadogState absent', () => {
        // AMBER collapsed status covers both Warn and No Data; map to noData
        // to never hide the No-Data signal (PRD FR-2).
        const app = makeApp([makeMonitor({ id: 1, status: 'AMBER' })]);
        expect(countMonitorsByState([app])).toEqual({ ok: 0, warn: 0, alert: 0, noData: 1 });
    });

    it('datadogState takes priority over status when both are present', () => {
        // datadogState='Warn' but status='AMBER' — should bucket as warn, not noData.
        const app = makeApp([makeMonitor({ id: 1, datadogState: 'Warn', status: 'AMBER' })]);
        expect(countMonitorsByState([app])).toEqual({ ok: 0, warn: 1, alert: 0, noData: 0 });
    });
});

// ---------------------------------------------------------------------------
// classifyMonitorState (US-2.4 extraction) — same fixtures as countMonitorsByState
// above, now exercised directly so the shared classifier stays correct in isolation.
// ---------------------------------------------------------------------------

describe('classifyMonitorState', () => {
    it('classifies datadogState OK -> ok', () => {
        expect(
            classifyMonitorState(makeMonitor({ id: 1, datadogState: 'OK', status: 'GREEN' }))
        ).toBe('ok');
    });

    it('classifies datadogState Warn -> warn', () => {
        expect(
            classifyMonitorState(makeMonitor({ id: 1, datadogState: 'Warn', status: 'AMBER' }))
        ).toBe('warn');
    });

    it('classifies datadogState Alert -> alert', () => {
        expect(
            classifyMonitorState(makeMonitor({ id: 1, datadogState: 'Alert', status: 'RED' }))
        ).toBe('alert');
    });

    it('classifies datadogState No Data -> noData', () => {
        expect(
            classifyMonitorState(makeMonitor({ id: 1, datadogState: 'No Data', status: 'AMBER' }))
        ).toBe('noData');
    });

    it('legacy fallback: GREEN status -> ok when datadogState absent', () => {
        expect(classifyMonitorState(makeMonitor({ id: 1, status: 'GREEN' }))).toBe('ok');
    });

    it('legacy fallback: RED status -> alert when datadogState absent', () => {
        expect(classifyMonitorState(makeMonitor({ id: 1, status: 'RED' }))).toBe('alert');
    });

    it('legacy fallback: AMBER status -> noData (not warn) when datadogState absent', () => {
        expect(classifyMonitorState(makeMonitor({ id: 1, status: 'AMBER' }))).toBe('noData');
    });

    it('datadogState takes priority over status when both are present', () => {
        expect(
            classifyMonitorState(makeMonitor({ id: 1, datadogState: 'Warn', status: 'AMBER' }))
        ).toBe('warn');
    });
});

// ---------------------------------------------------------------------------
// collectFiringMonitors (US-2.4)
// ---------------------------------------------------------------------------

describe('collectFiringMonitors', () => {
    it('returns [] for an empty apps list', () => {
        expect(collectFiringMonitors([])).toEqual([]);
    });

    it('returns [] when an app has no monitors array (does not throw)', () => {
        expect(collectFiringMonitors([makeApp()])).toEqual([]);
    });

    it('includes only Warn and Alert monitors, excluding OK and No Data', () => {
        const app = makeApp([
            makeMonitor({ id: 1, datadogState: 'OK', status: 'GREEN' }),
            makeMonitor({ id: 2, datadogState: 'Warn', status: 'AMBER' }),
            makeMonitor({ id: 3, datadogState: 'Alert', status: 'RED' }),
            makeMonitor({ id: 4, datadogState: 'No Data', status: 'AMBER' }),
        ]);
        const rows = collectFiringMonitors([app]);
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.monitorId).sort()).toEqual([2, 3]);
    });

    it('excludes a legacy AMBER-without-datadogState monitor (buckets to noData, not warn)', () => {
        // Critical consistency case: reusing classifyMonitorState means a legacy AMBER
        // monitor must never leak into the firing list as a false Warn row.
        const app = makeApp([makeMonitor({ id: 1, status: 'AMBER' })]);
        expect(collectFiringMonitors([app])).toEqual([]);
    });

    it('falls back to the owning app name when the monitor has no service tag', () => {
        const app = makeApp([makeMonitor({ id: 1, datadogState: 'Alert', status: 'RED' })]);
        const [row] = collectFiringMonitors([app]);
        expect(row.service).toBe('Test App');
    });

    it('uses the monitor service tag when present, not the app name', () => {
        const app = makeApp([
            makeMonitor({
                id: 1,
                datadogState: 'Alert',
                status: 'RED',
                service: 'auto-choice-api',
            }),
        ]);
        const [row] = collectFiringMonitors([app]);
        expect(row.service).toBe('auto-choice-api');
    });

    it('carries appId/appName, lastTriggeredAt, and monitorUrl (null when absent)', () => {
        const app = makeApp([
            makeMonitor({
                id: 7,
                datadogState: 'Alert',
                status: 'RED',
                name: 'DB pool exhausted',
                lastTriggeredAt: '2026-06-30T10:00:00Z',
                monitorUrl: 'https://app.datadoghq.com/monitors/7',
            }),
        ]);
        const [row] = collectFiringMonitors([app]);
        expect(row).toEqual({
            monitorId: 7,
            name: 'DB pool exhausted',
            state: 'alert',
            service: 'Test App',
            appId: 'test-id',
            appName: 'Test App',
            lastTriggeredAt: '2026-06-30T10:00:00Z',
            monitorUrl: 'https://app.datadoghq.com/monitors/7',
        });
    });

    it('sets monitorUrl to null (not undefined) when the monitor predates the backfill', () => {
        const app = makeApp([makeMonitor({ id: 1, datadogState: 'Warn', status: 'AMBER' })]);
        const [row] = collectFiringMonitors([app]);
        expect(row.monitorUrl).toBeNull();
    });

    it('sorts nothing itself — returns rows in app/monitor encounter order', () => {
        const appA = makeApp([makeMonitor({ id: 1, datadogState: 'Alert', status: 'RED' })]);
        const appWithTwo = makeApp([
            makeMonitor({ id: 2, datadogState: 'Warn', status: 'AMBER' }),
            makeMonitor({ id: 3, datadogState: 'Alert', status: 'RED' }),
        ]);
        expect(collectFiringMonitors([appA, appWithTwo]).map((r) => r.monitorId)).toEqual([
            1, 2, 3,
        ]);
    });
});
