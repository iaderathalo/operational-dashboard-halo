import { DatadogMonitor, DatadogMonitorState, DatadogSyntheticCheck } from './datadog.types';
import {
    buildHealth,
    buildMonitorBreakdown,
    buildMonitorUrl,
    buildSyntheticBreakdown,
    rollupStatus,
} from './health-rollup';

const syn = (over: Partial<DatadogSyntheticCheck>): DatadogSyntheticCheck => ({
    publicId: 'p',
    name: 'check',
    type: 'browser',
    status: 'live',
    uptime: 100,
    ...over,
});

const mon = (state: DatadogMonitorState): DatadogMonitor => ({
    id: 1,
    name: 'm',
    overall_state: state,
    tags: [],
});

const monRich = (over: Partial<DatadogMonitor>): DatadogMonitor => ({
    id: 1,
    name: 'm',
    overall_state: 'OK',
    tags: [],
    ...over,
});

describe('rollupStatus (worst-state-wins)', () => {
    it('all OK -> GREEN', () => expect(rollupStatus([mon('OK'), mon('OK')])).toBe('GREEN'));
    it('Warn + OK -> AMBER', () => expect(rollupStatus([mon('OK'), mon('Warn')])).toBe('AMBER'));
    it('any Alert -> RED', () =>
        expect(rollupStatus([mon('OK'), mon('Warn'), mon('Alert')])).toBe('RED'));
    it('all No Data -> AMBER', () =>
        expect(rollupStatus([mon('No Data'), mon('No Data')])).toBe('AMBER'));
    it('empty set -> AMBER (never GREEN)', () => expect(rollupStatus([])).toBe('AMBER'));

    it('suppresses a downtimed Alert: Alert(in downtime) + OK -> GREEN', () =>
        expect(
            rollupStatus([
                monRich({ overall_state: 'Alert', matching_downtimes: [{ id: 1 }] }),
                monRich({ overall_state: 'OK' }),
            ])
        ).toBe('GREEN'));

    it('all monitors in downtime -> AMBER (no false RED)', () =>
        expect(
            rollupStatus([monRich({ overall_state: 'Alert', matching_downtimes: [{ id: 1 }] })])
        ).toBe('AMBER'));
});

describe('buildHealth', () => {
    it('unmapped: AMBER, datadogMapped false, all metrics null', () => {
        const h = buildHealth([], null, 'unmapped');
        expect(h.healthStatus).toBe('AMBER');
        expect(h.datadogMapped).toBe(false);
        expect(h.uptime30d).toBeNull();
        expect(h.errorBudgetRemainingPct).toBeNull();
        expect(h.resolutionPath).toBe('unmapped');
    });

    it('mapped with SLO: carries uptime and error budget', () => {
        const h = buildHealth(
            [mon('OK')],
            {
                sloId: 's',
                target: 99.5,
                errorBudgetRemainingPct: 80,
                uptime24h: 99.9,
                uptime7d: 99.8,
                uptime30d: 99.7,
            },
            'primary'
        );
        expect(h.healthStatus).toBe('GREEN');
        expect(h.datadogMapped).toBe(true);
        expect(h.uptime30d).toBe(99.7);
        expect(h.slaTarget).toBe(99.5);
        expect(h.errorBudgetRemainingPct).toBe(80);
    });

    it('mapped without SLO: still mapped, metrics null', () => {
        const h = buildHealth([mon('Warn')], null, 'fallback');
        expect(h.healthStatus).toBe('AMBER');
        expect(h.datadogMapped).toBe(true);
        expect(h.uptime30d).toBeNull();
        expect(h.errorBudgetRemainingPct).toBeNull();
    });
});

describe('buildMonitorBreakdown', () => {
    it('empty set -> []', () => expect(buildMonitorBreakdown([])).toEqual([]));

    it('maps state->status, trims message, carries last-triggered, preserves datadogState', () => {
        const [m] = buildMonitorBreakdown([
            monRich({
                id: 5,
                name: 'API',
                overall_state: 'Alert',
                message: '  boom  ',
                overall_state_modified: '2026-06-16T17:36:00Z',
            }),
        ]);
        expect(m).toEqual({
            id: 5,
            name: 'API',
            status: 'RED',
            datadogState: 'Alert',
            message: 'boom',
            lastTriggeredAt: '2026-06-16T17:36:00Z',
            inMaintenance: false,
        });
    });

    it('carries datadogState OK for an OK monitor', () => {
        const [m] = buildMonitorBreakdown([monRich({ overall_state: 'OK' })]);
        expect(m.datadogState).toBe('OK');
        expect(m.status).toBe('GREEN');
    });

    it('carries datadogState Warn for a Warn monitor', () => {
        const [m] = buildMonitorBreakdown([monRich({ overall_state: 'Warn' })]);
        expect(m.datadogState).toBe('Warn');
        expect(m.status).toBe('AMBER');
    });

    it('carries datadogState No Data for a No Data monitor', () => {
        const [m] = buildMonitorBreakdown([monRich({ overall_state: 'No Data' })]);
        expect(m.datadogState).toBe('No Data');
        expect(m.status).toBe('AMBER');
    });

    it('flags a monitor in an active downtime as inMaintenance', () => {
        const [m] = buildMonitorBreakdown([
            monRich({ overall_state: 'Alert', matching_downtimes: [{ id: 1 }] }),
        ]);
        expect(m.inMaintenance).toBe(true);
    });

    it('defaults a missing message to "" and last-triggered to null', () => {
        const [m] = buildMonitorBreakdown([monRich({ overall_state: 'OK' })]);
        expect(m.message).toBe('');
        expect(m.lastTriggeredAt).toBeNull();
    });

    it('sorts worst-state first, then by name', () => {
        const names = buildMonitorBreakdown([
            monRich({ name: 'b-ok', overall_state: 'OK' }),
            monRich({ name: 'a-alert', overall_state: 'Alert' }),
            monRich({ name: 'c-warn', overall_state: 'Warn' }),
            monRich({ name: 'a-ok', overall_state: 'OK' }),
        ]).map((m) => m.name);
        expect(names).toEqual(['a-alert', 'c-warn', 'a-ok', 'b-ok']);
    });

    // -------------------------------------------------------------------
    // US-2.4 — service tag extraction
    // -------------------------------------------------------------------
    it('extracts a service: tag, preserving its original casing', () => {
        const [m] = buildMonitorBreakdown([monRich({ tags: ['service:Auto-Choice-API'] })]);
        expect(m.service).toBe('Auto-Choice-API');
    });

    it('matches the service: tag key case-insensitively', () => {
        const [m] = buildMonitorBreakdown([monRich({ tags: ['Service:quote-svc'] })]);
        expect(m.service).toBe('quote-svc');
    });

    it('sets service: undefined when no service: tag is present', () => {
        const [m] = buildMonitorBreakdown([monRich({ tags: ['app_short_key:foo'] })]);
        expect(m.service).toBeUndefined();
    });

    it('takes the first service: tag when multiple are present', () => {
        const [m] = buildMonitorBreakdown([
            monRich({ tags: ['service:first-svc', 'service:second-svc'] }),
        ]);
        expect(m.service).toBe('first-svc');
    });

    it('sets service: undefined (never throws) for an undefined tags array', () => {
        const [m] = buildMonitorBreakdown([monRich({ tags: undefined as unknown as string[] })]);
        expect(m.service).toBeUndefined();
    });

    it('sets service: undefined for an empty/valueless service: tag', () => {
        const [m] = buildMonitorBreakdown([monRich({ tags: ['service:'] })]);
        expect(m.service).toBeUndefined();
    });
});

describe('buildMonitorUrl', () => {
    it('builds a URL against the default datadoghq.com site', () => {
        expect(buildMonitorUrl('datadoghq.com', 123)).toBe(
            'https://app.datadoghq.com/monitors/123'
        );
    });

    it('builds a URL against a custom site', () => {
        expect(buildMonitorUrl('datadoghq.eu', 456)).toBe('https://app.datadoghq.eu/monitors/456');
    });

    it('uses the app. subdomain, not api.', () => {
        expect(buildMonitorUrl('datadoghq.com', 1)).toContain('https://app.');
        expect(buildMonitorUrl('datadoghq.com', 1)).not.toContain('https://api.');
    });

    it('interpolates the numeric monitor id verbatim', () => {
        expect(buildMonitorUrl('datadoghq.com', 987654)).toBe(
            'https://app.datadoghq.com/monitors/987654'
        );
    });
});

describe('buildSyntheticBreakdown', () => {
    it('maps the Datadog shape verbatim', () => {
        const [c] = buildSyntheticBreakdown([
            syn({ publicId: 'x1', name: 'login', type: 'api', status: 'paused', uptime: 97.5 }),
        ]);
        expect(c).toEqual({
            publicId: 'x1',
            name: 'login',
            type: 'api',
            status: 'paused',
            uptime: 97.5,
        });
    });

    it('sorts lowest-uptime first, with null (no-data) checks last', () => {
        const names = buildSyntheticBreakdown([
            syn({ name: 'ok', uptime: 99.9 }),
            syn({ name: 'nodata', uptime: null }),
            syn({ name: 'bad', uptime: 80 }),
        ]).map((c) => c.name);
        expect(names).toEqual(['bad', 'ok', 'nodata']);
    });

    it('caps the breakdown at 50 checks', () => {
        const many = Array.from({ length: 60 }, (_, i) => syn({ name: `c${i}`, uptime: i }));
        expect(buildSyntheticBreakdown(many)).toHaveLength(50);
    });
});
